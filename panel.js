// The strip is fixed to the bottom of the drawer, outside Grok's header.
// React removes nodes placed in that header.

(function () {
  const PANEL_HEIGHT = "44px";

  let panelHost = null;
  let hideBottomPanel = false;
  let hideBottomPanelKnown = false;
  let panelActive = false;
  let lastReportedUrl = "";
  let track = true;
  let timer = 0;

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
      showPanel();
    } else if (root.dataset.sidegrok === "sidebar") {
      delete root.dataset.sidegrok;
      hidePanel();
    }
  }

  function reportPanelUrl(closing) {
    if (!track) {
      return;
    }
    const url = location.href;
    if (!closing && url === lastReportedUrl) {
      return;
    }
    browser.runtime
      .sendMessage({ type: "panel-url", url, closing })
      .then((response) => {
        if (response && response.sidebar === false) {
          stopTracking();
          return;
        }
        markSidebar(true);
        lastReportedUrl = url;
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

  reportPanelUrl(false);
  window.addEventListener("pageshow", () => reportPanelUrl(false));
  window.addEventListener("pagehide", () => reportPanelUrl(true));
  window.addEventListener("hashchange", () => reportPanelUrl(false));
  timer = setInterval(() => reportPanelUrl(false), 250);
})();
