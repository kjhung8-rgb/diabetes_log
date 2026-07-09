# 혈당 로그 PWA

개인 혈당 기록을 브라우저에서 관리하는 정적 PWA입니다. 기본 데이터는 브라우저 IndexedDB에 저장되고, Firebase Hosting 환경에서는 Google 로그인과 Cloud Firestore를 통해 계정별 자동 동기화를 사용할 수 있습니다.

## 주요 기능

- 혈당 기록 추가, 수정, 삭제
- 아침/점심/저녁 식사 구분
- 공복/식후 2시간 측정 시점 구분
- 식사 메모, 운동 여부, 약 복용 여부, 컨디션 메모 기록
- 오늘 기록 여부 체크리스트
- 오늘 요약, 최근 기록, 전체 기록 목록
- 달력 보기
- 주간/월간 혈당 그래프
- 그래프 점 선택 시 평균 혈당, 측정 횟수, 최근 측정 변화량 표시
- 최근 30일 기준 인사이트 카드
- IndexedDB 기반 로컬 저장
- Firebase Auth/Firestore 기반 선택적 클라우드 백업
- CSV 내보내기
- 사용 방법 도움말 화면

## 실행 방법

정적 파일 기반 앱이라 `index.html`을 직접 열어도 기본 화면은 볼 수 있습니다. 다만 PWA, 서비스 워커, Firebase 초기화 테스트는 로컬 서버나 Firebase Hosting 환경에서 확인하는 것을 권장합니다.

```powershell
cd path\to\diabetes-log-pwa
python -m http.server 5173
```

PC 브라우저에서는 아래 주소로 접속합니다.

```txt
http://localhost:5173
```

같은 와이파이에 연결된 휴대폰에서 테스트하려면 PC의 내부 IP를 사용합니다.

```powershell
python -m http.server 5174 --bind 0.0.0.0
```

예시:

```txt
http://<PC-IP>:5174
```

## Firebase 설정

클라우드 백업을 사용하려면 Firebase 프로젝트에서 다음 기능이 필요합니다.

- Firebase Hosting
- Firebase Authentication Google 로그인
- Cloud Firestore
- Firestore 보안 규칙 배포

Firebase CLI가 없다면 Node.js LTS와 Firebase CLI를 설치합니다.

```powershell
winget install OpenJS.NodeJS.LTS
npm install -g firebase-tools
```

설치 직후 `npm` 또는 `firebase` 명령을 인식하지 못하면 PowerShell을 새로 열고 다시 실행합니다.

Firebase 프로젝트를 연결하려면 `docs/examples/.firebaserc.example`을 `.firebaserc`로 복사한 뒤 프로젝트 ID를 입력합니다.

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

Firestore 규칙은 개인 이메일이 들어가는 로컬 설정 파일입니다. 처음 설정할 때는 `docs/examples/firestore.rules.example`을 `firestore.rules`로 복사한 뒤 허용 이메일 목록을 수정합니다.

```powershell
Copy-Item docs/examples/firestore.rules.example firestore.rules
```

```js
request.auth.token.email in [
  "your-email@example.com"
]
```

## 배포

Firebase에 로그인한 뒤 Hosting과 Firestore 규칙을 배포합니다.

```powershell
firebase login
firebase deploy --only hosting,firestore:rules --project your-firebase-project-id
```

`.firebaserc`에 기본 프로젝트를 설정했다면 아래처럼 실행할 수 있습니다.

```powershell
firebase deploy --only hosting,firestore:rules
```

## 데이터 저장 방식

기본 기록은 각 브라우저의 IndexedDB에 저장됩니다. Firebase Hosting에서 앱을 실행하고 Google 로그인에 성공하면 Firestore의 사용자별 경로로 기록이 동기화됩니다.

Firestore 경로 구조:

```txt
users/{uid}/readings/{readingId}
users/{uid}/meta/sync
```

`readings` 문서 주요 필드:

```txt
value
unit
measuredAt
period
timing
mealNote
exercised
medicationTaken
memo
createdAt
updatedAt
```

Firestore 규칙은 로그인한 사용자가 자신의 `uid` 경로에만 접근하도록 제한하고, 이메일 인증과 허용 이메일 목록을 함께 확인합니다.

## 테스트 데이터

Firestore 테스트용 더미 데이터는 `docs/test-data/`에 있습니다. 콘솔 가져오기 스크립트와 JSON 파일을 사용하면 현재 로그인된 허용 계정에 테스트 기록을 넣을 수 있습니다.

자세한 사용 방법은 `docs/test-data/README.md`를 확인합니다.

## 저장소 관리 주의사항

다음 파일과 폴더는 개인 환경 정보, 로컬 실행 기록, 원본 자료를 포함할 수 있으므로 커밋하지 않습니다.

- `.firebaserc`
- `.firebase/`
- `firestore.rules`
- `logs/`
- `assets/source/`
- `.env*`
- Firebase service account JSON 파일
- `*.bak`
- `*.zip`

위 항목은 `.gitignore`와 Firebase Hosting ignore 설정에 포함되어 있습니다.

## 의료 관련 주의

이 앱은 개인 혈당 기록과 관리 보조용입니다. 의료적 진단, 치료, 약물 조정 판단을 대신하지 않습니다. 혈당 수치에 이상이 있거나 건강 관련 판단이 필요한 경우 의료진과 상담해야 합니다.

---

# English

# Glucose Log PWA

A static PWA for personal blood glucose logging. Records are stored locally in browser IndexedDB by default. When hosted on Firebase Hosting, Google sign-in and Cloud Firestore can be used for account-based cloud sync.

## Features

- Add, edit, and delete glucose readings
- Morning/lunch/evening meal period selection
- Fasting and 2-hour post-meal timing selection
- Meal notes, exercise status, medication status, and memo fields
- Daily checklist
- Today summary, recent records, and full record list
- Calendar view
- Weekly and monthly charts
- Point tooltip with average glucose, measurement count, and latest change
- Recent 30-day insight cards
- Local IndexedDB storage
- Optional Firebase Auth/Firestore cloud backup
- CSV export
- In-app help guide

## Run Locally

The app is made of static files, so `index.html` can be opened directly for basic use. For PWA, service worker, and Firebase initialization testing, use a local server or Firebase Hosting.

```powershell
cd path\to\diabetes-log-pwa
python -m http.server 5173
```

Open this URL on the PC:

```txt
http://localhost:5173
```

For phone testing on the same Wi-Fi network, bind the server to all interfaces and use the PC local IP.

```powershell
python -m http.server 5174 --bind 0.0.0.0
```

Example:

```txt
http://<PC-IP>:5174
```

## Firebase Setup

Cloud backup requires these Firebase features:

- Firebase Hosting
- Firebase Authentication with Google sign-in
- Cloud Firestore
- Firestore security rules

Install Node.js LTS and Firebase CLI if needed.

```powershell
winget install OpenJS.NodeJS.LTS
npm install -g firebase-tools
```

Copy `docs/examples/.firebaserc.example` to `.firebaserc`, then set your Firebase project ID.

Copy `docs/examples/firestore.rules.example` to `firestore.rules`, then update the allowed email list.

## Deploy

```powershell
firebase login
firebase deploy --only hosting,firestore:rules --project your-firebase-project-id
```

If `.firebaserc` is configured:

```powershell
firebase deploy --only hosting,firestore:rules
```

## Data Storage

Records are stored in IndexedDB by default. After Google sign-in on Firebase Hosting, records are synced to Firestore under the signed-in user UID.

Firestore paths:

```txt
users/{uid}/readings/{readingId}
users/{uid}/meta/sync
```

## Test Data

Dummy Firestore test data is stored in `docs/test-data/`. See `docs/test-data/README.md` for import instructions.

## Medical Notice

This app is for personal logging and management support only. It does not replace medical diagnosis, treatment, or medication decisions. Consult a medical professional for health-related decisions.