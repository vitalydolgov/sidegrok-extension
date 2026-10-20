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
    // Room for the picker only. Grok's own sidebar, widths, and media rules
    // stay as they are on a page without this branch.
    'html[data-sidegrok="sidebar"] #grok-app-root {',
    "height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
    "max-height: calc(100vh - " + PANEL_HEIGHT + ") !important;",
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
    // Native <select> in this shadow root commits, then Firefox snaps the
    // value back to the placeholder, so the change handler never keeps an id.
    // setPanel while the panel is open would reload the sidebar a second time.
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

function botIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const shape = "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-15 -15 259 259");
  svg.setAttribute("aria-hidden", "true");
  const clip = document.createElementNS(ns, "clipPath");
  clip.setAttribute("id", "sidegrok-bot-clip");
  const clipShape = document.createElementNS(ns, "path");
  clipShape.setAttribute("d", shape);
  clip.appendChild(clipShape);
  const defs = document.createElementNS(ns, "defs");
  defs.appendChild(clip);
  svg.appendChild(defs);
  const body = document.createElementNS(ns, "path");
  body.setAttribute("class", "body");
  body.setAttribute("d", shape);
  svg.appendChild(body);
  const eyes = document.createElementNS(ns, "g");
  eyes.setAttribute("clip-path", "url(#sidegrok-bot-clip)");
  for (const d of [
    "M130.36 45.98L132.71 46.19L134.98 46.81L137.11 47.83L138.97 49.28L140.47 51.09L141.68 53.12L142.73 55.23L143.76 57.36L144.78 59.49L145.79 61.62L146.79 63.76L147.76 65.91L148.71 68.07L149.63 70.25L150.52 72.43L151.37 74.63L151.99 76.91L152.10 79.26L151.64 81.57L150.59 83.68L149.04 85.45L147.10 86.78L144.90 87.62L142.56 87.93L140.22 87.71L137.98 86.99L135.93 85.82L134.17 84.24L132.78 82.34L131.69 80.25L130.77 78.08L129.87 75.89L128.94 73.72L128.00 71.56L127.03 69.40L126.05 67.26L125.05 65.12L124.03 62.99L122.93 60.90L121.87 58.79L121.03 56.59L120.72 54.26L121.10 51.93L122.15 49.83L123.75 48.10L125.76 46.89L128.01 46.19Z",
    "M176.61 37.08L178.72 37.59L180.70 38.48L182.52 39.65L184.20 41.03L185.71 42.59L187.03 44.31L188.20 46.14L189.26 48.03L190.27 49.96L191.26 51.89L192.23 53.84L193.16 55.80L194.05 57.78L194.92 59.77L195.74 61.78L196.53 63.80L197.27 65.84L197.97 67.90L198.47 70.01L198.63 72.18L198.40 74.33L197.58 76.33L195.95 77.72L193.83 78.08L191.71 77.65L189.76 76.69L188.03 75.38L186.53 73.82L185.28 72.05L184.25 70.13L183.40 68.14L182.63 66.11L181.87 64.07L181.07 62.05L180.25 60.04L179.39 58.05L178.49 56.07L177.57 54.10L176.61 52.15L175.62 50.22L174.59 48.31L173.53 46.41L172.54 44.48L171.86 42.42L171.76 40.26L172.62 38.30L174.45 37.19Z",
  ]) {
    const eye = document.createElementNS(ns, "path");
    eye.setAttribute("class", "eye");
    eye.setAttribute("d", d);
    eyes.appendChild(eye);
  }
  svg.appendChild(eyes);
  return svg;
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

function renderBots(bots, ready) {
  if (!panelChoice || !panelMenu) {
    return;
  }
  if (!bots.length) {
    const cached = roster.length ? roster : readRoster();
    if (cached.length) {
      bots = cached;
    } else if (ready && !/^\/bot\//i.test(location.pathname || "")) {
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
  renderBots(data.bots, data.ready === true);
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
