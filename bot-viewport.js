// A full load of /bot/<id> paints an empty shell in the drawer.
// The route's script checks follow the md breakpoint, 768px, and the drawer
// is about 340px wide. The page also stays blank until the bot roster has
// loaded, and that load starts only while Grok's own sidebar is expanded.
// The drawer keeps that sidebar collapsed. Script checks during this load
// are told the window is desktop-sized and the sidebar is expanded. The
// saved collapsed value is left in storage. CSS media queries are left alone,
// and the offset style hides Grok's sidebar column.

(function () {
  if (!/^\/bot\//i.test(location.pathname || "")) {
    return;
  }
  let width = 0;
  try {
    width = window.innerWidth;
  } catch (error) {
    return;
  }
  if (width >= 768) {
    return;
  }
  const desktop = 960;
  const realMatch = window.matchMedia.bind(window);

  function forced(query) {
    const text = String(query);
    const mins = [...text.matchAll(/(?:min-width:\s*|width\s*>=\s*)(\d+(?:\.\d+)?)px/g)].map(function (match) {
      return Number(match[1]);
    });
    const maxs = [...text.matchAll(/(?:max-width:\s*|width\s*<=\s*)(\d+(?:\.\d+)?)px/g)].map(function (match) {
      return Number(match[1]);
    });
    if (!mins.length && !maxs.length) {
      return null;
    }
    if (mins.some(function (value) { return value > desktop; })) {
      return false;
    }
    if (maxs.some(function (value) { return value < desktop; })) {
      return false;
    }
    return true;
  }

  try {
    window.matchMedia = function (query) {
      const matches = forced(query);
      const media = realMatch(query);
      if (matches === null) {
        return media;
      }
      return new Proxy(media, {
        get: function (target, prop) {
          if (prop === "matches") {
            return matches;
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    };
  } catch (error) {}

  try {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: function () {
        return desktop;
      },
    });
  } catch (error) {}

  // Firefox ignores an own-property replacement of localStorage.getItem.
  // The prototype is shared with sessionStorage, so only this document's
  // localStorage is answered.
  try {
    const storage = window.localStorage;
    const realGetItem = Storage.prototype.getItem;
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === storage && key === "sidebarOpen") {
        return "true";
      }
      return realGetItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === storage && key === "sidebarOpen") {
        return;
      }
      return realSetItem.call(this, key, value);
    };
  } catch (error) {}
})();
