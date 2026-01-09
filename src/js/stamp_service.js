/**
 * stamp_service.js
 * Entscheidet, ob der nächste Tap IN oder OUT ist – inklusive 03:00-Cutoff-Regel.
 */

(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }

  function makeStamp(type, dateObj, manualRequired) {
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const hh = dateObj.getHours();
    const mm = dateObj.getMinutes();
    const ss = dateObj.getSeconds();

    const iso = new Date(dateObj.getTime()).toISOString();

    return {
      type, // "IN" | "OUT"
      timestamp: dateObj.getTime(),
      iso,

      year: y,
      month: m,
      day: d,
      hour: hh,
      minute: mm,
      second: ss,

      manualRequired: !!manualRequired
    };
  }

  function todayCutoffTs(now, hour) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0).getTime();
  }

  function decideNextType(options) {
    const cutoffHour = (options && typeof options.cutoffHour === "number") ? options.cutoffHour : 3;

    const data = StorageService.getData();
    const last = (data.stamps && data.stamps.length) ? data.stamps[data.stamps.length - 1] : null;

    if (!last) return "IN";

    // Wenn letzter Stempel OUT war -> IN
    if (last.type === "OUT") return "IN";

    // Wenn letzter Stempel IN war:
    // Cutoff-Regel: wenn IN vor heute 03:00 -> als "vergessen" betrachten, nächster Tap muss IN sein
    if (last.type === "IN" && typeof last.timestamp === "number") {
      const now = new Date();
      const cutoffTs = todayCutoffTs(now, cutoffHour);
      if (last.timestamp < cutoffTs) {
        return "IN";
      }
      return "OUT";
    }

    return "IN";
  }

  function addStampNow(type, options) {
    const now = new Date();
    const stamp = makeStamp(type, now, false);
    StorageService.addStamp(stamp);
    return stamp;
  }

  window.StampService = {
    decideNextType,
    addStampNow
  };
})();
