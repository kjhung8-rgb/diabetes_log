# 혈당 로그 PWA

개인 혈당 기록을 브라우저에서 관리하는 정적 PWA입니다. 기본 데이터는 브라우저의 IndexedDB에 저장되며, Firebase Hosting 환경에서는 Google 로그인과 Firestore를 사용해 기기 간 동기화를 사용할 수 있습니다.

## 주요 기능

- 혈당 기록 추가, 수정, 삭제
- 공복 / 식후 2시간 측정 시점 구분
- 식사, 운동, 약 복용, 메모 기록
- 오늘 기록 요약과 체크리스트
- 기록 리스트와 달력 보기
- 주간 / 월간 그래프
- 패턴 인사이트 카드
- IndexedDB 기반 로컬 저장
- Firebase Auth / Firestore 기반 선택적 클라우드 동기화
- CSV 내보내기
- JSON 백업 / 복원

## 실행 방법

정적 파일 기반 앱이므로 `index.html`을 직접 열어도 기본 기능은 동작합니다. 다만 PWA 설치, 서비스 워커, Firebase Hosting 초기화 스크립트 확인은 로컬 서버 또는 Firebase Hosting 환경에서 실행하는 것을 권장합니다.

```powershell
cd path\to\diabetes-log-pwa
python -m http.server 5173
```

PC 브라우저에서 아래 주소로 접속합니다.

```txt
http://localhost:5173
```

휴대폰에서 같은 와이파이로 테스트하려면 PC의 내부 IP를 사용합니다.

```powershell
python -m http.server 5174 --bind 0.0.0.0
```

예시:

```txt
http://<PC-IP>:5174
```

## Firebase 설정

클라우드 동기화를 사용하려면 Firebase 프로젝트에서 다음 기능을 준비해야 합니다.

- Firebase Hosting
- Firebase Authentication의 Google 로그인
- Cloud Firestore
- Firestore 보안 규칙 배포

Firebase CLI가 없다면 Node.js LTS와 Firebase CLI를 설치합니다.

```powershell
winget install OpenJS.NodeJS.LTS
npm install -g firebase-tools
```

설치 직후 `npm` 또는 `firebase` 명령이 인식되지 않으면 PowerShell을 새로 열고 다시 실행합니다.

Firebase 프로젝트를 연결하려면 `.firebaserc.example`을 `.firebaserc`로 복사한 뒤 프로젝트 ID를 입력합니다.

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

Firestore 규칙은 개인 이메일이 들어가는 로컬 설정 파일입니다. Git에는 예시 파일만 포함하므로, 처음 설정할 때 `firestore.rules.example`을 `firestore.rules`로 복사한 뒤 허용 이메일 목록을 본인이 사용할 계정으로 수정합니다.

```powershell
Copy-Item firestore.rules.example firestore.rules
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

기본 기록은 각 브라우저의 IndexedDB에 저장됩니다. Firebase Hosting에서 앱을 실행하고 Google 로그인에 성공하면 Firestore의 사용자별 경로에 기록을 동기화합니다.

Firestore 경로 구조:

```txt
users/{uid}/readings/{readingId}
users/{uid}/meta/sync
```

Firestore 규칙은 로그인한 사용자가 자신의 `uid` 경로에만 접근하도록 제한하며, 이메일 인증과 허용 이메일 목록을 함께 확인합니다.

## 저장소 관리 주의사항

다음 파일은 개인 환경 정보 또는 로컬 실행 기록을 포함할 수 있으므로 커밋하지 않습니다.

- `.firebaserc`
- `.firebase/`
- `firestore.rules`
- `firebase-debug.log`
- `server*.log`
- `server*.err`
- `.env*`
- Firebase service account JSON 파일

이 항목들은 `.gitignore`에 포함되어 있습니다.

## 의료 관련 주의

이 앱은 개인 기록과 분석 보조용입니다. 진단, 치료, 약물 조정 판단은 반드시 의료진의 안내를 우선해야 합니다.

