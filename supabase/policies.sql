-- Enable RLS
alter table public.projects enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.staff_types enable row level security;
alter table public.payment_methods enable row level security;

-- Projects: authenticated users can read/write
drop policy if exists "projects_auth_all" on public.projects;
create policy "projects_auth_all"
on public.projects
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Payments: authenticated users can read/write
drop policy if exists "payments_auth_all" on public.payments;
create policy "payments_auth_all"
on public.payments
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Expenses: authenticated users can read/write
drop policy if exists "expenses_auth_all" on public.expenses;
create policy "expenses_auth_all"
on public.expenses
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Staff types: read-only for authenticated users
drop policy if exists "staff_types_auth_select" on public.staff_types;
create policy "staff_types_auth_select"
on public.staff_types
for select
using (auth.role() = 'authenticated');

-- Payment methods: read-only for authenticated users
drop policy if exists "payment_methods_auth_select" on public.payment_methods;
create policy "payment_methods_auth_select"
on public.payment_methods
for select
using (auth.role() = 'authenticated');

-- Storage: restrict access to authenticated users and payment-images bucket
drop policy if exists "payment_images_auth_select" on storage.objects;
create policy "payment_images_auth_select"
on storage.objects
for select
using (
  bucket_id = 'payment-images'
  and auth.role() = 'authenticated'
);

drop policy if exists "payment_images_auth_insert" on storage.objects;
create policy "payment_images_auth_insert"
on storage.objects
for insert
with check (
  bucket_id = 'payment-images'
  and auth.role() = 'authenticated'
);
