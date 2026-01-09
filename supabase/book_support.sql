-- Book support purchases
create table if not exists public.book_purchases (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null,
  purchase_date date not null,
  aladin_url text,
  title text,
  author text,
  publisher text,
  price integer,
  isbn13 text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_purchases_name_month
  on public.book_purchases (requester_name, purchase_date desc);

alter table public.book_purchases
  add column if not exists updated_at timestamptz not null default now();

alter table public.book_purchases
  alter column aladin_url drop not null;

alter table public.book_purchases
  add column if not exists note text;
