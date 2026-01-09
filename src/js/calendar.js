/**
 * calendar.js
 * Monatskalender anzeigen (Feiertage + Custom-Feiertage + Arbeitstage-Markierung)
 * Rein lokal, keine Server.
 */

(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymd(d) {
    const y = String(d.getFullYear()).padStart(4, "0");
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
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

  function renderMonth(containerId, targetDate) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const settings = getSettingsSafe();
    const workdays = getWorkdaysSafe(settings);

    const now = targetDate || new Date();
    const start = monthStart(now);
    const endEx = monthEndExclusive(now);

    // Header
    const monthLabel = start.toLocaleString("de-DE", { month: "long", year: "numeric" });

    // Build grid with Monday-first headers
    const headers = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    // Determine offset: convert JS day (Sun=0) to Monday-first index
    // Monday=0 ... Sunday=6
    const firstDayJs = start.getDay(); // 0..6
    const firstDayMonIndex = (firstDayJs === 0) ? 6 : (firstDayJs - 1);

    // Collect all day cells
    const days = [];
    for (let i = 0; i < firstDayMonIndex; i++) {
      days.push({ empty: true });
    }

    const d = new Date(start.getTime());
    while (d < endEx) {
      const dateStr = ymd(d);
      const key = weekdayKey(d);
      const isWorkday = !!workdays[key];

      const legal = (window.HolidaysService && HolidaysService.getHolidayInfo)
        ? HolidaysService.getHolidayInfo(settings, d)
        : { isHoliday: false, name: "", offFactor: 0 };

      const customFactor = customFactorForDate(settings, dateStr);
      const customOff = customFactor; // 0..1

      const offFactor = Math.max(legal.offFactor || 0, customOff || 0);
      const isOff = isWorkday && offFactor > 0;

      let label = "";
      if (legal.isHoliday && legal.name) label = legal.name;
      // Custom label, wenn customOff > legalOff oder legal fehlt
      if (customOff > 0) {
        const cLabel = (customOff === 1) ? "Custom frei" : `Custom ${customOff}`;
        label = label ? `${label} • ${cLabel}` : cLabel;
      }

      days.push({
        empty: false,
        day: d.getDate(),
        dateStr,
        isWorkday,
        isHoliday: !!legal.isHoliday,
        holidayName: legal.name || "",
        customOff,
        offFactor,
        isOff,
        isToday: ymd(d) === ymd(new Date())
      });

      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    }

    // Render
    container.innerHTML = `
      <div class="cal-header">
        <div>
          <div class="cal-title">${monthLabel}</div>
          <div class="cal-sub muted small">
            Arbeitstage: markiert • Feiertage/Custom: farbig • (Bundesland: ${settings.state || "–"}${settings.localProfile ? `, Profil: ${settings.localProfile}` : ""})
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

    days.forEach(cell => {
      if (cell.empty) {
        const div = document.createElement("div");
        div.className = "cal-cell cal-empty";
        calDays.appendChild(div);
        return;
      }

      const classes = ["cal-cell"];
      if (cell.isToday) classes.push("cal-today");
      if (cell.isWorkday) classes.push("cal-workday");
      if (cell.isOff) classes.push("cal-off");
      if (cell.isHoliday) classes.push("cal-legal");
      if (cell.customOff > 0) classes.push("cal-custom");

      const div = document.createElement("div");
      div.className = classes.join(" ");

      div.innerHTML = `
        <div class="cal-daynum">${cell.day}</div>
        <div class="cal-meta">
          ${cell.isWorkday ? `<span class="badge">Soll</span>` : `<span class="badge ghost">frei</span>`}
          ${cell.isOff ? `<span class="badge warn">frei</span>` : ""}
        </div>
        <div class="cal-label">${cell.holidayName || ""}</div>
        <div class="cal-label muted">${cell.customOff > 0 ? (cell.customOff === 1 ? "Custom frei" : `Custom Faktor ${cell.customOff}`) : ""}</div>
      `;

      calDays.appendChild(div);
    });

    // Navigation
    const prevBtn = container.querySelector("#calPrev");
    const nextBtn = container.querySelector("#calNext");
    const todayBtn = container.querySelector("#calToday");

    prevBtn.onclick = () => {
      const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      renderMonth(containerId, prev);
    };
    nextBtn.onclick = () => {
      const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      renderMonth(containerId, next);
    };
    todayBtn.onclick = () => {
      renderMonth(containerId, new Date());
    };
  }

  window.CalendarView = { renderMonth };
})();
