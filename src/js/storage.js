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
      meta: { ...base.meta, ...(data.meta || {}) }
    };

    if (!Array.isArray(merged.stamps)) merged.stamps = [];
    if (!Array.isArray(merged.absences)) merged.absences = [];
    if (!Array.isArray(merged.manualWork)) merged.manualWork = [];
    if (!merged.settings || typeof merged.settings !== "object") merged.settings = {};

    return merged;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error("Storage load failed", e);
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

  // Wir verwenden timestamp als "ID" (praktisch eindeutig).
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

  // NEU: Entfernt einen Stempel per timestamp (timestamp ist die "ID")
  function deleteStampByTimestamp(timestamp) {
    const data = load();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const idx = stamps.findIndex(s => s && s.timestamp === timestamp);
    if (idx < 0) return false;

    stamps.splice(idx, 1);
    data.stamps = stamps;
    save(data);
    return true;
  }

  // ----- Settings -----

  function updateSettings(settings) {
    const data = load();
    data.settings = { ...data.settings, ...settings };
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

  function upsertAbsence(entry) {
    const data = load();
    const list = Array.isArray(data.absences) ? data.absences : [];
    const idx = list.findIndex(x => x && x.date === entry.date);
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.push(entry);
    data.absences = list;
    save(data);
  }

  function removeAbsence(dateStr) {
    const data = load();
    const list = Array.isArray(data.absences) ? data.absences : [];
    data.absences = list.filter(x => x && x.date !== dateStr);
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
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
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
    updateMeta,
    clearAll,

    // absences
    getAbsences,
    upsertAbsence,
    removeAbsence,

    // manual work
    getManualWork,
    upsertManualWork,
    removeManualWork,

    // stamps update
    updateStampByTimestamp,
    deleteStampByTimestamp
  };
})();
