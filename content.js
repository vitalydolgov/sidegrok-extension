// The sidebar page is destroyed on close. Report the document URL so the
// background can reopen this page instead of the Grok home page. Grok is a
// single-page app, so location changes are not always full loads.
//
// This script also runs in ordinary grok.com tabs. The background tells those
// documents to stop; only the sidebar should update the restored page.
//
// The bot list is a separate panel pinned to the top of the drawer. It is not
// part of grok.com's header: that tree is owned by React and drops foreign
// nodes. The roster itself is read in the page world (bot-picker.js).

let lastReportedUrl = "";
let track = true;
let timer = 0;
let sidebarDocument = false;
let panelHost = null;
let panelChoice = null;
let panelMenu = null;
let chosenId = "";

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
    'html[data-sidegrok="sidebar"] #grok-app-root {',
    "margin-top: " + PANEL_HEIGHT + " !important;",
    "height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
    "max-height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
    "}",
    // The desktop bot route keeps Grok's own sidebar open. In the drawer that
    // column is about 256px and leaves the conversation an unreadable sliver.
    'html[data-sidegrok="sidebar"] #grok-app-root > .peer {',
    "display: none !important;",
    "}",
    'html[data-sidegrok="sidebar"] #grok-content-area {',
    "width: 100% !important;",
    "max-width: 100% !important;",
    "}",
  ].join("\n");
  document.documentElement.appendChild(style);
}

function ensurePanel() {
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
    "top: 0",
    "left: 0",
    "right: 0",
    "height: " + PANEL_HEIGHT,
    "display: block",
    "overflow: visible",
  ].join(";");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = [
    ".bar {",
    "  box-sizing: border-box;",
    "  height: " + PANEL_HEIGHT + ";",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 8px;",
    "  padding: 0 10px;",
    "  background: #111;",
    "  color: #f5f5f5;",
    '  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "  border-bottom: 1px solid #333;",
    "}",
    "button {",
    "  font: inherit;",
    "  color: inherit;",
    "  cursor: pointer;",
    "}",
    "button.choice {",
    "  flex: 1;",
    "  min-width: 0;",
    "  height: 28px;",
    "  padding: 0 8px;",
    "  background: #1c1c1c;",
    "  border: 1px solid #444;",
    "  border-radius: 6px;",
    "  text-align: left;",
    "}",
    ".menu {",
    "  position: absolute;",
    "  top: " + PANEL_HEIGHT + ";",
    "  left: 0;",
    "  right: 0;",
    "  max-height: 280px;",
    "  overflow: auto;",
    "  background: #161616;",
    "  color: #f5f5f5;",
    '  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "  border-bottom: 1px solid #333;",
    "  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);",
    "}",
    ".menu button {",
    "  display: block;",
    "  width: 100%;",
    "  padding: 8px 10px;",
    "  background: transparent;",
    "  border: 0;",
    "  text-align: left;",
    "}",
    ".menu button:hover, .menu button[aria-selected='true'] { background: #2a2a2a; }",
  ].join("\n");
  const bar = document.createElement("div");
  bar.className = "bar";
  const label = document.createElement("span");
  label.textContent = "Bots";
  const choice = document.createElement("button");
  choice.type = "button";
  choice.className = "choice";
  choice.setAttribute("aria-haspopup", "listbox");
  choice.setAttribute("aria-expanded", "false");
  choice.textContent = "Loading bots…";
  choice.addEventListener("click", function () {
    if (panelMenu.hidden) {
      panelMenu.hidden = false;
      choice.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button || !menu.contains(button)) {
      return;
    }
    // Native <select> in this shadow root commits, then Firefox snaps the
    // value back to the placeholder, so the change handler never keeps an id.
    // setPanel while the panel is open would reload the sidebar a second time.
    openBot(button.dataset.id || "");
  });
  bar.append(label, choice);
  shadow.append(style, bar, menu);
  document.documentElement.appendChild(host);
  panelHost = host;
  panelChoice = choice;
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

function openBot(id) {
  closeMenu();
  if (!id || id === currentBotId()) {
    return;
  }
  chosenId = id;
  showChoice(id);
  const url = new URL("/bot/" + encodeURIComponent(id), location.origin).href;
  location.assign(url);
}

function removePanel() {
  if (panelHost) {
    panelHost.remove();
    panelHost = null;
    panelChoice = null;
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

function displayedBotId() {
  const fromUrl = currentBotId();
  if (fromUrl) {
    chosenId = "";
    return fromUrl;
  }
  return chosenId;
}

function showChoice(active) {
  if (!panelChoice) {
    return;
  }
  const match = roster.find(function (bot) {
    return bot.id === active;
  });
  if (match) {
    panelChoice.textContent = optionLabel(match);
    return;
  }
  if (active) {
    panelChoice.textContent = "This bot";
    return;
  }
  panelChoice.textContent = roster.length ? "Choose a bot" : "Loading bots…";
}

function renderBots(bots) {
  if (!panelChoice || !panelMenu) {
    return;
  }
  if (!bots.length) {
    const cached = roster.length ? roster : readRoster();
    if (!cached.length) {
      showChoice(displayedBotId());
      return;
    }
    bots = cached;
  } else {
    writeRoster(bots);
  }
  roster = bots;
  const active = displayedBotId();
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
  renderBots(data.bots);
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

reportPanelUrl(false);
window.addEventListener("pageshow", () => reportPanelUrl(false));
window.addEventListener("pagehide", () => reportPanelUrl(true));
window.addEventListener("hashchange", () => reportPanelUrl(false));
timer = setInterval(() => reportPanelUrl(false), 250);
