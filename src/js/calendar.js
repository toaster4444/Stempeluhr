/**
 * calendar.js
 * Monatskalender anzeigen (Feiertage + Custom-Feiertage + Arbeitstage + Abwesenheiten + Problem-Markierung)
 *
 * Rot markiert ("Issue") wenn:
 * - Stempel auf dem Datum cutoffFlag=true
 * - oder manualRequired=true
 * - oder es gibt einen offenen IN ohne OUT (Tag vom offenen IN)
 */

(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymd(d) {
    const y = String(d.getFullYear()).padStart(4, "0");
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
  }

  function ymdFromParts(y, m, d) {
    return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  }

  function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  function monthEndExclusive(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  function weekdayKey(d) {
    const dow = d.getDay(); // 0..6
    return dow === 1 ? "mon"
      : dow === 2 ? "tue"
      : dow === 3 ? "wed"
      : dow === 4 ? "thu"
      : dow === 5 ? "fri"
      : dow === 6 ? "sat"
      : "sun";
  }

  function getSettingsSafe() {
    return (window.StorageService && StorageService.getSettings())
      ? (StorageService.getSettings() || {})
      : {};
  }

  function getWorkdaysSafe(settings) {
    const def = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    const wd = settings.workdays ? settings.workdays : def;
    return { ...def, ...wd };
  }

  function customFactorForDate(settings, dateStr) {
    const list = Array.isArray(settings.customHolidays) ? settings.customHolidays : [];
    const found = list.find(x => x && x.date === dateStr);
    if (!found) return 0;
    const f = Number(found.factor);
    if (Number.isNaN(f) || f < 0) return 0;
    return Math.min(1, f);
  }

  function getAbsenceMap() {
    if (!window.StorageService) return new Map();
    const abs = StorageService.getAbsences();
    const m = new Map();
    abs.forEach(a => { if (a && a.date) m.set(a.date, a); });
    return m;
  }

  function minutesToHM(minutes) {
    const mins = Math.max(0, Math.round(Number(minutes || 0)));
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${hh}:${String(mm).padStart(2, "0")}`;
  }

  function sortStamps(stamps) {
    return stamps
      .filter(s => s && typeof s.timestamp === "number")
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function buildSessions(stampsSorted) {
    const sessions = [];
    let openIn = null;

    for (const st of stampsSorted) {
      if (st.type === "IN") { openIn = st; continue; }
      if (st.type === "OUT") {
        if (openIn && typeof openIn.timestamp === "number" && st.timestamp >= openIn.timestamp) {
          sessions.push({ startTs: openIn.timestamp, endTs: st.timestamp });
          openIn = null;
        } else {
          sessions.push({ startTs: null, endTs: st.timestamp });
        }
      }
    }

    if (openIn) sessions.push({ startTs: openIn.timestamp, endTs: null });
    return sessions;
  }

  function splitSessionByDay(startTs, endTs) {
    const map = new Map();
    let cur = new Date(startTs);
    const end = new Date(endTs);

    while (cur.getTime() < end.getTime()) {
      const dayStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0, 0).getTime();
      const dayEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0).getTime();

      const segStart = Math.max(startTs, dayStart);
      const segEnd = Math.min(endTs, dayEnd);

      if (segEnd > segStart) {
        const dateStr = ymd(new Date(dayStart));
        map.set(dateStr, (map.get(dateStr) || 0) + (segEnd - segStart));
      }

      cur = new Date(dayEnd);
    }

    return map;
  }

  function computeStampMinutesByDate(periodStart, periodEndExclusive) {
    if (!window.StorageService) return new Map();
    const data = StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const sorted = sortStamps(stamps);
    const sessions = buildSessions(sorted);
    const dateMs = new Map();

    for (const sess of sessions) {
      if (typeof sess.startTs === "number" && typeof sess.endTs === "number") {
        const s = Math.max(sess.startTs, periodStart.getTime());
        const e = Math.min(sess.endTs, periodEndExclusive.getTime());
        if (e > s) {
          const parts = splitSessionByDay(s, e);
          parts.forEach((ms, dateStr) => {
            dateMs.set(dateStr, (dateMs.get(dateStr) || 0) + ms);
          });
        }
      }
    }

    const minutesMap = new Map();
    dateMs.forEach((ms, dateStr) => {
      minutesMap.set(dateStr, Math.round(ms / 60000));
    });
    return minutesMap;
  }

  function computeManualMinutesByDate(periodStart, periodEndExclusive) {
    if (!window.StorageService) return new Map();
    const list = StorageService.getManualWork();
    const map = new Map();

    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!entry || !entry.date) return;
      const d = new Date(entry.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      if (d >= periodStart && d < periodEndExclusive) {
        map.set(entry.date, Number(entry.minutesWorked || 0));
      }
    });

    return map;
  }

  // --- Problem-Map aus Stempeln bauen ---
  // Map: dateStr -> { issue:boolean, reasons:Set<string>, cutoff:boolean, openIn:boolean }
  function getStampIssueMap() {
    const map = new Map();

    function ensure(dateStr) {
      if (!map.has(dateStr)) {
        map.set(dateStr, { issue: false, reasons: new Set(), cutoff: false, openIn: false });
      }
      return map.get(dateStr);
    }

    const data = StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];

    // 1) cutoffFlag / manualRequired pro Datum
    for (const s of stamps) {
      if (!s || !s.year) continue;
      const dateStr = ymdFromParts(s.year, s.month, s.day);
      const entry = ensure(dateStr);

      if (s.cutoffFlag) {
        entry.issue = true;
        entry.cutoff = true;
        entry.reasons.add("Ausstempeln vergessen (03:00)");
      }
      if (s.manualRequired) {
        entry.issue = true;
        entry.reasons.add("Manuelle Prüfung nötig");
      }
    }

    // 2) offener IN ohne OUT (nur letzter Zustand)
    const last = stamps.length ? stamps[stamps.length - 1] : null;
    if (last && last.type === "IN" && last.year) {
      const dateStr = ymdFromParts(last.year, last.month, last.day);
      const entry = ensure(dateStr);
      entry.issue = true;
      entry.openIn = true;
      entry.reasons.add("Offener IN ohne OUT");
    }

    return map;
  }

  function renderMonth(containerId, targetDate) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const settings = getSettingsSafe();
    const workdays = getWorkdaysSafe(settings);
    const absMap = getAbsenceMap();
    const issueMap = getStampIssueMap();

    const now = targetDate || new Date();
    const start = monthStart(now);
    const endEx = monthEndExclusive(now);
    const stampMinutesByDate = computeStampMinutesByDate(start, endEx);
    const manualMinutesByDate = computeManualMinutesByDate(start, endEx);

    const monthLabel = start.toLocaleString("de-DE", { month: "long", year: "numeric" });
    const headers = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    const firstDayJs = start.getDay();
    const firstDayMonIndex = (firstDayJs === 0) ? 6 : (firstDayJs - 1);

    const cells = [];
    for (let i = 0; i < firstDayMonIndex; i++) cells.push({ empty: true });

    const d = new Date(start.getTime());
    while (d < endEx) {
      const dateStr = ymd(d);
      const key = weekdayKey(d);
      const isWorkday = !!workdays[key];

      const legal = (window.HolidaysService && HolidaysService.getHolidayInfo)
        ? HolidaysService.getHolidayInfo(settings, d)
        : { isHoliday: false, name: "", offFactor: 0 };

      const customOff = customFactorForDate(settings, dateStr);
      const offFactor = Math.max(legal.offFactor || 0, customOff || 0);
      const requiredFraction = 1 - offFactor;
      const isSollDay = isWorkday && requiredFraction > 0;

      const abs = absMap.get(dateStr) || null;
      const issues = issueMap.get(dateStr) || null;
      const manualMinutes = manualMinutesByDate.has(dateStr) ? manualMinutesByDate.get(dateStr) : null;
      const stampMinutes = stampMinutesByDate.get(dateStr) || 0;
      const recordedMinutes = manualMinutes !== null ? manualMinutes : stampMinutes;
      const hasRecorded = manualMinutes !== null || stampMinutesByDate.has(dateStr);

      cells.push({
        empty: false,
        day: d.getDate(),
        dateStr,
        isWorkday: isSollDay,
        legalName: legal.name || "",
        isLegal: !!legal.isHoliday,
        customOff,
        requiredFraction,
        abs,
        issues,
        recordedMinutes,
        hasRecorded
      });

      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    }

    container.innerHTML = `
      <div class="cal-header">
        <div>
          <div class="cal-title">${monthLabel}</div>
          <div class="cal-sub muted small">
            Bundesland: ${settings.state || "–"}${settings.localProfile ? ` • Profil: ${settings.localProfile}` : ""} • Feiertage ignorieren: ${settings.ignoreHolidays ? "ja" : "nein"}
          </div>
        </div>
        <div class="cal-actions">
          <button class="btn secondary" id="calPrev" type="button">◀</button>
          <button class="btn secondary" id="calToday" type="button">Heute</button>
          <button class="btn secondary" id="calNext" type="button">▶</button>
        </div>
      </div>

      <div class="cal-grid cal-weekdays">
        ${headers.map(h => `<div class="cal-wd">${h}</div>`).join("")}
      </div>

      <div class="cal-grid cal-days" id="calDays"></div>
    `;

    const calDays = container.querySelector("#calDays");

    cells.forEach(cell => {
      if (cell.empty) {
        const div = document.createElement("div");
        div.className = "cal-cell cal-empty";
        calDays.appendChild(div);
        return;
      }

      const classes = ["cal-cell"];
      if (cell.isWorkday) classes.push("cal-workday");
      if (cell.requiredFraction < 1 && cell.requiredFraction > 0) classes.push("cal-partialoff");
      if (cell.requiredFraction === 0) classes.push("cal-off");

      if (cell.isLegal) classes.push("cal-legal");
      if (cell.customOff > 0) classes.push("cal-custom");

      const abs = cell.abs;
      const absBadge = abs
        ? (abs.type === "VACATION" ? (abs.auto ? "Urlaub (auto)" : "Urlaub") :
           abs.type === "SICK" ? "Krank" :
           abs.type === "WORK_MANUAL" ? "Arbeit (man.)" : abs.type)
        : "";

      if (abs) classes.push("cal-abs");

      const issues = cell.issues;
      const hasIssue = !!(issues && issues.issue);
      if (hasIssue) classes.push("cal-issue");
      if (issues && issues.cutoff) classes.push("cal-cutoff");

      const issueTitle = hasIssue ? Array.from(issues.reasons).join(" • ") : "";

      const div = document.createElement("div");
      div.className = classes.join(" ");
      if (hasIssue) div.title = issueTitle;
      div.classList.add("cal-clickable");
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.onclick = () => {
        window.dispatchEvent(new CustomEvent("calendar:day-click", { detail: { dateStr: cell.dateStr } }));
      };
      div.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          div.click();
        }
      };

      div.innerHTML = `
        <div class="cal-daynum">${cell.day}</div>

        <div class="cal-meta">
          ${cell.isWorkday ? `<span class="badge">Soll</span>` : `<span class="badge ghost">frei</span>`}
          ${cell.requiredFraction === 0 ? `<span class="badge warn">Feiertag</span>` : ""}
          ${cell.requiredFraction < 1 && cell.requiredFraction > 0 ? `<span class="badge warn">teilfrei</span>` : ""}
          ${abs ? `<span class="badge info">${absBadge}</span>` : ""}
          ${hasIssue ? `<span class="badge danger">⚠</span>` : ""}
        </div>

        ${cell.hasRecorded ? `<div class="cal-time">Erfasst: ${minutesToHM(cell.recordedMinutes)}</div>` : ""}

        <div class="cal-label">${cell.isLegal ? cell.legalName : ""}</div>
        <div class="cal-label muted">${cell.customOff > 0 ? (cell.customOff === 1 ? "Custom frei" : `Custom Faktor ${cell.customOff}`) : ""}</div>
        <div class="cal-label danger-text">${hasIssue ? issueTitle : ""}</div>
      `;

      calDays.appendChild(div);
    });

    const prevBtn = container.querySelector("#calPrev");
    const nextBtn = container.querySelector("#calNext");
    const todayBtn = container.querySelector("#calToday");

    prevBtn.onclick = () => renderMonth(containerId, new Date(start.getFullYear(), start.getMonth() - 1, 1));
    nextBtn.onclick = () => renderMonth(containerId, new Date(start.getFullYear(), start.getMonth() + 1, 1));
    todayBtn.onclick = () => renderMonth(containerId, new Date());
  }

  window.CalendarView = { renderMonth };
})();
