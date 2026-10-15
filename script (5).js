// ========================================
// GOOGLE APPS SCRIPT API CONFIGURATION
// ========================================

// Replace the placeholder below with your deployed
// Google Apps Script Web App URL ending in /exec.

const API_URL = "https://script.google.com/macros/s/AKfycbwy-vPiNNpdESXlvJL6DaHFVgZ-R5pTcvM6VmZEwaR-yAdgB5vGLllP9XuJ3kzCJ8uteA/exec";

// ========================================
// APP STATE
// ========================================

const state = {
  settings: null,
  teams: [],
  isSaving: false,
  isLoadingTeams: false,
  teamsLoadedOnce: false
};

const $ = (id) => document.getElementById(id);

// ========================================
// API LAYER (edit here if your deployment needs changes)
// ========================================

// True only when a real /exec URL has been supplied.
function isApiConfigured() {
  return typeof API_URL === "string" &&
    /^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL.trim()) &&
    !API_URL.includes("PASTE_YOUR");
}

// Reads the response as text first, then parses JSON, so that
// HTML error pages from Google produce a helpful message.
async function parseJsonResponse(response) {
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(
      "The server did not return valid JSON. Check that the Web App is deployed " +
      "as 'Anyone' can access and that the URL ends in /exec."
    );
  }
  if (!response.ok) {
    throw new Error((json && json.message) || "The server returned an error (" + response.status + ").");
  }
  return json;
}

// GET request: ?action=<action>
async function apiGet(action) {
  if (!isApiConfigured()) throw new Error("The API URL has not been configured in script.js.");
  const url = API_URL + "?action=" + encodeURIComponent(action) + "&_=" + Date.now();
  let response;
  try {
    response = await fetch(url, { method: "GET", redirect: "follow" });
  } catch (err) {
    throw new Error("Could not reach the database. Check your internet connection and the API deployment.");
  }
  return parseJsonResponse(response);
}

// POST request: JSON body sent as text/plain so the browser does not
// trigger a CORS preflight (Apps Script cannot answer OPTIONS requests).
// The backend reads it with JSON.parse(e.postData.contents).
async function apiPost(payload) {
  if (!isApiConfigured()) throw new Error("The API URL has not been configured in script.js.");
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    throw new Error("Could not reach the database. The team was NOT confirmed as saved.");
  }
  return parseJsonResponse(response);
}

// Throws unless the backend reports success.
function assertSuccess(result) {
  if (!result || result.success !== true) {
    throw new Error((result && (result.message || result.error)) || "The server did not confirm the request.");
  }
  return result;
}

// ========================================
// DATA LOADING
// ========================================

async function loadSettings() {
  try {
    const result = assertSuccess(await apiGet("getSettings"));
    state.settings = result.data !== undefined ? result.data : result.settings || null;
  } catch (err) {
    state.settings = null;
    console.warn("Settings could not be loaded:", err.message);
  }
  return state.settings;
}

function extractTeams(result) {
  const d = result.data !== undefined ? result.data : result.teams;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.teams)) return d.teams;
  throw new Error("The server response did not contain a list of teams.");
}

async function loadTeams() {
  if (state.isLoadingTeams) return;
  state.isLoadingTeams = true;
  $("refresh-btn").disabled = true;
  showLoadingState("Loading our young innovators...");
  try {
    const result = assertSuccess(await apiGet("getTeams"));
    state.teams = extractTeams(result);
    state.teamsLoadedOnce = true;
    renderTeams(state.teams);
  } catch (err) {
    state.teams = [];
    $("teams-grid").replaceChildren();
    $("team-count").textContent = "";
    showErrorState(err.message);
  } finally {
    state.isLoadingTeams = false;
    $("refresh-btn").disabled = false;
  }
}

// ========================================
// RENDERING (all database values use textContent)
// ========================================

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function splitNames(value) {
  return clean(value).split(/[\n\r,;]+/).map((n) => n.trim()).filter(Boolean);
}

function makeBlock(kind, heading, text) {
  const box = el("div", "block " + kind);
  box.append(el("h4", "", heading), el("p", "", text));
  return box;
}

function buildTeamCard(team) {
  const card = el("article", "team-card");
  card.append(el("h3", "", clean(team.Team_Name) || "Unnamed Team"));

  const names = splitNames(team.Student_Names);
  const innovators = el("div", "innovators");
  innovators.append(el("h4", "", "Our Innovators"));
  const list = el("ul", "chips");
  names.forEach((n) => list.append(el("li", "", n)));
  innovators.append(list);
  card.append(innovators);

  card.append(makeBlock("problem", "The Problem We Identified", clean(team.Problem_Identified)));
  card.append(makeBlock("solution", "Our Proposed Solution", clean(team.Proposed_Solution)));

  const about = clean(team.Project_Description);
  if (about) card.append(makeBlock("about", "About Our Project", about));
  return card;
}

function updateTeamCount(n) {
  $("team-count").textContent = "Our Club: " + n + (n === 1 ? " Team" : " Teams") + " of Innovators";
}

function renderTeams(teams) {
  const grid = $("teams-grid");
  const stateBox = $("teams-state");
  grid.replaceChildren();
  stateBox.replaceChildren();
  updateTeamCount(teams.length);

  if (teams.length === 0) {
    const box = el("div", "state-box");
    box.append(
      el("h3", "", "Our Innovation Journey Is About to Begin!"),
      el("p", "", "Our young innovators are getting ready. Team projects will appear here once they have been registered.")
    );
    stateBox.append(box);
    return;
  }
  teams.forEach((t) => grid.append(buildTeamCard(t)));
}

function showLoadingState(message) {
  $("teams-grid").replaceChildren();
  const box = el("div", "state-box");
  box.setAttribute("role", "status");
  box.append(el("div", "spinner"), el("p", "", message || "Loading..."));
  $("teams-state").replaceChildren(box);
}

function showErrorState(message) {
  const box = el("div", "state-box error");
  box.setAttribute("role", "alert");
  const retry = el("button", "btn secondary", "Try Again");
  retry.type = "button";
  retry.addEventListener("click", loadTeams);
  box.append(el("h3", "", "We couldn't load the teams"), el("p", "", message || "Something went wrong."), retry);
  $("teams-state").replaceChildren(box);
}

// ========================================
// NOTIFICATIONS
// ========================================

let notificationTimer = null;

function showNotification(message, type) {
  const box = $("notification");
  box.textContent = message;
  box.className = "notification " + (type || "info");
  box.hidden = false;
  clearTimeout(notificationTimer);
  if (type === "success") {
    notificationTimer = setTimeout(() => { box.hidden = true; }, 8000);
  }
}

function hideNotification() {
  clearTimeout(notificationTimer);
  $("notification").hidden = true;
}

// ========================================
// FORM VALIDATION AND SUBMISSION
// ========================================

const requiredFields = [
  { id: "team-name", err: "err-team-name", msg: "Please enter a team name." },
  { id: "student-names", err: "err-student-names", msg: "Please enter the names of the students in your team." },
  { id: "problem", err: "err-problem", msg: "Please describe the problem your team has discovered." },
  { id: "solution", err: "err-solution", msg: "Please explain the solution your team wants to offer." }
];

function validateForm() {
  let firstInvalid = null;
  requiredFields.forEach((f) => {
    const input = $(f.id);
    const empty = input.value.trim() === "";
    input.classList.toggle("invalid", empty);
    input.setAttribute("aria-invalid", empty ? "true" : "false");
    $(f.err).textContent = empty ? f.msg : "";
    if (empty && !firstInvalid) firstInvalid = input;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

function getFormData() {
  return {
    Team_Name: $("team-name").value.trim(),
    Student_Names: $("student-names").value.trim(),
    Problem_Identified: $("problem").value.trim(),
    Proposed_Solution: $("solution").value.trim(),
    Project_Description: $("description").value.trim()
  };
}

function setSaving(isSaving) {
  state.isSaving = isSaving;
  const btn = $("save-btn");
  btn.disabled = isSaving;
  btn.textContent = isSaving ? "Saving Team..." : "Save Team";
}

async function handleTeamSubmission(event) {
  event.preventDefault();
  if (state.isSaving) return;
  hideNotification();

  if (!validateForm()) {
    showNotification("Please fill in the highlighted fields.", "error");
    return;
  }
  if (!isApiConfigured()) {
    showNotification("The API URL has not been configured. Open script.js and set API_URL.", "error");
    return;
  }

  const data = getFormData();
  setSaving(true);
  try {
    const result = await apiPost({ action: "createTeam", data: data });
    assertSuccess(result);
    $("team-form").reset();
    requiredFields.forEach((f) => { $(f.id).classList.remove("invalid"); $(f.err).textContent = ""; });
    state.teamsLoadedOnce = false; // force showcase to refetch
    showNotification(result.message || "Your team has been saved. Great work, young innovators!", "success");
  } catch (err) {
    showNotification("Your team was not saved. " + err.message + " Your information is still in the form.", "error");
  } finally {
    setSaving(false);
  }
}

// ========================================
// NAVIGATION
// ========================================

function switchView(view) {
  const isRegister = view === "register";
  $("view-register").hidden = !isRegister;
  $("view-explore").hidden = isRegister;
  [["tab-register", isRegister], ["tab-explore", !isRegister]].forEach(([id, active]) => {
    const tab = $(id);
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  if (!isRegister && !state.teamsLoadedOnce) loadTeams();
}

// ========================================
// INIT
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  $("team-form").addEventListener("submit", handleTeamSubmission);
  $("refresh-btn").addEventListener("click", loadTeams);
  requiredFields.forEach((f) => {
    $(f.id).addEventListener("input", () => {
      if ($(f.id).value.trim()) { $(f.id).classList.remove("invalid"); $(f.err).textContent = ""; }
    });
  });

  if (!isApiConfigured()) {
    showNotification("API URL not configured yet. Open script.js and set API_URL to your Web App URL.", "info");
  } else {
    loadSettings();
  }
  switchView("register");
});
