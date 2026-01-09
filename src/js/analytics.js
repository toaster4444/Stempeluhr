/**
 * analytics.js
 * Wochen- & Monatsauswertung (IST/SOLL) – IST enthält jetzt auch manuelle Nachträge.
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
      if (st.type === "IN") { openIn = st; continue; }

      if (st.type === "OUT") {
        if (openIn && typeof openIn.timestamp === "number" && st.timestamp >= openIn.timestamp) {
          sessions.push({
            startTs: openIn.timestamp,
            endTs: st.timestamp,
            manualRequired: !!(openIn.manualRequired || st.manualRequired)
          });
          openIn = null;
        } else {
          sessions.push({
            startTs: null,
            endTs: st.timestamp,
            manualRequired: true,
            unmatched: "OUT_WITHOUT_IN"
          });
        }
      }
    }

    if (openIn) {
      sessions.push({
        startTs: openIn.timestamp,
        endTs: null,
        manualRequired: true,
        unmatched: "IN_WITHOUT_OUT"
      });
    }

    return sessions;
  }

  function overlapMs(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    return Math.max(0, end - start);
  }

  function msToHours(ms) { return ms / 3600000; }
  function minutesToHours(min) { return min / 60; }

  function formatHours(hours) {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return "–";
    return hours.toFixed(2);
  }

  function formatSignedDiff(hours) {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return "–";
    const sign = hours > 0 ? "+" : "";
    return sign + hours.toFixed(2);
  }

  function weekdayKey(d) {
    const dow = d.getDay();
    return dow === 1 ? "mon"
      : dow === 2 ? "tue"
      : dow === 3 ? "wed"
      : dow === 4 ? "thu"
      : dow === 5 ? "fri"
      : dow === 6 ? "sat"
      : "sun";
  }

  function ymd(d) {
    const y = String(d.getFullYear()).padStart(4, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getWeeklyHoursFromSettings(settings) {
    if (settings && typeof settings.weeklyHours === "number") return settings.weeklyHours;
    if (settings && typeof settings.weeklyPercent === "number") return (settings.weeklyPercent / 100) * 40;
    return null;
  }

  function customHolidayFactorForDate(settings, dateStr) {
    const list = Array.isArray(settings.customHolidays) ? settings.customHolidays : [];
    const found = list.find(x => x && x.date === dateStr);
    if (!found) return 0;
    const f = Number(found.factor);
    if (Number.isNaN(f) || f < 0) return 0;
    return Math.min(1, f);
  }

  function legalHolidayOffFactor(settings, dateObj) {
    if (!window.HolidaysService || !HolidaysService.getHolidayInfo) return 0;
    const info = HolidaysService.getHolidayInfo(settings, dateObj);
    return info && info.offFactor ? info.offFactor : 0;
  }

  function computeTargetHoursForRange(settings, workdays, dailyTarget, start, endExclusive) {
    if (dailyTarget === null || dailyTarget === undefined) return null;

    let target = 0;
    const d = new Date(start.getTime());

    while (d < endExclusive) {
      d.setHours(0, 0, 0, 0);

      const key = weekdayKey(d);
      if (workdays[key]) {
        const dateStr = ymd(d);
        const legalOff = legalHolidayOffFactor(settings, d);
        const customOff = customHolidayFactorForDate(settings, dateStr);

        const offFactor = Math.max(legalOff, customOff);
        const requiredFraction = 1 - offFactor;

        target += dailyTarget * requiredFraction;
      }

      d.setDate(d.getDate() + 1);
    }

    return target;
  }

  function computeStampWorked(stamps, periodStart, periodEndExclusive) {
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

    return { hours: msToHours(workedMs), manualCount, openCount, unmatchedOutCount };
  }

  function computeManualWorked(periodStart, periodEndExclusive) {
    const list = StorageService.getManualWork();
    let minutes = 0;

    for (const e of list) {
      if (!e || !e.date) continue;
      const d = new Date(e.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) continue;

      if (d >= periodStart && d < periodEndExclusive) {
        minutes += Number(e.minutesWorked || 0);
      }
    }

    return minutesToHours(minutes);
  }

  function getSummary() {
    const data = window.StorageService ? StorageService.getData() : { stamps: [] };
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];

    const settings = getSettingsSafe();
    const workdays = getWorkdaysSafe(settings);

    const weeklyHours = getWeeklyHoursFromSettings(settings);
    const selectedDaysPerWeek = countSelectedWorkdaysPerWeek(workdays);

    const now = new Date();

    const wStart = startOfWeekMonday(now);
    const wEnd = endOfWeekMondayExclusive(now);

    const mStart = startOfMonth(now);
    const mEnd = endOfMonthExclusive(now);

    const weekStamp = computeStampWorked(stamps, wStart, wEnd);
    const monthStamp = computeStampWorked(stamps, mStart, mEnd);

    const weekManual = computeManualWorked(wStart, wEnd);
    const monthManual = computeManualWorked(mStart, mEnd);

    let dailyTarget = null;
    if (weeklyHours !== null && selectedDaysPerWeek > 0) {
      dailyTarget = weeklyHours / selectedDaysPerWeek;
    }

    const weekTarget = computeTargetHoursForRange(settings, workdays, dailyTarget, wStart, wEnd);
    const monthTarget = computeTargetHoursForRange(settings, workdays, dailyTarget, mStart, mEnd);

    const weekWorked = weekStamp.hours + weekManual;
    const monthWorked = monthStamp.hours + monthManual;

    const weekDiff = (weekTarget !== null) ? (weekWorked - weekTarget) : null;
    const monthDiff = (monthTarget !== null) ? (monthWorked - monthTarget) : null;

    return {
      week: {
        start: wStart,
        endExclusive: wEnd,
        workedHours: weekWorked,
        targetHours: weekTarget,
        diffHours: weekDiff,
        manualCount: weekStamp.manualCount,
        openCount: weekStamp.openCount,
        unmatchedOutCount: weekStamp.unmatchedOutCount,
        manualHoursAdded: weekManual
      },
      month: {
        start: mStart,
        endExclusive: mEnd,
        workedHours: monthWorked,
        targetHours: monthTarget,
        diffHours: monthDiff,
        manualCount: monthStamp.manualCount,
        openCount: monthStamp.openCount,
        unmatchedOutCount: monthStamp.unmatchedOutCount,
        manualHoursAdded: monthManual
      },
      meta: {
        weeklyHoursSetting: weeklyHours,
        selectedWorkdaysPerWeek: selectedDaysPerWeek
      }
    };
  }

  window.Analytics = {
    getSummary,
    formatHours,
    formatSignedDiff,
    formatDateYYYYMMDD: (d) => ymd(d)
  };
})();
