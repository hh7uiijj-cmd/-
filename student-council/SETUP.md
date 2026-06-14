# วิธี Setup ระบบกิจการนักศึกษา

## 1. สร้าง Firebase Project

1. ไปที่ https://console.firebase.google.com
2. คลิก **Add project** → ตั้งชื่อ (เช่น `student-council`)
3. เปิด/ปิด Google Analytics ตามต้องการ → **Create project**

## 2. เปิดใช้งาน Authentication

1. เมนูซ้าย → **Authentication** → **Get started**
2. แท็บ **Sign-in method** → เปิด **Email/Password** → Save

## 3. สร้าง Firestore Database

1. เมนูซ้าย → **Firestore Database** → **Create database**
2. เลือก **Start in production mode** → เลือก region ใกล้ที่สุด (เช่น `asia-southeast1`)
3. ไปที่แท็บ **Rules** แล้วแทนที่ด้วย:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || isAdmin() || isCommittee());
      allow write: if isAdmin();
    }
    match /events/{id} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /participations/{id} {
      allow read: if request.auth != null &&
        (resource.data.userId == request.auth.uid || isAdmin() || isCommittee());
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update: if isAdmin();
      allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    match /news/{id} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /fcmTokens/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /notifications/{id} {
      allow read, write: if isAdmin();
    }
    function isAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    function isCommittee() {
      return request.auth != null &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'committee';
    }
  }
}
```

## 4. เปิดใช้งาน Cloud Messaging (Push Notifications)

1. เมนูซ้าย → **Project Settings** (ไอคอน ⚙️)
2. แท็บ **Cloud Messaging**
3. ส่วน **Web Push certificates** → **Generate key pair**
4. Copy **Key pair** ไว้ (นี่คือ VAPID_KEY)

## 5. รับ Firebase Config

1. **Project Settings** → แท็บ **General**
2. เลื่อนลงหา **Your apps** → คลิก **</>** (Web)
3. ตั้งชื่อ app → **Register app**
4. Copy ค่า `firebaseConfig` ทั้งหมด

## 6. แก้ไขไฟล์ js/config.js

แก้ค่าต่าง ๆ ใน `js/config.js`:

```js
const FIREBASE_CONFIG = {
  apiKey: "...",           // แทนที่ด้วยค่าจริง
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

const VAPID_KEY = "...";   // จาก Cloud Messaging

const PRESIDENT_IDS = ["รหัสนักศึกษาของคุณ"];  // รหัสประธาน
```

## 7. สร้างบัญชีประธาน (ครั้งแรก)

เนื่องจากยังไม่มีสมาชิก ต้องสร้างบัญชีประธานด้วย Firebase Console:

1. **Authentication** → **Users** → **Add user**
   - Email: `{รหัสนักศึกษา}@student-council.app`  
     (เช่น `6501234567@student-council.app`)
   - Password: ตั้งเอง
2. Copy UID ของ user ที่สร้าง
3. **Firestore** → **users** collection → **Add document**
   - Document ID: UID ที่ copy มา
   - Fields:
     ```
     studentId: "6501234567"
     name: "ชื่อของคุณ"
     position: "ประธานกิจการนักศึกษา"
     role: "admin"
     email: "6501234567@student-council.app"
     ```

## 8. Deploy

วิธีที่ง่ายที่สุดคือ **Firebase Hosting**:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Public directory: student-council
firebase deploy
```

หรือ drag & drop โฟลเดอร์ขึ้น **Netlify** / **Vercel** ก็ได้

---

## ฟีเจอร์ทั้งหมด

| ฟีเจอร์ | สมาชิก | ประธาน |
|---|---|---|
| Login ด้วยรหัสนักศึกษา | ✅ | ✅ |
| ดูสถานะตัวเอง (ชม./กิจกรรม) | ✅ | ✅ |
| บันทึกการทำงาน | ✅ | ✅ |
| ดูประวัติตัวเอง | ✅ | ✅ |
| อ่านข่าวสาร | ✅ | ✅ |
| เพิ่ม/ลบสมาชิก | ❌ | ✅ |
| ดูบันทึกทุกคน | ❌ | ✅ |
| Export CSV | ❌ | ✅ |
| ลงข่าวสาร/ประกาศ | ❌ | ✅ |
| ส่ง Push Notification | ❌ | ✅ |
| PWA (ลงแอปมือถือ) | ✅ | ✅ |
