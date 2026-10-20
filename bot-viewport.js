// Choosing a bot full-loads /bot/<id> in the drawer. That route stays empty
// until the bot roster has loaded, and Grok starts that load only while its
// own sidebar is expanded. The drawer does not change that sidebar, the
// viewport, or stored sidebar state: those stay as they are on main. This
// script only starts the roster load, and only in the drawer.

(function () {
  const marker = 'name:"useBotsStore"';
  let store = null;
  let started = false;

  function boot() {
    if (started || !store) {
      return;
    }
    const root = document.documentElement;
    if (!root || root.dataset.sidegrok !== "sidebar") {
      return;
    }
    started = true;
    try {
      store.getState().bootstrap();
    } catch (error) {
      started = false;
    }
  }

  function remember(exports) {
    if (store || !exports || (typeof exports !== "object" && typeof exports !== "function")) {
      return;
    }
    let found;
    try {
      found = exports.useBotsStore;
    } catch (error) {
      return;
    }
    if (!found || typeof found.getState !== "function") {
      return;
    }
    let state;
    try {
      state = found.getState();
    } catch (error) {
      return;
    }
    if (!state || typeof state.bootstrap !== "function") {
      return;
    }
    store = found;
  }

  function wrap(factory) {
    return function (context) {
      const result = factory.apply(this, arguments);
      try {
        remember(context && context.e);
        if (!store && context && context.m) {
          remember(context.m.exports);
          remember(context.m.namespaceObject);
        }
      } catch (error) {}
      boot();
      return result;
    };
  }

  function scan(chunk) {
    if (!Array.isArray(chunk)) {
      return;
    }
    for (let index = 0; index < chunk.length; index += 1) {
      const value = chunk[index];
      if (typeof value !== "function") {
        continue;
      }
      let source = "";
      try {
        source = Function.prototype.toString.call(value);
      } catch (error) {
        continue;
      }
      if (source.indexOf(marker) === -1) {
        continue;
      }
      const wrapped = wrap(value);
      chunk[index] = wrapped;
    }
  }

  // The runtime bails unless TURBOPACK is still an array, then replaces it
  // with {push}. Chunks that arrived first are scanned by the array push.
  // Later chunks are scanned by the replacement push.
  let current = globalThis.TURBOPACK;
  if (!Array.isArray(current)) {
    current = [];
  }
  const realPush = Array.prototype.push;
  function scanningPush(chunk) {
    scan(chunk);
    return realPush.call(current, chunk);
  }
  current.push = scanningPush;

  try {
    Object.defineProperty(globalThis, "TURBOPACK", {
      configurable: true,
      enumerable: true,
      get: function () {
        return current;
      },
      set: function (value) {
        if (value && typeof value.push === "function" && !value.push.__sidegrok) {
          const inner = value.push;
          const wrapped = function (chunk) {
            scan(chunk);
            return inner.apply(this, arguments);
          };
          wrapped.__sidegrok = true;
          try {
            value.push = wrapped;
          } catch (error) {}
        }
        current = value;
      },
    });
  } catch (error) {
    globalThis.TURBOPACK = current;
  }

  const root = document.documentElement;
  if (root) {
    new MutationObserver(boot).observe(root, {
      attributes: true,
      attributeFilter: ["data-sidegrok"],
    });
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
