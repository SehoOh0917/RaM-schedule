const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

async function getActor(authContext) {
  if (!authContext) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const actorRef = db.collection("users").doc(authContext.uid);
  const actorSnap = await actorRef.get();
  if (!actorSnap.exists) {
    throw new HttpsError("permission-denied", "직원 계정이 등록되지 않았습니다.");
  }
  const actor = actorSnap.data();
  if (!actor.active) {
    throw new HttpsError("permission-denied", "비활성화된 계정입니다.");
  }
  return { uid: authContext.uid, ...actor };
}

async function assertAdmin(authContext) {
  const actor = await getActor(authContext);
  if (actor.role !== "admin") {
    throw new HttpsError("permission-denied", "관리자만 실행할 수 있습니다.");
  }
  return actor;
}

async function countActiveAdmins() {
  const snap = await db
    .collection("users")
    .where("role", "==", "admin")
    .where("active", "==", true)
    .get();
  return snap.size;
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "staff";
}

exports.createStaffUser = onCall(async (request) => {
  await assertAdmin(request.auth);
  const name = String(request.data?.name || "").trim();
  const email = String(request.data?.email || "").trim().toLowerCase();
  const password = String(request.data?.password || "").trim();
  const role = normalizeRole(request.data?.role);

  if (!name || !email || !password) {
    throw new HttpsError("invalid-argument", "이름, 이메일, 비밀번호가 필요합니다.");
  }
  if (password.length < 4) {
    throw new HttpsError("invalid-argument", "비밀번호는 4자 이상이어야 합니다.");
  }

  const userRecord = await auth.createUser({
    email,
    password,
    displayName: name,
    disabled: false,
  });

  await db.collection("users").doc(userRecord.uid).set({
    name,
    email,
    role,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, uid: userRecord.uid };
});

exports.setStaffRole = onCall(async (request) => {
  await assertAdmin(request.auth);
  const uid = String(request.data?.uid || "").trim();
  const role = normalizeRole(request.data?.role);
  if (!uid) throw new HttpsError("invalid-argument", "uid가 필요합니다.");

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "직원 계정을 찾지 못했습니다.");
  const target = snap.data();

  if (target.role === "admin" && role !== "admin" && target.active) {
    const activeAdminCount = await countActiveAdmins();
    if (activeAdminCount <= 1) {
      throw new HttpsError("failed-precondition", "최소 1명의 활성 관리자 계정이 필요합니다.");
    }
  }

  await ref.update({
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

exports.setStaffActive = onCall(async (request) => {
  const actor = await assertAdmin(request.auth);
  const uid = String(request.data?.uid || "").trim();
  const active = Boolean(request.data?.active);
  if (!uid) throw new HttpsError("invalid-argument", "uid가 필요합니다.");
  if (uid === actor.uid && !active) {
    throw new HttpsError("failed-precondition", "본인 계정은 비활성화할 수 없습니다.");
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "직원 계정을 찾지 못했습니다.");
  const target = snap.data();

  if (target.role === "admin" && target.active && !active) {
    const activeAdminCount = await countActiveAdmins();
    if (activeAdminCount <= 1) {
      throw new HttpsError("failed-precondition", "최소 1명의 활성 관리자 계정이 필요합니다.");
    }
  }

  await ref.update({
    active,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await auth.updateUser(uid, { disabled: !active });

  return { ok: true };
});
