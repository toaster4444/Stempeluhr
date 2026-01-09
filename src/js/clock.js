/**
 * clock.js
 * Logik für Ein- und Ausstempeln
 */

(function () {

  function now() {
    const d = new Date();
    return {
      iso: d.toISOString(),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      timestamp: d.getTime()
    };
  }

  function isAfterNightBoundary(lastStamp, current) {
    if (!lastStamp) return false;

    const last = new Date(lastStamp.timestamp);
    const nowDate = new Date(current.timestamp);

    // Grenze: 03:00 Uhr
    const boundary = new Date(last);
    boundary.setHours(3, 0, 0, 0);

    return nowDate > boundary && lastStamp.type === "IN";
  }

  function toggleStamp() {
    const current = now();
    const lastStamp = StorageService.getLastStamp();

    let type = "IN";
    let needsManualFix = false;

    if (!lastStamp) {
      type = "IN";
    } else if (lastStamp.type === "IN") {

      if (isAfterNightBoundary(lastStamp, current)) {
        // Sicherheitsfall: Ausstempeln vergessen
        needsManualFix = true;
        type = "IN";
      } else {
        type = "OUT";
      }

    } else {
      type = "IN";
    }

    const stamp = {
      type,
      ...current,
      manualRequired: needsManualFix
    };

    StorageService.addStamp(stamp);

    return {
      type,
      timeString:
        String(current.hour).padStart(2, "0") + ":" +
        String(current.minute).padStart(2, "0") + ":" +
        String(current.second).padStart(2, "0"),
      manualRequired: needsManualFix
    };
  }

  window.Clock = {
    toggleStamp
  };

})();

