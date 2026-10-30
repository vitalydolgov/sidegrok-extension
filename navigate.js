// The picker runs outside the page, so it cannot call Grok's router.
// A full load of /bot/<id> drops the roster, the thread request fails, and
// Grok shows "Couldn't load this bot's thread" before recovering.
// Opening the drawer is that full load. Leave it for the app shell, then
// router.push once the roster is back. router.push keeps the roster and
// loads the thread once. location.assign is only the picker's last resort.

(function () {
  const BOOT_KEY = "sidegrok-restore";
  const SIDEBAR_KEY = "sidegrok-sidebar";

  function raw(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    try {
      if (value.wrappedJSObject) {
        return value.wrappedJSObject;
      }
    } catch (error) {}
    return value;
  }

  function pageRouter() {
    try {
      const next = raw(globalThis.next);
      const router = next && raw(next.router);
      if (router && typeof router.push === "function") {
        return router;
      }
    } catch (error) {}
    return null;
  }

  function assign(href) {
    location.assign(new URL(href, location.origin).href);
  }

  let forgetting = false;
  let openTimer = 0;

  function forgetBotRoute() {
    if (forgetting || !sidebarMarked() || botIdFromPath() || !historyStillShowsBot()) {
      return;
    }
    const router = pageRouter();
    if (!router || typeof router.replace !== "function") {
      return;
    }
    const href = shownUrl() || "/";
    forgetting = true;
    // Let Grok store the page it just opened, then tell Next that this
    // document is that page. replace keeps the address and drops the bot.
    queueMicrotask(function () {
      forgetting = false;
      if (!sidebarMarked() || botIdFromPath() || !historyStillShowsBot()) {
        return;
      }
      if (restoringId) {
        cancelRestore();
      }
      try {
        router.replace(href);
      } catch (error) {}
    });
  }

  function pushNow(href) {
    const router = pageRouter();
    if (!router) {
      assign(href);
      return;
    }
    try {
      const pending = router.push(href);
      if (pending && typeof pending.then === "function") {
        pending.catch(function () {
          assign(href);
        });
      }
    } catch (error) {
      assign(href);
    }
  }

  function open(href) {
    if (openTimer) {
      clearInterval(openTimer);
      openTimer = 0;
    }
    if (!pageRouter()) {
      assign(href);
      return;
    }
    // The leave may still be catching Next up. Pushing the bot before that
    // finishes is a no-op paint: the tree already names this bot.
    if (!botIdFromPath() && historyStillShowsBot()) {
      forgetBotRoute();
      const started = Date.now();
      openTimer = setInterval(function () {
        if (botIdFromPath() || !historyStillShowsBot() || Date.now() - started > 2000) {
          clearInterval(openTimer);
          openTimer = 0;
          pushNow(href);
        }
      }, 50);
      return;
    }
    pushNow(href);
  }

  function decodeId(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function botIdFromPathname(pathname) {
    const match = /^\/bot\/([^/?#]+)/i.exec(pathname || "");
    return match ? decodeId(match[1]) : "";
  }

  function botIdFromPath() {
    return botIdFromPathname(location.pathname);
  }

  function pathnameOf(url) {
    if (url == null || url === "") {
      return location.pathname;
    }
    try {
      const value = typeof url === "string" ? url : String(url);
      return new URL(value, location.href).pathname;
    } catch (error) {
      return location.pathname;
    }
  }

  function shownUrl() {
    return location.pathname + location.search + location.hash;
  }

  // Grok leaves a bot with history.pushState. Next then copies the bot tree
  // onto that entry, so the address is home (or a conversation) while the
  // tree still names the bot. A later push of the same bot only updates the
  // address. The page segment is the first child of Next's history tree.
  function historyStillShowsBot() {
    let state;
    try {
      state = history.state;
    } catch (error) {
      return false;
    }
    const internals = state && state.__PRIVATE_NEXTJS_INTERNALS_TREE;
    const tree = internals && internals.tree;
    const children = tree && tree[1] && tree[1].children;
    return Array.isArray(children) && children[0] === "bot";
  }

  function sidebarMarked() {
    const root = document.documentElement;
    if (root && root.dataset.sidegrok === "sidebar") {
      return true;
    }
    try {
      return sessionStorage.getItem(SIDEBAR_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function leaveBotDocument(id) {
    try {
      sessionStorage.setItem(BOOT_KEY, id);
    } catch (error) {}
    const home = new URL("/", location.origin);
    home.hash = "sidegrok-bot=" + encodeURIComponent(id);
    location.replace(home.href);
  }

  // This is the URL the document was loaded with, not a later client move.
  // The observer stays for the life of the document, and a restored bot
  // thread must not be sent back to the shell.
  const loadedBotId = botIdFromPath();
  let leftBotDocument = false;

  function redirectLoadedBot() {
    if (leftBotDocument || !loadedBotId || botIdFromPath() !== loadedBotId || !sidebarMarked()) {
      return;
    }
    leftBotDocument = true;
    leaveBotDocument(loadedBotId);
  }

  function bootIdFromLocation() {
    try {
      const hash = /^#sidegrok-bot=([^&]+)/.exec(location.hash || "");
      if (hash) {
        const id = decodeId(hash[1]);
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

  function threadErrorVisible() {
    const body = document.body;
    if (!body || !body.textContent) {
      return false;
    }
    return body.textContent.indexOf("Couldn't load this bot's thread") !== -1;
  }

  function holdRestore(id) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.dataset.sidegrokRestore = id;
    if (document.getElementById("sidegrok-restore-hold")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "sidegrok-restore-hold";
    // The shell would otherwise paint the home conversation, and a bot
    // thread that still fails would paint the error, until the push settles.
    style.textContent = "html[data-sidegrok-restore] body { visibility: hidden !important; }";
    root.appendChild(style);
  }

  function releaseRestore() {
    const root = document.documentElement;
    if (root && root.dataset.sidegrokRestore) {
      delete root.dataset.sidegrokRestore;
    }
  }

  function rosterReady() {
    const root = document.documentElement;
    return !!(root && root.dataset.sidegrokRoster === "ready");
  }

  let restoringId = "";
  let restoreTimer = 0;
  let restorePushes = 0;
  let restoreStarted = 0;
  let lastPush = 0;
  let pathMatchedAt = 0;
  let sawThreadError = false;

  function finishRestore() {
    if (restoreTimer) {
      clearInterval(restoreTimer);
      restoreTimer = 0;
    }
    try {
      sessionStorage.removeItem(BOOT_KEY);
    } catch (error) {}
    releaseRestore();
    restoringId = "";
  }

  function cancelRestore() {
    finishRestore();
    window.postMessage({ source: "sidegrok-restore-cancel" }, location.origin);
  }

  // A failed push must not full-load the bot. That load is what shows the error.
  function pushBot(id) {
    const router = pageRouter();
    if (!router) {
      return false;
    }
    try {
      const pending = router.push("/bot/" + encodeURIComponent(id));
      if (pending && typeof pending.then === "function") {
        pending.catch(function () {
          if (restorePushes > 0) {
            restorePushes -= 1;
          }
        });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function startRestore(id) {
    if (!id || loadedBotId || restoringId === id) {
      return;
    }
    restoringId = id;
    restorePushes = 0;
    restoreStarted = Date.now();
    lastPush = 0;
    pathMatchedAt = 0;
    sawThreadError = false;
    holdRestore(id);
    if (restoreTimer) {
      clearInterval(restoreTimer);
    }
    restoreTimer = setInterval(function () {
      const waited = Date.now() - restoreStarted;
      if (botIdFromPath() === id) {
        if (!pathMatchedAt) {
          pathMatchedAt = Date.now();
        }
        // The URL moves before the bot page paints. Wait past that paint so
        // a thread error cannot flash in the gap, and if it does, stay hidden
        // until Grok replaces it with the conversation.
        if (threadErrorVisible()) {
          sawThreadError = true;
        } else if (sawThreadError || Date.now() - pathMatchedAt > 400) {
          finishRestore();
          return;
        }
        if (waited > 20000) {
          cancelRestore();
        }
        return;
      }
      if (sidebarMarked() && rosterReady() && restorePushes < 3 && Date.now() - lastPush > 700) {
        if (pushBot(id)) {
          restorePushes += 1;
          lastPush = Date.now();
        }
      }
      if (waited > 20000) {
        cancelRestore();
      }
    }, 50);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== "sidegrok-open-bot" || typeof data.id !== "string" || !data.id) {
      return;
    }
    const root = document.documentElement;
    if (!root || root.dataset.sidegrok !== "sidebar") {
      return;
    }
    open("/bot/" + encodeURIComponent(data.id));
  });

  const bootId = bootIdFromLocation();
  if (bootId) {
    startRestore(bootId);
  }
  redirectLoadedBot();
  const root = document.documentElement;
  if (root && loadedBotId) {
    new MutationObserver(redirectLoadedBot).observe(root, {
      attributes: true,
      attributeFilter: ["data-sidegrok"],
    });
  }

  // Grok replaces history.pushState after this script. Wrap the page's
  // method once it has settled, so a leave from /bot/ can drop the bot tree.
  const nativePushState = history.pushState;
  const nativeReplaceState = history.replaceState;
  let pushUnderlying = nativePushState;
  let replaceUnderlying = nativeReplaceState;
  let inHistory = false;

  function historyMethodIsNative(fn) {
    try {
      return Function.prototype.toString.call(fn).indexOf("[native code]") !== -1;
    } catch (error) {
      return false;
    }
  }

  function runHistory(underlying, native, data, unused, url) {
    if (inHistory) {
      return native.call(history, data, unused, url);
    }
    inHistory = true;
    try {
      const leaving = !!botIdFromPath() && !botIdFromPathname(pathnameOf(url));
      const result = underlying.call(history, data, unused, url);
      if (leaving) {
        forgetBotRoute();
      }
      return result;
    } finally {
      inHistory = false;
    }
  }

  function wrappedPushState(data, unused, url) {
    return runHistory(pushUnderlying, nativePushState, data, unused, url);
  }

  function wrappedReplaceState(data, unused, url) {
    return runHistory(replaceUnderlying, nativeReplaceState, data, unused, url);
  }

  function methodSettled(current, wrapped, stable) {
    if (current === wrapped || historyMethodIsNative(current)) {
      stable.fn = null;
      return false;
    }
    if (current !== stable.fn) {
      stable.fn = current;
      stable.at = Date.now();
      return false;
    }
    return Date.now() - stable.at >= 400;
  }

  const pushStable = { fn: null, at: 0 };
  const replaceStable = { fn: null, at: 0 };
  let adoptedPush = false;
  let adoptedReplace = false;
  const historyWatchStarted = Date.now();
  const historyTimer = setInterval(function () {
    if (!adoptedPush && methodSettled(history.pushState, wrappedPushState, pushStable)) {
      pushUnderlying = history.pushState;
      history.pushState = wrappedPushState;
      adoptedPush = true;
    }
    if (!adoptedReplace && methodSettled(history.replaceState, wrappedReplaceState, replaceStable)) {
      replaceUnderlying = history.replaceState;
      history.replaceState = wrappedReplaceState;
      adoptedReplace = true;
    }
    if (adoptedPush && !adoptedReplace && historyMethodIsNative(history.replaceState)) {
      replaceUnderlying = history.replaceState;
      history.replaceState = wrappedReplaceState;
      adoptedReplace = true;
    }
    if ((adoptedPush && adoptedReplace) || Date.now() - historyWatchStarted > 30000) {
      clearInterval(historyTimer);
    }
  }, 100);
})();
