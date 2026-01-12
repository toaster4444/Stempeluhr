/**
 * analytics.js
 * Wochen- & Monatsauswertung (IST/SOLL)
 *
 * WICHTIG:
 * - Manuelle Nachträge überschreiben Stempelzeiten pro Datum (nur für Auswertung).
 * - Stempel-Rohdaten bleiben erhalten.
 * - Ignorierte Stempelzeit wird separat ausgewiesen.
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

  function getDailyHoursFromSettings(settings, selectedDaysPerWeek) {
    const weekly = getWeeklyHoursFromSettings(settings);
    if (weekly !== null && selectedDaysPerWeek > 0) return weekly / selectedDaysPerWeek;
    const daily = Number(settings && settings.standardDailyHours);
    if (!Number.isNaN(daily) && daily > 0) return daily;
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

  // ---------- Stempel: pro Datum aufteilen ----------
  function splitSessionByDay(startTs, endTs) {
    // returns Map(dateStr -> ms)
    const map = new Map();
    let cur = new Date(startTs);
    let end = new Date(endTs);

    while (cur.getTime() < end.getTime()) {
      const dayStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0, 0).getTime();
      const dayEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0).getTime();

      const segStart = Math.max(startTs, dayStart);
      const segEnd = Math.min(endTs, dayEnd);

      if (segEnd > segStart) {
        const dateStr = ymd(new Date(dayStart));
        map.set(dateStr, (map.get(dateStr) || 0) + (segEnd - segStart));
      }

      cur = new Date(dayEnd);
    }

    return map;
  }

  function computeStampWorkedByDate(stamps, periodStart, periodEndExclusive) {
    const sorted = sortStamps(stamps);
    const sessions = buildSessions(sorted);

    const dateMs = new Map(); // dateStr -> ms in period
    let manualCount = 0;
    let openCount = 0;
    let unmatchedOutCount = 0;

    for (const sess of sessions) {
      if (sess.manualRequired) manualCount += 1;
      if (sess.unmatched === "IN_WITHOUT_OUT") openCount += 1;
      if (sess.unmatched === "OUT_WITHOUT_IN") unmatchedOutCount += 1;

      if (typeof sess.startTs === "number" && typeof sess.endTs === "number") {
        // clamp to period
        const s = Math.max(sess.startTs, periodStart.getTime());
        const e = Math.min(sess.endTs, periodEndExclusive.getTime());
        if (e > s) {
          const parts = splitSessionByDay(s, e);
          parts.forEach((ms, dateStr) => {
            dateMs.set(dateStr, (dateMs.get(dateStr) || 0) + ms);
          });
        }
      }
    }

    return { dateMs, manualCount, openCount, unmatchedOutCount };
  }

  function computeManualWorkedByDate(periodStart, periodEndExclusive) {
    const list = StorageService.getManualWork();
    const map = new Map(); // dateStr -> minutesWorked

    for (const e of list) {
      if (!e || !e.date) continue;
      const d = new Date(e.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) continue;

      if (d >= periodStart && d < periodEndExclusive) {
        map.set(e.date, Number(e.minutesWorked || 0));
      }
    }

    return map;
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

    // --- worked stamps per date + flags ---
    const weekStamp = computeStampWorkedByDate(stamps, wStart, wEnd);
    const monthStamp = computeStampWorkedByDate(stamps, mStart, mEnd);

    // --- manual per date ---
    const weekManualByDate = computeManualWorkedByDate(wStart, wEnd);
    const monthManualByDate = computeManualWorkedByDate(mStart, mEnd);

    // --- apply override rule ---
    function sumWithOverride(stampDateMsMap, manualByDateMap) {
      let stampHoursCounted = 0;
      let stampHoursIgnored = 0;
      let manualHoursCounted = 0;

      // sum stamps
      stampDateMsMap.forEach((ms, dateStr) => {
        const hasManual = manualByDateMap.has(dateStr);
        const h = msToHours(ms);
        if (hasManual) stampHoursIgnored += h;
        else stampHoursCounted += h;
      });

      // sum manual
      manualByDateMap.forEach((minutes, dateStr) => {
        manualHoursCounted += minutesToHours(minutes);
      });

      return {
        workedHours: stampHoursCounted + manualHoursCounted,
        manualHoursAdded: manualHoursCounted,
        stampHoursIgnored: stampHoursIgnored,
        stampHoursCounted: stampHoursCounted
      };
    }

    const weekWorked = sumWithOverride(weekStamp.dateMs, weekManualByDate);
    const monthWorked = sumWithOverride(monthStamp.dateMs, monthManualByDate);

    // targets
    const dailyTarget = getDailyHoursFromSettings(settings, selectedDaysPerWeek);
    const weeklyHoursEffective = (weeklyHours !== null && selectedDaysPerWeek > 0)
      ? weeklyHours
      : (dailyTarget !== null ? dailyTarget * selectedDaysPerWeek : null);

    const weekTarget = computeTargetHoursForRange(settings, workdays, dailyTarget, wStart, wEnd);
    const monthTarget = computeTargetHoursForRange(settings, workdays, dailyTarget, mStart, mEnd);

    const weekDiff = (weekTarget !== null) ? (weekWorked.workedHours - weekTarget) : null;
    const monthDiff = (monthTarget !== null) ? (monthWorked.workedHours - monthTarget) : null;

    return {
      week: {
        start: wStart,
        endExclusive: wEnd,
        workedHours: weekWorked.workedHours,
        targetHours: weekTarget,
        diffHours: weekDiff,

        manualHoursAdded: weekWorked.manualHoursAdded,
        stampHoursIgnored: weekWorked.stampHoursIgnored,

        manualCount: weekStamp.manualCount,
        openCount: weekStamp.openCount,
        unmatchedOutCount: weekStamp.unmatchedOutCount
      },
      month: {
        start: mStart,
        endExclusive: mEnd,
        workedHours: monthWorked.workedHours,
        targetHours: monthTarget,
        diffHours: monthDiff,

        manualHoursAdded: monthWorked.manualHoursAdded,
        stampHoursIgnored: monthWorked.stampHoursIgnored,

        manualCount: monthStamp.manualCount,
        openCount: monthStamp.openCount,
        unmatchedOutCount: monthStamp.unmatchedOutCount
      },
      meta: {
        weeklyHoursSetting: weeklyHoursEffective,
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
