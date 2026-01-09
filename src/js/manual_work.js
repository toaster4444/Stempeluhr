/**
 * manual_work.js
 * Manuelles Nachtragen von Arbeitszeit (Start/Ende/Pause) pro Tag.
 */

(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }

  function parseYmd(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return new Date(y, mo - 1, da, 0, 0, 0, 0);
  }

  function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  function monthEndExclusive(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  function parseTimeHM(s) {
    const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function minutesToHM(mins) {
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function computeMinutesWorked(startMin, endMin, breakMinutes) {
    const b = Math.max(0, Number(breakMinutes || 0));
    const raw = endMin - startMin;
    const worked = raw - b;
    return Math.max(0, worked);
  }

  function upsert(dateStr, startHM, endHM, breakMinutes) {
    const d = parseYmd(dateStr);
    if (!d) return { ok: false, error: "Ungültiges Datum" };

    const sMin = parseTimeHM(startHM);
    const eMin = parseTimeHM(endHM);
    if (sMin === null || eMin === null) return { ok: false, error: "Ungültige Zeit (HH:MM)" };
    if (eMin <= sMin) return { ok: false, error: "Ende muss nach Start liegen" };

    const b = Number(breakMinutes);
    if (Number.isNaN(b) || b < 0) return { ok: false, error: "Pause ungültig" };

    const minutesWorked = computeMinutesWorked(sMin, eMin, b);

    const entry = {
      date: dateStr,
      start: minutesToHM(sMin),
      end: minutesToHM(eMin),
      breakMinutes: Math.floor(b),
      minutesWorked,
      updatedAt: Date.now()
    };

    StorageService.upsertManualWork(entry);
    return { ok: true, entry };
  }

  function remove(dateStr) {
    StorageService.removeManualWork(dateStr);
    return { ok: true };
  }

  function getByDate(dateStr) {
    const list = StorageService.getManualWork();
    return list.find(x => x && x.date === dateStr) || null;
  }

  function listForMonth(dateObj) {
    const base = dateObj || new Date();
    const start = monthStart(base);
    const endEx = monthEndExclusive(base);

    const list = StorageService.getManualWork();
    return list
      .filter(x => x && x.date && parseYmd(x.date))
      .filter(x => {
        const d = parseYmd(x.date);
        return d >= start && d < endEx;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  window.ManualWorkService = {
    upsert,
    remove,
    getByDate,
    listForMonth
  };
})();
