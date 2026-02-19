-- HDD 라이브러리: RAID HDD 세트 및 파일 인덱스 테이블
-- 사용법: Supabase SQL 에디터에서 실행

-- HDD 세트 (연도별 RAID 세트, 예: "25 레이드", "24 레이드")
create table if not exists public.hdd_sets (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null unique,       -- "25 레이드"
  description      text,
  last_scanned_at  timestamptz,                       -- 마지막 스캔 시각
  file_count       integer     not null default 0,    -- 스캔된 항목 수
  created_at       timestamptz not null default now()
);

-- 파일 인덱스 (각 HDD 세트의 모든 파일/폴더 목록)
create table if not exists public.hdd_file_index (
  id           uuid        primary key default gen_random_uuid(),
  hdd_set_id   uuid        not null references public.hdd_sets(id) on delete cascade,
  name         text        not null,      -- 파일/폴더명 (예: "footage", "A001_C001.mov")
  path         text        not null,      -- 마운트 루트 기준 상대경로 (예: "/2024 LG AI캠프/footage")
  parent_path  text        not null,      -- 상위 폴더 경로 ("" = 루트, "/2024 LG AI캠프" = 하위)
  is_dir       boolean     not null default false,
  size_bytes   bigint,                    -- 파일 크기 바이트 (폴더는 null)
  modified_at  timestamptz,              -- 파일 수정일
  extension    text,                      -- 소문자 확장자 (예: "mov", "prproj", 폴더는 null)
  created_at   timestamptz not null default now()
);

-- 폴더 탐색 쿼리 최적화 (핵심 인덱스: hdd_set + parent_path 조합으로 빠른 조회)
create index if not exists hdd_file_index_set_parent
  on public.hdd_file_index (hdd_set_id, parent_path);

-- 이름 검색 최적화
create index if not exists hdd_file_index_set_name
  on public.hdd_file_index (hdd_set_id, name);
