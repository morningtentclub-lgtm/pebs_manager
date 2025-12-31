-- Book support purchases
create table if not exists public.book_purchases (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null,
  purchase_date date not null,
  aladin_url text not null,
  title text,
  author text,
  publisher text,
  price integer,
  isbn13 text,
  created_at timestamptz not null default now()
);

create index if not exists book_purchases_name_month
  on public.book_purchases (requester_name, purchase_date desc);
