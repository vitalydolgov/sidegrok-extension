// Firefox's built-in chatbot loads Claude, ChatGPT, Gemini, and Mistral as a
// top-level document in the sidebar browser. Grok is not in that list.
// grok.com sends X-Frame-Options: DENY and a frame-ancestors policy, so an
// iframe cannot host it. sidebarAction.setPanel navigates the sidebar
// browser itself, which is the same kind of load the built-in chatbot uses.
//
// Closing the sidebar unloads that document. The next open loads whatever
// URL was last passed to setPanel, so navigation inside the sidebar has to be
// recorded and applied after the panel closes. A normal grok.com tab must not
// be recorded. Applying the URL while the panel is open calls
// SidebarController.show, which reloads the page.
//
// A saved /bot/<id> page is not what setPanel loads. That full load asks for
// the thread before the roster exists, and Grok shows "Couldn't load this
// bot's thread" until the roster recovers. setPanel loads the app shell with
// a one-time hash. The page opens the bot with the router once the roster
// is ready. The hash is not stored; panelUrl stays the bot thread.
//
// Context-menu actions (summarize, explain, quiz, proofread) belong to the
// built-in chatbot and are intentionally not implemented here.

let panelUrl = GROK_HOME;
let wasOpen = false;
let applyChain = Promise.resolve();
// Option+Command+A matches key="A": Firefox also tries the unmodified letter,
// so the Option character still hits this command. An empty shortcut turns it off.
let shortcutEnabled = true;
let applyingShortcutPreference = false;
const TOGGLE_COMMAND = "toggle-sidebar";
const TOGGLE_SHORTCUT = "Alt+Ctrl+A";

// The revamp sidebar paints this action as an <img>, so a context-fill SVG
// stays black. The launcher sits on the toolbar surface (a transparent toolbar
// shows the frame). Pick the mark that contrasts with that surface.
const BLACK_MARK = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  96: "icons/icon-96.png",
  128: "icons/icon-128.png",
};
const WHITE_MARK = {
  16: "icons/icon-white-16.png",
  32: "icons/icon-white-32.png",
  48: "icons/icon-white-48.png",
  96: "icons/icon-white-96.png",
  128: "icons/icon-white-128.png",
};
const appliedMark = new Map();
let iconChain = Promise.resolve();

function parseThemeColor(input) {
  if (Array.isArray(input) && input.length >= 3) {
    const r = Number(input[0]);
    const g = Number(input[1]);
    const b = Number(input[2]);
    const a = input.length >= 4 ? Number(input[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) {
      return null;
    }
    return { r, g, b, a };
  }
  if (typeof input !== "string") {
    return null;
  }
  const value = input.trim().toLowerCase();
  if (value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (value === "white") {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  if (value === "black") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = [...h].map((channel) => channel + channel).join("");
    }
    if (h.length !== 6 && h.length !== 8) {
      return null;
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (!rgb) {
    return null;
  }
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
}

function compositeOver(top, bottom) {
  if (!top) {
    return bottom || null;
  }
  if (!bottom || top.a >= 0.999) {
    return top;
  }
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha <= 0) {
    return null;
  }
  const channel = (above, below) =>
    Math.round((above * top.a + below * bottom.a * (1 - top.a)) / alpha);
  return {
    r: channel(top.r, bottom.r),
    g: channel(top.g, bottom.g),
    b: channel(top.b, bottom.b),
    a: alpha,
  };
}

function launcherBackground(colors) {
  if (!colors) {
    return null;
  }
  const surface =
    compositeOver(parseThemeColor(colors.toolbar), parseThemeColor(colors.frame)) ||
    parseThemeColor(colors.sidebar);
  if (!surface || surface.a < 0.5) {
    return null;
  }
  return surface;
}

function whiteMarkOn(color) {
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
  // Same cutoff Firefox uses for badge text: white on dark, black on light.
  return (lum + 0.05) ** 2 <= 1.05 * 0.05;
}

// theme.getCurrent() returns the light colors only. Firefox paints dark_theme
// when light/dark mode is dark, and theme.onUpdated does not fire for that
// switch. This page's prefers-color-scheme follows it when website appearance
// is automatic, and the change listener below re-reads it. Built-in Dark is
// color_scheme "dark" with no colors, and built-in Light is color_scheme
// "light" with no colors; neither follows that switch.
function markForTheme(theme) {
  const scheme = theme && theme.properties && theme.properties.color_scheme;
  if (scheme === "dark") {
    return WHITE_MARK;
  }
  const background = launcherBackground(theme && theme.colors);
  if (scheme === "light" && !background) {
    return BLACK_MARK;
  }
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return WHITE_MARK;
  }
  if (background) {
    return whiteMarkOn(background) ? WHITE_MARK : BLACK_MARK;
  }
  return BLACK_MARK;
}

function refreshThemeIcon(windowId) {
  const targeted = Number.isInteger(windowId);
  const run = iconChain.then(async () => {
    if (targeted) {
      await applyIconForWindow(windowId);
      return;
    }
    await applyIconForWindow(undefined);
    const windows = await browser.windows.getAll();
    for (const win of windows) {
      await applyIconForWindow(win.id);
    }
  });
  iconChain = run.catch((error) => {
    console.error("Failed to match the Grok icon to the theme", error);
  });
  return iconChain;
}

async function applyIconForWindow(windowId) {
  let theme = null;
  try {
    theme =
      windowId == null
        ? await browser.theme.getCurrent()
        : await browser.theme.getCurrent(windowId);
  } catch (error) {
    console.error("Failed to read the browser theme", error);
  }
  const path = markForTheme(theme);
  const key = windowId == null ? "global" : windowId;
  const name = path === WHITE_MARK ? "white" : "black";
  if (appliedMark.get(key) === name) {
    return;
  }
  const details = { path };
  if (windowId != null) {
    details.windowId = windowId;
  }
  await browser.sidebarAction.setIcon(details);
  appliedMark.set(key, name);
}

function rememberPanelUrl(value) {
  const next = grokPanelUrl(value);
  if (!next || next === panelUrl) {
    return;
  }
  panelUrl = next;
  browser.storage.local.set({ [PANEL_URL_KEY]: next }).catch((error) => {
    console.error("Failed to store the Grok sidebar URL", error);
  });
}

function applyShortcutPreference(enabled) {
  shortcutEnabled = enabled !== false;
  applyingShortcutPreference = true;
  const shortcut = shortcutEnabled ? TOGGLE_SHORTCUT : "";
  browser.commands
    .update({ name: TOGGLE_COMMAND, shortcut })
    .catch((error) => {
      console.error("Failed to update the sidebar shortcut", error);
    })
    .finally(() => {
      applyingShortcutPreference = false;
    });
}

function toggleSidebar() {
  if (!shortcutEnabled) {
    return;
  }
  // sidebarAction.toggle only succeeds in the turn that handles the key.
  // Anything awaited before it runs after that user-input window closes.
  browser.sidebarAction.toggle().catch((error) => {
    console.error("Failed to toggle the Grok sidebar", error);
  });
}

function panelRestoreId(value) {
  try {
    const match = /^#sidegrok-bot=([^&]+)/.exec(new URL(value).hash);
    if (!match) {
      return "";
    }
    return decodeURIComponent(match[1]);
  } catch (error) {
    return "";
  }
}

function applySavedPanel() {
  const run = applyChain.then(async () => {
    // panelUrl can change while setPanel is in flight. Read it again after
    // each attempt so a slow home-page write cannot clobber a later page.
    for (let attempt = 0; attempt < 4; attempt++) {
      const raw = await browser.sidebarAction.getPanel({});
      const current = grokPanelUrl(raw);
      const desired = panelUrl;
      const load = grokPanelLoadUrl(desired);
      if (!load) {
        return;
      }
      // grokPanelUrl drops the hash, so the shell and the home page look the
      // same. The hash has to match too, or a stale bot shell stays in place
      // after the saved page is no longer that bot.
      if (current === grokPanelUrl(load) && panelRestoreId(raw) === grokBotId(desired)) {
        return;
      }
      let open = false;
      try {
        open = await browser.sidebarAction.isOpen({});
      } catch (error) {
        console.error(error);
      }
      // setPanel while the drawer is open reloads it. Leave a bot thread
      // that is already showing; the next close points the panel at the shell.
      if (open && grokBotId(current) && grokBotId(current) === grokBotId(desired)) {
        return;
      }
      await browser.sidebarAction.setPanel({ panel: load });
    }
  });
  applyChain = run.catch((error) => {
    console.error("Failed to set the Grok sidebar panel", error);
  });
  return applyChain;
}

async function noteClosed() {
  const isOpen = await browser.sidebarAction.isOpen({});
  const closed = wasOpen && !isOpen;
  wasOpen = isOpen;
  if (closed) {
    await applySavedPanel();
  }
}

browser.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_COMMAND) {
    toggleSidebar();
  }
});

browser.commands.onChanged.addListener((change) => {
  if (applyingShortcutPreference || !change || change.name !== TOGGLE_COMMAND) {
    return;
  }
  const enabled = change.newShortcut !== "";
  if (enabled === shortcutEnabled) {
    return;
  }
  shortcutEnabled = enabled;
  browser.storage.local
    .set({ [SHORTCUT_ENABLED_KEY]: enabled })
    .catch((error) => {
      console.error("Failed to store the shortcut preference", error);
    });
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !Object.hasOwn(changes, SHORTCUT_ENABLED_KEY)) {
    return;
  }
  const enabled = changes[SHORTCUT_ENABLED_KEY].newValue !== false;
  if (enabled === shortcutEnabled) {
    return;
  }
  applyShortcutPreference(enabled);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "panel-url") {
    return undefined;
  }
  // The same content script runs in every grok.com tab. Those tabs have
  // sender.tab; the sidebar browser does not. A tab must not replace the
  // page the sidebar restores. sender.url has to be that same Grok page:
  // an extension page also has no tab, and must not set the panel either.
  const senderPage = grokPanelUrl(sender && sender.url);
  const reported = grokPanelUrl(message.url);
  if (sender.tab || !senderPage || !reported) {
    return Promise.resolve({ sidebar: false });
  }
  if (new URL(senderPage).origin !== new URL(reported).origin) {
    return Promise.resolve({ sidebar: false });
  }
  // The shell is only a place to start the roster. Saving it would replace
  // the bot thread the drawer is about to open.
  const restore = typeof message.restore === "string" ? message.restore : "";
  if (!restore) {
    rememberPanelUrl(reported);
  }
  if (!message.closing) {
    wasOpen = true;
    return Promise.resolve({ sidebar: true });
  }
  return browser.sidebarAction.isOpen({}).then(async (isOpen) => {
    wasOpen = isOpen;
    if (!isOpen) {
      await applySavedPanel();
    }
    return { sidebar: true };
  });
});

async function init() {
  const stored = await browser.storage.local.get([
    PANEL_URL_KEY,
    SHORTCUT_ENABLED_KEY,
  ]);
  if (stored[SHORTCUT_ENABLED_KEY] === false) {
    applyShortcutPreference(false);
  }
  const saved = grokPanelUrl(stored[PANEL_URL_KEY]);
  if (saved) {
    panelUrl = saved;
  }
  try {
    wasOpen = await browser.sidebarAction.isOpen({});
  } catch (error) {
    console.error(error);
  }
  await applySavedPanel();
  console.info("Restored the Grok sidebar panel");
  refreshThemeIcon();
  browser.theme.onUpdated.addListener((update) => {
    refreshThemeIcon(update && update.windowId);
  });
  browser.windows.onCreated.addListener((win) => {
    refreshThemeIcon(win.id);
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      refreshThemeIcon();
    });
  setInterval(() => {
    noteClosed().catch((error) => {
      console.error(error);
    });
  }, 250);
}

init().catch((error) => {
  console.error("Failed to restore the Grok sidebar panel", error);
});
