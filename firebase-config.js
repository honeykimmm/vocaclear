// Firebase 설정 — 보카클리어 고교필수편 전용 프로젝트
// 실시간 랭킹 + 개인 점수 기록 저장용 Firestore
//
// ⚠️ 사용 전 설정 필요:
// 1. https://console.firebase.google.com 에서 새 프로젝트 생성
// 2. Firestore Database 만들기 (테스트 모드로 시작 가능)
// 3. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가에서 나오는 설정값을 아래에 붙여넣기
// 4. 키를 넣지 않으면 자동으로 "오프라인 모드"로 동작 (이 기기에만 점수 저장됨)

const firebaseConfig = {
  apiKey: "AIzaSyDPLACEHOLDER_REPLACE_ME",
  authDomain: "vocaclear-app.firebaseapp.com",
  projectId: "vocaclear-app",
  storageBucket: "vocaclear-app.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:placeholder"
};

let db = null;
let firebaseReady = false;

const isPlaceholderConfig = firebaseConfig.apiKey.includes("PLACEHOLDER");

if (!isPlaceholderConfig && typeof firebase !== "undefined") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    // 오프라인 퍼시스턴스: 한 번 온라인으로 받아온 데이터는 기기에 캐싱되고,
    // 오프라인 중 저장한 점수는 큐에 쌓였다가 온라인 복귀 시 자동 동기화됨
    db.enablePersistence({ synchronizeTabs: true }).catch((e) => {
      console.warn("Firestore 오프라인 캐시 활성화 실패(여러 탭 동시 사용 등) — 온라인일 때만 정상 동작합니다.", e);
    });
    firebaseReady = true;
  } catch (e) {
    console.warn("Firebase 초기화 실패 — 로컬 모드로 전환됩니다.", e);
    db = null;
    firebaseReady = false;
  }
} else {
  if (isPlaceholderConfig) {
    console.info("Firebase 설정이 아직 비어있어요. firebase-config.js를 채우면 실시간 랭킹이 활성화됩니다. 지금은 오프라인(로컬) 모드로 동작합니다.");
  }
  db = null;
  firebaseReady = false;
}

