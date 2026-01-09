/**
 * install.js
 * Zeigt ein eigenes Installations-Banner für die PWA
 * Alles lokal, kein Tracking, kein Server
 */

(function () {
  let deferredPrompt = null;

  function createBanner() {
    if (document.getElementById("installBanner")) return;

    const banner = document.createElement("div");
    banner.id = "installBanner";
    banner.innerHTML = `
      <div class="install-banner">
        <span>📲 App installieren?</span>
        <div class="install-actions">
          <button id="btnInstallApp" class="btn">Jetzt installieren</button>
          <button id="btnDismissInstall" class="btn secondary">Später</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById("btnInstallApp").onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.remove();
    };

    document.getElementById("btnDismissInstall").onclick = () => {
      banner.remove();
    };
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    createBanner();
  });

})();
