# OCR 기능 설정 가이드

OCR 기능이 구현되었습니다. 아래 단계를 따라 설정을 완료하면 신분증과 통장 사본에서 자동으로 정보를 추출할 수 있습니다.

## 비용 정보

### Google Cloud Vision API
- **무료 할당량**: 매월 첫 1,000건의 텍스트 감지 무료
- **유료**: 1,000건 초과 시 $1.50/1,000 이미지
- **예상 비용**: 월 100건 사용 시 → 무료

### Supabase Storage
- **무료 할당량**: 1GB 스토리지 무료
- **유료**: 1GB 초과 시 $0.021/GB/월
- **예상 비용**: 이미지 100장 (각 2MB) → 200MB → 무료

**결론**: 일반적인 사용 범위에서는 무료로 사용 가능합니다.

---

## 설정 단계

### 1. Supabase Storage 설정

1. [Supabase 대시보드](https://app.supabase.com/project/wthgqzuvabmmffpownxd/storage/buckets) 접속
2. **Storage** → **Create bucket** 클릭
3. 버킷 설정:
   - **Name**: `payment-images`
   - **Public bucket**: ❌ 체크 해제 (보안상 private 권장)
4. **Create bucket** 클릭

### 2. Google Cloud Vision API 설정

#### 2-1. Google Cloud 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 상단의 프로젝트 선택 드롭다운 클릭
3. **새 프로젝트** 클릭
4. 프로젝트 이름 입력 (예: "pebs-payment-ocr")
5. **만들기** 클릭

#### 2-2. Cloud Vision API 활성화

1. [Cloud Vision API 페이지](https://console.cloud.google.com/apis/library/vision.googleapis.com) 접속
2. **사용 설정** 클릭
3. API가 활성화될 때까지 대기

#### 2-3. 서비스 계정 생성

1. [서비스 계정 페이지](https://console.cloud.google.com/iam-admin/serviceaccounts) 접속
2. **+ 서비스 계정 만들기** 클릭
3. 서비스 계정 세부정보:
   - **서비스 계정 이름**: `pebs-ocr-service`
   - **서비스 계정 ID**: 자동 생성됨
   - **설명**: "PEBS Payment OCR Service Account"
4. **만들고 계속하기** 클릭
5. 역할 선택:
   - **역할**: "Cloud Vision AI" > "Cloud Vision API 사용자" 선택
6. **계속** 클릭
7. **완료** 클릭

#### 2-4. JSON 키 다운로드

1. 생성된 서비스 계정 클릭
2. **키** 탭으로 이동
3. **키 추가** → **새 키 만들기** 클릭
4. 키 유형: **JSON** 선택
5. **만들기** 클릭
6. JSON 파일이 자동으로 다운로드됨

#### 2-5. 키 파일 프로젝트에 추가

다운로드한 JSON 파일을 프로젝트 루트 디렉토리에 복사하고 이름을 변경:

```bash
# 다운로드 폴더에서 프로젝트 폴더로 이동
mv ~/Downloads/pebs-payment-ocr-*.json /Users/anjaehyeong/Documents/projects/pebs_payment/pebs-payment-manager/google-cloud-key.json
```

또는 Finder에서:
1. 다운로드한 JSON 파일을 찾기
2. `pebs-payment-manager` 폴더로 드래그
3. 파일명을 `google-cloud-key.json`으로 변경

### 3. 환경 변수 확인

`.env.local` 파일이 이미 업데이트되었습니다. 내용 확인:

```
NEXT_PUBLIC_SUPABASE_URL=https://wthgqzuvabmmffpownxd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
APP_SHARED_PASSWORD=your_shared_password
SUPABASE_APP_USER_EMAIL=shared@company.com
SUPABASE_APP_USER_PASSWORD=shared_account_password

# Google Cloud Vision API - JSON 키 파일 경로
GOOGLE_APPLICATION_CREDENTIALS=./google-cloud-key.json
```

### Vercel 배포용 설정

Vercel에서는 파일 경로 방식 대신 JSON 내용을 환경 변수로 넣어야 합니다.

```
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"..."}
```

`GOOGLE_APPLICATION_CREDENTIALS_JSON`이 설정되어 있으면 파일 경로는 사용하지 않습니다.

### 4. 서버 재시작

개발 서버를 재시작하여 환경 변수를 다시 로드:

```bash
# 현재 실행 중인 서버 중지 (Ctrl+C)
# 서버 재시작
npm run dev
```

---

## 사용 방법

### OCR 기능 테스트

1. 브라우저에서 프로젝트 상세 페이지 접속
2. **+ 새 지급 내역** 버튼 클릭
3. **신분증/통장/사업자등록증 업로드** 영역에 이미지를 드래그하거나 붙여넣기(Cmd/Ctrl+V)
   - 여러 장을 한 번에 업로드할 수 있습니다.
4. **인식** 버튼 클릭
   - 주민등록번호/은행명/계좌번호/사업자등록번호가 자동으로 채워짐
   - 이미지가 Supabase Storage에 저장됨
5. 나머지 정보 입력 후 **추가** 버튼 클릭

### 지원되는 은행

OCR이 자동 인식하는 은행:
- 국민은행 (KB)
- 신한은행
- 우리은행
- 하나은행
- 농협은행 (NH)
- 기업은행 (IBK)
- 카카오뱅크
- 토스뱅크
- 케이뱅크
- SC제일은행
- 씨티은행
- 산업은행 (KDB)
- 수협은행
- 새마을금고
- 우체국
- 신협
- 저축은행

---

## 문제 해결

### "이미지 업로드에 실패했습니다"

**원인**: Supabase Storage 버킷이 생성되지 않음

**해결**:
1. Supabase 대시보드에서 `payment-images` 버킷 생성 확인
2. `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있는지 확인
3. Storage 정책에서 `payment-images` 버킷 정책이 적용되어 있는지 확인

### "OCR 처리에 실패했습니다"

**원인**: Google Cloud Vision API 설정 오류

**해결**:
1. `google-cloud-key.json` 파일이 프로젝트 루트에 있는지 확인
2. Google Cloud Vision API가 활성화되어 있는지 확인
3. 서비스 계정에 "Cloud Vision API 사용자" 역할이 부여되어 있는지 확인
4. 서버를 재시작했는지 확인

### "텍스트를 찾을 수 없습니다"

**원인**: 이미지 품질이 낮거나 텍스트가 명확하지 않음

**해결**:
1. 고해상도 이미지를 사용
2. 조명이 밝은 곳에서 촬영
3. 텍스트가 선명하게 보이도록 촬영
4. 필요시 수동으로 입력

### 개발자 콘솔에서 오류 확인

브라우저의 개발자 도구 (F12)를 열고 **Console** 탭에서 오류 메시지 확인:
- "추출된 텍스트: ..." - OCR이 인식한 전체 텍스트
- "주민등록번호 추출 성공: ..." - 추출 성공
- "은행명을 찾을 수 없습니다" - 패턴 매칭 실패

---

## 구현된 기능

✅ 신분증 OCR
- 주민등록번호 자동 추출
- 이미지 자동 저장

✅ 통장 사본 OCR
- 은행명 자동 추출 (17개 주요 은행 지원)
- 계좌번호 자동 추출
- 이미지 자동 저장

✅ 이미지 저장
- Supabase Storage에 자동 업로드
- 데이터베이스에 이미지 URL 저장
- 업로드 시 타임스탬프로 고유 파일명 생성

✅ 에러 처리
- OCR 실패 시 수동 입력 가능
- 사용자 친화적 오류 메시지

---

## 향후 개선 사항 (선택적)

### Google Drive 연동 (선택)

Google Drive에 이미지를 자동 백업하려면:
1. Google Drive API 활성화
2. 서비스 계정에 Drive 권한 추가
3. 백업 폴더 생성 및 공유 설정
4. OCR route에 Drive 업로드 코드 추가

**참고**: 현재 Supabase Storage만으로도 충분합니다. Google Drive 연동은 추가 보안 백업이 필요한 경우에만 권장합니다.

---

## 설정 완료 체크리스트

- [ ] Supabase Storage에 `payment-images` 버킷 생성
- [ ] 버킷을 private으로 설정
- [ ] Google Cloud 프로젝트 생성
- [ ] Cloud Vision API 활성화
- [ ] 서비스 계정 생성 및 역할 부여
- [ ] JSON 키 파일 다운로드
- [ ] `google-cloud-key.json` 파일을 프로젝트 루트에 저장
- [ ] `.env.local` 파일에 환경 변수 확인
- [ ] Supabase RLS 정책 적용 (`supabase/policies.sql`)
- [ ] Supabase Auth에 공용 계정 생성 (이메일/비밀번호)
- [ ] 개발 서버 재시작
- [ ] 테스트 이미지로 OCR 기능 테스트

설정 완료 후 OCR 기능을 사용할 수 있습니다!
