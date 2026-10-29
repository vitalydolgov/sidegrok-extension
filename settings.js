var GROK_HOME = "https://grok.com/";
var PANEL_URL_KEY = "panelUrl";
// Absent or any value other than false keeps the sidebar shortcut.
var SHORTCUT_ENABLED_KEY = "shortcutEnabled";
// Absent or false leaves the bot picker visible at the bottom of the drawer.
var HIDE_BOTTOM_PANEL_KEY = "hideBottomPanel";

// Firefox drops the sidebar document when the panel closes and loads
// sidebarAction's panel URL the next time it opens. Only the Grok app on
// the default HTTPS port is a place we can restore. Fragments are dropped so
// a one-time token in the hash is not stored or replayed.
function grokPanelUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.port !== "") {
      return null;
    }
    if (host !== "grok.com" && host !== "www.grok.com") {
      return null;
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch (error) {
    return null;
  }
}

// A full load of /bot/<id> asks for the thread before the roster exists.
// Grok then shows "Couldn't load this bot's thread" until that roster
// recovers. The drawer loads the app shell and opens the bot afterwards.
function grokBotId(value) {
  const page = grokPanelUrl(value);
  if (!page) {
    return "";
  }
  const match = new URL(page).pathname.match(/^\/bot\/([^/?#]+)/i);
  if (!match) {
    return "";
  }
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

function grokPanelLoadUrl(value) {
  const page = grokPanelUrl(value);
  if (!page) {
    return null;
  }
  const id = grokBotId(page);
  if (!id) {
    return page;
  }
  const url = new URL(page);
  url.pathname = "/";
  url.search = "";
  url.hash = "sidegrok-bot=" + encodeURIComponent(id);
  return url.href;
}
