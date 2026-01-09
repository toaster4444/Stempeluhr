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

  /**
   * Exportiert Rohdaten als CSV, das Excel öffnen kann.
   * Enthält: Datum, Uhrzeit, Stunde, Minute, Sekunde, ISO, Timestamp, Typ, manualRequired
   */
  function exportStampsCSV(options) {
    const opts = options || {};
    const delimiter = opts.delimiter || ";";

    const data = window.StorageService.getData();
    const stamps = Array.isArray(data.stamps) ? data.stamps : [];

    const headers = [
      "type",
      "date",
      "time",
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "iso",
      "timestamp",
      "manualRequired"
    ];

    const lines = [];
    lines.push(headers.join(delimiter));

    for (const st of stamps) {
      const row = [
        safe(st.type),
        (st.year ? formatDate(st) : ""),
        (typeof st.hour === "number" ? formatTime(st) : ""),
        safe(st.year),
        safe(st.month),
        safe(st.day),
        safe(st.hour),
        safe(st.minute),
        safe(st.second),
        safe(st.iso),
        safe(st.timestamp),
        st.manualRequired ? "TRUE" : "FALSE"
      ].map(v => {
        // CSV-Quoting: wenn Delimiter oder " oder Zeilenumbruch enthalten
        const s = safe(v);
        if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });

      lines.push(row.join(delimiter));
    }

    // UTF-8 BOM, damit Excel Umlaute sicher erkennt
    const bom = "\uFEFF";
    const csv = bom + lines.join("\r\n");

    const filename = `stempeluhr_rohdaten_${new Date().toISOString().slice(0, 10)}.csv`;
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
    exportStampsCSV,
    exportAllJSON
  };
})();

