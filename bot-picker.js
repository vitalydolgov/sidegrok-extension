// The picker fills the bottom strip. It is not part of grok.com's header.

var mountBotPicker;
var unmountBotPicker;

(function () {
  const ROSTER_KEY = "sidegrok-roster";

  let choice = null;
  let label = null;
  let menu = null;
  let host = null;
  let schemeObserver = null;
  let roster = [];
  let pinned = [];
  let sections = [];
  let rosterKnown = false;
  let navigating = false;

  // Built as elements inside the picker shadow. An image file would not take
  // the shadow's currentColor and --panel fills.
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

  function currentBotId() {
    const match = location.pathname.match(/^\/bot\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function closeMenu() {
    if (!menu || menu.hidden) {
      return;
    }
    menu.hidden = true;
    if (choice) {
      choice.setAttribute("aria-expanded", "false");
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
    if (!host) {
      return;
    }
    host.dataset.scheme = pageScheme();
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

  function optionLabel(bot) {
    return bot.hidden ? bot.name + " (hidden)" : bot.name;
  }

  function botRows(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(function (bot) {
      return bot && typeof bot.id === "string" && typeof bot.name === "string";
    });
  }

  function idRows(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const ids = [];
    const seen = new Set();
    for (const id of value) {
      if (typeof id !== "string" || !id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function sectionRows(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const rows = [];
    const seen = new Set();
    for (const section of value) {
      if (!section || typeof section.id !== "string") {
        continue;
      }
      const id = section.id.trim();
      if (!id || id === "__agents__" || seen.has(id)) {
        continue;
      }
      seen.add(id);
      rows.push({
        id: id,
        name: typeof section.name === "string" ? section.name : "",
        agentIds: idRows(section.agentIds),
      });
    }
    return rows;
  }

  function readRoster() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ROSTER_KEY) || "null");
      if (Array.isArray(parsed)) {
        return { bots: botRows(parsed), pinned: [], sections: [] };
      }
      if (parsed && typeof parsed === "object") {
        return {
          bots: botRows(parsed.bots),
          pinned: idRows(parsed.pinned),
          sections: sectionRows(parsed.sections),
        };
      }
    } catch (error) {}
    return { bots: [], pinned: [], sections: [] };
  }

  function writeRoster() {
    try {
      sessionStorage.setItem(
        ROSTER_KEY,
        JSON.stringify({ bots: roster, pinned: pinned, sections: sections })
      );
    } catch (error) {}
  }

  // Pinned bots are not repeated in their section. Bots left over are Unassigned.
  // With no pins and no named sections the list stays flat.
  function menuGroups() {
    const byId = new Map();
    const order = [];
    for (const bot of roster) {
      if (!bot || typeof bot.id !== "string" || typeof bot.name !== "string" || byId.has(bot.id)) {
        continue;
      }
      byId.set(bot.id, bot);
      order.push(bot);
    }
    const used = new Set();
    function take(ids) {
      const bots = [];
      for (const id of ids) {
        if (used.has(id)) {
          continue;
        }
        const bot = byId.get(id);
        if (!bot) {
          continue;
        }
        used.add(id);
        bots.push(bot);
      }
      return bots;
    }
    const pinnedBots = take(pinned);
    const named = [];
    for (const section of sections) {
      const bots = take(section.agentIds);
      if (!bots.length) {
        continue;
      }
      named.push({ title: section.name.trim() || "Untitled", bots: bots });
    }
    const rest = [];
    for (const bot of order) {
      if (used.has(bot.id)) {
        continue;
      }
      rest.push(bot);
    }
    if (!pinnedBots.length && !named.length) {
      return [{ title: "", bots: rest }];
    }
    const groups = [];
    if (pinnedBots.length) {
      groups.push({ title: "Pinned", bots: pinnedBots });
    }
    for (const group of named) {
      groups.push(group);
    }
    if (rest.length) {
      groups.push({ title: "Unassigned", bots: rest });
    }
    return groups;
  }

  function showChoice(active) {
    if (navigating || !label) {
      return;
    }
    const match = roster.find(function (bot) {
      return bot.id === active;
    });
    if (match) {
      label.textContent = optionLabel(match);
      return;
    }
    if (!roster.length) {
      label.textContent = rosterKnown ? "No bots" : "Loading...";
      return;
    }
    label.textContent = "Choose...";
  }

  function paint() {
    if (!choice || !menu) {
      return;
    }
    const active = currentBotId();
    showChoice(active);
    if (!roster.length) {
      menu.replaceChildren();
      menu.dataset.bots = "";
      menu.dataset.active = "";
      return;
    }
    const groups = menuGroups();
    const signature = groups
      .map(function (group) {
        return (
          group.title +
          "\0" +
          group.bots
            .map(function (bot) {
              return bot.id + "\0" + optionLabel(bot);
            })
            .join("\n")
        );
      })
      .join("\n\n");
    if (menu.dataset.bots === signature && menu.dataset.active === active) {
      return;
    }
    if (!menu.hidden) {
      return;
    }
    menu.replaceChildren();
    for (const group of groups) {
      const section = document.createElement("div");
      section.className = "section";
      if (group.title) {
        const heading = document.createElement("div");
        heading.className = "group";
        heading.textContent = group.title;
        section.appendChild(heading);
      }
      for (const bot of group.bots) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.id = bot.id;
        button.textContent = optionLabel(bot);
        button.setAttribute("role", "option");
        if (bot.id === active) {
          button.setAttribute("aria-selected", "true");
        }
        section.appendChild(button);
      }
      menu.appendChild(section);
    }
    menu.dataset.bots = signature;
    menu.dataset.active = active;
  }

  function acceptBots(bots, settled, layout) {
    let next = botRows(bots);
    let nextPinned = pinned;
    let nextSections = sections;
    if (!next.length) {
      const cached = roster.length
        ? { bots: roster, pinned: pinned, sections: sections }
        : readRoster();
      if (cached.bots.length) {
        next = cached.bots;
        if (!layout) {
          nextPinned = cached.pinned;
          nextSections = cached.sections;
        }
      } else if (settled) {
        roster = [];
        pinned = [];
        sections = [];
        rosterKnown = true;
        paint();
        return;
      } else {
        paint();
        return;
      }
    }
    if (layout) {
      nextPinned = idRows(layout.pinned);
      nextSections = sectionRows(layout.sections);
    }
    roster = next;
    pinned = nextPinned;
    sections = nextSections;
    rosterKnown = true;
    writeRoster();
    paint();
  }

  function botsMessage(event) {
    // The page posts this to itself. Comparing event.source to the content-script
    // window fails under Firefox's Xray wrapper, so the origin is the check.
    // The roster travels as a JSON string: an Xray wrapper of the object array
    // reports length 0.
    const root = document.documentElement;
    if (!root || root.dataset.sidegrok !== "sidebar" || event.origin !== location.origin) {
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

  mountBotPicker = function (shadow) {
    host = shadow.host;
    const style = document.createElement("style");
    style.textContent = [
      ":host {",
      "  --panel: #171716;",
      "  --ink: #f5f5f5;",
      "  --muted: #8d8d8a;",
      "  --line: #333;",
      "  --hover: #2a2a2a;",
      "}",
      ":host([data-scheme='light']) {",
      "  --panel: #f4f1f0;",
      "  --ink: #171717;",
      "  --muted: #736e6b;",
      "  --line: #e4dfdd;",
      "  --hover: #e7e2e0;",
      "}",
      ".bar {",
      "  position: relative;",
      "  box-sizing: border-box;",
      "  height: 100%;",
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
      "  left: 10px;",
      "  bottom: 100%;",
      "  width: min(200px, calc(100% - 20px));",
      "  box-sizing: border-box;",
      "  max-height: min(420px, calc(100dvh - 52px));",
      "  overflow: auto;",
      "  overscroll-behavior: contain;",
      "  scrollbar-width: thin;",
      "  scrollbar-color: var(--line) transparent;",
      "  padding: 4px;",
      "  background: var(--panel);",
      "  color: var(--ink);",
      '  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      "  border: 1px solid var(--line);",
      "  border-bottom: 0;",
      "  border-radius: 10px 10px 0 0;",
      "  box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.28);",
      "}",
      ".section {",
      "  display: flex;",
      "  flex-direction: column;",
      "}",
      ".section + .section {",
      "  margin-top: 6px;",
      "}",
      ".menu .group {",
      "  padding: 6px 8px 2px;",
      "  overflow: hidden;",
      "  font-size: 11px;",
      "  font-weight: 600;",
      "  line-height: 1.2;",
      "  letter-spacing: 0.04em;",
      "  white-space: nowrap;",
      "  text-overflow: ellipsis;",
      "  color: var(--muted);",
      "}",
      ".menu button {",
      "  display: block;",
      "  width: 100%;",
      "  padding: 6px 8px;",
      "  overflow: hidden;",
      "  white-space: nowrap;",
      "  text-overflow: ellipsis;",
      "  background: transparent;",
      "  border: 0;",
      "  border-radius: 6px;",
      "  text-align: left;",
      "}",
      ".menu button:hover, .menu button[aria-selected='true'] { background: var(--hover); }",
      ".menu button[aria-selected='true'] { font-weight: 600; }",
    ].join("\n");
    const bar = document.createElement("div");
    bar.className = "bar";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(botIcon());
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "Loading...";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.append(mark, name);
    button.addEventListener("click", function () {
      if (menu.hidden) {
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
      } else {
        closeMenu();
      }
    });
    const slot = document.createElement("div");
    slot.className = "slot";
    const list = document.createElement("div");
    list.className = "menu";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    list.addEventListener("click", function (event) {
      const item = event.target.closest("button");
      if (!item || !list.contains(item)) {
        return;
      }
      openBot(item.dataset.id || "");
    });
    slot.append(button);
    bar.append(slot, list);
    shadow.append(style, bar);
    choice = button;
    label = name;
    menu = list;
    watchScheme();
    syncScheme();
    if (!roster.length && !rosterKnown) {
      const cached = readRoster();
      if (cached.bots.length) {
        roster = cached.bots;
        pinned = cached.pinned;
        sections = cached.sections;
        rosterKnown = true;
      }
    }
    paint();
  };

  unmountBotPicker = function () {
    choice = null;
    label = null;
    menu = null;
    host = null;
  };

  window.addEventListener("message", function (event) {
    const data = botsMessage(event);
    if (!data) {
      return;
    }
    const hasLayout = Array.isArray(data.pinned) || Array.isArray(data.sections);
    acceptBots(data.bots, data.settled === true, hasLayout ? data : null);
  });

  document.addEventListener(
    "mousedown",
    function (event) {
      if (!menu || menu.hidden) {
        return;
      }
      if (host && event.target === host) {
        return;
      }
      closeMenu();
    },
    true
  );
})();
