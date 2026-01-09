/**
 * cutoff.js
 * 03:00-Grenze (lokal):
 * Wenn letzter Stempel IN ist und vor "heute 03:00" liegt -> als "Ausstempeln vergessen" markieren.
 */

(function () {
  function todayCutoffTs(now, hour) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    return d.getTime();
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function ymdFromParts(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function getLastInWithoutOut(stamps) {
    // Wir suchen von hinten: letzter IN, und schauen ob danach ein OUT existiert.
    for (let i = stamps.length - 1; i >= 0; i--) {
      const s = stamps[i];
      if (!s) continue;
      if (s.type === "OUT") return null; // letzter ist OUT -> kein offener IN
      if (s.type === "IN") return s;
    }
    return null;
  }

  /**
   * Prüft und markiert ggf. offenen IN über Nacht.
   * Rückgabe:
   * { flagged:boolean, dateStr:string|null, reason:string|null }
   */
  function runCutoffCheck(options) {
    const cutoffHour = (options && typeof options.cutoffHour === "number") ? options.cutoffHour : 3;

    const data = StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const lastOpenIn = getLastInWithoutOut(stamps);

    const now = new Date();
    const cutoffTs = todayCutoffTs(now, cutoffHour);

    StorageService.updateMeta({ cutoffLastCheckedAt: Date.now() });

    if (!lastOpenIn) {
      return { flagged: false, dateStr: null, reason: null };
    }

    // Wenn der offene IN vor der heutigen Cutoff-Zeit liegt -> "Ausstempeln vergessen"
    if (typeof lastOpenIn.timestamp === "number" && lastOpenIn.timestamp < cutoffTs) {
      // Markieren (ohne Rohdaten zu verändern)
      StorageService.updateStampByTimestamp(lastOpenIn.timestamp, {
        manualRequired: true,
        cutoffFlag: true
      });

      const dateStr = ymdFromParts(lastOpenIn.year, lastOpenIn.month, lastOpenIn.day);

      return {
        flagged: true,
        dateStr,
        reason: `Letzter IN ist vor ${pad2(cutoffHour)}:00 und ohne OUT`
      };
    }

    return { flagged: false, dateStr: null, reason: null };
  }

  window.CutoffService = {
    runCutoffCheck
  };
})();
