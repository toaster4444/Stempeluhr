/**
 * install.js
 * Zeigt ein eigenes Installations-Banner für die PWA
 * Alles lokal, kein Tracking, kein Server
 */

(function () {
  let deferredPrompt = null;
  const dismissKey = "installBannerDismissed";

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function updateBannerState(banner) {
    if (!banner) return;
    const installButton = banner.querySelector("#btnInstallApp");
    const status = banner.querySelector("#installStatus");
    const available = !!deferredPrompt;
    installButton.disabled = !available;
    installButton.setAttribute("aria-disabled", String(!available));
    status.textContent = available ? "Bereit zur Installation." : "Installation wird vorbereitet…";
  }

  function createBanner() {
    if (document.getElementById("installBanner")) return;
    if (localStorage.getItem(dismissKey) === "true") return;
    if (isStandalone()) return;

    const banner = document.createElement("div");
    banner.id = "installBanner";
    banner.innerHTML = `
      <div class="install-banner">
        <div class="install-info">
          <img class="install-icon" src="/public/icons/icon-192.png" alt="Stempeluhr" width="48" height="48" />
          <div>
            <div class="install-title">Stempeluhr installieren</div>
            <div class="install-status" id="installStatus">Installation wird vorbereitet…</div>
          </div>
        </div>
        <div class="install-actions">
          <button id="btnInstallApp" class="btn">Jetzt installieren</button>
          <button id="btnDismissInstall" class="btn secondary">Später</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    const installButton = document.getElementById("btnInstallApp");
    installButton.onclick = async () => {
      if (!deferredPrompt) {
        updateBannerState(banner);
        return;
      }
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (result.outcome === "accepted") {
        banner.remove();
      } else {
        updateBannerState(banner);
      }
    };

    document.getElementById("btnDismissInstall").onclick = () => {
      localStorage.setItem(dismissKey, "true");
      banner.remove();
    };

    updateBannerState(banner);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    createBanner();
    updateBannerState(document.getElementById("installBanner"));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const banner = document.getElementById("installBanner");
    if (banner) banner.remove();
  });

  document.addEventListener("DOMContentLoaded", () => {
    createBanner();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js");
    });
  });

})();
