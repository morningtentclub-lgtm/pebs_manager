-- ⚠️ 긴급 보안 수정: payment-images 스토리지 접근을 인증된 사용자로 제한
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- (버킷 public=false 전환은 이미 완료됨. 이 스크립트는 anon 키 직접 접근을 막는 RLS 방어선입니다.)

drop policy if exists "payment_images_public_select" on storage.objects;
drop policy if exists "payment_images_public_insert" on storage.objects;
drop policy if exists "payment_images_public_update" on storage.objects;
drop policy if exists "payment_images_public_delete" on storage.objects;
drop policy if exists "payment_images_auth_select" on storage.objects;
drop policy if exists "payment_images_auth_insert" on storage.objects;
drop policy if exists "payment_images_auth_update" on storage.objects;
drop policy if exists "payment_images_auth_delete" on storage.objects;

create policy "payment_images_auth_select"
on storage.objects for select
using (bucket_id = 'payment-images' and auth.role() = 'authenticated');

create policy "payment_images_auth_insert"
on storage.objects for insert
with check (bucket_id = 'payment-images' and auth.role() = 'authenticated');

create policy "payment_images_auth_update"
on storage.objects for update
using (bucket_id = 'payment-images' and auth.role() = 'authenticated')
with check (bucket_id = 'payment-images' and auth.role() = 'authenticated');

create policy "payment_images_auth_delete"
on storage.objects for delete
using (bucket_id = 'payment-images' and auth.role() = 'authenticated');
