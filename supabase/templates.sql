-- Add optional company name to payments
alter table public.payments
add column if not exists company_name text;

-- Payment templates
create table if not exists public.payment_templates (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  company_name text,
  bank_name text,
  account_number text,
  resident_number text,
  payment_method_id bigint references public.payment_methods (id),
  staff_type_id bigint references public.staff_types (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed templates (idempotent)
insert into public.payment_templates (
  recipient,
  company_name,
  bank_name,
  account_number,
  payment_method_id,
  staff_type_id
)
select
  '이순준',
  '윌비순필름',
  '국민은행',
  '03870104552039',
  (select id from public.payment_methods where name = '세금계산서' limit 1),
  (select id from public.staff_types where name = '촬영' limit 1)
where not exists (
  select 1 from public.payment_templates
  where recipient = '이순준'
    and company_name = '윌비순필름'
    and account_number = '03870104552039'
);

insert into public.payment_templates (
  recipient,
  company_name,
  bank_name,
  account_number,
  payment_method_id,
  staff_type_id
)
select
  '박서영',
  '돌고래아파트',
  '국민은행',
  '20570104384946',
  (select id from public.payment_methods where name = '세금계산서' limit 1),
  (select id from public.staff_types where name = '헤어메이크업' limit 1)
where not exists (
  select 1 from public.payment_templates
  where recipient = '박서영'
    and company_name = '돌고래아파트'
    and account_number = '20570104384946'
);

insert into public.payment_templates (
  recipient,
  company_name,
  bank_name,
  account_number,
  payment_method_id,
  staff_type_id
)
select
  '김강미',
  '그린',
  '국민은행',
  '80910104221038',
  (select id from public.payment_methods where name = '세금계산서' limit 1),
  (select id from public.staff_types where name = '헤어메이크업' limit 1)
where not exists (
  select 1 from public.payment_templates
  where recipient = '김강미'
    and company_name = '그린'
    and account_number = '80910104221038'
);

insert into public.payment_templates (
  recipient,
  company_name,
  bank_name,
  account_number,
  payment_method_id,
  staff_type_id
)
select
  '김예나',
  '유어태그샵',
  '하나은행',
  '14991001608704',
  (select id from public.payment_methods where name = '세금계산서' limit 1),
  (select id from public.staff_types where name = '스타일링' limit 1)
where not exists (
  select 1 from public.payment_templates
  where recipient = '김예나'
    and company_name = '유어태그샵'
    and account_number = '14991001608704'
);

insert into public.payment_templates (
  recipient,
  company_name,
  bank_name,
  account_number,
  payment_method_id,
  staff_type_id
)
select
  '문진호',
  '지노스튜디오',
  '우리은행',
  '1005403938077',
  (select id from public.payment_methods where name = '세금계산서' limit 1),
  (select id from public.staff_types where name = '스타일링' limit 1)
where not exists (
  select 1 from public.payment_templates
  where recipient = '문진호'
    and company_name = '지노스튜디오'
    and account_number = '1005403938077'
);
