// Drawer colors for the panel and the picker.
// The light set follows Grok's light mode.

var themeColors = {
  dark: {
    "background": "#171716",
    "text": "#f5f5f5",
    "muted-text": "#8d8d8a",
    "border": "#333",
    "hover-background": "#2a2a2a",
    "input-background": "#262623",
    "input-border": "transparent",
  },
  light: {
    "background": "#f4f1f0",
    "text": "#171717",
    "muted-text": "#736e6b",
    "border": "#e4dfdd",
    "hover-background": "#e7e2e0",
    "input-background": "#fffeff",
    "input-border": "#e5e5e5",
  },
};

var themeElement = null;
var themeWatch = null;

function themeScheme() {
  const root = document.documentElement;
  if (!root) {
    return "dark";
  }
  // Grok keeps scheme-light in the class list and adds dark for its dark theme.
  if (root.classList.contains("dark")) {
    return "dark";
  }
  if (root.classList.contains("scheme-light") || root.style.colorScheme === "light") {
    return "light";
  }
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch (error) {}
  return "dark";
}

function applyTheme(element) {
  if (!element) {
    return;
  }
  const scheme = themeScheme();
  const colors = themeColors[scheme] || themeColors.dark;
  element.dataset.scheme = scheme;
  element.style.colorScheme = scheme;
  for (const name in colors) {
    element.style.setProperty("--" + name, colors[name]);
  }
}

function watchTheme(element) {
  themeElement = element;
  applyTheme(element);
  if (themeWatch || !document.documentElement) {
    return;
  }
  themeWatch = new MutationObserver(function () {
    applyTheme(themeElement);
  });
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  try {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      applyTheme(themeElement);
    });
  } catch (error) {}
}
