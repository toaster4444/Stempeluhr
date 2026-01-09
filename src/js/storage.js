/**
 * storage.js
 * Zentrale lokale Datenspeicherung für die Stempeluhr (nur Browser).
 */

(function () {
  const STORAGE_KEY = "stempeluhr_data_v1";

  function defaultData() {
    return {
      stamps: [],
      settings: {},
      absences: [],
      manualWork: [], // NEU: manuell nachgetragene Arbeitszeiten pro Datum
      meta: { lastAction: null }
    };
  }

  function migrate(data) {
    const base = defaultData();
    if (!data || typeof data !== "object") return base;

    const merged = {
      ...base,
      ...data,
      meta: { ...base.meta, ...(data.meta || {}) }
    };

    if (!Array.isArray(merged.stamps)) merged.stamps = [];
    if (!Array.isArray(merged.absences)) merged.absences = [];
    if (!Array.isArray(merged.manualWork)) merged.manualWork = [];
    if (!merged.settings || typeof merged.settings !== "object") merged.settings = {};

    return merged;
  }

  function load() {
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

  function getData() { return load(); }

  function addStamp(stamp) {
    const data = load();
    data.stamps.push(stamp);
    data.meta.lastAction = stamp.type;
    save(data);
  }

  function getLastStamp() {
    const data = load();
    return data.stamps.length ? data.stamps[data.stamps.length - 1] : null;
  }

  function updateSettings(settings) {
    const data = load();
    data.settings = { ...data.settings, ...settings };
    save(data);
  }

  function getSettings() {
    const data = load();
    return data.settings || {};
  }

  // ----- Absences -----

  function getAbsences() {
    const data = load();
    return Array.isArray(data.absences) ? data.absences : [];
  }

  function upsertAbsence(record) {
    const data = load();
    const abs = Array.isArray(data.absences) ? data.absences : [];
    const idx = abs.findIndex(a => a && a.date === record.date);
    if (idx >= 0) abs[idx] = record;
    else abs.push(record);
    data.absences = abs;
    save(data);
  }

  function removeAbsence(dateStr) {
    const data = load();
    const abs = Array.isArray(data.absences) ? data.absences : [];
    data.absences = abs.filter(a => a && a.date !== dateStr);
    save(data);
  }

  // ----- Manual Work (NEU) -----
  // Schema:
  // { date:"YYYY-MM-DD", start:"HH:MM", end:"HH:MM", breakMinutes:30, minutesWorked:xxx, updatedAt:ms }

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

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.StorageService = {
    getData,
    addStamp,
    getLastStamp,
    updateSettings,
    getSettings,
    clearAll,

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
