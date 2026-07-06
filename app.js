"use strict";

const DB_NAME = "glucose-log-db";
const DB_VERSION = 1;
const STORE_NAME = "readings";

const TARGETS = {
  fasting: { label: "공복", min: 80, max: 130 },
  postprandial2h: { label: "식후 2시간 후", min: 70, max: 180 },
};

const PERIODS = {
  morning: { label: "아침" },
  lunch: { label: "점심" },
  evening: { label: "저녁" },
};

const CALENDAR_SLOTS = [
  { id: "morningFasting", period: "morning", timing: "fasting", label: "아침 공복" },
  { id: "morningPost", period: "morning", timing: "postprandial2h", label: "아침 식후 2시간" },
  { id: "lunchFasting", period: "lunch", timing: "fasting", label: "점심 공복" },
  { id: "lunchPost", period: "lunch", timing: "postprandial2h", label: "점심 식후 2시간" },
  { id: "eveningFasting", period: "evening", timing: "fasting", label: "저녁 공복" },
  { id: "eveningPost", period: "evening", timing: "postprandial2h", label: "저녁 식후 2시간" },
];

const state = {
  readings: [],
  editingId: null,
  activeTab: "dashboard",
  rangeFilter: "30",
  timingFilter: "all",
  selectedDate: toDateKey(new Date()),
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  isPeriodManuallySelected: false,
  isTimingManuallySelected: false,
  cloud: {
    auth: null,
    db: null,
    user: null,
    unsubscribe: null,
    isAvailable: false,
    isSyncing: false,
    lastSyncedAt: null,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  form: $("#readingForm"),
  formTitle: $("#formTitle"),
  valueInput: $("#valueInput"),
  measuredAtInput: $("#measuredAtInput"),
  mealNoteInput: $("#mealNoteInput"),
  exerciseInput: $("#exerciseInput"),
  medicationInput: $("#medicationInput"),
  memoInput: $("#memoInput"),
  submitLabel: $("#submitLabel"),
  cancelEditButton: $("#cancelEditButton"),
  todayDateLabel: $("#todayDateLabel"),
  todaySummary: $("#todaySummary"),
  todaySlotChecklist: $("#todaySlotChecklist"),
  patternAlerts: $("#patternAlerts"),
  recentList: $("#recentList"),
  recordList: $("#recordList"),
  recordCountLabel: $("#recordCountLabel"),
  rangeFilter: $("#rangeFilter"),
  timingFilter: $("#timingFilter"),
  calendarTitle: $("#calendarTitle"),
  calendarGrid: $("#calendarGrid"),
  selectedDateTitle: $("#selectedDateTitle"),
  selectedDateMeta: $("#selectedDateMeta"),
  selectedDateList: $("#selectedDateList"),
  weeklyChart: $("#weeklyChart"),
  monthlyChart: $("#monthlyChart"),
  insightGrid: $("#insightGrid"),
  insightRangeLabel: $("#insightRangeLabel"),
  syncStatusText: $("#syncStatusText"),
  cloudSignInButton: $("#cloudSignInButton"),
  cloudSyncButton: $("#cloudSyncButton"),
  cloudSignOutButton: $("#cloudSignOutButton"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setDefaultDateTime();
  bindEvents();
  await loadReadings();
  render();
  applySuggestedPeriodSelection({ force: true });
  applySuggestedTimingSelection({ force: true });
  initCloudSync();
  registerServiceWorker();
}

function bindEvents() {
  elements.form.addEventListener("submit", handleSubmit);
  elements.cancelEditButton.addEventListener("click", resetForm);
  elements.measuredAtInput.addEventListener("change", () => {
    applySuggestedPeriodSelection();
    applySuggestedTimingSelection();
  });
  elements.form.querySelectorAll("input[name=\"period\"]").forEach((input) => {
    input.addEventListener("change", () => {
      state.isPeriodManuallySelected = true;
      applySuggestedTimingSelection({ force: !state.isTimingManuallySelected });
    });
  });
  elements.form.querySelectorAll("input[name=\"timing\"]").forEach((input) => {
    input.addEventListener("change", () => {
      state.isTimingManuallySelected = true;
    });
  });
  elements.rangeFilter.addEventListener("change", (event) => {
    state.rangeFilter = event.target.value;
    render();
  });
  elements.timingFilter.addEventListener("change", (event) => {
    state.timingFilter = event.target.value;
    renderRecords();
  });
  elements.cloudSignInButton.addEventListener("click", signInToCloud);
  elements.cloudSyncButton.addEventListener("click", syncWithCloud);
  elements.cloudSignOutButton.addEventListener("click", signOutFromCloud);
  $("#prevMonthButton").addEventListener("click", () => changeMonth(-1));
  $("#nextMonthButton").addEventListener("click", () => changeMonth(1));

  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  $$("[data-open-tab]").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.openTab));
  });

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    const deleteButton = event.target.closest("[data-delete-id]");
    const dayButton = event.target.closest("[data-calendar-date]");

    if (editButton) {
      startEdit(editButton.dataset.editId);
    }

    if (deleteButton) {
      deleteReading(deleteButton.dataset.deleteId);
    }

    if (dayButton) {
      state.selectedDate = dayButton.dataset.calendarDate;
      renderCalendar();
      renderSelectedDateList();
    }
  });

  window.addEventListener("resize", debounce(() => {
    renderCharts();
  }, 120));
}

async function loadReadings() {
  state.readings = await getAllReadings();
  sortReadings();
}

function initCloudSync() {
  if (!window.firebase?.apps?.length || !window.firebase.auth || !window.firebase.firestore) {
    state.cloud.isAvailable = false;
    updateSyncUi("클라우드 백업은 배포된 주소에서 사용할 수 있습니다.");
    return;
  }

  state.cloud.isAvailable = true;
  state.cloud.auth = window.firebase.auth();
  state.cloud.db = window.firebase.firestore();
  state.cloud.auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  state.cloud.auth.onAuthStateChanged(async (user) => {
    state.cloud.user = user;
    stopCloudListener();

    if (!user) {
      updateSyncUi("로그인이 필요합니다.");
      return;
    }

    updateSyncUi("클라우드 백업을 준비 중입니다.");
    await syncWithCloud();
    startCloudListener();
  });
}

async function signInToCloud() {
  if (!state.cloud.auth) {
    alert("클라우드 백업을 사용할 수 없습니다.");
    return;
  }

  const provider = new window.firebase.auth.GoogleAuthProvider();
  try {
    await state.cloud.auth.signInWithPopup(provider);
  } catch (error) {
    if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/operation-not-supported-in-this-environment"].includes(error.code)) {
      await state.cloud.auth.signInWithRedirect(provider);
      return;
    }

    console.error(error);
    alert("Google 로그인을 완료하지 못했습니다.");
  }
}

async function signOutFromCloud() {
  if (!state.cloud.auth) return;
  if (!confirm("클라우드 백업 계정에서 로그아웃하시겠습니까? 로컬 기록은 유지됩니다.")) return;

  stopCloudListener();
  await state.cloud.auth.signOut();
  state.cloud.user = null;
  updateSyncUi("로그인이 필요합니다.");
}

async function syncWithCloud() {
  if (!state.cloud.user || !state.cloud.db || state.cloud.isSyncing) {
    updateSyncUi();
    return;
  }

  state.cloud.isSyncing = true;
  updateSyncUi("동기화 중입니다.");

  try {
    await loadReadings();
    const localById = new Map(state.readings.map((reading) => [reading.id, reading]));
    const collection = getCloudReadingsCollection();
    const snapshot = await collection.get();
    const cloudById = new Map();

    snapshot.forEach((doc) => {
      const reading = normalizeReading({ id: doc.id, ...doc.data() });
      if (reading) cloudById.set(reading.id, reading);
    });

    for (const cloudReading of cloudById.values()) {
      const localReading = localById.get(cloudReading.id);
      if (!localReading || isNewerReading(cloudReading, localReading)) {
        await putReading(cloudReading);
      }
    }

    await loadReadings();
    const writes = state.readings.map((reading) => {
      const cloudReading = cloudById.get(reading.id);
      if (cloudReading && isNewerReading(cloudReading, reading)) return null;
      return collection.doc(reading.id).set(toCloudReading(reading), { merge: true });
    }).filter(Boolean);

    await Promise.all(writes);
    await saveCloudMeta();
    await loadReadings();
    render();
    applySuggestedPeriodSelection();
    applySuggestedTimingSelection();
    state.cloud.lastSyncedAt = new Date();
    updateSyncUi();
  } catch (error) {
    console.error(error);
    updateSyncUi("클라우드 동기화에 실패했습니다. 로컬 기록은 유지됩니다.");
  } finally {
    state.cloud.isSyncing = false;
    updateSyncUi();
  }
}

function startCloudListener() {
  if (!state.cloud.user || !state.cloud.db) return;

  state.cloud.unsubscribe = getCloudReadingsCollection().onSnapshot(async (snapshot) => {
    let changed = false;

    for (const change of snapshot.docChanges()) {
      if (change.type === "removed") {
        await removeReading(change.doc.id);
        changed = true;
        continue;
      }

      const cloudReading = normalizeReading({ id: change.doc.id, ...change.doc.data() });
      if (!cloudReading) continue;

      const localReading = state.readings.find((reading) => reading.id === cloudReading.id);
      if (!localReading || isNewerReading(cloudReading, localReading)) {
        await putReading(cloudReading);
        changed = true;
      }
    }

    if (changed) {
      await loadReadings();
      render();
      applySuggestedPeriodSelection();
      applySuggestedTimingSelection();
    }

    state.cloud.lastSyncedAt = new Date();
    updateSyncUi();
  }, (error) => {
    console.error(error);
    updateSyncUi("클라우드 변경사항을 받지 못했습니다.");
  });
}

function stopCloudListener() {
  if (state.cloud.unsubscribe) {
    state.cloud.unsubscribe();
    state.cloud.unsubscribe = null;
  }
}

async function syncCloudReading(reading) {
  if (!state.cloud.user || !state.cloud.db) {
    updateSyncUi();
    return;
  }

  updateSyncUi("클라우드에 저장 중입니다.");

  try {
    await getCloudReadingsCollection().doc(reading.id).set(toCloudReading(reading), { merge: true });
    await saveCloudMeta();
    state.cloud.lastSyncedAt = new Date();
    updateSyncUi();
  } catch (error) {
    console.error(error);
    updateSyncUi("클라우드 저장에 실패했습니다. 로컬에는 저장되었습니다.");
  }
}

async function deleteCloudReading(id) {
  if (!state.cloud.user || !state.cloud.db) {
    updateSyncUi();
    return;
  }

  updateSyncUi("클라우드에서 삭제 중입니다.");

  try {
    await getCloudReadingsCollection().doc(id).delete();
    await saveCloudMeta();
    state.cloud.lastSyncedAt = new Date();
    updateSyncUi();
  } catch (error) {
    console.error(error);
    updateSyncUi("클라우드 삭제에 실패했습니다. 로컬에서는 삭제되었습니다.");
  }
}

function getCloudReadingsCollection() {
  return state.cloud.db.collection("users").doc(state.cloud.user.uid).collection("readings");
}

function getCloudMetaDoc() {
  return state.cloud.db.collection("users").doc(state.cloud.user.uid).collection("meta").doc("sync");
}

function toCloudReading(reading) {
  return {
    value: reading.value,
    unit: "mg/dL",
    measuredAt: reading.measuredAt,
    period: reading.period,
    timing: reading.timing,
    mealNote: reading.mealNote ?? "",
    exercised: Boolean(reading.exercised),
    medicationTaken: Boolean(reading.medicationTaken),
    memo: reading.memo ?? "",
    createdAt: reading.createdAt,
    updatedAt: reading.updatedAt,
  };
}

function isNewerReading(left, right) {
  return new Date(left.updatedAt ?? left.measuredAt).getTime() > new Date(right.updatedAt ?? right.measuredAt).getTime();
}

async function saveCloudMeta() {
  if (!state.cloud.user || !state.cloud.db) return;

  await getCloudMetaDoc().set({
    lastSyncedAt: new Date().toISOString(),
    userEmail: state.cloud.user.email ?? "",
  }, { merge: true });
}

function updateSyncUi(message) {
  const signedIn = Boolean(state.cloud.user);
  const email = state.cloud.user?.email ?? "";
  const lastSync = state.cloud.lastSyncedAt ? ` · 마지막 동기화 ${formatRelativeTime(state.cloud.lastSyncedAt)}` : "";

  elements.cloudSignInButton.classList.toggle("hidden", signedIn);
  elements.cloudSyncButton.classList.toggle("hidden", !signedIn);
  elements.cloudSignOutButton.classList.toggle("hidden", !signedIn);
  elements.cloudSyncButton.disabled = state.cloud.isSyncing;

  if (message) {
    elements.syncStatusText.textContent = message;
    return;
  }

  if (!state.cloud.isAvailable) {
    elements.syncStatusText.textContent = "클라우드 백업은 배포된 주소에서 사용할 수 있습니다.";
    return;
  }

  elements.syncStatusText.textContent = signedIn
    ? `${email} 계정으로 자동 백업 중입니다${lastSync}.`
    : "로그인이 필요합니다.";
}

async function handleSubmit(event) {
  event.preventDefault();

  const value = Number(elements.valueInput.value);
  const measuredAtValue = elements.measuredAtInput.value;
  const formData = new FormData(elements.form);
  const period = formData.get("period");
  const timing = formData.get("timing");

  if (!Number.isFinite(value) || value < 20 || value > 600) {
    alert("혈당값은 20-600 사이로 입력해 주세요.");
    return;
  }

  if (!measuredAtValue) {
    alert("측정 일시를 입력해 주세요.");
    return;
  }

  if (!PERIODS[period]) {
    alert("아침, 점심, 저녁 중 하나를 선택해 주세요.");
    return;
  }

  const now = new Date().toISOString();
  const existing = state.editingId ? state.readings.find((reading) => reading.id === state.editingId) : null;
  const reading = {
    id: existing?.id ?? createId(),
    value,
    unit: "mg/dL",
    measuredAt: new Date(measuredAtValue).toISOString(),
    period,
    timing,
    mealNote: elements.mealNoteInput.value.trim(),
    exercised: elements.exerciseInput.checked,
    medicationTaken: elements.medicationInput.checked,
    memo: elements.memoInput.value.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await putReading(reading);
  await loadReadings();
  state.selectedDate = toDateKey(new Date(reading.measuredAt));
  resetForm();
  render();
  syncCloudReading(reading);
}

function startEdit(id) {
  const reading = state.readings.find((item) => item.id === id);
  if (!reading) return;

  state.editingId = id;
  elements.formTitle.textContent = "기록 수정";
  elements.submitLabel.textContent = "저장";
  elements.cancelEditButton.classList.remove("hidden");
  elements.valueInput.value = reading.value;
  elements.measuredAtInput.value = toDateTimeLocal(new Date(reading.measuredAt));
  elements.mealNoteInput.value = reading.mealNote ?? "";
  elements.exerciseInput.checked = Boolean(reading.exercised);
  elements.medicationInput.checked = Boolean(reading.medicationTaken);
  elements.memoInput.value = reading.memo ?? "";
  const periodInput = elements.form.querySelector(`input[name="period"][value="${reading.period}"]`);
  if (periodInput) periodInput.checked = true;
  elements.form.querySelector(`input[name="timing"][value="${reading.timing}"]`).checked = true;
  setActiveTab("dashboard");
  elements.valueInput.focus();
}

async function deleteReading(id) {
  const reading = state.readings.find((item) => item.id === id);
  if (!reading) return;

  const label = `${formatDateTime(new Date(reading.measuredAt))} ${reading.value}mg/dL`;
  if (!confirm(`${label} 기록을 삭제하시겠습니까?`)) return;

  await removeReading(id);
  await loadReadings();
  if (state.editingId === id) resetForm();
  render();
  applySuggestedPeriodSelection();
  applySuggestedTimingSelection();
  deleteCloudReading(id);
}

function resetForm() {
  state.editingId = null;
  state.isPeriodManuallySelected = false;
  state.isTimingManuallySelected = false;
  elements.form.reset();
  setDefaultDateTime();
  elements.formTitle.textContent = "혈당 기록";
  elements.submitLabel.textContent = "추가";
  elements.cancelEditButton.classList.add("hidden");
  applySuggestedPeriodSelection({ force: true });
  applySuggestedTimingSelection({ force: true });
}

function render() {
  renderHeaderDates();
  renderTodaySlotChecklist();
  renderTodaySummary();
  renderAlerts();
  renderRecentList();
  renderRecords();
  renderCalendar();
  renderSelectedDateList();
  renderCharts();
  renderInsights();
}

function renderHeaderDates() {
  elements.todayDateLabel.textContent = formatDate(new Date());
}

function renderTodaySlotChecklist() {
  const completedSlots = getCompletedSlotIdsForDate(new Date());

  elements.todaySlotChecklist.innerHTML = CALENDAR_SLOTS.map((slot) => {
    const isDone = completedSlots.has(slot.id);
    return `
      <div class="slot-check ${isDone ? "is-done" : ""}" title="${escapeHtml(slot.label)} ${isDone ? "기록 완료" : "기록 없음"}">
        <span class="slot-check-label">${escapeHtml(slot.label)}</span>
        <span class="slot-check-icon" aria-label="${isDone ? "기록 완료" : "기록 없음"}">${isDone ? "✓" : "-"}</span>
      </div>
    `;
  }).join("");
}

function renderTodaySummary() {
  const today = toDateKey(new Date());
  const todayReadings = state.readings.filter((reading) => toDateKey(new Date(reading.measuredAt)) === today);
  const recent = todayReadings[0] ?? state.readings[0];
  const values = todayReadings.map((reading) => reading.value);
  const inRange = todayReadings.filter((reading) => getStatus(reading).type === "good").length;
  const ratio = todayReadings.length ? Math.round((inRange / todayReadings.length) * 100) : null;

  const cards = [
    {
      label: "최근 혈당",
      value: recent ? `${recent.value}` : "-",
      meta: recent ? `${TARGETS[recent.timing].label} · ${formatRelativeTime(new Date(recent.measuredAt))}` : "기록이 없습니다.",
    },
    {
      label: "오늘 평균",
      value: values.length ? `${Math.round(average(values))}` : "-",
      meta: values.length ? `${values.length}회 기록` : "기록이 없습니다.",
    },
    {
      label: "오늘 최고",
      value: values.length ? `${Math.max(...values)}` : "-",
      meta: values.length ? "mg/dL" : "기록이 없습니다.",
    },
    {
      label: "오늘 최저",
      value: values.length ? `${Math.min(...values)}` : "-",
      meta: values.length ? "mg/dL" : "기록이 없습니다.",
    },
    {
      label: "목표 범위",
      value: ratio === null ? "-" : `${ratio}%`,
      meta: todayReadings.length ? `${inRange}/${todayReadings.length}회 목표 내` : "기록이 없습니다.",
    },
    {
      label: "전체 기록",
      value: `${state.readings.length}`,
      meta: "로컬 저장",
    },
  ];

  elements.todaySummary.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.meta)}</small>
    </article>
  `).join("");
}

function renderAlerts() {
  const alerts = buildPatternAlerts(state.readings);
  elements.patternAlerts.innerHTML = alerts.length
    ? alerts.map((alertItem) => `<div class="notice ${alertItem.level}">${escapeHtml(alertItem.text)}</div>`).join("")
    : `<div class="notice">최근 패턴 알림이 없습니다. 개인 목표 범위는 필요한 경우 의료진 기준에 맞춰 조정해야 합니다.</div>`;
}

function renderRecentList() {
  const recent = state.readings.slice(0, 5);
  renderRecordList(elements.recentList, recent, { compact: true });
}

function renderRecords() {
  const readings = getVisibleReadings();
  elements.recordCountLabel.textContent = readings.length ? `${readings.length}개 기록` : "표시할 기록이 없습니다.";
  renderRecordList(elements.recordList, readings);
}

function renderRecordList(container, readings) {
  if (!readings.length) {
    container.innerHTML = $("#emptyTemplate").innerHTML;
    return;
  }

  container.innerHTML = readings.map((reading) => {
    const measuredAt = new Date(reading.measuredAt);
    const status = getStatus(reading);
    const badges = getRecordBadges(reading);
    const memoParts = [reading.mealNote, reading.memo].filter(Boolean);

    return `
      <article class="record-card">
        <div class="record-value">
          <strong>${reading.value}</strong>
          <span>mg/dL</span>
        </div>
        <div class="record-main">
          <h3 class="record-title">
            <span class="record-badge period ${badges.periodClass}">${escapeHtml(badges.periodLabel)}</span>
            <span class="record-badge timing ${badges.timingClass}">${escapeHtml(badges.timingLabel)}</span>
            <span class="record-time">· ${formatDateTime(measuredAt)}</span>
          </h3>
          <div class="chip-row">
            <span class="chip ${status.type}">${status.label}</span>
            ${reading.exercised ? `<span class="chip">운동</span>` : ""}
            ${reading.medicationTaken ? `<span class="chip">약</span>` : `<span class="chip">약 미복용</span>`}
          </div>
          ${memoParts.length ? `<p>${escapeHtml(memoParts.join(" · "))}</p>` : ""}
        </div>
        <div class="record-actions">
          <button class="icon-button" type="button" data-edit-id="${escapeHtml(reading.id)}" aria-label="기록 수정" title="기록 수정">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button class="icon-button" type="button" data-delete-id="${escapeHtml(reading.id)}" aria-label="기록 삭제" title="기록 삭제">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCalendar() {
  const month = state.calendarMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previousMonthDays = new Date(year, monthIndex, 0).getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const cells = [];
  const readingsByDate = groupBy(state.readings, (reading) => toDateKey(new Date(reading.measuredAt)));

  elements.calendarTitle.textContent = `${year}년 ${monthIndex + 1}월`;

  weekdays.forEach((day) => {
    cells.push(`<div class="weekday">${day}</div>`);
  });

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - startOffset + 1;
    const isPrevious = dayNumber < 1;
    const isNext = dayNumber > daysInMonth;
    const displayDay = isPrevious
      ? previousMonthDays + dayNumber
      : isNext
        ? dayNumber - daysInMonth
        : dayNumber;
    const date = new Date(year, monthIndex + (isPrevious ? -1 : isNext ? 1 : 0), displayDay);
    const key = toDateKey(date);
    const dayReadings = readingsByDate.get(key) ?? [];
    const avgValue = dayReadings.length ? Math.round(average(dayReadings.map((reading) => reading.value))) : null;
    const highCount = dayReadings.filter((reading) => getStatus(reading).type === "high").length;
    const slotSummary = buildCalendarSlotSummary(dayReadings);

    cells.push(`
      <button class="calendar-day ${isPrevious || isNext ? "is-muted" : ""} ${key === state.selectedDate ? "is-selected" : ""}" type="button" data-calendar-date="${key}">
        <strong>${displayDay}</strong>
        ${avgValue === null ? "" : `<span class="calendar-avg">평균 ${avgValue}</span>`}
        ${dayReadings.length ? `<span class="calendar-count">${dayReadings.length}회${highCount ? ` · 높음 ${highCount}` : ""}</span>` : ""}
        ${slotSummary.length ? `
          <div class="calendar-slots">
            ${slotSummary.map((slot) => `
              <span class="calendar-slot">
                <b>${slot.label}</b>
                <em>${slot.value}</em>
              </span>
            `).join("")}
          </div>
        ` : ""}
      </button>
    `);
  }

  elements.calendarGrid.innerHTML = cells.join("");
}

function buildCalendarSlotSummary(readings) {
  if (!readings.length) return [];

  const slotValues = new Map(CALENDAR_SLOTS.map((slot) => [slot.id, []]));

  readings.forEach((reading) => {
    const slotId = getCalendarSlotId(reading);
    slotValues.get(slotId)?.push(reading.value);
  });

  return CALENDAR_SLOTS.map((slot) => {
    const values = slotValues.get(slot.id) ?? [];
    return {
      label: slot.label,
      value: values.length ? Math.round(average(values)) : "-",
    };
  });
}

function inferPeriodFromDate(date) {
  const hour = date.getHours();
  if (hour < 11) return "morning";
  if (hour < 16) return "lunch";
  return "evening";
}

function getReadingPeriod(reading) {
  if (PERIODS[reading.period]) return reading.period;
  const measuredAt = new Date(reading.measuredAt);
  return Number.isNaN(measuredAt.getTime()) ? "morning" : inferPeriodFromDate(measuredAt);
}

function getSlotId(period, timing) {
  return `${period}${timing === "fasting" ? "Fasting" : "Post"}`;
}

function getCalendarSlotId(reading) {
  const period = getReadingPeriod(reading);
  const timing = TARGETS[reading.timing] ? reading.timing : "fasting";
  return getSlotId(period, timing);
}

function getRecordBadges(reading) {
  const period = getReadingPeriod(reading);
  const isFasting = reading.timing === "fasting";

  return {
    periodLabel: PERIODS[period]?.label ?? "아침",
    periodClass: period,
    timingLabel: isFasting ? "공복" : "식후 2시간",
    timingClass: isFasting ? "fasting" : "post",
  };
}

function getSelectedPeriodForForm(date) {
  const selectedPeriod = new FormData(elements.form).get("period");
  return PERIODS[selectedPeriod] ? selectedPeriod : inferPeriodFromDate(date);
}

function applySuggestedPeriodSelection({ force = false } = {}) {
  if (state.editingId) return;
  if (state.isPeriodManuallySelected && !force) return;

  const measuredAtValue = elements.measuredAtInput.value;
  if (!measuredAtValue) return;

  const measuredAt = new Date(measuredAtValue);
  if (Number.isNaN(measuredAt.getTime())) return;

  const period = inferPeriodFromDate(measuredAt);
  const periodInput = elements.form.querySelector(`input[name="period"][value="${period}"]`);
  if (periodInput) periodInput.checked = true;
}

function getCompletedSlotIdsForDate(date) {
  const dateKey = toDateKey(date);
  return new Set(
    state.readings
      .filter((reading) => toDateKey(new Date(reading.measuredAt)) === dateKey)
      .map(getCalendarSlotId),
  );
}

function getSuggestedTimingForDate(date, period) {
  const completedSlots = getCompletedSlotIdsForDate(date);
  const fastingSlot = getSlotId(period, "fasting");
  const postSlot = getSlotId(period, "postprandial2h");

  if (completedSlots.has(fastingSlot) && !completedSlots.has(postSlot)) {
    return "postprandial2h";
  }

  return "fasting";
}

function applySuggestedTimingSelection({ force = false } = {}) {
  if (state.editingId) return;
  if (state.isTimingManuallySelected && !force) return;

  const measuredAtValue = elements.measuredAtInput.value;
  if (!measuredAtValue) return;

  const measuredAt = new Date(measuredAtValue);
  if (Number.isNaN(measuredAt.getTime())) return;

  const period = getSelectedPeriodForForm(measuredAt);
  const timing = getSuggestedTimingForDate(measuredAt, period);
  const timingInput = elements.form.querySelector(`input[name="timing"][value="${timing}"]`);
  if (timingInput) timingInput.checked = true;
}

function renderSelectedDateList() {
  const readings = state.readings.filter((reading) => toDateKey(new Date(reading.measuredAt)) === state.selectedDate);
  elements.selectedDateTitle.textContent = formatDate(parseDateKey(state.selectedDate));
  elements.selectedDateMeta.textContent = readings.length ? `${readings.length}개 기록` : "기록이 없습니다.";
  renderRecordList(elements.selectedDateList, readings, { compact: true });
}

function renderCharts() {
  renderLineChart(elements.weeklyChart, buildDailySeries(7));
  renderLineChart(elements.monthlyChart, buildDailySeries(30));
}

function renderInsights() {
  const readings = filterReadingsByRange(state.readings, state.rangeFilter);
  const insights = buildInsights(readings);
  elements.insightRangeLabel.textContent = rangeLabel(state.rangeFilter);
  elements.insightGrid.innerHTML = insights.map((insight) => `
    <article class="insight-card">
      <strong>${escapeHtml(insight.title)}</strong>
      <p>${escapeHtml(insight.body)}</p>
    </article>
  `).join("");
}

function setActiveTab(tab) {
  state.activeTab = tab;
  $$(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  $$(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `${tab}Panel`);
  });
  if (tab === "analytics") {
    requestAnimationFrame(renderCharts);
  }
}

function changeMonth(offset) {
  state.calendarMonth = new Date(
    state.calendarMonth.getFullYear(),
    state.calendarMonth.getMonth() + offset,
    1,
  );
  renderCalendar();
}

function getVisibleReadings() {
  return filterReadingsByRange(state.readings, state.rangeFilter)
    .filter((reading) => state.timingFilter === "all" || reading.timing === state.timingFilter);
}

function filterReadingsByRange(readings, range) {
  if (range === "all") return [...readings];

  const days = Number(range);
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - days + 1);
  return readings.filter((reading) => new Date(reading.measuredAt) >= cutoff);
}

function buildDailySeries(days) {
  const items = [];
  const today = startOfDay(new Date());

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = toDateKey(date);
    const dayReadings = state.readings.filter((reading) => toDateKey(new Date(reading.measuredAt)) === key);
    const fasting = dayReadings.filter((reading) => reading.timing === "fasting").map((reading) => reading.value);
    const post = dayReadings.filter((reading) => reading.timing === "postprandial2h").map((reading) => reading.value);

    items.push({
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      fasting: fasting.length ? Math.round(average(fasting)) : null,
      postprandial2h: post.length ? Math.round(average(post)) : null,
    });
  }

  return items;
}

function renderLineChart(canvas, series) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height || 240));

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const values = series.flatMap((item) => [item.fasting, item.postprandial2h]).filter((value) => value !== null);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (!values.length) {
    context.fillStyle = "#66706d";
    context.font = "700 15px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText("표시할 데이터가 없습니다.", width / 2, height / 2);
    return;
  }

  const padding = { top: 20, right: 18, bottom: 34, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.max(40, Math.min(...values, 80) - 20);
  const maxValue = Math.min(360, Math.max(...values, 180) + 20);
  const yScale = (value) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
  const xScale = (index) => padding.left + (series.length === 1 ? chartWidth / 2 : (index / (series.length - 1)) * chartWidth);

  drawGrid(context, padding, width, height, minValue, maxValue, yScale);
  drawTargetLine(context, padding, chartWidth, yScale(130), "130", "#166b5f");
  drawTargetLine(context, padding, chartWidth, yScale(180), "180", "#bb5a32");

  drawSeries(context, series, "fasting", "#166b5f", xScale, yScale);
  drawSeries(context, series, "postprandial2h", "#bb5a32", xScale, yScale);

  context.fillStyle = "#66706d";
  context.font = "700 11px Segoe UI, sans-serif";
  context.textAlign = "center";
  const labelStep = series.length > 14 ? 5 : series.length > 7 ? 3 : 1;
  series.forEach((item, index) => {
    if (index % labelStep === 0 || index === series.length - 1) {
      context.fillText(item.label, xScale(index), height - 12);
    }
  });
}

function drawGrid(context, padding, width, height, minValue, maxValue, yScale) {
  context.strokeStyle = "#dce2dc";
  context.lineWidth = 1;
  context.fillStyle = "#66706d";
  context.font = "700 11px Segoe UI, sans-serif";
  context.textAlign = "right";

  const ticks = 4;
  for (let index = 0; index <= ticks; index += 1) {
    const value = Math.round(minValue + ((maxValue - minValue) / ticks) * index);
    const y = yScale(value);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${value}`, padding.left - 8, y + 4);
  }

  context.strokeStyle = "#202427";
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, height - padding.bottom);
  context.lineTo(width - padding.right, height - padding.bottom);
  context.stroke();
}

function drawTargetLine(context, padding, chartWidth, y, label, color) {
  context.save();
  context.strokeStyle = color;
  context.setLineDash([5, 5]);
  context.globalAlpha = 0.5;
  context.beginPath();
  context.moveTo(padding.left, y);
  context.lineTo(padding.left + chartWidth, y);
  context.stroke();
  context.restore();

  context.fillStyle = color;
  context.font = "700 10px Segoe UI, sans-serif";
  context.textAlign = "left";
  context.fillText(label, padding.left + 4, y - 5);
}

function drawSeries(context, series, key, color, xScale, yScale) {
  const points = series
    .map((item, index) => ({ x: xScale(index), y: item[key] === null ? null : yScale(item[key]), value: item[key] }))
    .filter((point) => point.y !== null);

  if (!points.length) return;

  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2.5;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    context.fill();
  });
}

function buildInsights(readings) {
  const fasting = readings.filter((reading) => reading.timing === "fasting");
  const post = readings.filter((reading) => reading.timing === "postprandial2h");
  const targetGood = readings.filter((reading) => getStatus(reading).type === "good").length;
  const highBucket = mostFrequentHighBucket(readings);
  const foodPattern = repeatedFoodSpike(post);
  const exercise = compareBooleanAverage(readings, "exercised", "운동한 날", "운동하지 않은 날");
  const medication = compareBooleanAverage(readings, "medicationTaken", "약 복용", "약 미복용");

  return [
    {
      title: "공복 혈당 추세",
      body: trendText(fasting, TARGETS.fasting.max),
    },
    {
      title: "식후 혈당 패턴",
      body: post.length
        ? `식후 2시간 후 평균은 ${Math.round(average(post.map((reading) => reading.value)))}mg/dL이며, 목표 초과는 ${post.filter((reading) => getStatus(reading).type === "high").length}회입니다.`
        : "식후 2시간 후 기록이 아직 없습니다.",
    },
    {
      title: "자주 높은 시간대",
      body: highBucket ? `${highBucket.label}에 높은 기록이 ${highBucket.count}회로 가장 많습니다.` : "높은 기록이 아직 뚜렷하지 않습니다.",
    },
    {
      title: "목표 범위 비율",
      body: readings.length
        ? `${targetGood}/${readings.length}회가 목표 범위 안입니다. 비율은 ${Math.round((targetGood / readings.length) * 100)}%입니다.`
        : "분석할 기록이 아직 없습니다.",
    },
    {
      title: "음식 메모 반복",
      body: foodPattern ?? "반복해서 높게 나온 음식 메모가 아직 뚜렷하지 않습니다.",
    },
    {
      title: "운동 비교",
      body: exercise,
    },
    {
      title: "약 복용 비교",
      body: medication,
    },
    {
      title: "최근 7일 알림",
      body: buildPatternAlerts(state.readings).map((alertItem) => alertItem.text).join(" ") || "최근 7일 반복 패턴 알림이 없습니다.",
    },
  ];
}

function trendText(readings, targetMax) {
  if (readings.length < 3) return "공복 기록이 3개 이상 쌓이면 추세를 볼 수 있습니다.";

  const chronological = [...readings].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  const firstChunk = chronological.slice(0, Math.ceil(chronological.length / 2));
  const secondChunk = chronological.slice(Math.floor(chronological.length / 2));
  const firstAvg = average(firstChunk.map((reading) => reading.value));
  const secondAvg = average(secondChunk.map((reading) => reading.value));
  const diff = Math.round(secondAvg - firstAvg);
  const highCount = readings.filter((reading) => reading.value > targetMax).length;

  if (Math.abs(diff) < 5) {
    return `평균 변화가 ${diff}mg/dL로 크지 않습니다. 목표 초과는 ${highCount}회입니다.`;
  }

  return diff > 0
    ? `최근 공복 평균이 앞기간보다 ${diff}mg/dL 높아졌습니다. 목표 초과는 ${highCount}회입니다.`
    : `최근 공복 평균이 앞기간보다 ${Math.abs(diff)}mg/dL 낮아졌습니다. 목표 초과는 ${highCount}회입니다.`;
}

function mostFrequentHighBucket(readings) {
  const buckets = [
    { label: "새벽/아침", start: 4, end: 10, count: 0 },
    { label: "점심 전후", start: 10, end: 15, count: 0 },
    { label: "저녁 전후", start: 15, end: 21, count: 0 },
    { label: "밤", start: 21, end: 24, count: 0 },
    { label: "밤", start: 0, end: 4, count: 0 },
  ];

  readings.filter((reading) => getStatus(reading).type === "high").forEach((reading) => {
    const hour = new Date(reading.measuredAt).getHours();
    const bucket = buckets.find((item) => hour >= item.start && hour < item.end);
    if (bucket) bucket.count += 1;
  });

  const mergedNight = buckets.reduce((acc, item) => {
    if (item.label === "밤") acc.count += item.count;
    return acc;
  }, { label: "밤", count: 0 });
  const merged = buckets.filter((item) => item.label !== "밤").concat(mergedNight);
  const top = merged.sort((a, b) => b.count - a.count)[0];

  return top?.count ? top : null;
}

function repeatedFoodSpike(readings) {
  const map = new Map();
  const ignored = new Set(["아침", "점심", "저녁", "식사", "간식", "먹음", "후", "전", "밥"]);

  readings.forEach((reading) => {
    const tokens = (reading.mealNote ?? "")
      .split(/[\s,./+&·]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !ignored.has(token));

    tokens.forEach((token) => {
      if (!map.has(token)) map.set(token, []);
      map.get(token).push(reading);
    });
  });

  const candidates = Array.from(map.entries())
    .map(([token, tokenReadings]) => ({
      token,
      count: tokenReadings.length,
      average: average(tokenReadings.map((reading) => reading.value)),
      highCount: tokenReadings.filter((reading) => getStatus(reading).type === "high").length,
    }))
    .filter((item) => item.count >= 2 && item.highCount >= 2)
    .sort((a, b) => b.highCount - a.highCount || b.average - a.average);

  if (!candidates.length) return null;

  const top = candidates[0];
  return `"${top.token}" 메모가 있는 식후 기록 ${top.count}회 중 ${top.highCount}회가 목표보다 높았습니다. 평균은 ${Math.round(top.average)}mg/dL입니다.`;
}

function compareBooleanAverage(readings, key, trueLabel, falseLabel) {
  const yes = readings.filter((reading) => Boolean(reading[key]));
  const no = readings.filter((reading) => !Boolean(reading[key]));

  if (!yes.length || !no.length) {
    return `${trueLabel}과 ${falseLabel} 기록이 모두 필요합니다.`;
  }

  const yesAvg = Math.round(average(yes.map((reading) => reading.value)));
  const noAvg = Math.round(average(no.map((reading) => reading.value)));
  const diff = noAvg - yesAvg;

  if (Math.abs(diff) < 5) {
    return `${trueLabel} 평균 ${yesAvg}mg/dL, ${falseLabel} 평균 ${noAvg}mg/dL로 차이가 작습니다.`;
  }

  return diff > 0
    ? `${falseLabel} 평균이 ${trueLabel}보다 ${diff}mg/dL 높습니다.`
    : `${trueLabel} 평균이 ${falseLabel}보다 ${Math.abs(diff)}mg/dL 높습니다.`;
}

function buildPatternAlerts(readings) {
  const alerts = [];
  const lastSevenCutoff = startOfDay(new Date());
  lastSevenCutoff.setDate(lastSevenCutoff.getDate() - 6);
  const recent = readings.filter((reading) => new Date(reading.measuredAt) >= lastSevenCutoff);
  const morningFasting = recent.filter((reading) => reading.timing === "fasting" && getReadingPeriod(reading) === "morning");
  const byDay = groupBy(morningFasting, (reading) => toDateKey(new Date(reading.measuredAt)));
  const dailyMorning = Array.from(byDay.values()).map((dayReadings) => {
    return dayReadings.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))[0];
  });
  const highMorning = dailyMorning.filter((reading) => reading.value > TARGETS.fasting.max);
  const lowReadings = recent.filter((reading) => reading.value < 70);
  const highPost = recent.filter((reading) => reading.timing === "postprandial2h" && reading.value > TARGETS.postprandial2h.max);

  if (dailyMorning.length >= 3 && highMorning.length === dailyMorning.length) {
    alerts.push({
      level: "danger",
      text: `최근 7일 아침 공복 기록 ${dailyMorning.length}회가 모두 목표보다 높습니다. 다음 진료 때 기록을 보여주는 것이 좋습니다.`,
    });
  }

  if (highPost.length >= 3) {
    alerts.push({
      level: "danger",
      text: `최근 7일 식후 2시간 후 목표 초과가 ${highPost.length}회 있습니다. 식사 메모와 같이 확인해 주세요.`,
    });
  }

  if (lowReadings.length) {
    alerts.push({
      level: "danger",
      text: `최근 7일 70mg/dL 미만 기록이 ${lowReadings.length}회 있습니다. 저혈당 대처 기준은 의료진 안내를 우선하는 것이 필요합니다.`,
    });
  }

  return alerts;
}

function getStatus(reading) {
  const target = TARGETS[reading.timing] ?? TARGETS.fasting;
  const lowThreshold = reading.timing === "fasting" ? target.min : 70;

  if (reading.value < lowThreshold) return { type: "low", label: "낮음" };
  if (reading.value > target.max) return { type: "high", label: "높음" };
  return { type: "good", label: "목표 내" };
}

function exportCsv() {
  if (!state.readings.length) {
    alert("내보낼 기록이 없습니다.");
    return;
  }

  const header = ["id", "measuredAt", "period", "timing", "value", "unit", "mealNote", "exercised", "medicationTaken", "memo"];
  const rows = state.readings.map((reading) => [
    reading.id,
    reading.measuredAt,
    PERIODS[getReadingPeriod(reading)].label,
    TARGETS[reading.timing].label,
    reading.value,
    reading.unit,
    reading.mealNote ?? "",
    reading.exercised ? "Y" : "N",
    reading.medicationTaken ? "Y" : "N",
    reading.memo ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadFile(`glucose-log-${toDateKey(new Date())}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function exportBackup() {
  const backup = {
    app: "glucose-log-pwa",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      readings: state.readings,
    },
  };

  downloadFile(
    `glucose-backup-${toDateKey(new Date())}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8",
  );
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const readings = backup?.data?.readings;

    if (!Array.isArray(readings)) {
      throw new Error("invalid backup");
    }

    const normalized = readings.map(normalizeReading).filter(Boolean);
    if (!normalized.length) {
      alert("복원할 기록이 없습니다.");
      return;
    }

    const shouldMerge = confirm(`백업 기록 ${normalized.length}개를 기존 데이터에 병합하시겠습니까?`);
    if (!shouldMerge) return;

    for (const reading of normalized) {
      await putReading(reading);
    }

    await loadReadings();
    render();
    syncWithCloud();
    alert("복원이 완료되었습니다.");
  } catch (error) {
    console.error(error);
    alert("백업 파일을 읽지 못했습니다.");
  } finally {
    event.target.value = "";
  }
}

function normalizeReading(reading) {
  if (!reading || !Number.isFinite(Number(reading.value)) || !reading.measuredAt) return null;
  const timing = TARGETS[reading.timing] ? reading.timing : "fasting";
  const measuredAt = new Date(reading.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) return null;
  const period = PERIODS[reading.period] ? reading.period : inferPeriodFromDate(measuredAt);

  return {
    id: reading.id || createId(),
    value: Number(reading.value),
    unit: "mg/dL",
    measuredAt: measuredAt.toISOString(),
    period,
    timing,
    mealNote: String(reading.mealNote ?? "").slice(0, 80),
    exercised: Boolean(reading.exercised),
    medicationTaken: Boolean(reading.medicationTaken),
    memo: String(reading.memo ?? "").slice(0, 200),
    createdAt: reading.createdAt || new Date().toISOString(),
    updatedAt: reading.updatedAt || new Date().toISOString(),
  };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("measuredAt", "measuredAt");
        store.createIndex("timing", "timing");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = callback(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllReadings() {
  const readings = await withStore("readonly", (store) => requestToPromise(store.getAll()));
  return readings.map(normalizeReading).filter(Boolean);
}

function putReading(reading) {
  return withStore("readwrite", (store) => {
    store.put(reading);
  });
}

function removeReading(id) {
  return withStore("readwrite", (store) => {
    store.delete(id);
  });
}

function sortReadings() {
  state.readings.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
}

function setDefaultDateTime() {
  elements.measuredAtInput.value = toDateTimeLocal(new Date());
}

function toDateTimeLocal(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return `${days}일 전`;
}

function rangeLabel(range) {
  if (range === "all") return "전체 기간";
  return `최근 ${range}일`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.info("Service worker registration skipped.", error);
    });
  }
}
