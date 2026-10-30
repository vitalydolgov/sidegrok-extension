// The strip is fixed to the bottom of the drawer, outside Grok's header.
// React removes nodes placed in that header.

(function () {
  const PANEL_HEIGHT = "44px";
  const SIDEBAR_KEY = "sidegrok-sidebar";
  const BOOT_KEY = "sidegrok-restore";

  let panelHost = null;
  let hideBottomPanel = false;
  let hideBottomPanelKnown = false;
  let panelActive = false;
  let lastReportedUrl = "";
  let track = true;
  let timer = 0;
  let restoreBotId = "";

  function ensureOffsetStyle() {
    if (document.getElementById("sidegrok-bot-offset")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "sidegrok-bot-offset";
    style.textContent = [
      // The strip is position:fixed, so the page has to shrink or the strip covers it.
      'html[data-sidegrok="sidebar"] #grok-app-root {',
      "height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
      "max-height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
      "}",
      // A project chat sizes its column with h-dvh, which is the whole viewport
      // and ignores the shortened app root. The composer is then pinned to that
      // column and slides under the strip. Grok's own collapsed sidebar is also
      // h-dvh, but it is not w-full, and forcing its height would open it.
      'html[data-sidegrok="sidebar"] .h-dvh.w-full {',
      "height: calc(100dvh - " + PANEL_HEIGHT + ") !important;",
      "}",
      // Signed out, the legal footer is fixed to the viewport bottom. Shortening
      // the app root does not move it, so the strip covers the terms line.
      'html[data-sidegrok="sidebar"] footer.fixed.bottom-4 {',
      "transform: translateY(-" + PANEL_HEIGHT + ") !important;",
      "}",
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function ensurePanel() {
    if (!hideBottomPanelKnown) {
      return;
    }
    if (hideBottomPanel) {
      removePanel();
      return;
    }
    if (panelHost && panelHost.isConnected) {
      return;
    }
    ensureOffsetStyle();
    const host = document.createElement("div");
    host.id = "sidegrok-bot-panel";
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "z-index: 2147483647",
      "bottom: 0",
      "left: 0",
      "right: 0",
      "height: " + PANEL_HEIGHT,
      "display: block",
      "overflow: visible",
    ].join(";");
    const shadow = host.attachShadow({ mode: "closed" });
    document.documentElement.appendChild(host);
    panelHost = host;
    watchTheme(host);
    mountBotPicker(shadow);
  }

  function removePanel() {
    unmountBotPicker();
    if (panelHost) {
      panelHost.remove();
      panelHost = null;
    }
    const style = document.getElementById("sidegrok-bot-offset");
    if (style) {
      style.remove();
    }
  }

  function syncBottomPanelSetting(hidden) {
    hideBottomPanel = hidden === true;
    hideBottomPanelKnown = true;
    if (panelActive) {
      ensurePanel();
    }
  }

  function showPanel() {
    panelActive = true;
    ensurePanel();
  }

  function hidePanel() {
    panelActive = false;
    removePanel();
  }

  // The sidebar page is destroyed on close. Report the document URL so the
  // extension can reopen this page. Grok is a single-page app, so location
  // changes are not always full loads. Ordinary grok.com tabs get this script
  // too. The extension tells those documents to stop.
  function stopTracking() {
    track = false;
    markSidebar(false);
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
  }

  function markSidebar(isSidebar) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    if (isSidebar) {
      root.dataset.sidegrok = "sidebar";
      try {
        sessionStorage.setItem(SIDEBAR_KEY, "1");
      } catch (error) {}
      showPanel();
    } else if (root.dataset.sidegrok === "sidebar") {
      delete root.dataset.sidegrok;
      try {
        sessionStorage.removeItem(SIDEBAR_KEY);
      } catch (error) {}
      hidePanel();
    }
  }

  function currentBotId() {
    const match = /^\/bot\/([^/?#]+)/i.exec(location.pathname);
    if (!match) {
      return "";
    }
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      return match[1];
    }
  }

  // The shell load must not be stored in place of the bot thread. The hash
  // is the id for this document; sessionStorage covers a same-context reload
  // that already dropped the hash.
  function captureBootBot() {
    try {
      const hash = /^#sidegrok-bot=([^&]+)/.exec(location.hash || "");
      if (hash) {
        const id = decodeURIComponent(hash[1]);
        history.replaceState(null, "", location.pathname + location.search);
        sessionStorage.setItem(BOOT_KEY, id);
        return id;
      }
      const stored = sessionStorage.getItem(BOOT_KEY) || "";
      if (!stored) {
        return "";
      }
      const path = location.pathname.replace(/\/+$/, "") || "/";
      if (path === "/") {
        return stored;
      }
      sessionStorage.removeItem(BOOT_KEY);
      return "";
    } catch (error) {
      return "";
    }
  }

  function restoreToken() {
    if (!restoreBotId) {
      return "";
    }
    if (currentBotId() === restoreBotId) {
      restoreBotId = "";
      try {
        sessionStorage.removeItem(BOOT_KEY);
      } catch (error) {}
      return "";
    }
    return restoreBotId;
  }

  function reportPanelUrl(closing) {
    if (!track) {
      return;
    }
    const url = location.href;
    const restore = restoreToken();
    const reportKey = restore + " " + url;
    if (!closing && reportKey === lastReportedUrl) {
      return;
    }
    browser.runtime
      .sendMessage({ type: "panel-url", url, closing, restore })
      .then((response) => {
        if (response && response.sidebar === false) {
          stopTracking();
          return;
        }
        markSidebar(true);
        lastReportedUrl = reportKey;
      })
      .catch(() => {});
  }

  browser.storage.local.get(HIDE_BOTTOM_PANEL_KEY).then(
    (stored) => {
      syncBottomPanelSetting(stored[HIDE_BOTTOM_PANEL_KEY]);
    },
    () => {
      syncBottomPanelSetting(false);
    }
  );

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.hasOwn(changes, HIDE_BOTTOM_PANEL_KEY)) {
      return;
    }
    syncBottomPanelSetting(changes[HIDE_BOTTOM_PANEL_KEY].newValue);
  });

  restoreBotId = captureBootBot();

  try {
    if (sessionStorage.getItem(SIDEBAR_KEY) === "1") {
      markSidebar(true);
    }
  } catch (error) {}

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== "sidegrok-restore-cancel") {
      return;
    }
    restoreBotId = "";
    try {
      sessionStorage.removeItem(BOOT_KEY);
    } catch (error) {}
    lastReportedUrl = "";
    reportPanelUrl(false);
  });

  reportPanelUrl(false);
  window.addEventListener("pageshow", () => reportPanelUrl(false));
  window.addEventListener("pagehide", () => reportPanelUrl(true));
  window.addEventListener("hashchange", () => reportPanelUrl(false));
  timer = setInterval(() => reportPanelUrl(false), 250);
})();
