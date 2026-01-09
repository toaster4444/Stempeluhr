/**
 * analytics.js
 * Wochen- & Monatsauswertung aus Rohdaten (stamps).
 * - rein lokal
 * - berechnet IST-Zeit aus IN/OUT-Paaren
 * - Zielzeiten aus Einstellungen (weeklyHours + workdays)
 * - Feiertage/Urlaub/Krankheit werden später ergänzt
 */

(function () {
  function getSettingsSafe() {
    const s = (window.StorageService && StorageService.getSettings())
      ? StorageService.getSettings()
      : {};
    return s || {};
  }

  function getWorkdaysSafe(settings) {
    const def = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    const wd = settings && settings.workdays ? settings.workdays : def;
    return { ...def, ...wd };
  }

  function countSelectedWorkdaysPerWeek(workdays) {
    const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    return keys.reduce((sum, k) => sum + (workdays[k] ? 1 : 0), 0);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function startOfWeekMonday(date) {
    const d = startOfDay(date);
    // JS: So=0, Mo=1 ... Sa=6
    const day = d.getDay();
    const diffToMonday = (day === 0) ? -6 : (1 - day);
    d.setDate(d.getDate() + diffToMonday);
    return d;
  }

  function endOfWeekMondayExclusive(date) {
    const s = startOfWeekMonday(date);
    const e = new Date(s.getTime());
    e.setDate(e.getDate() + 7);
    return e;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  function endOfMonthExclusive(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  function sortStamps(stamps) {
    return stamps
      .filter(s => s && typeof s.timestamp === "number")
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function buildSessions(stampsSorted) {
    const sessions = [];
    let openIn = null;

    for (const st of stampsSorted) {
      if (st.type === "IN") {
        openIn = st; // überschreibt ggf. vorheriges offenes IN
        continue;
      }

      if (st.type === "OUT") {
        if (openIn && typeof openIn.timestamp === "number" && st.timestamp >= openIn.timestamp) {
          sessions.push({
            startTs: openIn.timestamp,
            endTs: st.timestamp,
            manualRequired: !!(openIn.manualRequired || st.manualRequired),
            inStamp: openIn,
            outStamp: st
          });
          openIn = null;
        } else {
          // OUT ohne passendes IN -> ignorieren, aber als "unmatched" melden
          sessions.push({
            startTs: null,
            endTs: st.timestamp,
            manualRequired: true,
            unmatched: "OUT_WITHOUT_IN",
            outStamp: st
          });
        }
      }
    }

    if (openIn) {
      sessions.push({
        startTs: openIn.timestamp,
        endTs: null,
        manualRequired: true,
        unmatched: "IN_WITHOUT_OUT",
        inStamp: openIn
      });
    }

    return sessions;
  }

  function overlapMs(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    return Math.max(0, end - start);
  }

  function msToHours(ms) {
    return ms / 3600000;
  }

  function formatHours(hours) {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return "–";
    return hours.toFixed(2);
  }

  function formatSignedDiff(hours) {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return "–";
    const sign = hours > 0 ? "+" : "";
    return sign + hours.toFixed(2);
  }

  function countWorkdaysInRange(start, endExclusive, workdays) {
    // zählt Tage im Bereich [start, endExclusive), die in workdays=true sind
    let count = 0;
    const d = new Date(start.getTime());

    while (d < endExclusive) {
      const dow = d.getDay(); // 0..6
      const key =
        dow === 1 ? "mon" :
        dow === 2 ? "tue" :
        dow === 3 ? "wed" :
        dow === 4 ? "thu" :
        dow === 5 ? "fri" :
        dow === 6 ? "sat" : "sun";

      if (workdays[key]) count += 1;

      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    }

    return count;
  }

  function computePeriod(stamps, periodStart, periodEndExclusive) {
    const sorted = sortStamps(stamps);
    const sessions = buildSessions(sorted);

    let workedMs = 0;
    let manualCount = 0;
    let openCount = 0;
    let unmatchedOutCount = 0;

    for (const sess of sessions) {
      if (sess.manualRequired) manualCount += 1;
      if (sess.unmatched === "IN_WITHOUT_OUT") openCount += 1;
      if (sess.unmatched === "OUT_WITHOUT_IN") unmatchedOutCount += 1;

      if (typeof sess.startTs === "number" && typeof sess.endTs === "number") {
        workedMs += overlapMs(sess.startTs, sess.endTs, periodStart.getTime(), periodEndExclusive.getTime());
      }
    }

    return {
      workedHours: msToHours(workedMs),
      manualCount,
      openCount,
      unmatchedOutCount
    };
  }

  function getWeeklyHoursFromSettings(settings) {
    if (settings && typeof settings.weeklyHours === "number") return settings.weeklyHours;
    if (settings && typeof settings.weeklyPercent === "number") return (settings.weeklyPercent / 100) * 40;
    return null;
  }

  function computeTargetsForWeekAndMonth(nowDate) {
    const settings = getSettingsSafe();
    const workdays = getWorkdaysSafe(settings);

    const weeklyHours = getWeeklyHoursFromSettings(settings);
    const selectedDaysPerWeek = countSelectedWorkdaysPerWeek(workdays);

    const weekTarget = weeklyHours; // Wochenziel = Wochenstunden

    // Monatsziel: Tagesziel * Anzahl Arbeitstage im Monat
    let monthTarget = null;
    if (weeklyHours !== null && selectedDaysPerWeek > 0) {
      const dailyTarget = weeklyHours / selectedDaysPerWeek;

      const mStart = startOfMonth(nowDate);
      const mEnd = endOfMonthExclusive(nowDate);
      const workdaysInMonth = countWorkdaysInRange(mStart, mEnd, workdays);

      monthTarget = dailyTarget * workdaysInMonth;
    }

    return { weekTarget, monthTarget, weeklyHours, selectedDaysPerWeek };
  }

  function getSummary() {
    const data = window.StorageService ? StorageService.getData() : { stamps: [] };
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];

    const now = new Date();

    const wStart = startOfWeekMonday(now);
    const wEnd = endOfWeekMondayExclusive(now);

    const mStart = startOfMonth(now);
    const mEnd = endOfMonthExclusive(now);

    const week = computePeriod(stamps, wStart, wEnd);
    const month = computePeriod(stamps, mStart, mEnd);

    const targets = computeTargetsForWeekAndMonth(now);

    const weekDiff = (targets.weekTarget !== null) ? (week.workedHours - targets.weekTarget) : null;
    const monthDiff = (targets.monthTarget !== null) ? (month.workedHours - targets.monthTarget) : null;

    return {
      week: {
        start: wStart,
        endExclusive: wEnd,
        workedHours: week.workedHours,
        targetHours: targets.weekTarget,
        diffHours: weekDiff,
        manualCount: week.manualCount,
        openCount: week.openCount,
        unmatchedOutCount: week.unmatchedOutCount
      },
      month: {
        start: mStart,
        endExclusive: mEnd,
        workedHours: month.workedHours,
        targetHours: targets.monthTarget,
        diffHours: monthDiff,
        manualCount: month.manualCount,
        openCount: month.openCount,
        unmatchedOutCount: month.unmatchedOutCount
      },
      meta: {
        weeklyHoursSetting: targets.weeklyHours,
        selectedWorkdaysPerWeek: targets.selectedDaysPerWeek
      }
    };
  }

  function formatDateYYYYMMDD(d) {
    const y = String(d.getFullYear()).padStart(4, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  window.Analytics = {
    getSummary,
    formatHours,
    formatSignedDiff,
    formatDateYYYYMMDD
  };
})();
