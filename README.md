# SideGrok

The built-in sidebar chatbot does not support Grok. This extension adds a sidebar button so you can open Grok directly, along with a bottom panel for quickly switching between bots.

Requires Firefox 142 or newer.

## Install

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Choose `manifest.json` in this folder.

A temporary add-on is removed when Firefox quits. Load it again after the next start.

If the button is missing from the sidebar launcher, turn it on under **Customize sidebar**.

## Behavior

Closing the sidebar unloads the page. Opening it again returns to the last page on grok.com. You stay signed in.

**Tip:** To toggle the drawer, use Opt+Cmd+A on macOS, or Ctrl+Alt+A on Windows and Linux. Turn it off under the extension’s Preferences in `about:addons`.

## License

The code is MIT. Grok and its mark are trademarks of SpaceXAI and are not covered by that license.
