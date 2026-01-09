-- Staff planet members
create table if not exists public.staff_planet_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('explored', 'unexplored')),
  notes text,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_planet_members_status_idx
  on public.staff_planet_members (status);

-- Staff planet projects (explored members)
create table if not exists public.staff_planet_projects (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.staff_planet_members (id) on delete cascade,
  project_name text not null,
  estimate integer,
  contact text,
  created_at timestamptz not null default now()
);

create index if not exists staff_planet_projects_member_idx
  on public.staff_planet_projects (member_id);
