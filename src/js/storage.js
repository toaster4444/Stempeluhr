/**
 * storage.js
 * Zentrale lokale Datenspeicherung für die Stempeluhr
 * Alle Daten bleiben ausschließlich im Browser
 */

(function () {
  const STORAGE_KEY = "stempeluhr_data_v1";

  function defaultData() {
    return {
      stamps: [],        // Rohdaten: IN/OUT
      settings: {},      // Einstellungen
      absences: [],      // NEU: Urlaub/Krankheit/Manuell (pro Datum)
      meta: {
        lastAction: null // "IN" | "OUT"
      }
    };
  }

  function migrate(data) {
    const base = defaultData();
    if (!data || typeof data !== "object") return base;

    // merge mit Defaults
    const merged = {
      ...base,
      ...data,
      meta: { ...base.meta, ...(data.meta || {}) }
    };

    // ensure arrays
    if (!Array.isArray(merged.stamps)) merged.stamps = [];
    if (!Array.isArray(merged.absences)) merged.absences = [];
    if (!merged.settings || typeof merged.settings !== "object") merged.settings = {};

    return merged;
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();

    try {
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.error("Speicher konnte nicht gelesen werden", e);
      return defaultData();
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getData() {
    return load();
  }

  function addStamp(stamp) {
    const data = load();
    data.stamps.push(stamp);
    data.meta.lastAction = stamp.type;
    save(data);
  }

  function getLastStamp() {
    const data = load();
    if (data.stamps.length === 0) return null;
    return data.stamps[data.stamps.length - 1];
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

  // ----- Absences (NEU) -----

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
    removeAbsence
  };
})();
