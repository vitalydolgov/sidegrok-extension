// Choosing a bot full-loads /bot/<id> in the drawer. That route stays empty
// until the bot roster has loaded, and Grok starts that load only while its
// own sidebar is expanded. This script starts that load in the drawer, then
// reads the roster from the page and posts it to the picker.
//
// Firefox can hand this script an Xray wrapper of the page, which hides
// React's expando properties. wrappedJSObject is the page object. The roster
// is posted as a JSON string because an Xray wrapper of the array looks empty
// to the content script.

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
    publishRoster();
  }

  // The page walk can see the React fiber before any agent is mounted.
  // rosterLoaded is the store's own finished signal, including an empty list.
  let watched = false;

  function publishRoster() {
    const root = document.documentElement;
    if (!store || !root || root.dataset.sidegrok !== "sidebar") {
      return;
    }
    let state;
    try {
      state = store.getState();
    } catch (error) {
      return;
    }
    if (!state || state.rosterLoaded !== true || !Array.isArray(state.agents)) {
      return;
    }
    const bots = [];
    for (let index = 0; index < state.agents.length; index += 1) {
      const agent = state.agents[index];
      if (!agent || typeof agent.agentId !== "string" || typeof agent.name !== "string") {
        continue;
      }
      bots.push({
        id: agent.agentId,
        name: agent.name,
        hidden: agent.hiddenFromSidebar === true,
      });
    }
    try {
      window.postMessage(
        {
          source: "sidegrok-bots",
          payload: JSON.stringify({ bots: bots, settled: true }),
        },
        location.origin
      );
    } catch (error) {}
  }

  function watchRoster() {
    if (watched || typeof store.subscribe !== "function") {
      return;
    }
    watched = true;
    try {
      store.subscribe(publishRoster);
    } catch (error) {
      watched = false;
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
    watchRoster();
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

  function raw(value) {
    if (value == null || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    try {
      if (value.wrappedJSObject) {
        return value.wrappedJSObject;
      }
    } catch (error) {
      return value;
    }
    return value;
  }

  function isSidebar() {
    const root = raw(document.documentElement);
    return !!(root && root.dataset && root.dataset.sidegrok === "sidebar");
  }

  function reactKey(node) {
    const host = raw(node);
    if (!host) {
      return "";
    }
    const names = Object.getOwnPropertyNames(host);
    for (const name of names) {
      if (name.startsWith("__reactContainer$") || name.startsWith("__reactFiber$")) {
        return name;
      }
    }
    return "";
  }

  function agentsOf(value) {
    value = raw(value);
    if (!value || typeof value.length !== "number" || value.length === 0) {
      return null;
    }
    const bots = [];
    for (let index = 0; index < value.length; index += 1) {
      const agent = raw(value[index]);
      if (!agent || typeof agent !== "object") {
        continue;
      }
      if (typeof agent.agentId !== "string" || typeof agent.name !== "string") {
        continue;
      }
      bots.push({
        id: agent.agentId,
        name: agent.name,
        hidden: agent.hiddenFromSidebar === true,
      });
    }
    return bots.length ? bots : null;
  }

  function collectBots() {
    const doc = raw(document);
    const host = doc && raw(doc.body);
    const key = reactKey(host);
    if (!key) {
      return [];
    }
    let fiber = raw(host[key]);
    const stateNode = fiber && raw(fiber.stateNode);
    if (stateNode && stateNode.current) {
      fiber = raw(stateNode.current);
    }
    let best = [];
    const seen = new Set();
    const stack = fiber ? [fiber] : [];
    let steps = 0;
    while (stack.length && steps < 20000) {
      const node = raw(stack.pop());
      steps += 1;
      if (!node || seen.has(node)) {
        continue;
      }
      seen.add(node);
      if (node.child) {
        stack.push(node.child);
      }
      if (node.sibling) {
        stack.push(node.sibling);
      }
      let hook = node.memoizedState;
      let hops = 0;
      while (hook && hops < 80) {
        hops += 1;
        hook = raw(hook);
        const state = raw(hook.memoizedState);
        const found = agentsOf(state) || agentsOf(state && state.agents);
        if (found && found.length > best.length) {
          best = found;
        }
        hook = hook.next;
      }
    }
    return best;
  }

  function publish() {
    if (!isSidebar()) {
      return;
    }
    window.postMessage(
      {
        source: "sidegrok-bots",
        payload: JSON.stringify({ bots: collectBots() }),
      },
      location.origin
    );
  }

  let timer = 0;

  function syncWatch() {
    if (!isSidebar()) {
      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
      return;
    }
    if (!timer) {
      timer = setInterval(publish, 1500);
    }
    publish();
  }

  function onSidebar() {
    boot();
    syncWatch();
  }

  const root = document.documentElement;
  if (root) {
    new MutationObserver(onSidebar).observe(root, {
      attributes: true,
      attributeFilter: ["data-sidegrok"],
    });
  }
  document.addEventListener("DOMContentLoaded", onSidebar);
  onSidebar();
})();
