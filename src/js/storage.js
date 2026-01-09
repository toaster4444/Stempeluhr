
/**
 * storage.js
 * Zentrale lokale Datenspeicherung für die Stempeluhr
 * Alle Daten bleiben ausschließlich im Browser
 */

(function () {
  const STORAGE_KEY = "stempeluhr_data_v1";

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        stamps: [],        // alle Kommen-/Gehen-Ereignisse (Rohdaten)
        settings: {},      // Einstellungen (Wochenstunden etc.)
        meta: {
          lastAction: null // "IN" | "OUT"
        }
      };
    }

    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Speicher konnte nicht gelesen werden", e);
      return {
        stamps: [],
        settings: {},
        meta: { lastAction: null }
      };
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

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Öffentliche API
  window.StorageService = {
    getData,
    addStamp,
    getLastStamp,
    updateSettings,
    getSettings,
    clearAll
  };
})();
