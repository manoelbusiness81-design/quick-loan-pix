
-- Enum de roles
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- has_role security definer
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Coefficients
create table public.coefficients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bank text not null,
  prazo integer not null,
  taxa numeric(6,4) not null,
  coeficiente numeric(10,7) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coefficients enable row level security;
create index coefficients_owner_idx on public.coefficients(owner_id);

-- Commissions
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  taxa numeric(6,4) not null,
  percentual numeric(6,3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, taxa)
);
alter table public.commissions enable row level security;

-- RLS policies
-- profiles
create policy "profiles select own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles update own or admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles insert admin" on public.profiles
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin') or id = auth.uid());

-- user_roles: only admins can read/write
create policy "roles select admin or self" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "roles all admin" on public.user_roles
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- coefficients: owner only
create policy "coef select own" on public.coefficients
  for select to authenticated using (owner_id = auth.uid());
create policy "coef insert own" on public.coefficients
  for insert to authenticated with check (owner_id = auth.uid());
create policy "coef update own" on public.coefficients
  for update to authenticated using (owner_id = auth.uid());
create policy "coef delete own" on public.coefficients
  for delete to authenticated using (owner_id = auth.uid());

-- commissions: owner only
create policy "comm select own" on public.commissions
  for select to authenticated using (owner_id = auth.uid());
create policy "comm insert own" on public.commissions
  for insert to authenticated with check (owner_id = auth.uid());
create policy "comm update own" on public.commissions
  for update to authenticated using (owner_id = auth.uid());
create policy "comm delete own" on public.commissions
  for delete to authenticated using (owner_id = auth.uid());

-- Trigger to auto-create profile + default 'user' role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_coef_updated before update on public.coefficients
  for each row execute function public.set_updated_at();
create trigger trg_comm_updated before update on public.commissions
  for each row execute function public.set_updated_at();
