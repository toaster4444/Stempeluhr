/**
 * storage.js
 * Zentrale lokale Datenspeicherung für die Stempeluhr (nur Browser).
 *
 * NEU:
 * - Jahreswechsel-Check für Carryover (vacationYearLastSeen)
 * - deleteStampByTimestamp()
 */

(function () {
  const STORAGE_KEY = "stempeluhr_data_v1";

  function nowTs() { return Date.now(); }

  function defaultData() {
    return {
      stamps: [],
      settings: {
        // wir nutzen dieses Feld, um Jahreswechsel zu erkennen
        vacationYearLastSeen: null
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

  /**
   * Jahreswechsel-Handling (Basis):
   * - Erkennt neues Jahr beim Laden
   * - Aktualisiert settings.vacationYearLastSeen
   *
   * Hinweis:
   * Die „übrigen Urlaubstage“ können wir erst korrekt übertragen,
   * wenn wir eine echte Verbrauchslogik haben. (Machen wir danach.)
   */
  function applyYearRolloverIfNeeded(data) {
    const curYear = new Date().getFullYear();

    if (!data.settings || typeof data.settings !== "object") data.settings = {};
    const lastSeen = Number(data.settings.vacationYearLastSeen);

    // Wenn noch nie gesetzt -> setzen
    if (!lastSeen || Number.isNaN(lastSeen)) {
      data.settings.vacationYearLastSeen = curYear;
      return { data, changed: true };
    }

    // Kein Jahreswechsel
    if (lastSeen === curYear) return { data, changed: false };

    // Jahreswechsel erkannt (lastSeen < curYear)
    // Wir markieren nur den Wechsel zuverlässig.
    // carryoverRemaining bleibt wie er ist (falls gesetzt).
    data.settings.vacationYearLastSeen = curYear;

    // Optional: Wenn carryoverYear leer ist aber carryoverRemaining existiert,
    // setzen wir carryoverYear automatisch auf Vorjahr.
    // (Das ist eine logische Ergänzung, aber ohne Verbrauchslogik neutral.)
    if ((data.settings.carryoverYear == null || data.settings.carryoverYear === "") &&
        typeof data.settings.carryoverRemaining === "number") {
      data.settings.carryoverYear = curYear - 1;
    }

    return { data, changed: true };
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

  // Wir verwenden timestamp als "ID"
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

    // Wir lassen zusätzliche Felder (z.B. planned) bewusst zu.
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
