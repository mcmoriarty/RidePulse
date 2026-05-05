const STORAGE_KEY = "ridepulse.entries.v2";

const $ = (selector) => document.querySelector(selector);

const elements = {
  form: $("#activityForm"),
  activityId: $("#activityId"),
  date: $("#activityDate"),
  cycleTime: $("#activityCycleTime"),
  distance: $("#activityDistance"),
  activeCalories: $("#activityActiveCalories"),
  totalCalories: $("#activityTotalCalories"),
  avgHeartRate: $("#activityAvgHeartRate"),
  notes: $("#activityNotes"),
  saveButton: $("#saveButton"),
  resetButton: $("#resetButton"),
  table: $("#activityTable"),
  template: $("#rowTemplate"),
  cards: $("#activityCards"),
  cardTemplate: $("#cardTemplate"),
  filterRange: $("#filterRange"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  trendChart: $("#trendChart"),
  lifetimeCycleTime: $("#lifetimeCycleTime"),
  lifetimeDistance: $("#lifetimeDistance"),
  lifetimeCalories: $("#lifetimeCalories"),
  lifetimeAvgHeartRate: $("#lifetimeAvgHeartRate"),
  monthCycleTime: $("#monthCycleTime"),
  monthCycleTimeDelta: $("#monthCycleTimeDelta"),
  monthDistance: $("#monthDistance"),
  monthDistanceDelta: $("#monthDistanceDelta"),
  monthActiveCalories: $("#monthActiveCalories"),
  monthActiveCaloriesDelta: $("#monthActiveCaloriesDelta"),
  monthTotalCalories: $("#monthTotalCalories"),
  monthTotalCaloriesDelta: $("#monthTotalCaloriesDelta"),
  monthAvgHeartRate: $("#monthAvgHeartRate"),
  monthAvgHeartRateDelta: $("#monthAvgHeartRateDelta"),
  focusMonth: $("#focusMonth"),
  focusText: $("#focusText"),
  syncStatus: $("#syncStatus"),
  syncDescription: $("#syncDescription"),
  syncUser: $("#syncUser"),
  signInButton: $("#signInButton"),
  signOutButton: $("#signOutButton"),
};

let entries = loadEntries();
let currentUser = null;
let cloudCollection = null;
let cloudUnsubscribe = null;
let firebaseReady = false;
let syncingFromCloud = false;

initializeForm();
wireEvents();
initializeFirebase();
render();

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return sanitizeEntries(parsed);
    }
  } catch {
    return [];
  }

  return [];
}

function initializeForm() {
  elements.date.value = formatDate(new Date());
}

function wireEvents() {
  elements.form.addEventListener("submit", handleSubmit);
  elements.resetButton.addEventListener("click", resetForm);
  elements.filterRange.addEventListener("change", render);
  elements.exportButton.addEventListener("click", exportEntries);
  elements.importInput.addEventListener("change", importEntries);
  elements.table.addEventListener("click", handleTableAction);
  elements.cards.addEventListener("click", handleTableAction);
  elements.signInButton.addEventListener("click", signInWithGoogle);
  elements.signOutButton.addEventListener("click", signOutOfFirebase);
}

function initializeFirebase() {
  const config = window.FIREBASE_CONFIG || {};
  const hasConfig = config.apiKey && config.projectId && config.appId;

  if (!window.firebase || !hasConfig) {
    updateSyncUI({ enabled: false, message: "Add Firebase config to enable cloud sync." });
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }

  firebaseReady = true;
  cloudCollection = firebase.firestore().collection("users");

  const auth = firebase.auth();
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI(user);

    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    if (!user) {
      updateSyncUI({
        enabled: true,
        message: "Signed out. Your changes stay on this device until you sign in again.",
      });
      return;
    }

    updateSyncUI({ enabled: true, message: "Connected. Syncing with Firebase..." });
    const docRef = cloudCollection.doc(user.uid);
    cloudUnsubscribe = docRef.onSnapshot(
      (snapshot) => {
        syncingFromCloud = true;
        if (snapshot.exists) {
          const data = snapshot.data() || {};
          if (Array.isArray(data.entries)) {
            entries = sanitizeEntries(data.entries);
            persistLocal();
            render();
          }
        } else {
          docRef.set(
            {
              entries,
              schemaVersion: 2,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        syncingFromCloud = false;
        updateSyncUI({
          enabled: true,
          message: "Sync is active. Changes save to your browser and Firebase.",
        });
      },
      (error) => {
        syncingFromCloud = false;
        updateSyncUI({
          enabled: true,
          message: `Firebase sync error: ${error.message}`,
        });
      },
    );
  });
}

function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    id: elements.activityId.value || crypto.randomUUID(),
    date: elements.date.value,
    cycleTime: roundNumber(elements.cycleTime.value),
    distance: roundNumber(elements.distance.value),
    activeCalories: roundNumber(elements.activeCalories.value),
    totalCalories: roundNumber(elements.totalCalories.value),
    avgHeartRate: roundNumber(elements.avgHeartRate.value),
    notes: elements.notes.value.trim(),
  };

  const index = entries.findIndex((entry) => entry.id === payload.id);
  if (index >= 0) {
    entries[index] = payload;
  } else {
    entries.unshift(payload);
  }

  persistLocal();
  persistCloud();
  resetForm();
  render();
}

function handleTableAction(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const item = button.closest("[data-id]");
  const id = item?.dataset.id;
  if (!id) return;

  if (button.classList.contains("edit-btn")) {
    const entry = entries.find((item) => item.id === id);
    if (entry) {
      fillForm(entry);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (button.classList.contains("delete-btn")) {
    const entry = entries.find((item) => item.id === id);
    if (entry && confirm(`Delete the session on ${entry.date}?`)) {
      entries = entries.filter((item) => item.id !== id);
      persistLocal();
      persistCloud();
      render();
    }
  }
}

function fillForm(entry) {
  elements.activityId.value = entry.id;
  elements.date.value = entry.date;
  elements.cycleTime.value = entry.cycleTime;
  elements.distance.value = entry.distance;
  elements.activeCalories.value = entry.activeCalories;
  elements.totalCalories.value = entry.totalCalories;
  elements.avgHeartRate.value = entry.avgHeartRate;
  elements.notes.value = entry.notes || "";
  elements.saveButton.textContent = "Update activity";
}

function resetForm() {
  elements.form.reset();
  elements.activityId.value = "";
  elements.date.value = formatDate(new Date());
  elements.saveButton.textContent = "Save activity";
}

function render() {
  const visibleEntries = getVisibleEntries();
  const sorted = [...visibleEntries].sort((a, b) => b.date.localeCompare(a.date));
  renderTable(sorted);
  renderCards(sorted);
  renderSummary(visibleEntries);
  renderChart();
}

function getVisibleEntries() {
  const start = getStartDate(elements.filterRange.value, new Date());
  return entries.filter((entry) => !start || parseActivityDate(entry.date) >= start);
}

function renderTable(visibleEntries) {
  elements.table.innerHTML = "";

  if (!visibleEntries.length) {
    elements.table.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">No entries match the current filters yet.</td>
      </tr>
    `;
    return;
  }

  for (const entry of visibleEntries) {
    const fragment = elements.template.content.cloneNode(true);
    const row = fragment.querySelector("tr");
    row.dataset.id = entry.id;
    row.querySelector('[data-field="date"]').textContent = formatPrettyDate(entry.date);
    row.querySelector('[data-field="cycleTime"]').textContent = formatCycleTime(entry.cycleTime);
    row.querySelector('[data-field="distance"]').textContent = formatDistance(entry.distance);
    row.querySelector('[data-field="activeCalories"]').textContent = formatCalories(entry.activeCalories);
    row.querySelector('[data-field="totalCalories"]').textContent = formatCalories(entry.totalCalories);
    row.querySelector('[data-field="avgHeartRate"]').textContent = formatHeartRate(entry.avgHeartRate);
    row.querySelector('[data-field="notes"]').textContent = entry.notes || "-";
    elements.table.appendChild(fragment);
  }
}

function renderCards(visibleEntries) {
  elements.cards.innerHTML = "";

  if (!visibleEntries.length) {
    elements.cards.innerHTML = `<div class="empty-cards">No entries match the current filters yet.</div>`;
    return;
  }

  for (const entry of visibleEntries) {
    const fragment = elements.cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".activity-card");
    card.dataset.id = entry.id;
    card.querySelector('[data-field="date"]').textContent = formatPrettyDate(entry.date);
    card.querySelector('[data-field="title"]').textContent = "Session";
    card.querySelector('[data-field="cycleTime"]').textContent = formatCycleTime(entry.cycleTime);
    card.querySelector('[data-field="distance"]').textContent = formatDistance(entry.distance);
    card.querySelector('[data-field="activeCalories"]').textContent = formatCalories(entry.activeCalories);
    card.querySelector('[data-field="totalCalories"]').textContent = formatCalories(entry.totalCalories);
    card.querySelector('[data-field="avgHeartRate"]').textContent = formatHeartRate(entry.avgHeartRate);
    card.querySelector('[data-field="notes"]').textContent = entry.notes || "-";
    elements.cards.appendChild(fragment);
  }
}

function renderSummary(visibleEntries) {
  const currentMonth = monthKey(new Date());
  const previousMonth = monthKey(addMonths(new Date(), -1));
  const grouped = groupByMonth(entries);
  const current = grouped.get(currentMonth) || [];
  const previous = grouped.get(previousMonth) || [];

  const currentCycleTime = sum(current, "cycleTime");
  const previousCycleTime = sum(previous, "cycleTime");
  const currentDistance = sum(current, "distance");
  const previousDistance = sum(previous, "distance");
  const currentActiveCalories = sum(current, "activeCalories");
  const previousActiveCalories = sum(previous, "activeCalories");
  const currentTotalCalories = sum(current, "totalCalories");
  const previousTotalCalories = sum(previous, "totalCalories");
  const currentAvgHeartRate = average(current, "avgHeartRate");
  const previousAvgHeartRate = average(previous, "avgHeartRate");

  elements.lifetimeCycleTime.textContent = formatCycleTime(sum(entries, "cycleTime"));
  elements.lifetimeDistance.textContent = formatDistance(sum(entries, "distance"));
  elements.lifetimeCalories.textContent = formatCalories(sum(entries, "activeCalories"));
  elements.lifetimeAvgHeartRate.textContent = formatHeartRate(average(entries, "avgHeartRate"));

  elements.monthCycleTime.textContent = formatCycleTime(currentCycleTime);
  elements.monthDistance.textContent = formatDistance(currentDistance);
  elements.monthActiveCalories.textContent = formatCalories(currentActiveCalories);
  elements.monthTotalCalories.textContent = formatCalories(currentTotalCalories);
  elements.monthAvgHeartRate.textContent = formatHeartRate(currentAvgHeartRate);

  elements.monthCycleTimeDelta.textContent = comparePercentage(currentCycleTime, previousCycleTime, "vs last month");
  elements.monthDistanceDelta.textContent = comparePercentage(currentDistance, previousDistance, "vs last month");
  elements.monthActiveCaloriesDelta.textContent = comparePercentage(
    currentActiveCalories,
    previousActiveCalories,
    "vs last month",
  );
  elements.monthTotalCaloriesDelta.textContent = comparePercentage(
    currentTotalCalories,
    previousTotalCalories,
    "vs last month",
  );
  elements.monthAvgHeartRateDelta.textContent = compareAbsoluteBpm(
    currentAvgHeartRate,
    previousAvgHeartRate,
    "vs last month",
  );

  const latestMonth = getLatestMonthLabel(entries);
  elements.focusMonth.textContent = latestMonth.label;
  elements.focusText.textContent = latestMonth.description;
}

function renderChart() {
  const monthly = buildMonthlySeries(entries, 8);
  const width = 760;
  const height = 460;
  const padding = { top: 28, right: 26, bottom: 58, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxTrend = Math.max(
    10,
    ...monthly.map((item) => item.cycleTime),
    ...monthly.map((item) => item.distance),
    ...monthly.map((item) => item.activeCalories / 10),
  );

  if (!entries.length) {
    elements.trendChart.innerHTML = `
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(7,17,31,0.08)" />
      <text x="50%" y="50%" text-anchor="middle" fill="#94a3b8" font-size="16">Add your first session to see trends</text>
    `;
    return;
  }

  const xStep = monthly.length > 1 ? chartWidth / (monthly.length - 1) : chartWidth;
  const cyclePoints = monthly.map((item, index) => point(index, item.cycleTime, maxTrend, xStep, padding, chartHeight)).join(" ");
  const distancePoints = monthly.map((item, index) => point(index, item.distance, maxTrend, xStep, padding, chartHeight)).join(" ");
  const caloriesPoints = monthly
    .map((item, index) => point(index, item.activeCalories / 10, maxTrend, xStep, padding, chartHeight))
    .join(" ");

  const gridLines = [0.25, 0.5, 0.75].map(
    (ratio) => `
      <line x1="${padding.left}" y1="${padding.top + chartHeight * ratio}" x2="${width - padding.right}" y2="${padding.top + chartHeight * ratio}" stroke="rgba(148,163,184,0.14)" />
    `,
  );

  const ticks = monthly
    .map((item, index) => {
      const x = padding.left + index * xStep;
      return `
        <text x="${x}" y="${height - 18}" text-anchor="middle" fill="#94a3b8" font-size="12">${item.label}</text>
      `;
    })
    .join("");

  elements.trendChart.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(7,17,31,0.08)" />
    ${gridLines.join("")}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(148,163,184,0.18)" />
    <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(148,163,184,0.18)" />
    <text x="${padding.left - 8}" y="${padding.top + 6}" text-anchor="end" fill="#94a3b8" font-size="12">high</text>
    <text x="${padding.left - 8}" y="${height - padding.bottom + 16}" text-anchor="end" fill="#94a3b8" font-size="12">low</text>
    <polyline fill="none" stroke="#62e0b8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${cyclePoints}" />
    <polyline fill="none" stroke="#7aa7ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${distancePoints}" opacity="0.92" />
    <polyline fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${caloriesPoints}" opacity="0.92" />
    ${ticks}
  `;
}

function exportEntries() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ridepulse-entries.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importEntries(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Import file must contain an array.");
    }

    entries = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeEntry(item))
      .sort((a, b) => b.date.localeCompare(a.date));

    persistLocal();
    persistCloud();
    resetForm();
    render();
  } catch (error) {
    alert(`Could not import entries: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function persistCloud() {
  if (!firebaseReady || !currentUser || syncingFromCloud) return;

  try {
    await cloudCollection.doc(currentUser.uid).set(
      {
        entries,
        schemaVersion: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    updateSyncUI({
      enabled: true,
      message: `Saved locally, but cloud sync failed: ${error.message}`,
    });
  }
}

function roundNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}

function formatDistance(value) {
  return `${Number(value || 0).toFixed(1)} mi`;
}

function formatCalories(value) {
  return `${Math.round(Number(value) || 0)}`;
}

function formatHeartRate(value) {
  return `${Math.round(Number(value) || 0)} bpm`;
}

function formatCycleTime(value) {
  const minutes = Math.round(Number(value) || 0);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function comparePercentage(current, previous, suffix) {
  if (!previous) {
    return "No prior month";
  }

  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}% ${suffix}`;
}

function compareAbsoluteBpm(current, previous, suffix) {
  if (!previous) {
    return "No prior month";
  }

  const delta = current - previous;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)} bpm ${suffix}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPrettyDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseActivityDate(value));
}

function getStartDate(rangeValue, now) {
  if (rangeValue === "all") return null;
  if (rangeValue === "12m") {
    const twelveMonthsAgo = addMonths(now, -12);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    return twelveMonthsAgo;
  }
  const days = Number(rangeValue);
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date, amount) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function groupByMonth(items) {
  const map = new Map();
  for (const item of items) {
    const key = monthKey(parseActivityDate(item.date));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function sum(items, field) {
  return items.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
}

function average(items, field) {
  if (!items.length) return 0;
  return sum(items, field) / items.length;
}

function getLatestMonthLabel(items) {
  if (!items.length) {
    return {
      label: "No data yet",
      description: "Add your first session to start comparing month-over-month trends.",
    };
  }

  const latest = [...items].sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(parseActivityDate(latest.date)),
    description: `Latest session: ${formatPrettyDate(latest.date)}.`,
  };
}

function buildMonthlySeries(items, count) {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = addMonths(cursor, -index);
    const key = monthKey(date);
    const monthEntries = items.filter((item) => monthKey(parseActivityDate(item.date)) === key);

    months.push({
      key,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      cycleTime: sum(monthEntries, "cycleTime"),
      distance: sum(monthEntries, "distance"),
      activeCalories: sum(monthEntries, "activeCalories"),
    });
  }

  return months;
}

function point(index, value, maxValue, xStep, padding, chartHeight) {
  const x = padding.left + index * xStep;
  const safeValue = maxValue > 0 ? value / maxValue : 0;
  const y = padding.top + chartHeight - safeValue * chartHeight;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function parseActivityDate(value) {
  return new Date(`${value}T12:00:00`);
}

function normalizeEntry(item) {
  return {
    id: item.id || crypto.randomUUID(),
    date: item.date || formatDate(new Date()),
    cycleTime: Number(item.cycleTime ?? item.duration) || 0,
    distance: Number(item.distance) || 0,
    activeCalories: Number(item.activeCalories) || 0,
    totalCalories: Number(item.totalCalories) || 0,
    avgHeartRate: Number(item.avgHeartRate ?? item.heartRate) || 0,
    notes: item.notes || "",
  };
}

function sanitizeEntries(items) {
  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeEntry(item))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function updateAuthUI(user) {
  if (!firebaseReady) {
    elements.signInButton.disabled = true;
    elements.signInButton.textContent = "Firebase unavailable";
    elements.signOutButton.hidden = true;
    elements.syncUser.textContent = "";
    return;
  }

  if (user) {
    elements.signInButton.hidden = true;
    elements.signOutButton.hidden = false;
    elements.syncUser.textContent = user.email ? `Signed in as ${user.email}` : "Signed in to Firebase";
  } else {
    elements.signInButton.hidden = false;
    elements.signOutButton.hidden = true;
    elements.syncUser.textContent = "";
  }
}

function updateSyncUI({ enabled, message }) {
  elements.syncStatus.textContent = enabled ? "Cloud ready" : "Local only";
  elements.syncDescription.textContent = message;
  elements.signInButton.disabled = !enabled || !firebaseReady;
  elements.signOutButton.disabled = !enabled || !firebaseReady;
}

async function signInWithGoogle() {
  if (!firebaseReady) {
    updateSyncUI({ enabled: false, message: "Add Firebase config to enable cloud sync." });
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (error) {
    updateSyncUI({
      enabled: true,
      message: `Could not sign in: ${error.message}`,
    });
  }
}

async function signOutOfFirebase() {
  if (!firebaseReady) return;

  try {
    await firebase.auth().signOut();
  } catch (error) {
    updateSyncUI({
      enabled: true,
      message: `Could not sign out: ${error.message}`,
    });
  }
}
