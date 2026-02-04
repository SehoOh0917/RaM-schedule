import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig || !firebaseConfig.projectId) {
  throw new Error("firebase-config.js 설정이 필요합니다.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

const createStaffUserFn = httpsCallable(functions, "createStaffUser");
const setStaffRoleFn = httpsCallable(functions, "setStaffRole");
const setStaffActiveFn = httpsCallable(functions, "setStaffActive");

const state = {
  currentUser: null,
  currentView: "month",
  focusDate: new Date(),
  selectedStaff: "all",
  events: [],
  users: [],
  unsubEvents: null,
  unsubUsers: null,
};
let eventsErrorNotified = false;

const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const authError = document.getElementById("authError");
const userMeta = document.getElementById("userMeta");

const scheduleForm = document.getElementById("scheduleForm");
const eventIdInput = document.getElementById("eventId");
const dateInput = document.getElementById("date");
const timeHourInput = document.getElementById("timeHour");
const timeMinuteInput = document.getElementById("timeMinute");
const serviceTypeInput = document.getElementById("serviceType");
const reserverTypeInput = document.getElementById("reserverType");
const brideNameInput = document.getElementById("brideName");
const groomNameInput = document.getElementById("groomName");
const brideContactInput = document.getElementById("brideContact");
const groomContactInput = document.getElementById("groomContact");
const assigneeInput = document.getElementById("assignee");
const notesInput = document.getElementById("notes");
const deleteBtn = document.getElementById("deleteBtn");
const resetBtn = document.getElementById("resetBtn");

const adminPanel = document.getElementById("adminPanel");
const staffForm = document.getElementById("staffForm");
const staffNameInput = document.getElementById("staffName");
const staffEmailInput = document.getElementById("staffEmail");
const staffRoleInput = document.getElementById("staffRole");
const staffPasswordInput = document.getElementById("staffPassword");
const staffManageError = document.getElementById("staffManageError");
const staffTableWrap = document.getElementById("staffTableWrap");

const viewButtons = [...document.querySelectorAll(".view-btn")];
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const todayBtn = document.getElementById("todayBtn");
const printBtn = document.getElementById("printBtn");
const logoutBtn = document.getElementById("logoutBtn");
const staffFilter = document.getElementById("staffFilter");
const assigneeList = document.getElementById("assigneeList");
const periodTitle = document.getElementById("periodTitle");
const scheduleView = document.getElementById("scheduleView");

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatKoreanDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function parseDateTime(date, time) {
  return new Date(`${date}T${time}:00`);
}

function byDateTimeAsc(a, b) {
  return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

function hideAuthError() {
  authError.textContent = "";
  authError.classList.add("hidden");
}

function setManageError(message = "") {
  if (!message) {
    staffManageError.textContent = "";
    staffManageError.classList.add("hidden");
    return;
  }
  staffManageError.textContent = message;
  staffManageError.classList.remove("hidden");
}

function setAuthView(isLoggedIn) {
  authShell.classList.toggle("hidden", isLoggedIn);
  appShell.classList.toggle("hidden", !isLoggedIn);
}

function populateTimeHourOptions() {
  const options = Array.from({ length: 24 }, (_, index) => {
    const displayHour = index + 1;
    const valueHour = displayHour === 24 ? "00" : String(displayHour).padStart(2, "0");
    return `<option value="${valueHour}">${displayHour}시</option>`;
  });
  timeHourInput.innerHTML = options.join("");
}

function getSelectedTime() {
  return `${timeHourInput.value}:${timeMinuteInput.value}`;
}

function setSelectedTime(timeValue) {
  const [hour = "09", minute = "00"] = String(timeValue || "").split(":");
  timeHourInput.value = /^\d{2}$/.test(hour) ? hour : "09";
  timeMinuteInput.value = minute === "30" ? "30" : "00";
}

function getRoundedHalfHourTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = now.getMinutes() >= 30 ? "30" : "00";
  return `${hour}:${minute}`;
}

function resetForm() {
  scheduleForm.reset();
  eventIdInput.value = "";
  deleteBtn.classList.add("hidden");
  dateInput.value = formatDate(new Date());
  setSelectedTime(getRoundedHalfHourTime());
}

function fillForm(event) {
  eventIdInput.value = event.id;
  dateInput.value = event.date;
  setSelectedTime(event.time);
  serviceTypeInput.value = event.serviceType;
  reserverTypeInput.value = event.reserverType;
  brideNameInput.value = event.brideName || "";
  groomNameInput.value = event.groomName || "";
  brideContactInput.value = event.brideContact || "";
  groomContactInput.value = event.groomContact || "";
  assigneeInput.value = event.assignee;
  notesInput.value = event.notes || "";
  deleteBtn.classList.remove("hidden");
}

function getVisibleEvents() {
  const events = [...state.events].sort(byDateTimeAsc);
  if (state.selectedStaff === "all") return events;
  return events.filter((event) => event.assignee === state.selectedStaff);
}

function upsertLocalEvent(event) {
  const index = state.events.findIndex((item) => item.id === event.id);
  if (index >= 0) {
    state.events[index] = event;
    return;
  }
  state.events.push(event);
}

function removeLocalEvent(id) {
  state.events = state.events.filter((event) => event.id !== id);
}

function getUniqueStaff() {
  const activeUsers = state.users.filter((user) => user.active).map((user) => user.name);
  const fromEvents = state.events.map((event) => event.assignee).filter(Boolean);
  const set = new Set([...activeUsers, ...fromEvents]);
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

function updateStaffOptions() {
  const staff = getUniqueStaff();
  const options = ['<option value="all">전체 담당자</option>']
    .concat(staff.map((name) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`))
    .join("");
  staffFilter.innerHTML = options;
  if (!staff.includes(state.selectedStaff) && state.selectedStaff !== "all") {
    state.selectedStaff = "all";
  }
  staffFilter.value = state.selectedStaff;
  assigneeList.innerHTML = staff.map((name) => `<option value="${escapeHTML(name)}"></option>`).join("");
}

function getMonthRange(baseDate) {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
  return { monthStart, gridStart, gridEnd };
}

function getWeekRange(baseDate) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function isSameDate(d1, d2) {
  return formatDate(d1) === formatDate(d2);
}

function isHalfHourTime(timeValue) {
  const minute = Number(String(timeValue).split(":")[1] || "0");
  return minute === 0 || minute === 30;
}

function renderEventNames(event) {
  const names = [event.brideName, event.groomName].filter(Boolean);
  return names.length ? names.join(" / ") : "-";
}

function setCurrentView(view, shouldRender = true) {
  state.currentView = view;
  viewButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (shouldRender) renderView();
}

function eventRowHTML(event) {
  const contacts = [event.brideContact, event.groomContact].filter(Boolean).join(" / ");
  return `
    <article class="event-row" data-id="${event.id}">
      <div class="event-main">
        <span>${escapeHTML(event.time)} · ${escapeHTML(event.serviceType)} · ${escapeHTML(event.assignee)}</span>
      </div>
      <div class="event-sub">예약자: ${escapeHTML(event.reserverType)} · 이름(신부/신랑): ${escapeHTML(renderEventNames(event))}</div>
      <div class="event-sub">연락처(신부/신랑): ${contacts ? escapeHTML(contacts) : "-"}</div>
      ${event.notes ? `<div class="event-sub">특이사항: ${escapeHTML(event.notes)}</div>` : ""}
    </article>
  `;
}

function formatEventPrintLine(event) {
  return `${event.time} ${event.serviceType} (${event.assignee}) - ${renderEventNames(event)}`;
}

function formatPrintTitle() {
  if (state.currentView === "month") {
    const monthStart = new Date(state.focusDate.getFullYear(), state.focusDate.getMonth(), 1);
    return `${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월 월간 일정`;
  }
  if (state.currentView === "week") {
    const { start, end } = getWeekRange(state.focusDate);
    return `${formatDate(start)} ~ ${formatDate(end)} 주간 일정`;
  }
  return `${formatKoreanDate(state.focusDate)} 일간 일정`;
}

function getPrintEvents(filteredEvents) {
  if (state.currentView === "month") {
    const start = new Date(state.focusDate.getFullYear(), state.focusDate.getMonth(), 1);
    const end = new Date(state.focusDate.getFullYear(), state.focusDate.getMonth() + 1, 0);
    return filteredEvents.filter((event) => event.date >= formatDate(start) && event.date <= formatDate(end));
  }
  if (state.currentView === "week") {
    const { start, end } = getWeekRange(state.focusDate);
    return filteredEvents.filter((event) => event.date >= formatDate(start) && event.date <= formatDate(end));
  }
  const dayKey = formatDate(state.focusDate);
  return filteredEvents.filter((event) => event.date === dayKey);
}

function renderPrintCurrentView() {
  const filteredEvents = getVisibleEvents();
  const printEvents = getPrintEvents(filteredEvents).sort(byDateTimeAsc);
  const lines =
    printEvents.length > 0
      ? printEvents
          .map((event) => `<div class="print-line">${escapeHTML(`${event.date} · ${formatEventPrintLine(event)}`)}</div>`)
          .join("")
      : '<div class="print-line">등록된 일정 없음</div>';

  const printRoot = document.getElementById("printCurrentView") || document.createElement("section");
  printRoot.id = "printCurrentView";
  printRoot.className = `print-current-view ${state.currentView}`;
  printRoot.innerHTML = `
    <h2>라엠 메이크업 일정관리</h2>
    <h3>${escapeHTML(formatPrintTitle())}</h3>
    <div class="print-meta">출력 기준일: ${formatKoreanDate(new Date())}</div>
    <section class="print-section">${lines}</section>
  `;

  if (!printRoot.parentNode) appShell.append(printRoot);
  document.body.classList.add("printing-current-view");
  const cleanup = () => document.body.classList.remove("printing-current-view");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}

function renderMonthView(filteredEvents) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const { monthStart, gridStart, gridEnd } = getMonthRange(state.focusDate);
  periodTitle.textContent = `${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월 월간 일정`;

  const eventMap = new Map();
  filteredEvents.forEach((event) => {
    const arr = eventMap.get(event.date) || [];
    arr.push(event);
    eventMap.set(event.date, arr);
  });

  let cursor = new Date(gridStart);
  const rows = [];
  while (cursor <= gridEnd) {
    const cells = [];
    for (let i = 0; i < 7; i += 1) {
      const key = formatDate(cursor);
      const events = (eventMap.get(key) || []).sort(byDateTimeAsc);
      const muted = cursor.getMonth() !== monthStart.getMonth();
      const chips = events
        .slice(0, 3)
        .map(
          (event) =>
            `<div class="event-chip" data-id="${event.id}">${escapeHTML(event.time)} ${escapeHTML(event.assignee)}${
              event.brideName ? ` · ${escapeHTML(event.brideName)}` : ""
            }</div>`
        )
        .join("");
      cells.push(`
        <div class="date-cell ${muted ? "muted" : ""}">
          <div class="date-head">
            <span>${cursor.getDate()}</span>
            ${isSameDate(cursor, new Date()) ? "<span>오늘</span>" : ""}
          </div>
          <div class="chip-list">
            ${chips}
            ${events.length > 3 ? `<div class="event-chip">+${events.length - 3}건</div>` : ""}
          </div>
        </div>
      `);
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(`<div class="month-row">${cells.join("")}</div>`);
  }

  scheduleView.innerHTML = `
    <div class="month-grid">
      <div class="weekday-row">${weekdays.map((day) => `<div>${day}</div>`).join("")}</div>
      ${rows.join("")}
    </div>
  `;
}

function renderWeekView(filteredEvents) {
  const { start, end } = getWeekRange(state.focusDate);
  periodTitle.textContent = `${formatDate(start)} ~ ${formatDate(end)} 주간 일정`;
  const blocks = [];
  const cursor = new Date(start);
  for (let i = 0; i < 7; i += 1) {
    const dateKey = formatDate(cursor);
    const dayEvents = filteredEvents.filter((event) => event.date === dateKey).sort(byDateTimeAsc);
    blocks.push(`
      <section class="day-block">
        <h4>${formatKoreanDate(cursor)}</h4>
        ${dayEvents.length ? dayEvents.map(eventRowHTML).join("") : '<p class="empty">등록된 일정 없음</p>'}
      </section>
    `);
    cursor.setDate(cursor.getDate() + 1);
  }
  scheduleView.innerHTML = `<div class="list-wrap">${blocks.join("")}</div>`;
}

function renderDayView(filteredEvents) {
  const currentDay = formatDate(state.focusDate);
  periodTitle.textContent = `${formatKoreanDate(state.focusDate)} 일간 일정`;
  const dayEvents = filteredEvents.filter((event) => event.date === currentDay).sort(byDateTimeAsc);
  scheduleView.innerHTML = `
    <div class="day-block">
      ${dayEvents.length ? dayEvents.map(eventRowHTML).join("") : '<p class="empty">등록된 일정 없음</p>'}
    </div>
  `;
}

function renderView() {
  updateStaffOptions();
  const filteredEvents = getVisibleEvents();
  if (state.currentView === "month") renderMonthView(filteredEvents);
  if (state.currentView === "week") renderWeekView(filteredEvents);
  if (state.currentView === "day") renderDayView(filteredEvents);
}

function renderUserManager() {
  if (!isAdmin()) {
    adminPanel.classList.add("hidden");
    return;
  }
  adminPanel.classList.remove("hidden");
  const rows = state.users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((user) => {
      const roleOptions = ["admin", "staff"]
        .map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`)
        .join("");
      return `
        <tr>
          <td>${escapeHTML(user.name || "-")}</td>
          <td>${escapeHTML(user.email || "-")}</td>
          <td>
            <select data-action="role" data-uid="${user.id}" ${!user.active ? "disabled" : ""}>
              ${roleOptions}
            </select>
          </td>
          <td><span class="badge ${user.active ? "" : "off"}">${user.active ? "활성" : "비활성"}</span></td>
          <td>
            <button
              type="button"
              class="${user.active ? "danger" : "secondary"}"
              data-action="toggle-active"
              data-uid="${user.id}"
              ${user.id === state.currentUser.uid ? "disabled" : ""}
            >
              ${user.active ? "비활성화" : "활성화"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  staffTableWrap.innerHTML = `
    <table class="staff-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>이메일</th>
          <th>권한</th>
          <th>상태</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function normalizeFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("auth/invalid-credential")) return "이메일 또는 비밀번호를 확인해 주세요.";
  if (code.includes("auth/too-many-requests")) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (code.includes("permission-denied")) return "권한이 없습니다.";
  if (code.includes("not-found")) return "대상을 찾지 못했습니다.";
  return error?.message || "요청 처리 중 오류가 발생했습니다.";
}

function unsubscribeAll() {
  if (state.unsubEvents) state.unsubEvents();
  if (state.unsubUsers) state.unsubUsers();
  state.unsubEvents = null;
  state.unsubUsers = null;
}

function subscribeEvents() {
  if (state.unsubEvents) state.unsubEvents();
  state.unsubEvents = onSnapshot(
    collection(db, "events"),
    (snap) => {
      eventsErrorNotified = false;
      state.events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderView();
    },
    (error) => {
      console.error(error);
      if (!eventsErrorNotified) {
        eventsErrorNotified = true;
        alert(`일정 불러오기 실패: ${normalizeFirebaseError(error)}`);
      }
    }
  );
}

function subscribeUsers() {
  if (state.unsubUsers) state.unsubUsers();
  if (isAdmin()) {
    state.unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        state.users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderUserManager();
        updateStaffOptions();
      },
      (error) => {
        console.error(error);
        setManageError(normalizeFirebaseError(error));
      }
    );
    return;
  }

  // Staff accounts can read only their own profile document by rules.
  state.unsubUsers = onSnapshot(
    doc(db, "users", state.currentUser.uid),
    (snapshot) => {
      state.users = snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : [];
      renderUserManager();
      updateStaffOptions();
    },
    (error) => {
      console.error(error);
      setManageError(normalizeFirebaseError(error));
    }
  );
}

async function loadMyProfile(uid) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;
  return snapshot.data();
}

async function handleAuthUser(user) {
  if (!user) {
    state.currentUser = null;
    state.events = [];
    state.users = [];
    state.focusDate = new Date();
    state.selectedStaff = "all";
    setCurrentView("month", false);
    unsubscribeAll();
    setAuthView(false);
    hideAuthError();
    return;
  }

  try {
    const profile = await loadMyProfile(user.uid);
    if (!profile || profile.active === false) {
      await signOut(auth);
      showAuthError("활성화된 직원 계정이 아닙니다. 관리자에게 문의해 주세요.");
      return;
    }

    state.currentUser = {
      uid: user.uid,
      email: user.email || "",
      name: profile.name || user.email || "직원",
      role: profile.role || "staff",
      active: profile.active !== false,
    };

    setAuthView(true);
    state.focusDate = new Date();
    state.selectedStaff = "all";
    setCurrentView("month", false);
    userMeta.textContent = `${state.currentUser.name} (${state.currentUser.role}) 로그인`;
    hideAuthError();
    resetForm();
    renderView();
    subscribeEvents();
    subscribeUsers();
    renderUserManager();
  } catch (error) {
    await signOut(auth);
    showAuthError(normalizeFirebaseError(error));
  }
}

function changePeriod(direction) {
  const delta = direction === "next" ? 1 : -1;
  if (state.currentView === "month") {
    state.focusDate = new Date(state.focusDate.getFullYear(), state.focusDate.getMonth() + delta, 1);
  } else if (state.currentView === "week") {
    state.focusDate = new Date(state.focusDate);
    state.focusDate.setDate(state.focusDate.getDate() + delta * 7);
  } else {
    state.focusDate = new Date(state.focusDate);
    state.focusDate.setDate(state.focusDate.getDate() + delta);
  }
  renderView();
}

async function upsertEvent(payload) {
  if (payload.id) {
    const ref = doc(db, "events", payload.id);
    await updateDoc(ref, {
      date: payload.date,
      time: payload.time,
      serviceType: payload.serviceType,
      reserverType: payload.reserverType,
      brideName: payload.brideName,
      groomName: payload.groomName,
      brideContact: payload.brideContact,
      groomContact: payload.groomContact,
      assignee: payload.assignee,
      notes: payload.notes,
      updatedAt: serverTimestamp(),
      updatedByUid: state.currentUser.uid,
      updatedByName: state.currentUser.name,
    });
    return payload.id;
  }

  const created = await addDoc(collection(db, "events"), {
    date: payload.date,
    time: payload.time,
    serviceType: payload.serviceType,
    reserverType: payload.reserverType,
    brideName: payload.brideName,
    groomName: payload.groomName,
    brideContact: payload.brideContact,
    groomContact: payload.groomContact,
    assignee: payload.assignee,
    notes: payload.notes,
    createdAt: serverTimestamp(),
    createdByUid: state.currentUser.uid,
    createdByName: state.currentUser.name,
    updatedAt: serverTimestamp(),
    updatedByUid: state.currentUser.uid,
    updatedByName: state.currentUser.name,
  });
  return created.id;
}

async function removeEvent(id) {
  await deleteDoc(doc(db, "events", id));
}

function bindEvents() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "").trim();
    if (!email || !password) return;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showAuthError(normalizeFirebaseError(error));
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  scheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      id: eventIdInput.value || undefined,
      date: dateInput.value,
      time: getSelectedTime(),
      serviceType: serviceTypeInput.value,
      reserverType: reserverTypeInput.value,
      brideName: brideNameInput.value.trim(),
      groomName: groomNameInput.value.trim(),
      brideContact: brideContactInput.value.trim(),
      groomContact: groomContactInput.value.trim(),
      assignee: assigneeInput.value.trim(),
      notes: notesInput.value.trim(),
    };

    if (!payload.date || !payload.time || !payload.serviceType || !payload.reserverType || !payload.assignee) return;
    if (!isHalfHourTime(payload.time)) {
      alert("시간의 분 단위는 00분 또는 30분만 입력할 수 있습니다.");
      return;
    }

    const previousEvents = [...state.events];
    const tempId = payload.id || `temp-${Date.now()}`;
    upsertLocalEvent({
      id: tempId,
      date: payload.date,
      time: payload.time,
      serviceType: payload.serviceType,
      reserverType: payload.reserverType,
      brideName: payload.brideName,
      groomName: payload.groomName,
      brideContact: payload.brideContact,
      groomContact: payload.groomContact,
      assignee: payload.assignee,
      notes: payload.notes,
    });
    state.focusDate = new Date(payload.date);
    renderView();

    try {
      const savedId = await upsertEvent(payload);
      if (!payload.id && savedId !== tempId) {
        removeLocalEvent(tempId);
        upsertLocalEvent({
          id: savedId,
          date: payload.date,
          time: payload.time,
          serviceType: payload.serviceType,
          reserverType: payload.reserverType,
          brideName: payload.brideName,
          groomName: payload.groomName,
          brideContact: payload.brideContact,
          groomContact: payload.groomContact,
          assignee: payload.assignee,
          notes: payload.notes,
        });
        renderView();
      }
      resetForm();
    } catch (error) {
      state.events = previousEvents;
      renderView();
      alert(normalizeFirebaseError(error));
    }
  });

  resetBtn.addEventListener("click", () => resetForm());

  deleteBtn.addEventListener("click", async () => {
    const id = eventIdInput.value;
    if (!id) return;
    const previousEvents = [...state.events];
    removeLocalEvent(id);
    renderView();
    try {
      await removeEvent(id);
      resetForm();
    } catch (error) {
      state.events = previousEvents;
      renderView();
      alert(normalizeFirebaseError(error));
    }
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCurrentView(button.dataset.view);
    });
  });

  prevBtn.addEventListener("click", () => changePeriod("prev"));
  nextBtn.addEventListener("click", () => changePeriod("next"));
  todayBtn.addEventListener("click", () => {
    state.focusDate = new Date();
    renderView();
  });
  staffFilter.addEventListener("change", () => {
    state.selectedStaff = staffFilter.value;
    renderView();
  });
  printBtn.addEventListener("click", () => renderPrintCurrentView());

  scheduleView.addEventListener("click", (event) => {
    const target = event.target;
    const eventEl = target.closest("[data-id]");
    if (!eventEl) return;
    const found = state.events.find((item) => item.id === eventEl.dataset.id);
    if (!found) return;
    fillForm(found);
  });

  staffForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;

    const payload = {
      name: staffNameInput.value.trim(),
      email: staffEmailInput.value.trim().toLowerCase(),
      role: staffRoleInput.value === "admin" ? "admin" : "staff",
      password: staffPasswordInput.value.trim(),
    };
    if (!payload.name || !payload.email || !payload.password) {
      setManageError("이름, 이메일, 초기 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await createStaffUserFn(payload);
      setManageError("");
      staffForm.reset();
      staffRoleInput.value = "staff";
      staffPasswordInput.value = "1234";
    } catch (error) {
      setManageError(normalizeFirebaseError(error));
    }
  });

  staffTableWrap.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.action !== "role") return;
    if (!isAdmin()) return;
    try {
      await setStaffRoleFn({
        uid: target.dataset.uid,
        role: target.value === "admin" ? "admin" : "staff",
      });
      setManageError("");
    } catch (error) {
      setManageError(normalizeFirebaseError(error));
    }
  });

  staffTableWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.dataset.action !== "toggle-active") return;
    if (!isAdmin()) return;
    const uid = target.dataset.uid;
    const rowUser = state.users.find((user) => user.id === uid);
    if (!rowUser) return;
    try {
      await setStaffActiveFn({ uid, active: !rowUser.active });
      setManageError("");
    } catch (error) {
      setManageError(normalizeFirebaseError(error));
    }
  });
}

function boot() {
  populateTimeHourOptions();
  bindEvents();
  onAuthStateChanged(auth, handleAuthUser);
}

boot();
