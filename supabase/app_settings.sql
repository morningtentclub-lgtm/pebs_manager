-- App settings (admin-only)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Set or update the payments access password
-- Example:
-- insert into public.app_settings (key, value)
-- values ('payments_access_password', 'YOUR_PASSWORD')
-- on conflict (key)
-- do update set value = excluded.value, updated_at = now();
