// The picker runs outside the page, so it cannot call Grok's router.
// A full load of /bot/<id> drops the roster, the thread request fails, and
// Grok shows "Couldn't load this bot's thread" before recovering.
// router.push keeps the roster and loads the thread once.

(function () {
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

  function open(href) {
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
})();
