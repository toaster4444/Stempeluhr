/**
 * holidays.js
 * Gesetzliche Feiertage je Bundesland (DE) + lokale Profile (Wohnort/Ort-spezifisch über Auswahl).
 * Rein lokal, keine Server-Calls.
 *
 * Lokale Profile (aktuell implementiert):
 * - BY: AUGSBURG -> Augsburger Friedensfest (08.08.)
 * - BY: ASSUMPTION_LOCAL -> Mariä Himmelfahrt (15.08.) als lokal aktiv
 *
 * Hinweis: Vollständige Gemeinde-Tabellen (z.B. BY Mariä Himmelfahrt je Gemeinde) sind groß.
 * Deshalb nutzen wir Profile/Optionen, die der Nutzer auswählt.
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

  function makeHolidayMap(year, stateCode, localProfile) {
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

    const S = String(stateCode || "").toUpperCase();
    const P = String(localProfile || "").toUpperCase();

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

    // Assumption (Mariä Himmelfahrt):
    // SL always, BY only local -> use profile
    if (["SL"].includes(S)) {
      add(`${year}-08-15`, "Mariä Himmelfahrt");
    }
    if (["BY"].includes(S) && P === "ASSUMPTION_LOCAL") {
      add(`${year}-08-15`, "Mariä Himmelfahrt (lokal)");
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
      const nov23 = new Date(year, 10, 23, 0, 0, 0, 0); // November
      let d = new Date(nov23.getTime());
      const dow = d.getDay(); // Wed=3
      const diff = (dow - 3 + 7) % 7;
      d.setDate(d.getDate() - diff);
      if (d.getTime() === nov23.getTime()) d.setDate(d.getDate() - 7);
      add(ymd(d), "Buß- und Bettag");
    }

    // Brandenburg-only: Easter Sunday, Whit Sunday
    if (["BB"].includes(S)) {
      add(ymd(addDays(easter, 0)), "Ostersonntag");
      add(ymd(addDays(easter, +49)), "Pfingstsonntag");
    }

    // Local-only: Augsburg Peace Festival (Augsburger Friedensfest) - BY, Augsburg city
    if (S === "BY" && P === "AUGSBURG") {
      add(`${year}-08-08`, "Augsburger Friedensfest (lokal)");
    }

    return map;
  }

  /**
   * Returns { isHoliday, name, offFactor }
   * offFactor: 1 if it counts as "arbeitsfrei" for SOLL (unless ignoreHolidays is true)
   */
  function getHolidayInfo(settings, dateObj) {
    const ignore = !!(settings && settings.ignoreHolidays);
    if (ignore) {
      return { isHoliday: false, name: "", offFactor: 0 };
    }

    const state = settings && settings.state ? settings.state : "";
    const profile = settings && settings.localProfile ? settings.localProfile : "";

    const map = makeHolidayMap(dateObj.getFullYear(), state, profile);
    const name = map[ymd(dateObj)] || "";
    const isHoliday = !!name;

    return { isHoliday, name, offFactor: isHoliday ? 1 : 0 };
  }

  /**
   * For UI: list holidays for a year.
   */
  function getHolidayMapForYear(settings, year) {
    const state = settings && settings.state ? settings.state : "";
    const profile = settings && settings.localProfile ? settings.localProfile : "";
    return makeHolidayMap(year, state, profile);
  }

  window.HolidaysService = {
    getHolidayInfo,
    getHolidayMapForYear
  };
})();
