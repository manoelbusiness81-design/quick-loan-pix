
-- 1) New role enum values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Commit enum changes before using them in this transaction
COMMIT;
BEGIN;

-- 2) Teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_supervisor_unique ON public.teams(supervisor_id) WHERE supervisor_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_teams_updated ON public.teams;
CREATE TRIGGER trg_teams_updated BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Team members (vendedores vinculados a uma equipe)
CREATE TABLE IF NOT EXISTS public.team_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_members_team_idx ON public.team_members(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 4) Helper functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'supervisor')
$$;

-- Returns the team id of a user (whether supervisor of a team or member of one)
CREATE OR REPLACE FUNCTION public.team_id_of(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM public.teams WHERE supervisor_id = _user_id LIMIT 1),
    (SELECT team_id FROM public.team_members WHERE user_id = _user_id LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.team_id_of(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.same_team_as(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.team_id_of(auth.uid()) IS NOT NULL
     AND public.team_id_of(auth.uid()) = public.team_id_of(_other)
$$;

-- A viewer can see data belonging to _owner if: master_admin, self, or supervisor of same team
CREATE OR REPLACE FUNCTION public.can_view_user_data(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_master_admin(auth.uid())
    OR auth.uid() = _owner
    OR (public.is_supervisor(auth.uid()) AND public.same_team_as(_owner))
$$;

-- 5) Convert legacy admins to master_admin
UPDATE public.user_roles SET role = 'master_admin' WHERE role = 'admin';

-- 6) Add team_id to coefficients & commissions
ALTER TABLE public.coefficients ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS coefficients_team_idx ON public.coefficients(team_id);

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS commissions_team_idx ON public.commissions(team_id);

-- 7) Rewrite RLS policies

-- teams
DROP POLICY IF EXISTS "teams master all" ON public.teams;
DROP POLICY IF EXISTS "teams select supervisor" ON public.teams;
DROP POLICY IF EXISTS "teams select member" ON public.teams;
CREATE POLICY "teams master all" ON public.teams
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "teams select supervisor" ON public.teams
  FOR SELECT TO authenticated
  USING (supervisor_id = auth.uid());
CREATE POLICY "teams select member" ON public.teams
  FOR SELECT TO authenticated
  USING (id = public.current_team_id());

-- team_members
DROP POLICY IF EXISTS "tm master all" ON public.team_members;
DROP POLICY IF EXISTS "tm select self" ON public.team_members;
DROP POLICY IF EXISTS "tm select supervisor" ON public.team_members;
CREATE POLICY "tm master all" ON public.team_members
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "tm select self" ON public.team_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "tm select supervisor" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id());

-- profiles
DROP POLICY IF EXISTS "profiles insert admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles select own or admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles update own or admin" ON public.profiles;
CREATE POLICY "profiles select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_user_data(id));
CREATE POLICY "profiles insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin(auth.uid()) OR id = auth.uid());
CREATE POLICY "profiles update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_master_admin(auth.uid()) OR id = auth.uid())
  WITH CHECK (public.is_master_admin(auth.uid()) OR id = auth.uid());

-- user_roles
DROP POLICY IF EXISTS "roles all admin" ON public.user_roles;
DROP POLICY IF EXISTS "roles select admin or self" ON public.user_roles;
CREATE POLICY "roles master all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "roles select self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- simulations
DROP POLICY IF EXISTS "Users delete own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users insert own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users update own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users view own simulations or admin all" ON public.simulations;
CREATE POLICY "sim select" ON public.simulations
  FOR SELECT TO authenticated
  USING (public.can_view_user_data(user_id));
CREATE POLICY "sim insert" ON public.simulations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sim update" ON public.simulations
  FOR UPDATE TO authenticated
  USING (public.can_view_user_data(user_id))
  WITH CHECK (public.can_view_user_data(user_id));
CREATE POLICY "sim delete" ON public.simulations
  FOR DELETE TO authenticated
  USING (public.can_view_user_data(user_id));

-- coefficients (team-scoped; NULL team_id = global, visible to everyone)
DROP POLICY IF EXISTS "coef delete admin" ON public.coefficients;
DROP POLICY IF EXISTS "coef insert admin" ON public.coefficients;
DROP POLICY IF EXISTS "coef select all auth" ON public.coefficients;
DROP POLICY IF EXISTS "coef update admin" ON public.coefficients;
CREATE POLICY "coef select" ON public.coefficients
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR team_id IS NULL
    OR team_id = public.current_team_id()
  );
CREATE POLICY "coef insert" ON public.coefficients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );
CREATE POLICY "coef update" ON public.coefficients
  FOR UPDATE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  )
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );
CREATE POLICY "coef delete" ON public.coefficients
  FOR DELETE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );

-- commissions (company-level per team)
DROP POLICY IF EXISTS "comm delete admin" ON public.commissions;
DROP POLICY IF EXISTS "comm insert admin" ON public.commissions;
DROP POLICY IF EXISTS "comm select admin" ON public.commissions;
DROP POLICY IF EXISTS "comm update admin" ON public.commissions;
CREATE POLICY "comm select" ON public.commissions
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND (team_id = public.current_team_id() OR team_id IS NULL))
  );
CREATE POLICY "comm insert" ON public.commissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );
CREATE POLICY "comm update" ON public.commissions
  FOR UPDATE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  )
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );
CREATE POLICY "comm delete" ON public.commissions
  FOR DELETE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND team_id = public.current_team_id())
  );

-- seller_commissions (per vendor)
DROP POLICY IF EXISTS "sc delete admin" ON public.seller_commissions;
DROP POLICY IF EXISTS "sc insert admin" ON public.seller_commissions;
DROP POLICY IF EXISTS "sc select own or admin" ON public.seller_commissions;
DROP POLICY IF EXISTS "sc update admin" ON public.seller_commissions;
CREATE POLICY "sc select" ON public.seller_commissions
  FOR SELECT TO authenticated
  USING (public.can_view_user_data(user_id));
CREATE POLICY "sc insert" ON public.seller_commissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND public.same_team_as(user_id))
  );
CREATE POLICY "sc update" ON public.seller_commissions
  FOR UPDATE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND public.same_team_as(user_id))
  )
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND public.same_team_as(user_id))
  );
CREATE POLICY "sc delete" ON public.seller_commissions
  FOR DELETE TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR (public.is_supervisor(auth.uid()) AND public.same_team_as(user_id))
  );

-- app_settings (master_admin only writes; everyone reads)
DROP POLICY IF EXISTS "Admins can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
CREATE POLICY "app_settings select" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings master insert" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "app_settings master update" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "app_settings master delete" ON public.app_settings
  FOR DELETE TO authenticated USING (public.is_master_admin(auth.uid()));

-- 8) Update has_role() so legacy callers asking for 'admin' continue to work for master_admin
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'admin' AND role = 'master_admin')
      )
  )
$$;
