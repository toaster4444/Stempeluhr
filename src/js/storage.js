/**
 * storage.js
 * Zentrale lokale Datenspeicherung für die Stempeluhr (nur Browser).
 *
 * NEU (wichtig):
 * - Jahreswechsel: Resturlaub vom Vorjahr wird automatisch berechnet & übernommen
 * - deleteStampByTimestamp()
 */

(function () {
  const STORAGE_KEY = "stempeluhr_data_v1";

  function nowTs() { return Date.now(); }

  function defaultData() {
    return {
      stamps: [],
      settings: {
        // Jahreswechsel-Erkennung
        vacationYearLastSeen: null,

        // Urlaub
        vacationAvailable: null,      // Anspruch aktuelles Jahr (z. B. 30)
        carryoverYear: null,          // aus welchem Jahr kommt carryover (z. B. 2025)
        carryoverDays: null,          // ursprüngliche carryover Tage (Info)
        carryoverRemaining: null,     // aktuell verfügbarer carryover (wird bei Jahreswechsel neu gesetzt)

        // Arbeitstage
        workdays: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false },

        // Feiertage / custom
        state: "",
        ignoreHolidays: false,
        localProfile: "",
        customHolidays: []
      },
      absences: [],
      manualWork: [],
      meta: {
        lastAction: null,
        cutoffLastCheckedAt: null
      }
    };
  }

  function migrate(data) {
    const base = defaultData();
    if (!data || typeof data !== "object") return base;

    const merged = {
      ...base,
      ...data,
      meta: { ...base.meta, ...(data.meta || {}) },
      settings: { ...(base.settings || {}), ...((data.settings && typeof data.settings === "object") ? data.settings : {}) }
    };

    if (!Array.isArray(merged.stamps)) merged.stamps = [];
    if (!Array.isArray(merged.absences)) merged.absences = [];
    if (!Array.isArray(merged.manualWork)) merged.manualWork = [];
    if (!merged.settings || typeof merged.settings !== "object") merged.settings = { ...base.settings };

    // workdays default absichern
    if (!merged.settings.workdays || typeof merged.settings.workdays !== "object") {
      merged.settings.workdays = { ...base.settings.workdays };
    } else {
      merged.settings.workdays = { ...base.settings.workdays, ...merged.settings.workdays };
    }

    // customHolidays default absichern
    if (!Array.isArray(merged.settings.customHolidays)) merged.settings.customHolidays = [];

    return merged;
  }

  function loadRaw() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error("Speicher konnte nicht gelesen werden", e);
      return defaultData();
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ----------------------------
  // Helfer für Urlaubsberechnung
  // ----------------------------

  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymdFromYMD(y, m, d) {
    return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  }

  function parseYmd(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return new Date(y, mo - 1, da, 0, 0, 0, 0);
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

  function getWorkdaysSafe(settings) {
    const def = { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false };
    const wd = (settings && settings.workdays && typeof settings.workdays === "object") ? settings.workdays : def;
    return { ...def, ...wd };
  }

  function customOffFactor(settings, dateStr) {
    const list = Array.isArray(settings.customHolidays) ? settings.customHolidays : [];
    const found = list.find(x => x && x.date === dateStr);
    if (!found) return 0;
    const f = Number(found.factor);
    if (Number.isNaN(f) || f < 0) return 0;
    return Math.min(1, f);
  }

  function legalOffFactor(settings, dateObj) {
    // Wichtig: HolidaysService ist evtl. noch nicht geladen -> dann 0
    if (!window.HolidaysService || !HolidaysService.getHolidayInfo) return 0;
    const info = HolidaysService.getHolidayInfo(settings, dateObj);
    return info && info.offFactor ? info.offFactor : 0;
  }

  // required work fraction: 0 / 0.5 / 1 ...
  function requiredWorkFraction(settings, workdays, dateObj) {
    const key = weekdayKey(dateObj);
    if (!workdays[key]) return 0;

    const dateStr = `${String(dateObj.getFullYear()).padStart(4, "0")}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
    const off = Math.max(
      legalOffFactor(settings, dateObj),
      customOffFactor(settings, dateStr)
    );
    const req = 1 - off;
    return req > 0 ? req : 0;
  }

  function hasStampOnDate(stamps, dateStr) {
    return (Array.isArray(stamps) ? stamps : []).some(s => {
      if (!s || !s.year) return false;
      const ds = `${s.year}-${pad2(s.month)}-${pad2(s.day)}`;
      return ds === dateStr;
    });
  }

  // Zählt verbrauchten Urlaub im Jahr (inkl. auto + geplant + manuell),
  // aber nur, wenn NICHT gestempelt wurde (Refund).
  function computeUsedVacationDaysForYear(data, year) {
    const settings = data.settings || {};
    const workdays = getWorkdaysSafe(settings);

    const abs = Array.isArray(data.absences) ? data.absences : [];
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];

    let used = 0;

    abs.forEach(a => {
      if (!a || a.type !== "VACATION" || !a.date) return;

      const d = parseYmd(a.date);
      if (!d) return;
      if (d.getFullYear() !== year) return;

      // Wenn gestempelt -> zählt nicht
      if (hasStampOnDate(stamps, a.date)) return;

      const req = requiredWorkFraction(settings, workdays, d);
      if (req <= 0) return;

      used += req;
    });

    return used;
  }

  function getCarryoverEnteringYear(settings, year) {
    // carryoverRemaining gilt für das aktuelle Jahr, wenn carryoverYear = year-1
    // Falls carryoverRemaining nicht gesetzt, nehmen wir carryoverDays (Startwert).
    const cy = Number(settings.carryoverYear);
    if (!cy || Number.isNaN(cy)) return 0;
    if (cy !== (year - 1)) return 0;

    if (typeof settings.carryoverRemaining === "number") return Math.max(0, settings.carryoverRemaining);
    if (typeof settings.carryoverDays === "number") return Math.max(0, settings.carryoverDays);
    return 0;
  }

  function getAnnualEntitlement(settings) {
    const v = Number(settings.vacationAvailable || 0);
    return Number.isNaN(v) ? 0 : Math.max(0, v);
  }

  /**
   * Jahreswechsel:
   * - Wenn yearLastSeen < currentYear:
   *   - berechne Rest für yearLastSeen: entitlement + carryoverEntering - used
   *   - setze carryover für currentYear auf diesen Rest (coming from yearLastSeen)
   *   - setze vacationYearLastSeen = currentYear
   */
  function applyYearRolloverIfNeeded(data) {
    const curYear = new Date().getFullYear();
    if (!data.settings || typeof data.settings !== "object") data.settings = {};

    const lastSeenRaw = data.settings.vacationYearLastSeen;
    const lastSeen = Number(lastSeenRaw);

    // Noch nie gesetzt -> initialisieren
    if (!lastSeenRaw || Number.isNaN(lastSeen) || lastSeen <= 0) {
      data.settings.vacationYearLastSeen = curYear;
      return { data, changed: true };
    }

    // Kein Wechsel
    if (lastSeen === curYear) return { data, changed: false };

    // Wenn mehrere Jahre übersprungen wurden: wir rollen Schrittweise,
    // damit carryoverYear korrekt bleibt.
    let changed = false;
    let y = lastSeen;

    while (y < curYear) {
      const entitlement = getAnnualEntitlement(data.settings);
      const carryIn = getCarryoverEnteringYear(data.settings, y);
      const used = computeUsedVacationDaysForYear(data, y);

      const rest = Math.max(0, (entitlement + carryIn) - used);

      // carryover für nächstes Jahr setzen
      data.settings.carryoverYear = y;
      data.settings.carryoverDays = rest;
      data.settings.carryoverRemaining = rest;

      // nächstes Jahr
      y += 1;
      changed = true;
    }

    data.settings.vacationYearLastSeen = curYear;
    return { data, changed };
  }

  function load() {
    const data = loadRaw();
    const res = applyYearRolloverIfNeeded(data);
    if (res.changed) save(res.data);
    return res.data;
  }

  function getData() { return load(); }

  // ----- Stamps -----

  function addStamp(stamp) {
    const data = load();
    data.stamps.push(stamp);
    data.meta.lastAction = stamp && stamp.type ? stamp.type : data.meta.lastAction;
    save(data);
  }

  function getLastStamp() {
    const data = load();
    return data.stamps.length ? data.stamps[data.stamps.length - 1] : null;
  }

  function updateStampByTimestamp(timestamp, patch) {
    const data = load();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const idx = stamps.findIndex(s => s && s.timestamp === timestamp);
    if (idx < 0) return false;

    stamps[idx] = { ...stamps[idx], ...(patch || {}) };
    data.stamps = stamps;
    save(data);
    return true;
  }

  function deleteStampByTimestamp(timestamp) {
    const data = load();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const before = stamps.length;
    data.stamps = stamps.filter(s => !(s && s.timestamp === timestamp));
    const changed = data.stamps.length !== before;
    if (changed) save(data);
    return changed;
  }

  // ----- Settings -----

  function updateSettings(settings) {
    const data = load();
    data.settings = { ...(data.settings || {}), ...(settings || {}) };

    // workdays/custom absichern
    if (!data.settings.workdays || typeof data.settings.workdays !== "object") {
      data.settings.workdays = { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false };
    } else {
      data.settings.workdays = { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false, ...data.settings.workdays };
    }
    if (!Array.isArray(data.settings.customHolidays)) data.settings.customHolidays = [];

    save(data);
  }

  function getSettings() {
    const data = load();
    return data.settings || {};
  }

  function updateMeta(patch) {
    const data = load();
    data.meta = { ...(data.meta || {}), ...(patch || {}) };
    save(data);
  }

  // ----- Absences -----

  function getAbsences() {
    const data = load();
    return Array.isArray(data.absences) ? data.absences : [];
  }

  function upsertAbsence(record) {
    const data = load();
    const abs = Array.isArray(data.absences) ? data.absences : [];

    if (!record || !record.date) return false;

    const idx = abs.findIndex(a => a && a.date === record.date);
    if (idx >= 0) abs[idx] = record;
    else abs.push(record);

    data.absences = abs;
    save(data);
    return true;
  }

  function removeAbsence(dateStr) {
    const data = load();
    const abs = Array.isArray(data.absences) ? data.absences : [];
    data.absences = abs.filter(a => a && a.date !== dateStr);
    save(data);
  }

  // ----- Manual Work -----

  function getManualWork() {
    const data = load();
    return Array.isArray(data.manualWork) ? data.manualWork : [];
  }

  function upsertManualWork(entry) {
    const data = load();
    const list = Array.isArray(data.manualWork) ? data.manualWork : [];
    const idx = list.findIndex(x => x && x.date === entry.date);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    data.manualWork = list;
    save(data);
  }

  function removeManualWork(dateStr) {
    const data = load();
    const list = Array.isArray(data.manualWork) ? data.manualWork : [];
    data.manualWork = list.filter(x => x && x.date !== dateStr);
    save(data);
  }

  // ----- Maintenance -----

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.StorageService = {
    // data
    getData,
    updateMeta,
    clearAll,

    // settings
    updateSettings,
    getSettings,

    // stamps
    addStamp,
    getLastStamp,
    updateStampByTimestamp,
    deleteStampByTimestamp,

    // absences
    getAbsences,
    upsertAbsence,
    removeAbsence,

    // manual work
    getManualWork,
    upsertManualWork,
    removeManualWork
  };
})();
