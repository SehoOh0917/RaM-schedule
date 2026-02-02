# Firebase 운영 설정 가이드

## 1) Firebase 프로젝트 준비
1. Firebase 콘솔에서 프로젝트 생성
2. Authentication > Sign-in method > 이메일/비밀번호 활성화
3. Firestore Database 생성
4. Web App 추가 후 설정값을 `firebase-config.js`에 입력

## 2) 초기 관리자 계정 1명 만들기
1. Authentication에서 관리자 이메일 계정 생성
2. Firestore `users/{uid}` 문서 생성:
   - `name`: "매니저"
   - `email`: 관리자 이메일
   - `role`: "admin"
   - `active`: true

> `uid`는 Authentication 사용자 UID와 반드시 동일해야 합니다.

## 3) Firebase CLI 배포
프로젝트 루트(`/home/user/ram-schedule`)에서:

```bash
firebase login
firebase use --add
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,functions,hosting
```

## 4) 운영 권한 구조
- 일정 조회/작성/수정/삭제: `users/{uid}`가 `active=true`인 로그인 사용자만 가능
- 직원 목록 조회: 로그인 + active 사용자만 가능
- 직원 생성/권한변경/비활성화: Cloud Functions에서 admin만 가능

## 5) 참고
- 직원 생성은 `createStaffUser` callable function이 처리합니다.
- 비활성화 시 Firestore `active=false` + Firebase Auth `disabled=true`로 함께 반영됩니다.
