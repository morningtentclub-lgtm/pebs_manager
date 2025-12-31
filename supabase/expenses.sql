-- Company card registry
create table if not exists public.expense_cards (
  id uuid primary key default gen_random_uuid(),
  card_last4 text not null,
  card_alias text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists expense_cards_unique
  on public.expense_cards (card_last4, card_alias);

-- Expense enhancements
alter table public.expenses
  add column if not exists card_id uuid references public.expense_cards (id),
  add column if not exists card_last4 text,
  add column if not exists card_alias text,
  add column if not exists payer_name text,
  add column if not exists payer_bank_name text,
  add column if not exists payer_account_number text,
  add column if not exists payment_status text default 'completed',
  add column if not exists payment_date date,
  add column if not exists note text;
