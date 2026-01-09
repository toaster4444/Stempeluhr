/**
 * holidays.js
 * Gesetzliche Feiertage je Bundesland (DE) + bewegliche Feiertage (Ostern-basiert).
 * Rein lokal, keine Server-Calls.
 *
 * Hinweis: Einige Feiertage haben lokale Ausnahmen (z.B. Mariä Himmelfahrt in BY teils nur in katholischen Gemeinden).
 * Diese Implementierung bildet eine praxistaugliche Bundesland-Logik ab.
 */

(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymd(dateObj) {
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    return `${y}-${m}-${d}`;
  }

  function addDays(dateObj, days) {
    const d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  // Anonymous Gregorian algorithm (computus) for Easter Sunday
  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function makeHolidayMap(year, stateCode) {
    const map = {}; // date -> name

    function add(dateStr, name) {
      map[dateStr] = name;
    }

    // National fixed
    add(`${year}-01-01`, "Neujahr");
    add(`${year}-05-01`, "Tag der Arbeit");
    add(`${year}-10-03`, "Tag der Deutschen Einheit");
    add(`${year}-12-25`, "1. Weihnachtstag");
    add(`${year}-12-26`, "2. Weihnachtstag");

    // Easter-based (national)
    const easter = easterSunday(year);
    add(ymd(addDays(easter, -2)), "Karfreitag");
    add(ymd(addDays(easter, +1)), "Ostermontag");
    add(ymd(addDays(easter, +39)), "Christi Himmelfahrt");
    add(ymd(addDays(easter, +50)), "Pfingstmontag");

    // State-specific extras
    const S = String(stateCode || "").toUpperCase();

    // Epiphany: BW, BY, ST
    if (["BW", "BY", "ST"].includes(S)) {
      add(`${year}-01-06`, "Heilige Drei Könige");
    }

    // International Women's Day: BE, MV
    if (["BE", "MV"].includes(S)) {
      add(`${year}-03-08`, "Internationaler Frauentag");
    }

    // Corpus Christi (Fronleichnam): BW, BY, HE, NW, RP, SL
    if (["BW", "BY", "HE", "NW", "RP", "SL"].includes(S)) {
      add(ymd(addDays(easter, +60)), "Fronleichnam");
    }

    // Assumption (Mariä Himmelfahrt): SL, BY (mit lokalen Ausnahmen in BY)
    if (["SL", "BY"].includes(S)) {
      add(`${year}-08-15`, "Mariä Himmelfahrt");
    }

    // World Children's Day: TH
    if (["TH"].includes(S)) {
      add(`${year}-09-20`, "Weltkindertag");
    }

    // Reformation Day: BB, HB, HH, MV, NI, SN, ST, SH, TH
    if (["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"].includes(S)) {
      add(`${year}-10-31`, "Reformationstag");
    }

    // All Saints: BW, BY, NW, RP, SL
    if (["BW", "BY", "NW", "RP", "SL"].includes(S)) {
      add(`${year}-11-01`, "Allerheiligen");
    }

    // Repentance Day (Buß- und Bettag): SN (Wednesday before Nov 23)
    if (["SN"].includes(S)) {
      // Find Nov 23
      const nov23 = new Date(year, 10, 23, 0, 0, 0, 0); // month 10 = November
      // We need the Wednesday before Nov 23. If Nov 23 is Wed, take previous Wed (7 days before) or "before" meaning strictly before.
      // In Germany: Buß- und Bettag is the Wednesday before November 23 (i.e., in the week before the 23rd).
      // Compute: go back to previous Wednesday (could be same day if Wed? then go back 7).
      let d = new Date(nov23.getTime());
      const dow = d.getDay(); // Sun=0 .. Sat=6, Wed=3
      const diff = (dow - 3 + 7) % 7; // days since Wednesday
      d.setDate(d.getDate() - diff);
      if (d.getTime() === nov23.getTime()) {
        d.setDate(d.getDate() - 7);
      }
      add(ymd(d), "Buß- und Bettag");
    }

    // Brandenburg-only: Easter Sunday, Whit Sunday (commonly local holiday)
    if (["BB"].includes(S)) {
      add(ymd(addDays(easter, 0)), "Ostersonntag");
      add(ymd(addDays(easter, +49)), "Pfingstsonntag");
    }

    return map;
  }

  function getHolidayMapForYear(stateCode, year) {
    return makeHolidayMap(year, stateCode);
  }

  function isHoliday(stateCode, dateObj) {
    const year = dateObj.getFullYear();
    const map = makeHolidayMap(year, stateCode);
    return !!map[ymd(dateObj)];
  }

  window.HolidaysService = {
    getHolidayMapForYear,
    isHoliday
  };
})();
