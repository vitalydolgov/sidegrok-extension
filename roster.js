// Grok starts the roster only while its own sidebar is expanded. This script
// starts that load in the drawer, then reads the roster and posts it to the picker.
//
// Firefox can hand this script an Xray wrapper of the page, which hides
// React's expando properties. wrappedJSObject is the page object. The roster
// is posted as a JSON string because an Xray wrapper of the array looks empty
// to the content script.

(function () {
  const marker = 'name:"useBotsStore"';
  const SIDEBAR_KEY = "sidegrok-sidebar";
  let store = null;
  let started = false;

  // The previous sidebar document set this. Marking the page before Grok
  // boots lets bootstrap run as soon as the store chunk loads.
  try {
    if (sessionStorage.getItem(SIDEBAR_KEY) === "1" && document.documentElement) {
      document.documentElement.dataset.sidegrok = "sidebar";
    }
  } catch (error) {}

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
    // Opening the drawer waits for this before moving to a saved bot thread.
    root.dataset.sidegrokRoster = "ready";
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
    // Pins and named sections are store fields, not fields on each agent.
    // __agents__ is the unassigned bucket; its members are whoever is left.
    try {
      window.postMessage(
        {
          source: "sidegrok-bots",
          payload: JSON.stringify({
            bots: bots,
            pinned: copyIds(state.pinnedAgentIds),
            sections: copySections(state.sidebarSections),
            settled: true,
          }),
        },
        location.origin
      );
    } catch (error) {}
  }

  function copyIds(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const ids = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const id = value[index];
      if (typeof id !== "string" || !id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function copySections(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const sections = [];
    const seenIds = new Set();
    const seenAgents = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const section = value[index];
      if (!section || typeof section.id !== "string") {
        continue;
      }
      const id = section.id.trim();
      if (!id || id === "__agents__" || seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      const agentIds = [];
      const rawIds = Array.isArray(section.agentIds) ? section.agentIds : [];
      for (let agentIndex = 0; agentIndex < rawIds.length; agentIndex += 1) {
        const agentId = rawIds[agentIndex];
        if (typeof agentId !== "string" || !agentId || seenAgents.has(agentId)) {
          continue;
        }
        seenAgents.add(agentId);
        agentIds.push(agentId);
      }
      sections.push({
        id: id,
        name: typeof section.name === "string" ? section.name : "",
        agentIds: agentIds,
      });
    }
    return sections;
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

  // The chunk is still tagged name:"useBotsStore". The export name is minified,
  // so the store is whichever export has bootstrap and the agent list.
  function remember(exports) {
    if (store || !exports || (typeof exports !== "object" && typeof exports !== "function")) {
      return;
    }
    let names;
    try {
      names = Object.keys(exports);
    } catch (error) {
      return;
    }
    try {
      if (exports.useBotsStore) {
        names.unshift("useBotsStore");
      }
    } catch (error) {}
    for (let index = 0; index < names.length; index += 1) {
      let found;
      try {
        found = exports[names[index]];
      } catch (error) {
        continue;
      }
      if (!found || typeof found.getState !== "function") {
        continue;
      }
      let state;
      try {
        state = found.getState();
      } catch (error) {
        continue;
      }
      if (!state || typeof state.bootstrap !== "function" || !Array.isArray(state.agents)) {
        continue;
      }
      store = found;
      watchRoster();
      return;
    }
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
