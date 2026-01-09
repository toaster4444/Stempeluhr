/**
 * ui.js
 * Kleine UI-Hilfsfunktionen (ohne Framework)
 * Alles bleibt lokal im Browser.
 */

(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const el = byId(id);
    if (el) el.textContent = text;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateParts(y, m, d) {
    return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  }

  function formatTimeParts(h, m, s) {
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function formatStamp(stamp) {
    if (!stamp) return "–";
    const date = (stamp.year && stamp.month && stamp.day)
      ? formatDateParts(stamp.year, stamp.month, stamp.day)
      : "–";
    const time = (typeof stamp.hour === "number")
      ? formatTimeParts(stamp.hour, stamp.minute, stamp.second)
      : "–";
    const type = stamp.type || "–";
    return `${type} • ${date} ${time}`;
  }

  function init() {
    // Platzhalter für spätere globale UI-Initialisierung
    // (z.B. Theme, Debug, globale Shortcuts)
  }

  window.UI = {
    init,
    byId,
    setText,
    formatStamp,
    formatDateParts,
    formatTimeParts
  };
})();

