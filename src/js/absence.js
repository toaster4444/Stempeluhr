/**
 * absence.js
 * Automatische Urlaub/Krankheit-Logik (lokal)
 * + planned-Vacation Unterstützung
 * + "Rückerstattung": Wenn an einem geplanten Urlaubstag gestempelt wird, wird die geplante Abwesenheit entfernt
 */

(function () {
  const TYPES = {
    VACATION: "VACATION",
    SICK: "SICK",
    WORK_MANUAL: "WORK_MANUAL"
  };

  function pad2(n) { return String(n).padStart(2, "0"); }
  function ymd(d) {
    return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseYmd(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return new Date(y, mo - 1, da, 0, 0, 0, 0);
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  function endOfMonthExclusive(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
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

  function getSettingsSafe() {
    return (window.StorageService && StorageService.getSettings)
      ? (StorageService.getSettings() || {})
      : {};
  }

  function getWorkdaysSafe(settings) {
    const def = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    const wd = settings.workdays ? settings.workdays : def;
    return { ...def, ...wd };
  }

  function getDailyHoursSafe(settings) {
    const dh = (settings && settings.dailyHours && typeof settings.dailyHours === "object") ? settings.dailyHours : {};
    return { ...dh };
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
    if (!window.HolidaysService || !HolidaysService.getHolidayInfo) return 0;
    const info = HolidaysService.getHolidayInfo(settings, dateObj);
    return info && info.offFactor ? info.offFactor : 0;
  }

  function isSollWorkday(settings, workdays, dateObj) {
    const key = weekdayKey(dateObj);
    const dailyHours = getDailyHoursSafe(settings);
    const hasDailyHours = Object.values(dailyHours).some(v => typeof v === "number");
    if (hasDailyHours) {
      const hours = dailyHours[key];
      if (typeof hours !== "number" || hours <= 0) return false;
    } else if (!workdays[key]) {
      return false;
    }

    const dateStr = ymd(dateObj);
    const off = Math.max(
      legalOffFactor(settings, dateObj),
      customOffFactor(settings, dateStr)
    );

    // off=1 -> komplett frei, off=0.5 -> halb frei => Solltag vorhanden (reduziert)
    return (1 - off) > 0;
  }

  function stampsOnDate(stamps, dateStr) {
    return stamps.some(s => s && s.year && s.month && s.day && `${s.year}-${pad2(s.month)}-${pad2(s.day)}` === dateStr);
  }

  function getAbsenceMap() {
    const abs = StorageService.getAbsences();
    const map = new Map();
    (Array.isArray(abs) ? abs : []).forEach(a => {
      if (a && a.date) map.set(a.date, a);
    });
    return map;
  }

  /**
   * Automatisch Urlaub bis einschließlich "gestern" für Solltage ohne Stempel.
   * - Überschreibt keine manuellen Einträge.
   * - planned Urlaub wird nicht überschrieben.
   * - "Rückerstattung": Wenn gestempelt wurde, entfernen wir auto oder planned Abwesenheit.
   */
  function ensureAutoVacationUpToYesterday() {
    const data = StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const settings = getSettingsSafe();
    const workdays = getWorkdaysSafe(settings);

    const absMap = getAbsenceMap();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime());
    yesterday.setDate(yesterday.getDate() - 1);

    // vom Monatsanfang bis gestern (aktueller Monat)
    const start = startOfMonth(today);
    const endEx = new Date(yesterday.getTime());
    endEx.setDate(endEx.getDate() + 1);

    const d = new Date(start.getTime());
    while (d < endEx) {
      d.setHours(0, 0, 0, 0);
      const dateStr = ymd(d);

      const soll = isSollWorkday(settings, workdays, d);

      if (soll) {
        const hasStamp = stampsOnDate(stamps, dateStr);
        const existing = absMap.get(dateStr);

        // ✅ Wenn gestempelt: auto/planned Abwesenheit entfernen (Refund)
        if (hasStamp) {
          if (existing && (existing.auto === true || existing.planned === true)) {
            StorageService.removeAbsence(dateStr);
            absMap.delete(dateStr);
          }
        } else {
          // ✅ keine Stempel: auto Urlaub setzen, sofern kein Eintrag existiert
          // - planned Urlaub bleibt bestehen (existing vorhanden)
          // - manuelle Abwesenheit bleibt bestehen (existing vorhanden)
          if (!existing) {
            const rec = {
              date: dateStr,
              type: TYPES.VACATION,
              auto: true,
              planned: false,
              updatedAt: Date.now()
            };
            StorageService.upsertAbsence(rec);
            absMap.set(dateStr, rec);
          }
        }
      }

      d.setDate(d.getDate() + 1);
    }
  }

  function setAbsence(dateStr, type) {
    const d = parseYmd(dateStr);
    if (!d) return false;

    const rec = {
      date: dateStr,
      type,
      auto: false,
      planned: false,
      updatedAt: Date.now()
    };
    StorageService.upsertAbsence(rec);
    return true;
  }

  // Optional: geplant setzen (für geplanten Urlaub)
  function setPlannedVacation(dateStr) {
    const d = parseYmd(dateStr);
    if (!d) return false;

    const rec = {
      date: dateStr,
      type: TYPES.VACATION,
      auto: false,
      planned: true,
      updatedAt: Date.now()
    };
    StorageService.upsertAbsence(rec);
    return true;
  }

  function clearAbsence(dateStr) {
    StorageService.removeAbsence(dateStr);
  }

  function listAbsencesForMonth(dateObj) {
    const base = dateObj || new Date();
    const start = startOfMonth(base);
    const endEx = endOfMonthExclusive(base);

    const abs = StorageService.getAbsences();
    return (Array.isArray(abs) ? abs : [])
      .filter(a => a && a.date)
      .filter(a => {
        const d = parseYmd(a.date);
        return d && d >= start && d < endEx;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  window.AbsenceService = {
    TYPES,
    ensureAutoVacationUpToYesterday,
    setAbsence,
    setPlannedVacation,
    clearAbsence,
    listAbsencesForMonth
  };
})();
