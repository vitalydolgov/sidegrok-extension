const status = document.getElementById("status");
const openTab = document.getElementById("open-tab");

// Shown only until the background (or this page) points the sidebar at the
// last Grok page. Once that navigation starts, this document is replaced.
async function openSavedPanel() {
  let panel = GROK_HOME;
  let saved = GROK_HOME;
  try {
    const stored = await browser.storage.local.get(PANEL_URL_KEY);
    saved = grokPanelUrl(stored[PANEL_URL_KEY]) || GROK_HOME;
    panel = grokPanelLoadUrl(saved) || saved;
    openTab.href = saved;
    await browser.sidebarAction.setPanel({ panel });
  } catch (error) {
    console.error(error);
    status.textContent = "Grok could not open in the sidebar.";
    openTab.hidden = false;
    openTab.href = saved;
    openTab.addEventListener("click", (event) => {
      event.preventDefault();
      browser.tabs.create({ url: openTab.href || GROK_HOME });
    });
  }
}

openSavedPanel();
