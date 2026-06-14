const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNn3R_h7J9yXrCkjqjiE18A1wVkRIcSfw",
  authDomain: "gitjha-d8454.firebaseapp.com",
  projectId: "gitjha-d8454",
  storageBucket: "gitjha-d8454.firebasestorage.app",
  messagingSenderId: "593542089602",
  appId: "1:593542089602:web:3ceb6010ab63fc443add9b"
};

const VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";
const AUTH_DOMAIN_SUFFIX = "@student-council.app";
const PRESIDENT_IDS = ["6711011553009"];
const UNIVERSITY_NAME = "มหาวิทยาลัยสวนดุสิต";
const FACULTY_NAME = "คณะมนุษยศาสตร์และสังคมศาสตร์";

const PROGRAMS = [
  "การออกแบบศิลปะสร้างสรรค์ด้วยปัญญาประดิษฐ์",
  "จิตวิทยาอุตสาหกรรมและองค์การ",
  "ภาษาและการสื่อสาร",
  "ภาษาและวัฒนธรรมไทย",
  "ภาษาจีนเพื่องานบริการ",
  "ภาษาอังกฤษเพื่อการสื่อสาร",
  "ภาษาอังกฤษและภาษาเกาหลีเพื่อการสื่อสารข้ามวัฒนธรรม",
];

// Local accounts (fallback เมื่อ Firebase ไม่พร้อม หรือใช้แบบ offline)
const LOCAL_USERS = [
  { studentId: "6711011553009", password: "22022549", role: "admin", name: "ประธานกิจการนักศึกษา" },
];