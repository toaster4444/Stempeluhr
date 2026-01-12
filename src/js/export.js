/**
 * export.js
 * Export der Rohdaten (lokal) – ohne Server.
 *
 * Wichtig:
 * - "Excel" im Browser ohne Library: wir exportieren CSV, das Excel öffnen kann.
 * - Für deutsche Excel-Setups ist ; als Trennzeichen oft am kompatibelsten.
 */

(function () {
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDate(st) {
    const y = String(st.year).padStart(4, "0");
    const m = pad2(st.month);
    const d = pad2(st.day);
    return `${y}-${m}-${d}`;
  }

  function formatTime(st) {
    const hh = pad2(st.hour);
    const mm = pad2(st.minute);
    const ss = pad2(st.second);
    return `${hh}:${mm}:${ss}`;
  }

  function safe(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function downloadBlob(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportTimeTrackingCSV(options) {
    const opts = options || {};
    const delimiter = opts.delimiter || ";";

    const data = window.StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];
    const manual = Array.isArray(data.manualWork) ? data.manualWork : [];

    const headers = [
      "source",
      "type",
      "date",
      "start",
      "end",
      "breakMinutes",
      "minutesWorked",
      "time",
      "iso",
      "timestamp",
      "manualRequired"
    ];

    const rows = [];

    stamps.forEach(st => {
      rows.push({
        source: "STAMP",
        type: safe(st.type),
        date: (st.year ? formatDate(st) : ""),
        start: "",
        end: "",
        breakMinutes: "",
        minutesWorked: "",
        time: (typeof st.hour === "number" ? formatTime(st) : ""),
        iso: safe(st.iso),
        timestamp: safe(st.timestamp),
        manualRequired: st.manualRequired ? "TRUE" : "FALSE",
        sortTs: typeof st.timestamp === "number" ? st.timestamp : 0
      });
    });

    manual.forEach(entry => {
      const dateStr = safe(entry.date);
      const start = safe(entry.start);
      const end = safe(entry.end);
      const stampTs = (() => {
        if (!dateStr || !start) return 0;
        const m = String(start).match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return 0;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
        const d = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(d.getTime())) return 0;
        d.setHours(hh, mm, 0, 0);
        return d.getTime();
      })();

      rows.push({
        source: "MANUAL",
        type: "WORK",
        date: dateStr,
        start,
        end,
        breakMinutes: safe(entry.breakMinutes),
        minutesWorked: safe(entry.minutesWorked),
        time: "",
        iso: "",
        timestamp: stampTs ? String(stampTs) : "",
        manualRequired: "",
        sortTs: stampTs
      });
    });

    rows.sort((a, b) => a.sortTs - b.sortTs);

    const lines = [];
    lines.push(headers.join(delimiter));

    for (const row of rows) {
      const values = [
        safe(row.source),
        safe(row.type),
        safe(row.date),
        safe(row.start),
        safe(row.end),
        safe(row.breakMinutes),
        safe(row.minutesWorked),
        safe(row.time),
        safe(row.iso),
        safe(row.timestamp),
        safe(row.manualRequired)
      ].map(v => {
        // CSV-Quoting: wenn Delimiter oder " oder Zeilenumbruch enthalten
        const s = safe(v);
        if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });

      lines.push(values.join(delimiter));
    }

    // UTF-8 BOM, damit Excel Umlaute sicher erkennt
    const bom = "\uFEFF";
    const csv = bom + lines.join("\r\n");

    const filename = `stempeluhr_zeiterfassung_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(filename, "text/csv;charset=utf-8", csv);
  }

  /**
   * Optional: kompletter Export als JSON (Backup lokal)
   */
  function exportAllJSON() {
    const data = window.StorageService.getData();
    const json = JSON.stringify(data, null, 2);
    const filename = `stempeluhr_backup_${new Date().toISOString().slice(0, 10)}.json`;
    downloadBlob(filename, "application/json;charset=utf-8", json);
  }

  window.ExportService = {
    exportTimeTrackingCSV,
    exportAllJSON
  };
})();
