// The sidebar page is destroyed on close. Report the document URL so the
// background can reopen this page instead of the Grok home page. Grok is a
// single-page app, so location changes are not always full loads.
//
// This script also runs in ordinary grok.com tabs. The background tells those
// documents to stop; only the sidebar should update the restored page.
//
// The bot list is a separate panel pinned to the bottom of the drawer. It is not
// part of grok.com's header: that tree is owned by React and drops foreign
// nodes. The roster itself is read in the page world (bot-picker.js).

let lastReportedUrl = "";
let track = true;
let timer = 0;
let sidebarDocument = false;
let panelHost = null;
let panelChoice = null;
let panelLabel = null;
let panelMenu = null;
let schemeObserver = null;
let hideBottomPanel = false;
let hideBottomPanelKnown = false;

const PANEL_HEIGHT = "44px";
const ROSTER_KEY = "sidegrok-roster";

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
  sidebarDocument = isSidebar;
  if (isSidebar) {
    root.dataset.sidegrok = "sidebar";
    ensurePanel();
  } else if (root.dataset.sidegrok === "sidebar") {
    delete root.dataset.sidegrok;
    removePanel();
  }
}

function currentBotId() {
  const match = location.pathname.match(/^\/bot\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

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
  const style = document.createElement("style");
  style.textContent = [
    ":host {",
    "  --panel: #171716;",
    "  --ink: #f5f5f5;",
    "  --line: #333;",
    "  --hover: #2a2a2a;",
    "}",
    ":host([data-scheme='light']) {",
    "  --panel: #f4f1f0;",
    "  --ink: #171717;",
    "  --line: #e4dfdd;",
    "  --hover: #e7e2e0;",
    "}",
    ".bar {",
    "  box-sizing: border-box;",
    "  height: " + PANEL_HEIGHT + ";",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 4px;",
    "  padding: 0 10px;",
    "  background: var(--panel);",
    "  color: var(--ink);",
    '  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "  border-top: 1px solid var(--line);",
    "}",
    "button {",
    "  font: inherit;",
    "  color: inherit;",
    "  cursor: pointer;",
    "}",
    ".mark {",
    "  flex: 0 0 auto;",
    "  width: 16px;",
    "  height: 16px;",
    "  display: block;",
    "}",
    ".mark svg { width: 16px; height: 16px; display: block; }",
    ".mark svg .body { fill: currentColor; }",
    ".mark svg .eye { fill: var(--panel); }",
    ".slot {",
    "  position: relative;",
    "  flex: 0 0 120px;",
    "  width: 120px;",
    "  min-width: 0;",
    "  align-self: stretch;",
    "  display: flex;",
    "  align-items: center;",
    "}",
    "button.choice {",
    "  width: 100%;",
    "  min-width: 0;",
    "  height: 28px;",
    "  padding: 0;",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 4px;",
    "  overflow: hidden;",
    "  background: transparent;",
    "  border: 0;",
    "  outline: 0;",
    "  border-radius: 6px;",
    "  text-align: left;",
    "}",
    "button.choice .name {",
    "  min-width: 0;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  white-space: nowrap;",
    "}",
    ".menu {",
    "  position: absolute;",
    "  bottom: 100%;",
    "  left: 0;",
    "  right: 0;",
    "  max-height: 280px;",
    "  overflow: auto;",
    "  background: var(--panel);",
    "  color: var(--ink);",
    '  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "  border-top: 1px solid var(--line);",
    "  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);",
    "}",
    ".menu button {",
    "  display: block;",
    "  width: 100%;",
    "  padding: 8px 10px;",
    "  background: transparent;",
    "  border: 0;",
    "  text-align: left;",
    "}",
    ".menu button:hover, .menu button[aria-selected='true'] { background: var(--hover); }",
  ].join("\n");
  const bar = document.createElement("div");
  bar.className = "bar";
  const mark = document.createElement("span");
  mark.className = "mark";
  mark.setAttribute("aria-hidden", "true");
  mark.appendChild(botIcon());
  const label = document.createElement("span");
  label.className = "name";
  label.textContent = "Loading...";
  const choice = document.createElement("button");
  choice.type = "button";
  choice.className = "choice";
  choice.setAttribute("aria-haspopup", "listbox");
  choice.setAttribute("aria-expanded", "false");
  choice.append(mark, label);
  choice.addEventListener("click", function () {
    if (panelMenu.hidden) {
      panelMenu.hidden = false;
      choice.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });
  const slot = document.createElement("div");
  slot.className = "slot";
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button || !menu.contains(button)) {
      return;
    }
    openBot(button.dataset.id || "");
  });
  slot.append(choice, menu);
  bar.append(slot);
  shadow.append(style, bar);
  document.documentElement.appendChild(host);
  panelHost = host;
  watchScheme();
  syncScheme();
  panelChoice = choice;
  panelLabel = label;
  panelMenu = menu;
  const cached = readRoster();
  if (cached.length) {
    renderBots(cached);
  }
}

function closeMenu() {
  if (!panelMenu || panelMenu.hidden) {
    return;
  }
  panelMenu.hidden = true;
  if (panelChoice) {
    panelChoice.setAttribute("aria-expanded", "false");
  }
}

function pageScheme() {
  const root = document.documentElement;
  if (!root) {
    return "dark";
  }
  // Grok keeps scheme-light in the class list and adds dark for its dark theme.
  if (root.classList.contains("dark")) {
    return "dark";
  }
  if (root.classList.contains("scheme-light") || root.style.colorScheme === "light") {
    return "light";
  }
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch (error) {}
  return "dark";
}

function syncScheme() {
  if (!panelHost) {
    return;
  }
  panelHost.dataset.scheme = pageScheme();
}

function watchScheme() {
  if (schemeObserver || !document.documentElement) {
    return;
  }
  schemeObserver = new MutationObserver(syncScheme);
  schemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  try {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", syncScheme);
  } catch (error) {}
}

function openBot(id) {
  closeMenu();
  if (!id || id === currentBotId() || navigating) {
    return;
  }
  // The roster is published again while this document is still visible, and
  // the URL can move before the next page paints. Either one would rename the
  // button to a bot that this page has not opened yet.
  navigating = true;
  const url = new URL("/bot/" + encodeURIComponent(id), location.origin).href;
  try {
    location.assign(url);
  } catch (error) {
    navigating = false;
  }
}

function removePanel() {
  if (panelHost) {
    panelHost.remove();
    panelHost = null;
    panelChoice = null;
    panelLabel = null;
    panelMenu = null;
  }
  const style = document.getElementById("sidegrok-bot-offset");
  if (style) {
    style.remove();
  }
}

function optionLabel(bot) {
  return bot.hidden ? bot.name + " (hidden)" : bot.name;
}

let roster = [];
let rosterKnown = false;
let navigating = false;

function readRoster() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ROSTER_KEY) || "null");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(function (bot) {
      return bot && typeof bot.id === "string" && typeof bot.name === "string";
    });
  } catch (error) {
    return [];
  }
}

function writeRoster(bots) {
  try {
    sessionStorage.setItem(ROSTER_KEY, JSON.stringify(bots));
  } catch (error) {}
}

function showChoice(active) {
  if (navigating || !panelLabel) {
    return;
  }
  const match = roster.find(function (bot) {
    return bot.id === active;
  });
  if (match) {
    panelLabel.textContent = optionLabel(match);
    return;
  }
  if (!roster.length) {
    panelLabel.textContent = rosterKnown ? "No bots" : "Loading...";
    return;
  }
  panelLabel.textContent = "Choose...";
}

function renderBots(bots, settled) {
  if (!panelChoice || !panelMenu) {
    return;
  }
  if (!bots.length) {
    const cached = roster.length ? roster : readRoster();
    if (cached.length) {
      bots = cached;
    } else if (settled) {
      roster = [];
      rosterKnown = true;
      showChoice(currentBotId());
      panelMenu.replaceChildren();
      panelMenu.dataset.bots = "";
      panelMenu.dataset.active = "";
      return;
    } else {
      showChoice(currentBotId());
      return;
    }
  } else {
    writeRoster(bots);
  }
  rosterKnown = true;
  roster = bots;
  const active = currentBotId();
  const signature = bots
    .map(function (bot) {
      return bot.id + "\0" + optionLabel(bot);
    })
    .join("\n");
  showChoice(active);
  if (panelMenu.dataset.bots === signature && panelMenu.dataset.active === active) {
    return;
  }
  if (!panelMenu.hidden) {
    return;
  }
  panelMenu.replaceChildren();
  const seen = new Set();
  for (const bot of bots) {
    if (!bot || typeof bot.id !== "string" || typeof bot.name !== "string" || seen.has(bot.id)) {
      continue;
    }
    seen.add(bot.id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = bot.id;
    button.textContent = optionLabel(bot);
    button.setAttribute("role", "option");
    if (bot.id === active) {
      button.setAttribute("aria-selected", "true");
    }
    panelMenu.appendChild(button);
  }
  panelMenu.dataset.bots = signature;
  panelMenu.dataset.active = active;
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

function botsMessage(event) {
  // The page posts this to itself. Comparing event.source to the content-script
  // window fails under Firefox's Xray wrapper, so the origin is the check.
  // The roster travels as a JSON string: an Xray wrapper of the object array
  // reports length 0.
  if (!sidebarDocument || event.origin !== location.origin) {
    return null;
  }
  const candidates = [];
  if (event.data) {
    candidates.push(event.data);
  }
  try {
    if (event.data && event.data.wrappedJSObject) {
      candidates.push(event.data.wrappedJSObject);
    }
  } catch (error) {}
  for (const data of candidates) {
    if (!data || data.source !== "sidegrok-bots" || typeof data.payload !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(data.payload);
      if (parsed && Array.isArray(parsed.bots)) {
        return parsed;
      }
    } catch (error) {}
  }
  return null;
}

window.addEventListener("message", function (event) {
  const data = botsMessage(event);
  if (!data) {
    return;
  }
  ensurePanel();
  renderBots(data.bots, data.settled === true);
});

document.addEventListener(
  "mousedown",
  function (event) {
    if (!panelMenu || panelMenu.hidden) {
      return;
    }
    if (panelHost && event.target === panelHost) {
      return;
    }
    closeMenu();
  },
  true
);

function syncBottomPanelSetting(hidden) {
  hideBottomPanel = hidden === true;
  hideBottomPanelKnown = true;
  if (sidebarDocument) {
    ensurePanel();
  }
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
