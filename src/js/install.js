/**
 * install.js
 * Zeigt ein eigenes Installations-Banner für die PWA
 * Alles lokal, kein Tracking, kein Server
 */

(function () {
  let deferredPrompt = null;
  const dismissKey = "installBannerDismissed";

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  async function setBannerIcon(banner) {
    if (!banner) return;
    const icon = banner.querySelector(".install-icon");
    if (!icon) return;

    try {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) return;
      const response = await fetch(manifestLink.href);
      if (!response.ok) return;
      const manifest = await response.json();
      if (!manifest.icons || manifest.icons.length === 0) return;

      const sortedIcons = [...manifest.icons].sort((a, b) => {
        const sizeA = parseInt(String(a.sizes).split("x")[0], 10) || 0;
        const sizeB = parseInt(String(b.sizes).split("x")[0], 10) || 0;
        return sizeB - sizeA;
      });

      const bestIcon = sortedIcons[0];
      if (bestIcon && bestIcon.src) {
        icon.src = bestIcon.src;
      }
    } catch (error) {
      // Fallback: default icon remains
    }
  }

  function updateBannerState(banner) {
    if (!banner) return;
    const installButton = banner.querySelector("#btnInstallApp");
    const status = banner.querySelector("#installStatus");
    const available = !!deferredPrompt;
    const ios = isIos();
    installButton.disabled = !available;
    installButton.setAttribute("aria-disabled", String(!available));
    if (ios) {
      installButton.disabled = false;
      installButton.setAttribute("aria-disabled", "false");
      installButton.textContent = "Zum Home-Bildschirm";
      status.textContent = "Tippe auf „Teilen“ und wähle „Zum Home-Bildschirm“.";
    } else {
      installButton.textContent = "Jetzt installieren";
      status.textContent = available ? "Bereit zur Installation." : "Installation wird vorbereitet…";
    }
  }

  function createBanner() {
    if (document.getElementById("installBanner")) return;
    if (localStorage.getItem(dismissKey) === "true") return;
    if (isStandalone()) return;
    if (!deferredPrompt && !isIos()) return;

    const banner = document.createElement("div");
    banner.id = "installBanner";
    banner.innerHTML = `
      <div class="install-banner">
        <div class="install-info">
          <img class="install-icon" src="/icons/icon-192.png" alt="Stempeluhr" width="48" height="48" />
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
      if (isIos()) {
        alert("Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“, um die App zu installieren.");
        return;
      }
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
    setBannerIcon(banner);
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
