// Page world. Reads the in-memory bot roster and hands it to the isolated
// content script, which owns the panel. Grok's React tree drops nodes
// mounted inside its header.
//
// Firefox can hand this script an Xray wrapper of the page, which hides
// React's expando properties. wrappedJSObject is the page object. The roster
// is posted as a JSON string because an Xray wrapper of the array looks empty
// to the content script.

(function () {
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

  const mark = new MutationObserver(syncWatch);
  mark.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-sidegrok"],
  });
  syncWatch();
})();
