// Grok's /bot/<id> route mounts an empty shell when the viewport is under
// the md breakpoint, 768px. The drawer is about 340px wide, so a full load
// of a bot page paints nothing and the picker has no roster to show.
// The desktop tree still shows the conversation after the drawer is narrowed,
// so script checks during that load are told the window is desktop-sized.
// CSS media queries are left alone.

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
})();
