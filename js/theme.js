// Colour schemes and light/dark mode. The choices are stored on this device
// (so the page opens in the right colours straight away) and in the profile
// (so they sync to the student's other devices).
(function (root) {
  "use strict";

  const KEY = "qsc.theme", MODE_KEY = "qsc.mode";
  const THEMES = [
    { id: "classic", label: "Classic", swatch: "#355E56" },
    { id: "queens", label: "Queen's", swatch: "#14325C" },
    { id: "lake", label: "Lake", swatch: "#2B6A8F" },
    { id: "blossom", label: "Blossom", swatch: "#9A3E62" },
    { id: "lavender", label: "Lavender", swatch: "#5B4B9A" },
  ];
  const MODES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
  const valid = (id) => THEMES.some((t) => t.id === id);
  const validMode = (m) => MODES.some(([id]) => id === m);
  const read = (k, ok, dflt) => { try { const v = localStorage.getItem(k); return ok(v) ? v : dflt; } catch (e) { return dflt; } };

  const current = () => read(KEY, valid, "classic");
  const mode = () => read(MODE_KEY, validMode, "auto");

  function setAttr(name, value, dflt) {
    if (value === dflt) document.documentElement.removeAttribute(name);
    else document.documentElement.setAttribute(name, value);
  }

  // Match the phone's status bar to the page background.
  function syncBar() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#F7F4EE");
  }

  function apply(id, m) {
    if (!valid(id)) id = "classic";
    if (!validMode(m)) m = mode();
    setAttr("data-theme", id, "classic");
    setAttr("data-mode", m, "auto");
    try { localStorage.setItem(KEY, id); localStorage.setItem(MODE_KEY, m); } catch (e) {}
    syncBar();
  }

  function pickerHTML() {
    const cur = current(), m = mode();
    return `<p class="theme-label">Colours</p>
      <div class="themes" role="radiogroup" aria-label="Colour scheme">${THEMES.map((t) => `
        <button type="button" class="theme-btn ${t.id === cur ? "on" : ""}" role="radio" aria-checked="${t.id === cur}" data-theme-pick="${t.id}">
          <span class="theme-sw" style="background:${t.swatch}"></span>${t.label}</button>`).join("")}</div>
      <div class="mode-row"><div class="modes" role="radiogroup" aria-label="Light or dark">${MODES.map(([id, label]) => `
        <button type="button" class="mode-btn ${id === m ? "on" : ""}" role="radio" aria-checked="${id === m}" data-mode-pick="${id}"${id === "auto" ? ' title="Follow your device setting"' : ""}>${label}</button>`).join("")}</div></div>`;
  }

  // Auto mode follows the device; keep the status bar colour right when it flips.
  if (root.matchMedia) root.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncBar);

  root.Theme = { THEMES, current, mode, apply, pickerHTML, valid, validMode };
  apply(current(), mode());
})(window);
