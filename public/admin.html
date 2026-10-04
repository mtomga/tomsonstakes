<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>TomsonStakes Admin</title>

  <style>
    :root {
      --bg: #07130d;
      --panel: #0d2117;
      --panel2: #10291c;
      --border: rgba(255,255,255,.09);
      --text: #f4fff7;
      --muted: #9bb5a5;
      --green: #20e875;
      --green-dark: #0b7a3b;
      --red: #ff5d6c;
      --yellow: #ffd166;
      --blue: #62a8ff;
      --shadow: 0 20px 50px rgba(0,0,0,.25);
      --radius: 18px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, Arial, Helvetica, sans-serif;
      background:
        radial-gradient(circle at top right, rgba(32,232,117,.08), transparent 30%),
        radial-gradient(circle at top left, rgba(98,168,255,.05), transparent 25%),
        var(--bg);
      color: var(--text);
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .container {
      width: min(1400px, 94%);
      margin: 0 auto;
      padding: 28px 0 60px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      margin-bottom: 25px;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo {
      width: 52px;
      height: 52px;
      border-radius: 15px;
      background: linear-gradient(135deg, var(--green), #0ea65a);
      color: #03220f;
      display: grid;
      place-items: center;
      font-size: 25px;
      font-weight: 900;
      box-shadow: 0 10px 30px rgba(32,232,117,.18);
    }

    h1,
    h2,
    h3 {
      margin: 0;
    }

    .brand h1 {
      font-size: 25px;
    }

    .brand p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .date-control {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 9px;
      border-radius: 14px;
    }

    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--border);
      background: #081810;
      color: var(--text);
      border-radius: 11px;
      padding: 11px 12px;
      outline: none;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: rgba(32,232,117,.7);
      box-shadow: 0 0 0 3px rgba(32,232,117,.08);
    }

    textarea {
      min-height: 95px;
      resize: vertical;
    }

    .date-control input {
      width: 155px;
    }

    .btn {
      border: 0;
      border-radius: 11px;
      padding: 11px 15px;
      font-weight: 800;
      transition: .18s ease;
    }

    .btn:hover {
      transform: translateY(-1px);
    }

    .btn-primary {
      background: var(--green);
      color: #03220f;
    }

    .btn-secondary {
      background: #183525;
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-danger {
      background: rgba(255,93,108,.12);
      color: #ff8792;
      border: 1px solid rgba(255,93,108,.22);
    }

    .btn-warning {
      background: rgba(255,209,102,.12);
      color: var(--yellow);
      border: 1px solid rgba(255,209,102,.22);
    }

    .btn-blue {
      background: rgba(98,168,255,.12);
      color: var(--blue);
      border: 1px solid rgba(98,168,255,.22);
    }

    .status {
      margin-bottom: 18px;
      padding: 13px 15px;
      border-radius: 13px;
      display: none;
      font-size: 14px;
    }

    .status.show {
      display: block;
    }

    .status.success {
      background: rgba(32,232,117,.09);
      border: 1px solid rgba(32,232,117,.2);
      color: #9cffc3;
    }

    .status.error {
      background: rgba(255,93,108,.09);
      border: 1px solid rgba(255,93,108,.2);
      color: #ffadb5;
    }

    .status.info {
      background: rgba(98,168,255,.09);
      border: 1px solid rgba(98,168,255,.2);
      color: #a9ceff;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(340px, .8fr);
      gap: 20px;
      align-items: start;
    }

    .card {
      background: linear-gradient(180deg, rgba(16,41,28,.96), rgba(9,28,18,.96));
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .card-header {
      padding: 18px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .card-header h2 {
      font-size: 17px;
    }

    .card-header span {
      color: var(--muted);
      font-size: 12px;
    }

    .card-body {
      padding: 20px;
    }

    .fixtures {
      max-height: 690px;
      overflow-y: auto;
    }

    .fixture {
      padding: 15px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      transition: .15s;
      cursor: pointer;
    }

    .fixture:hover {
      background: rgba(32,232,117,.04);
    }

    .fixture.selected {
      background: rgba(32,232,117,.08);
      box-shadow: inset 3px 0 0 var(--green);
    }

    .fixture-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 9px;
    }

    .league {
      color: var(--green);
      font-size: 12px;
      font-weight: 800;
    }

    .kickoff {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .teams {
      font-weight: 800;
      font-size: 15px;
      line-height: 1.45;
    }

    .fixture-meta {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.06);
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
    }

    .pill.upcoming {
      color: #8dffbb;
      background: rgba(32,232,117,.08);
    }

    .pill.live {
      color: #ffbdc4;
      background: rgba(255,93,108,.1);
    }

    .empty {
      padding: 45px 20px;
      text-align: center;
      color: var(--muted);
    }

    .empty strong {
      display: block;
      color: var(--text);
      margin-bottom: 7px;
    }

    .section {
      margin-bottom: 20px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-title {
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--green);
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 900;
    }

    .selected-match {
      padding: 15px;
      border-radius: 14px;
      background: rgba(32,232,117,.07);
      border: 1px solid rgba(32,232,117,.15);
      margin-bottom: 16px;
    }

    .selected-match .teams {
      font-size: 17px;
    }

    .selected-match small {
      display: block;
      margin-top: 5px;
      color: var(--muted);
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 13px;
    }

    .field {
      margin-bottom: 13px;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    label {
      display: block;
      margin-bottom: 6px;
      color: #bfd2c6;
      font-size: 12px;
      font-weight: 800;
    }

    .actions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      margin-top: 15px;
    }

    .slip-box {
      background:
        linear-gradient(135deg, rgba(32,232,117,.10), rgba(8,24,16,.5));
      border: 1px solid rgba(32,232,117,.18);
      border-radius: 15px;
      padding: 17px;
    }

    .slip-title {
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 4px;
    }

    .slip-subtitle {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 15px;
    }

    .records {
      margin-top: 20px;
    }

    .record {
      border: 1px solid var(--border);
      background: rgba(0,0,0,.12);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 10px;
    }

    .record-main {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      align-items: flex-start;
    }

    .record-teams {
      font-weight: 850;
      margin-bottom: 6px;
    }

    .record-details {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
    }

    .status-badge {
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
    }

    .status-draft {
      color: var(--yellow);
      background: rgba(255,209,102,.1);
    }

    .status-published {
      color: #8dffbb;
      background: rgba(32,232,117,.1);
    }

    .record-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .record-actions .btn {
      padding: 7px 10px;
      font-size: 11px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .stat {
      padding: 14px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
    }

    .stat strong {
      display: block;
      font-size: 21px;
    }

    .stat span {
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 800;
    }

    .loading {
      padding: 30px;
      text-align: center;
      color: var(--muted);
    }

    .loading::before {
      content: "";
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,.15);
      border-top-color: var(--green);
      border-radius: 50%;
      animation: spin .8s linear infinite;
      vertical-align: -4px;
      margin-right: 9px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 950px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .fixtures {
        max-height: 500px;
      }
    }

    @media (max-width: 600px) {
      .container {
        width: 95%;
        padding-top: 18px;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .field.full {
        grid-column: auto;
      }

      .stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .date-control {
        width: 100%;
      }

      .date-control input {
        flex: 1;
        width: auto;
      }

      .record-main {
        flex-direction: column;
      }
    }
  </style>
</head>

<body>

<div class="container">

  <header>
    <div class="brand">
      <div class="logo">TS</div>
      <div>
        <h1>TomsonStakes Admin</h1>
        <p>Global fixture selection · Predictions · Daily Slip</p>
      </div>
    </div>

    <div class="date-control">
      <input type="date" id="dateInput">
      <button class="btn btn-primary" id="loadDateBtn">
        Load Date
      </button>
    </div>
  </header>

  <div id="statusBox" class="status"></div>

  <div class="stats">
    <div class="stat">
      <strong id="fixtureCount">0</strong>
      <span>Fixtures</span>
    </div>

    <div class="stat">
      <strong id="draftCount">0</strong>
      <span>Drafts</span>
    </div>

    <div class="stat">
      <strong id="publishedCount">0</strong>
      <span>Published</span>
    </div>

    <div class="stat">
      <strong id="slipStatus">—</strong>
      <span>Daily Slip</span>
    </div>
  </div>

  <div class="grid">

    <!-- =====================================================
         LEFT COLUMN
         ===================================================== -->

    <div>

      <div class="card">

        <div class="card-header">
          <div>
            <h2>🌍 Global Fixtures</h2>
            <span id="fixtureSummary">
              Select a date to load fixtures.
            </span>
          </div>

          <span id="fixtureSource">API-Football</span>
        </div>

        <div id="fixturesList" class="fixtures">
          <div class="empty">
            <strong>No fixtures loaded</strong>
            Select a date and click Load Date.
          </div>
        </div>

      </div>


      <!-- ===================================================
           EXISTING RECORDS
           =================================================== -->

      <div class="card records">

        <div class="card-header">
          <div>
            <h2>📝 Saved Predictions</h2>
            <span>Draft and published predictions for this date</span>
          </div>
        </div>

        <div class="card-body">

          <div class="section">
            <div class="section-title">
              Draft Predictions
            </div>

            <div id="draftList">
              <div class="empty">
                No draft predictions.
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              Matches Published
            </div>

            <div id="publishedList">
              <div class="empty">
                No published predictions.
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>


    <!-- =====================================================
         RIGHT COLUMN
         ===================================================== -->

    <div>

      <!-- ===================================================
           DAILY SLIP
           =================================================== -->

      <div class="card section">

        <div class="card-header">
          <div>
            <h2>🎟️ Daily Slip</h2>
            <span>Booking information for the selected date</span>
          </div>
        </div>

        <div class="card-body">

          <div class="slip-box">

            <div class="slip-title">
              TODAY'S BOOKING
            </div>

            <div class="slip-subtitle">
              Save as draft first, then publish when ready.
            </div>

            <div class="field">
              <label for="bookingCode">
                Booking Code
              </label>

              <input
                id="bookingCode"
                type="text"
                placeholder="e.g. ABC12345"
                autocomplete="off"
              >
            </div>

            <div class="field">
              <label for="bookmaker">
                Bookmaker
              </label>

              <input
                id="bookmaker"
                type="text"
                placeholder="e.g. Bet9ja"
                autocomplete="off"
              >
            </div>

            <div class="actions">

              <button
                class="btn btn-secondary"
                id="saveSlipBtn"
                type="button"
              >
                Save Draft
              </button>

              <button
                class="btn btn-primary"
                id="publishSlipBtn"
                type="button"
              >
                Publish Slip
              </button>

            </div>

          </div>

        </div>

      </div>


      <!-- ===================================================
           PREDICTION EDITOR
           =================================================== -->

      <div class="card">

        <div class="card-header">
          <div>
            <h2>🎯 Prediction Editor</h2>
            <span>Create or edit a prediction</span>
          </div>

          <button
            class="btn btn-secondary"
            id="clearFormBtn"
            type="button"
          >
            Clear
          </button>
        </div>

        <div class="card-body">

          <div id="selectedMatchBox" class="selected-match">
            <div class="muted">
              Select a fixture from the left.
            </div>
          </div>

          <input type="hidden" id="predictionId">
          <input type="hidden" id="fixtureId">
          <input type="hidden" id="homeTeamId">
          <input type="hidden" id="awayTeamId">

          <div class="form-grid">

            <div class="field">
              <label for="homeTeam">
                Home Team
              </label>

              <input id="homeTeam" type="text">
            </div>

            <div class="field">
              <label for="awayTeam">
                Away Team
              </label>

              <input id="awayTeam" type="text">
            </div>

            <div class="field">
              <label for="country">
                Country
              </label>

              <input id="country" type="text">
            </div>

            <div class="field">
              <label for="league">
                League
              </label>

              <input id="league" type="text">
            </div>

            <div class="field">
              <label for="kickoff">
                Kickoff
              </label>

              <input id="kickoff" type="text">
            </div>

            <div class="field">
              <label for="market">
                Market
              </label>

              <select id="market">

                <option value="HOME WIN">
                  HOME WIN
                </option>

                <option value="DRAW">
                  DRAW
                </option>

                <option value="AWAY WIN">
                  AWAY WIN
                </option>

                <option value="OVER 1.5">
                  OVER 1.5
                </option>

                <option value="OVER 2.5">
                  OVER 2.5
                </option>

                <option value="UNDER 2.5">
                  UNDER 2.5
                </option>

                <option value="UNDER 3.5">
                  UNDER 3.5
                </option>

                <option value="BTTS YES">
                  BTTS YES
                </option>

                <option value="BTTS NO">
                  BTTS NO
                </option>

              </select>
            </div>

            <div class="field">
              <label for="prediction">
                Prediction
              </label>

              <input
                id="prediction"
                type="text"
                placeholder="e.g. HOME WIN"
              >
            </div>

            <div class="field">
              <label for="confidence">
                Confidence (5–10)
              </label>

              <input
                id="confidence"
                type="number"
                min="5"
                max="10"
                step="1"
                value="7"
              >
            </div>

            <div class="field full">
              <label for="analysis">
                Analysis / Reason
              </label>

              <textarea
                id="analysis"
                placeholder="Enter the reasoning behind this prediction..."
              ></textarea>
            </div>

            <div class="field">
              <label for="status">
                Status
              </label>

              <select id="status">

                <option value="DRAFT">
                  DRAFT
                </option>

                <option value="PUBLISHED">
                  PUBLISHED
                </option>

                <option value="UNPUBLISHED">
                  UNPUBLISHED
                </option>

              </select>
            </div>

          </div>

          <div class="actions">

            <button
              class="btn btn-secondary"
              id="saveDraftBtn"
              type="button"
            >
              💾 Save Draft
            </button>

            <button
              class="btn btn-primary"
              id="publishPredictionBtn"
              type="button"
            >
              🚀 Publish Prediction
            </button>

          </div>

        </div>

      </div>

    </div>

  </div>

</div>


<script>
"use strict";

/* ============================================================
   TOMSONSTAKES ADMIN
   ============================================================ */

const $ = (id) => document.getElementById(id);

let fixtures = [];
let predictions = [];
let dailySlip = null;
let selectedFixture = null;


/* ============================================================
   DATE
   ============================================================ */

function lagosDate() {

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());

}


/* ============================================================
   STATUS
   ============================================================ */

function showStatus(message, type = "info") {

  const box = $("statusBox");

  box.textContent = message;

  box.className =
    "status show " + type;

}


function clearStatus() {

  $("statusBox").className =
    "status";

}


/* ============================================================
   API HELPER
   ============================================================ */

async function api(url, options = {}) {

  const response =
    await fetch(
      url,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      }
    );

  const text =
    await response.text();

  let data = {};

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  }

  catch (error) {

    throw new Error(
      "Server returned invalid JSON."
    );

  }

  if (!response.ok || data.success === false) {

    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );

  }

  return data;

}


/* ============================================================
   FIXTURE NORMALIZER
   ============================================================

   IMPORTANT:

   /api/fixtures.js returns:

   {
     success: true,
     response: [
       {
         fixture: {...},
         league: {...},
         teams: {...},
         goals: {...}
       }
     ]
   }

   Therefore the actual fixture array is data.response.
   ============================================================ */

function normalizeFixtures(data) {

  let list = [];

  if (Array.isArray(data?.response)) {

    list = data.response;

  }

  else if (Array.isArray(data?.fixtures)) {

    list = data.fixtures;

  }

  else if (Array.isArray(data?.matches)) {

    list = data.matches;

  }

  else if (Array.isArray(data?.data)) {

    list = data.data;

  }


  return list
    .map((f) => {

      const fixture =
        f?.fixture || {};

      const league =
        f?.league || {};

      const teams =
        f?.teams || {};

      const home =
        teams?.home || {};

      const away =
        teams?.away || {};

      const status =
        fixture?.status || {};

      return {

        raw: f,

        id:
          fixture?.id ??
          f?.id ??
          f?.fixture_id ??
          "",

        home_team:
          home?.name ||
          f?.home_team ||
          "",

        away_team:
          away?.name ||
          f?.away_team ||
          "",

        home_team_id:
          home?.id ??
          f?.home_team_id ??
          null,

        away_team_id:
          away?.id ??
          f?.away_team_id ??
          null,

        country:
          league?.country ||
          f?.country ||
          "",

        league:
          league?.name ||
          f?.league_name ||
          "",

        league_id:
          league?.id ??
          f?.league_id ??
          null,

        kickoff:
          fixture?.date ||
          f?.kickoff ||
          null,

        timestamp:
          fixture?.timestamp ??
          f?.timestamp ??
          null,

        status:
          String(
            status?.short ||
            f?.status ||
            ""
          ).toUpperCase(),

        venue:
          fixture?.venue?.name ||
          "",

        referee:
          fixture?.referee ||
          ""

      };

    })
    .filter(
      f =>
        f.id &&
        f.home_team &&
        f.away_team
    );

}


/* ============================================================
   LOAD FIXTURES
   ============================================================ */

async function loadFixtures(date) {

  $("fixturesList").innerHTML =
    `<div class="loading">Loading global fixtures...</div>`;

  try {

    const data =
      await api(
        `/api/fixtures?date=${encodeURIComponent(date)}`
      );

    fixtures =
      normalizeFixtures(data);

    renderFixtures();

    $("fixtureCount").textContent =
      fixtures.length;

    const count =
      Number(
        data?.results?.count ??
        fixtures.length
      );

    const countries =
      Number(
        data?.results?.countries ??
        0
      );

    const leagues =
      Number(
        data?.results?.leagues ??
        0
      );

    $("fixtureSummary").textContent =
      `${count} fixtures · ${countries} countries · ${leagues} leagues`;

    return true;

  }

  catch (error) {

    fixtures = [];

    $("fixturesList").innerHTML = `
      <div class="empty">
        <strong>Unable to load fixtures</strong>
        ${escapeHtml(error.message)}
      </div>
    `;

    $("fixtureCount").textContent =
      "0";

    $("fixtureSummary").textContent =
      "Fixture request failed.";

    throw error;

  }

}


/* ============================================================
   RENDER FIXTURES
   ============================================================ */

function renderFixtures() {

  const box =
    $("fixturesList");

  if (!fixtures.length) {

    box.innerHTML = `
      <div class="empty">
        <strong>No fixtures found</strong>
        API-Football returned no fixtures for this date.
      </div>
    `;

    return;

  }


  box.innerHTML =
    fixtures
      .map(
        (f, index) => {

          const selected =
            selectedFixture &&
            String(selectedFixture.id) ===
            String(f.id);

          const statusClass =
            ["1H","HT","2H","ET","BT","P","LIVE"]
              .includes(f.status)
              ? "live"
              : ["NS","TBD"].includes(f.status)
                ? "upcoming"
                : "";


          return `
            <div
              class="fixture ${selected ? "selected" : ""}"
              data-index="${index}"
            >

              <div class="fixture-top">

                <div class="league">
                  ${escapeHtml(
                    f.country
                      ? `${f.country} · ${f.league}`
                      : f.league
                  )}
                </div>

                <div class="kickoff">
                  ${formatKickoff(f.kickoff)}
                </div>

              </div>

              <div class="teams">
                ${escapeHtml(f.home_team)}
                <br>
                <span class="muted">vs</span>
                <br>
                ${escapeHtml(f.away_team)}
              </div>

              <div class="fixture-meta">

                <span class="pill ${statusClass}">
                  ${escapeHtml(f.status || "UNKNOWN")}
                </span>

                ${
                  f.venue
                    ? `<span class="pill">
                        ${escapeHtml(f.venue)}
                       </span>`
                    : ""
                }

                <span class="pill">
                  ID ${escapeHtml(String(f.id))}
                </span>

              </div>

            </div>
          `;

        }
      )
      .join("");


  box
    .querySelectorAll(".fixture")
    .forEach(
      element => {

        element.addEventListener(
          "click",
          () => {

            const index =
              Number(
                element.dataset.index
              );

            selectFixture(
              fixtures[index]
            );

          }
        );

      }
    );

}


/* ============================================================
   SELECT FIXTURE
   ============================================================ */

function selectFixture(fixture) {

  selectedFixture =
    fixture;

  $("predictionId").value =
    "";

  $("fixtureId").value =
    fixture.id;

  $("homeTeamId").value =
    fixture.home_team_id || "";

  $("awayTeamId").value =
    fixture.away_team_id || "";

  $("homeTeam").value =
    fixture.home_team;

  $("awayTeam").value =
    fixture.away_team;

  $("country").value =
    fixture.country;

  $("league").value =
    fixture.league;

  $("kickoff").value =
    fixture.kickoff || "";

  $("prediction").value =
    "";

  $("analysis").value =
    "";

  $("confidence").value =
    "7";

  $("market").value =
    "HOME WIN";

  $("status").value =
    "DRAFT";


  renderSelectedMatch();

  renderFixtures();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* ============================================================
   SELECTED MATCH
   ============================================================ */

function renderSelectedMatch() {

  const box =
    $("selectedMatchBox");

  if (!selectedFixture) {

    box.innerHTML = `
      <div class="muted">
        Select a fixture from the left.
      </div>
    `;

    return;

  }


  box.innerHTML = `

    <div class="teams">
      ${escapeHtml(selectedFixture.home_team)}
      <br>
      <span class="muted">vs</span>
      <br>
      ${escapeHtml(selectedFixture.away_team)}
    </div>

    <small>
      ${escapeHtml(selectedFixture.country)}
      ·
      ${escapeHtml(selectedFixture.league)}
      ·
      ${formatKickoff(selectedFixture.kickoff)}
    </small>

  `;

}


/* ============================================================
   LOAD PREDICTIONS
   ============================================================ */

async function loadPredictions(date) {

  const data =
    await api(
      `/api/predictions?date=${encodeURIComponent(date)}`
    );

  predictions =
    Array.isArray(data?.predictions)
      ? data.predictions
      : Array.isArray(data?.data)
        ? data.data
        : [];

  renderPredictionLists();

}


/* ============================================================
   LOAD DAILY SLIP
   ============================================================ */

async function loadDailySlip(date) {

  const data =
    await api(
      `/api/daily-slip?date=${encodeURIComponent(date)}`
    );

  dailySlip =
    data?.slip ||
    null;

  if (dailySlip) {

    $("bookingCode").value =
      dailySlip.booking_code || "";

    $("bookmaker").value =
      dailySlip.bookmaker || "";

    const published =
      String(
        dailySlip.status || ""
      ).toUpperCase() === "PUBLISHED" ||
      dailySlip.is_published === true;

    $("slipStatus").textContent =
      published
        ? "LIVE"
        : "DRAFT";

  }

  else {

    $("bookingCode").value =
      "";

    $("bookmaker").value =
      "";

    $("slipStatus").textContent =
      "—";

  }

}


/* ============================================================
   LOAD DATE
   ============================================================ */

async function loadDate() {

  const date =
    $("dateInput").value;

  if (!date) {

    showStatus(
      "Please select a date.",
      "error"
    );

    return;

  }


  clearStatus();

  selectedFixture =
    null;

  renderSelectedMatch();


  /*
   * IMPORTANT:
   *
   * Use independent requests.
   *
   * A failure from predictions or daily-slip
   * must NOT hide the fixtures.
   */

  const results =
    await Promise.allSettled([

      loadFixtures(date),

      loadPredictions(date),

      loadDailySlip(date)

    ]);


  const fixtureResult =
    results[0];

  const predictionResult =
    results[1];

  const slipResult =
    results[2];


  if (
    fixtureResult.status === "fulfilled"
  ) {

    showStatus(
      `Loaded ${fixtures.length} fixtures for ${date}.`,
      "success"
    );

  }

  else {

    showStatus(
      `Fixtures failed: ${fixtureResult.reason?.message || "Unknown error"}`,
      "error"
    );

  }


  if (
    predictionResult.status === "rejected"
  ) {

    $("draftList").innerHTML = `
      <div class="empty">
        <strong>Predictions unavailable</strong>
        ${escapeHtml(
          predictionResult.reason?.message ||
          "Unable to load predictions."
        )}
      </div>
    `;

    $("publishedList").innerHTML = `
      <div class="empty">
        Prediction records could not be loaded.
      </div>
    `;

  }


  if (
    slipResult.status === "rejected"
  ) {

    $("slipStatus").textContent =
      "ERROR";

  }

}


/* ============================================================
   RENDER PREDICTIONS
   ============================================================ */

function renderPredictionLists() {

  const drafts =
    predictions.filter(
      p =>
        String(p.status || "")
          .toUpperCase() === "DRAFT"
    );


  const published =
    predictions.filter(
      p =>
        String(p.status || "")
          .toUpperCase() === "PUBLISHED"
    );


  $("draftCount").textContent =
    drafts.length;

  $("publishedCount").textContent =
    published.length;


  renderRecordList(
    $("draftList"),
    drafts,
    true
  );


  renderRecordList(
    $("publishedList"),
    published,
    false
  );

}


/* ============================================================
   RENDER RECORD LIST
   ============================================================ */

function renderRecordList(
  container,
  records,
  isDraft
) {

  if (!records.length) {

    container.innerHTML = `
      <div class="empty">
        No ${isDraft ? "draft" : "published"} predictions.
      </div>
    `;

    return;

  }


  container.innerHTML =
    records
      .map(
        p => {

          const id =
            p.id;

          const home =
            p.home_team ||
            p.homeTeam ||
            "";

          const away =
            p.away_team ||
            p.awayTeam ||
            "";

          const market =
            p.market ||
            p.prediction ||
            "—";

          const confidence =
            p.confidence ??
            "—";


          return `
            <div class="record">

              <div class="record-main">

                <div>

                  <div class="record-teams">
                    ${escapeHtml(home)}
                    <span class="muted"> vs </span>
                    ${escapeHtml(away)}
                  </div>

                  <div class="record-details">

                    <span class="pill">
                      ${escapeHtml(
                        p.league || ""
                      )}
                    </span>

                    <span class="pill">
                      ${escapeHtml(
                        market
                      )}
                    </span>

                    <span class="pill">
                      Confidence ${escapeHtml(
                        String(confidence)
                      )}
                    </span>

                    <span
                      class="status-badge ${
                        isDraft
                          ? "status-draft"
                          : "status-published"
                      }"
                    >
                      ${isDraft
                        ? "DRAFT"
                        : "PUBLISHED"}
                    </span>

                  </div>

                </div>


                <div class="record-actions">

                  <button
                    class="btn btn-blue"
                    type="button"
                    data-edit="${escapeHtml(
                      String(id)
                    )}"
                  >
                    Edit
                  </button>

                  ${
                    isDraft
                      ? `
                        <button
                          class="btn btn-primary"
                          type="button"
                          data-publish="${escapeHtml(
                            String(id)
                          )}"
                        >
                          Publish
                        </button>
                      `
                      : ""
                  }

                  <button
                    class="btn btn-danger"
                    type="button"
                    data-delete="${escapeHtml(
                      String(id)
                    )}"
                  >
                    Delete
                  </button>

                </div>

              </div>

            </div>
          `;

        }
      )
      .join("");


  container
    .querySelectorAll("[data-edit]")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            editPrediction(
              button.dataset.edit
            );

          }
        );

      }
    );


  container
    .querySelectorAll("[data-publish]")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            publishExistingPrediction(
              button.dataset.publish
            );

          }
        );

      }
    );


  container
    .querySelectorAll("[data-delete]")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            deletePrediction(
              button.dataset.delete
            );

          }
        );

      }
    );

}


/* ============================================================
   EDIT PREDICTION
   ============================================================ */

function editPrediction(id) {

  const prediction =
    predictions.find(
      p =>
        String(p.id) ===
        String(id)
    );

  if (!prediction) {

    showStatus(
      "Prediction record not found.",
      "error"
    );

    return;

  }


  $("predictionId").value =
    prediction.id;

  $("fixtureId").value =
    prediction.fixture_id ||
    prediction.fixtureId ||
    "";

  $("homeTeamId").value =
    prediction.home_team_id ||
    "";

  $("awayTeamId").value =
    prediction.away_team_id ||
    "";

  $("homeTeam").value =
    prediction.home_team ||
    "";

  $("awayTeam").value =
    prediction.away_team ||
    "";

  $("country").value =
    prediction.country ||
    "";

  $("league").value =
    prediction.league ||
    "";

  $("kickoff").value =
    prediction.kickoff ||
    "";

  $("market").value =
    prediction.market ||
    "HOME WIN";

  $("prediction").value =
    prediction.prediction ||
    "";

  $("confidence").value =
    prediction.confidence ??
    7;

  $("analysis").value =
    prediction.analysis ||
    "";

  $("status").value =
    String(
      prediction.status ||
      "DRAFT"
    ).toUpperCase();


  selectedFixture =
    fixtures.find(
      f =>
        String(f.id) ===
        String(
          prediction.fixture_id ||
          prediction.fixtureId
        )
    ) || null;


  renderSelectedMatch();

  renderFixtures();


  showStatus(
    "Prediction loaded into the editor. Make your changes and save.",
    "info"
  );


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* ============================================================
   FORM DATA
   ============================================================ */

function getPredictionPayload(
  forcedStatus = null
) {

  const fixtureId =
    $("fixtureId").value.trim();


  if (!fixtureId) {

    throw new Error(
      "Please select a fixture first."
    );

  }


  const homeTeam =
    $("homeTeam").value.trim();

  const awayTeam =
    $("awayTeam").value.trim();

  const prediction =
    $("prediction").value.trim();


  if (!homeTeam || !awayTeam) {

    throw new Error(
      "Home and away teams are required."
    );

  }


  if (!prediction) {

    throw new Error(
      "Prediction is required."
    );

  }


  let confidence =
    Number(
      $("confidence").value
    );


  if (!Number.isInteger(confidence)) {

    throw new Error(
      "Confidence must be a whole number from 5 to 10."
    );

  }


  confidence =
    Math.max(
      5,
      Math.min(
        10,
        confidence
      )
    );


  const status =
    forcedStatus ||
    String(
      $("status").value ||
      "DRAFT"
    ).toUpperCase();


  return {

    id:
      $("predictionId").value
        ? Number(
            $("predictionId").value
          )
        : undefined,

    prediction_date:
      $("dateInput").value,

    fixture_id:
      fixtureId,

    home_team:
      homeTeam,

    away_team:
      awayTeam,

    home_team_id:
      $("homeTeamId").value
        ? Number(
            $("homeTeamId").value
          )
        : null,

    away_team_id:
      $("awayTeamId").value
        ? Number(
            $("awayTeamId").value
          )
        : null,

    country:
      $("country").value.trim(),

    league:
      $("league").value.trim(),

    kickoff:
      $("kickoff").value.trim(),

    market:
      $("market").value,

    prediction,

    confidence,

    analysis:
      $("analysis").value.trim(),

    status

  };

}


/* ============================================================
   SAVE PREDICTION
   ============================================================ */

async function savePrediction(
  status
) {

  try {

    const payload =
      getPredictionPayload(
        status
      );


    const existingId =
      $("predictionId").value;


    let data;


    if (existingId) {

      data =
        await api(
          "/api/predictions",
          {
            method: "PUT",

            body:
              JSON.stringify(
                payload
              )
          }
        );

    }

    else {

      data =
        await api(
          "/api/predictions",
          {
            method: "POST",

            body:
              JSON.stringify(
                payload
              )
          }
        );

    }


    showStatus(
      status === "PUBLISHED"
        ? "Prediction published successfully."
        : "Draft saved successfully.",
      "success"
    );


    await loadPredictions(
      $("dateInput").value
    );


    clearPredictionForm();

  }

  catch (error) {

    showStatus(
      error.message,
      "error"
    );

  }

}


/* ============================================================
   PUBLISH EXISTING PREDICTION
   ============================================================ */

async function publishExistingPrediction(
  id
) {

  const prediction =
    predictions.find(
      p =>
        String(p.id) ===
        String(id)
    );


  if (!prediction) {

    showStatus(
      "Prediction not found.",
      "error"
    );

    return;

  }


  try {

    await api(
      "/api/predictions",
      {
        method: "PUT",

        body:
          JSON.stringify({
            id:
              prediction.id,

            status:
              "PUBLISHED",

            prediction_date:
              prediction.prediction_date ||
              $("dateInput").value
          })
      }
    );


    showStatus(
      "Prediction published successfully.",
      "success"
    );


    await loadPredictions(
      $("dateInput").value
    );

  }

  catch (error) {

    showStatus(
      error.message,
      "error"
    );

  }

}


/* ============================================================
   DELETE PREDICTION
   ============================================================ */

async function deletePrediction(id) {

  const confirmed =
    window.confirm(
      "Delete this prediction permanently?"
    );


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/predictions?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );


    showStatus(
      "Prediction deleted successfully.",
      "success"
    );


    await loadPredictions(
      $("dateInput").value
    );

  }

  catch (error) {

    showStatus(
      error.message,
      "error"
    );

  }

}


/* ============================================================
   DAILY SLIP
   ============================================================ */

async function saveDailySlip(
  publish = false
) {

  const bookingCode =
    $("bookingCode").value.trim();

  const bookmaker =
    $("bookmaker").value.trim();


  if (!bookingCode) {

    showStatus(
      "Booking code is required.",
      "error"
    );

    return;

  }


  if (!bookmaker) {

    showStatus(
      "Bookmaker is required.",
      "error"
    );

    return;

  }


  try {

    await api(
      "/api/predictions",
      {
        method: "POST",

        body:
          JSON.stringify({

            type:
              "daily_slip",

            prediction_date:
              $("dateInput").value,

            booking_code:
              bookingCode,

            bookmaker:
              bookmaker,

            status:
              publish
                ? "PUBLISHED"
                : "DRAFT"

          })
      }
    );


    showStatus(
      publish
        ? "Daily slip published successfully."
        : "Daily slip draft saved successfully.",
      "success"
    );


    await loadDailySlip(
      $("dateInput").value
    );

  }

  catch (error) {

    showStatus(
      error.message,
      "error"
    );

  }

}


/* ============================================================
   CLEAR FORM
   ============================================================ */

function clearPredictionForm() {

  $("predictionId").value =
    "";

  $("fixtureId").value =
    "";

  $("homeTeamId").value =
    "";

  $("awayTeamId").value =
    "";

  $("homeTeam").value =
    "";

  $("awayTeam").value =
    "";

  $("country").value =
    "";

  $("league").value =
    "";

  $("kickoff").value =
    "";

  $("market").value =
    "HOME WIN";

  $("prediction").value =
    "";

  $("confidence").value =
    "7";

  $("analysis").value =
    "";

  $("status").value =
    "DRAFT";

  selectedFixture =
    null;

  renderSelectedMatch();

  renderFixtures();

}


/* ============================================================
   FORMAT KICKOFF
   ============================================================ */

function formatKickoff(
  value
) {

  if (!value) {
    return "Time TBC";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return escapeHtml(
      String(value)
    );

  }


  return new Intl.DateTimeFormat(
    "en-NG",
    {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }
  ).format(date) + " WAT";

}


/* ============================================================
   HTML ESCAPE
   ============================================================ */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* ============================================================
   EVENTS
   ============================================================ */

$("loadDateBtn")
  .addEventListener(
    "click",
    loadDate
  );


$("dateInput")
  .addEventListener(
    "change",
    () => {
      clearStatus();
    }
  );


$("saveDraftBtn")
  .addEventListener(
    "click",
    () => {
      savePrediction(
        "DRAFT"
      );
    }
  );


$("publishPredictionBtn")
  .addEventListener(
    "click",
    () => {
      savePrediction(
        "PUBLISHED"
      );
    }
  );


$("clearFormBtn")
  .addEventListener(
    "click",
    clearPredictionForm
  );


$("saveSlipBtn")
  .addEventListener(
    "click",
    () => {
      saveDailySlip(
        false
      );
    }
  );


$("publishSlipBtn")
  .addEventListener(
    "click",
    () => {
      saveDailySlip(
        true
      );
    }
  );


/* ============================================================
   INITIALIZE
   ============================================================ */

$("dateInput").value =
  lagosDate();


loadDate();

</script>

</body>
</html>
