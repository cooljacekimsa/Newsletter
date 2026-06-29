# 모바일폰 + 클로드앱으로 웹앱 만들기
## 비개발자를 위한 Firebase + GitHub 셋업 가이드

> **이 가이드는?**
> PC나 터미널 없이, 스마트폰의 클로드(Claude) 앱 하나만으로
> 뉴스 수집 웹앱을 만들고 배포한 실제 경험을 정리한 문서입니다.
> 코딩 경험이 없는 분도 따라할 수 있도록 작성했습니다.

---

## 이 방법으로 만든 것

- **웹앱**: 한국 언론사 기사를 자동으로 수집·정리하는 뉴스레터 앱
- **접속 주소**: `https://[프로젝트명].web.app`
- **비용**: 완전 무료 (Firebase 무료 플랜 + GitHub 무료 플랜)
- **개발 환경**: 스마트폰 브라우저 + 클로드 앱만 사용

### 사용한 서비스 3가지

| 서비스 | 역할 | 비용 |
|--------|------|------|
| **Claude (클로드)** | 코드 작성 + 배포 지시 | 유료 구독 필요 |
| **GitHub** | 코드 저장소 + 자동화 서버 | 무료 |
| **Firebase** | 웹사이트 호스팅 + 데이터베이스 | 무료 (Spark 플랜) |

---

## 준비물

- [ ] 스마트폰 (안드로이드 또는 아이폰)
- [ ] Claude Pro 또는 Claude 유료 구독 계정
- [ ] Google 계정 (Firebase용)
- [ ] GitHub 계정 (없으면 새로 만들기: github.com)
- [ ] 이메일 주소

---

## 전체 흐름 한눈에 보기

```
[클로드 앱] ──코드 작성──> [GitHub 저장소]
                                  │
                          코드 올라가면 자동으로
                                  │
                                  ▼
                         [GitHub Actions]
                         (자동 배포 로봇)
                                  │
                          배포 명령 전달
                                  │
                                  ▼
                         [Firebase Hosting]
                         (웹사이트 서버)
                                  │
                          브라우저로 접속
                                  │
                                  ▼
                         [완성된 웹앱 🎉]
                    https://프로젝트명.web.app
```

---

## STEP 1: GitHub 저장소(Repository) 만들기

> GitHub = 코드를 저장하는 구글 드라이브 같은 곳

### 1-1. GitHub 계정 만들기 (이미 있으면 생략)
1. 스마트폰 브라우저에서 **github.com** 접속
2. [Sign up] 버튼 클릭
3. 이메일, 비밀번호, 사용자명 입력 후 계정 생성

### 1-2. 새 저장소 만들기
1. GitHub 로그인 후 우측 상단 **+** 버튼 클릭
2. **New repository** 선택
3. 설정:
   - **Repository name**: `africa` (원하는 이름으로)
   - **Visibility**: `Public` 선택
   - ✅ **Add a README file** 체크
4. **Create repository** 버튼 클릭

> ✅ 완료 확인: `github.com/내아이디/africa` 주소로 접속되면 성공

---

## STEP 2: Firebase 프로젝트 설정

> Firebase = Google이 만든 무료 웹서버 + 데이터베이스

### 2-1. Firebase 프로젝트 생성
1. 스마트폰 브라우저에서 **console.firebase.google.com** 접속
2. Google 계정으로 로그인
3. **프로젝트 추가** 클릭
4. 프로젝트 이름 입력 (예: `africa-office`)
5. Google 애널리틱스는 **사용 안 함** 선택
6. **프로젝트 만들기** 클릭 → 생성 완료까지 1분 대기

### 2-2. Firestore 데이터베이스 생성
> Firestore = 앱의 데이터를 저장하는 데이터베이스

1. 좌측 메뉴에서 **빌드** → **Firestore Database** 클릭
2. **데이터베이스 만들기** 클릭
3. **프로덕션 모드로 시작** 선택 → **다음**
4. 위치: `asia-northeast3 (Seoul)` 선택 → **완료**

### 2-3. Firestore 보안 규칙 설정
> 누가 데이터를 읽고 쓸 수 있는지 결정하는 설정

1. Firestore Database 화면에서 **규칙** 탭 클릭
2. 기존 내용을 **전체 선택 후 삭제**
3. 아래 내용을 **복사해서 붙여넣기**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /settings/{docId} {
      allow read, write: if true;
    }

    match /articles/{docId} {
      allow read: if true;
      allow write: if false;
    }

    match /newsletters/{docId} {
      allow read: if true;
      allow delete: if true;
      allow create, update: if false;
    }

    match /logs/{docId} {
      allow read: if true;
      allow delete: if true;
      allow create, update: if false;
    }
  }
}
```

4. **게시** 버튼 클릭

### 2-4. Firebase 웹앱 등록 (API 키 받기)
> 웹앱이 Firebase에 연결하기 위한 열쇠(API 키)를 발급받는 과정

1. Firebase Console 좌측 상단 **톱니바퀴 아이콘** → **프로젝트 설정**
2. **내 앱** 섹션까지 스크롤
3. 웹 아이콘 **`</>`** 클릭
4. 앱 닉네임 입력 (예: `africa-web`) → **앱 등록**
5. 아래와 같은 코드가 나타남 — **이 정보를 메모장에 복사해두기!**

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",          // ← 이것을 메모
  authDomain: "africa-office.firebaseapp.com",
  projectId: "africa-office",
  storageBucket: "africa-office.appspot.com",
  messagingSenderId: "485578...", // ← 이것을 메모
  appId: "1:485578...:web:9de9..." // ← 이것을 메모
};
```

6. **콘솔로 이동** 클릭

### 2-5. Firebase 서비스 계정 키 생성
> GitHub Actions(자동 배포 로봇)이 Firebase에 접근하기 위한 관리자 키

1. **프로젝트 설정** → **서비스 계정** 탭 클릭
2. **새 비공개 키 생성** 버튼 클릭
3. **키 생성** 클릭 → JSON 파일 다운로드됨
4. 다운로드된 파일을 열어서 **전체 내용 복사** (나중에 GitHub에 붙여넣기)

> ⚠️ 이 JSON 파일은 관리자 비밀번호와 같으므로 외부에 절대 공유하지 마세요!

### 2-6. Firebase Hosting 활성화
1. Firebase Console 좌측 메뉴 **빌드** → **Hosting** 클릭
2. **시작하기** 버튼 클릭
3. 안내 화면에서 그냥 **다음** → **다음** → **콘솔로 이동** 클릭

---

## STEP 3: GitHub Secrets 설정

> Secrets = GitHub에 암호처럼 저장하는 민감한 정보
> (코드에 직접 적으면 안 되는 API 키, 비밀번호 등을 안전하게 저장)

### 3-1. FIREBASE_SERVICE_ACCOUNT 시크릿 추가
> Firebase 서비스 계정 JSON을 GitHub에 등록

1. GitHub 저장소 페이지에서 **Settings** 탭 클릭
2. 좌측 메뉴 **Secrets and variables** → **Actions** 클릭
3. **New repository secret** 버튼 클릭
4. 입력:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT`
   - **Secret**: STEP 2-5에서 복사한 JSON 내용 전체 붙여넣기
5. **Add secret** 클릭

---

## STEP 4: 클로드(Claude)에게 웹앱 코드 만들어달라고 요청

> 이제 클로드 앱에서 실제 코드를 만드는 단계입니다.
> 클로드가 코드를 짜고, GitHub에 올리고, 배포까지 자동으로 합니다.

### 4-1. Claude Code 시작

1. 스마트폰에서 **Claude 앱** 실행 또는 **claude.ai** 접속
2. 새 대화 시작
3. GitHub 저장소와 연결 (Claude Code 웹앱의 경우 저장소 URL 입력)

### 4-2. 클로드에게 요청하는 방법

아래처럼 메시지를 보내면 됩니다:

```
이 GitHub 저장소에 뉴스 수집 웹앱을 만들어줘.

- Firebase 무료 플랜(Spark) 사용
- Firebase Functions 없이 GitHub Actions으로 크롤링
- 4개 탭: 뉴스레터, 수집, 설정, 로그
- Firestore로 데이터 저장
- 모바일 우선 디자인

Firebase 앱 정보:
- apiKey: "여기에 실제 키 입력"
- projectId: "africa-office"
- appId: "여기에 실제 앱ID 입력"
```

### 4-3. 클로드가 하는 일

클로드는 자동으로 다음을 처리합니다:
- HTML, CSS, JavaScript 파일 작성
- GitHub Actions 워크플로우 파일 작성 (자동 배포 설정)
- 뉴스 크롤러 스크립트 작성
- 모든 파일을 GitHub에 커밋(저장) 및 푸시(올리기)

### 4-4. 배포 확인

1. GitHub 저장소 → **Actions** 탭 클릭
2. 최근 실행 중인 워크플로우 확인
3. ✅ 초록색 체크 = 배포 성공
4. `https://[프로젝트명].web.app` 접속하여 확인

> 배포 완료까지 약 2~3분 소요

---

## STEP 5: 자동 수집을 위한 GitHub PAT 발급

> PAT = Personal Access Token (개인 접근 토큰)
> 웹앱에서 "지금 당장 뉴스 수집해!" 버튼을 누를 때 필요

### 5-1. GitHub PAT 만들기
1. GitHub → 우측 상단 프로필 사진 클릭
2. **Settings** → 맨 아래 **Developer settings** 클릭
3. **Personal access tokens** → **Tokens (classic)** 클릭
4. **Generate new token (classic)** 클릭
5. 설정:
   - **Note**: `africa-app-crawl` (설명)
   - **Expiration**: `90 days` 또는 `No expiration`
   - **Scopes**: ✅ `workflow` 체크
6. **Generate token** 클릭
7. 생성된 `ghp_xxxx...` 토큰을 **메모장에 복사** (다시 볼 수 없음!)

### 5-2. 웹앱에 PAT 입력
1. 완성된 웹앱 접속 (`https://프로젝트명.web.app`)
2. **수집** 탭 클릭
3. `ghp_xxxx...` 토큰 입력란에 붙여넣기
4. **저장** 버튼 클릭 (이 기기에만 저장됨, Firestore에 저장되지 않음)

---

## STEP 6: 첫 뉴스 수집 테스트

1. 웹앱 **설정** 탭 접속
2. **포함 키워드**: `아프리카` 입력
3. **시드 URL** 란에 아래 URL 추가:
   ```
   https://www.yna.co.kr/ubuntu/index
   https://www.yna.co.kr/international/index
   ```
4. **저장** 버튼 클릭
5. **수집** 탭으로 이동
6. **24시간 수집** 버튼 클릭
7. GitHub Actions가 실행됨 → 약 2~3분 후 **뉴스레터** 탭에서 결과 확인

---

## 완성된 웹앱 기능 설명

### 뉴스레터 탭
- 수집된 뉴스레터 목록 표시
- 클릭하면 전체 내용 보기
- 복사/공유 버튼 제공
- 개별 삭제 및 전체 삭제 가능

### 수집 탭
- **24시간 수집** / **48시간 수집** 버튼으로 즉시 실행
- 평일 오후 12시(한국 시간) 자동 수집 (GitHub Actions 스케줄)

### 설정 탭
- **포함 키워드**: 수집할 키워드 (예: `아프리카, 나이지리아`)
- **포함 조건**: AND(모두 포함) / OR(하나라도 포함)
- **제외 키워드**: 제외할 키워드 (예: `광고, 협찬`)
- **키워드 그룹**: 자주 쓰는 키워드 조합 저장
- **언론사 우선순위**: 대표 기사 선택 기준
- **시드 URL**: 수집할 뉴스 인덱스 페이지
- **추천 URL 추가** 버튼: 한겨레, 경향신문 등 추가

### 로그 탭
- 수집 과정의 에러 및 진행 상황 확인
- 개별 삭제 및 전체 삭제 가능

---

## 시스템 구조 (클로드에게 설명할 때 참고)

```
[Firebase Hosting] ← 정적 HTML/CSS/JS 서빙
        │
        ▼
[Browser (SPA)]   ← 4탭 단일페이지앱
   설정/조회는 Firestore 직접 읽기/쓰기
        │
        ▼
[Firestore DB]    ← 데이터 저장
  ├─ settings/global       : 키워드, 시드URL, 설정값
  ├─ settings/keyword-groups : 키워드 그룹 목록
  ├─ newsletters/{id}      : 생성된 뉴스레터
  ├─ articles/{id}         : 수집된 기사
  └─ logs/{id}             : 수집 로그

[GitHub Actions]  ← 서버리스 백엔드 (무료!)
  ├─ crawl.yml  : 평일 12시 자동 실행 + 수동 트리거
  └─ deploy.yml : 코드 푸시 시 Firebase 자동 배포

[scripts/]        ← Node.js 크롤러 (GitHub Actions에서 실행)
  ├─ crawl.js          : 메인 실행 파일
  ├─ crawler.js        : 기사 수집 (axios + cheerio)
  ├─ deduplicator.js   : TF-IDF 중복 제거
  └─ newsletterGenerator.js : 뉴스레터 형식 생성
```

---

## 문제 해결 FAQ

### Q. GitHub Actions에서 빨간 X 표시가 나와요
→ Actions 탭 클릭 → 실패한 워크플로우 클릭 → 오류 메시지 복사 → 클로드에게 붙여넣기

### Q. Firestore 규칙 오류가 나요 (Missing or insufficient permissions)
→ Firebase Console → Firestore Database → 규칙 탭에서
   STEP 2-3의 규칙을 다시 붙여넣고 **게시** 클릭

### Q. 뉴스레터 탭이 비어있어요
→ 수집 탭에서 24시간 수집 버튼 클릭 후 3분 대기

### Q. 24시간 수집 버튼을 눌러도 반응이 없어요
→ 수집 탭 PAT 토큰 입력란에 `ghp_xxxx` 토큰이 저장되어 있는지 확인
→ PAT의 `workflow` 권한이 체크되어 있는지 GitHub에서 확인

### Q. 기사가 연합뉴스만 나와요
→ 설정 탭 → 시드 URL → **"추천 URL 추가"** 버튼 클릭 → **저장**

### Q. 웹앱 수정을 요청하고 싶어요
→ 클로드 앱에서 "이 웹앱에서 [원하는 기능]을 추가/수정해줘" 라고 요청
→ 클로드가 코드를 수정하고 자동 배포됨 (약 2~3분 후 반영)

---

## 비용 정리

| 항목 | 비용 | 한도 |
|------|------|------|
| Firebase Hosting | **무료** | 월 10GB 전송 |
| Firestore | **무료** | 일 5만 읽기/2만 쓰기 |
| GitHub Actions | **무료** | 월 2,000분 |
| Claude 구독 | 월 약 20달러 | - |

> 뉴스레터 앱 규모에서는 Firebase 무료 한도를 초과할 일이 거의 없습니다.

---

## 클로드에게 이 프로젝트 설명할 때 참고 문구

다른 Claude 세션에서 이 프로젝트를 이어받을 때:

```
이 GitHub 저장소(shaunyoo-ao/africa)는 한국 아프리카 관련 뉴스를
자동 수집하는 뉴스레터 웹앱입니다.

구조:
- Firebase Hosting으로 정적 SPA 서빙 (public/ 폴더)
- Firebase Functions 없음 (무료 Spark 플랜)
- GitHub Actions(crawl.yml)이 백엔드 크롤러 역할
- Firestore로 데이터 저장 (settings, newsletters, articles, logs)
- 브라우저에서 Firestore 직접 읽기/쓰기 (인증 없음)
- 배포 브랜치: claude/deploy-firebase-MxySo
- 배포: deploy.yml이 hosting만 배포 (firestore 규칙은 수동)

Firebase 프로젝트: newslettersa-d21db
라이브 URL: https://newslettersa-d21db.web.app
```

---

*작성 기준: 2026년 4월 / Claude Sonnet 4.6 사용*
*모바일(Android) 브라우저 + Claude 앱으로 전체 개발 완료*
