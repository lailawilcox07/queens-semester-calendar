// "Add to your phone" guide. Works out which phone and browser the student is
// on and shows the matching steps; on a laptop it shows a QR code to open the
// site on their phone.
(function (root) {
  "use strict";

  const KEY = "qsc.install.v1";
  const SITE = "https://lailawilcox07.github.io/queens-semester-calendar/";
  let deferred = null; // Android/desktop Chrome's install prompt, when offered
  let open = false;
  let state = { dismissed: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  root.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (root.Install && Install.onChange) Install.onChange();
  });
  root.addEventListener("appinstalled", () => { deferred = null; state.dismissed = true; save(); if (Install.onChange) Install.onChange(); });

  function installed() {
    return (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || root.navigator.standalone === true;
  }

  function platform() {
    const ua = navigator.userAgent || "";
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    if (/iPhone|iPod|iPad/.test(ua) || iPadOS) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  // Small drawings of the buttons students need to find.
  const ICON = {
    share: `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    more: `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
    dots: `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`,
    add: `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

  function steps(p) {
    if (p === "ios") {
      const notSafari = /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
      return `
        <ol class="guide-steps">
          ${notSafari ? `<li><span>For the best result, open this page in <b>Safari</b>.</span></li>` : ""}
          <li>${ICON.more}<span>Tap <b>⋯</b> next to the address bar, then <b>Share</b>. <span class="muted">On older iPhones, tap the Share button ${ICON.share} at the bottom of the screen.</span></span></li>
          <li>${ICON.add}<span>Scroll down and tap <b>Add to Home Screen</b>. You may need to tap <b>View More</b> first.</span></li>
          <li><span>Leave <b>Open as Web App</b> turned on, then tap <b>Add</b>.</span></li>
        </ol>`;
    }
    if (p === "android") {
      return deferred
        ? `<p>Tap the button below, then <b>Install</b>.</p><button type="button" class="btn primary" data-i="prompt">Install the app</button>`
        : `<ol class="guide-steps">
            <li>${ICON.dots}<span>In Chrome, tap the <b>⋮</b> menu at the top right.</span></li>
            <li>${ICON.add}<span>Tap <b>Add to Home screen</b> (or <b>Install app</b>).</span></li>
            <li><span>Tap <b>Install</b>.</span></li>
          </ol>`;
    }
    return `
      <div class="guide-desktop">
        <img src="assets/qr-site.svg" alt="QR code linking to ${SITE}" width="132" height="132">
        <div>
          <p><b>Scan this with your phone's camera</b> to open Semester Calendar there.</p>
          <p class="muted small">${!(root.Sync && Sync.enabled()) ? "Your semester is saved on this device only for now, so you'd set it up again on your phone." : Sync.user() ? "Sign in with the same email on your phone and your semester will be there." : "Sign in on both devices to have the same semester on each."} Then follow the steps on your phone to add it to your home screen.</p>
          ${deferred ? `<p class="small">You can also add it to this computer: <button type="button" class="link-btn" data-i="prompt">Install on this computer</button></p>` : ""}
        </div>
      </div>`;
  }

  // The card shown at the top of the app, and from the "Add to your phone" link.
  function cardHTML() {
    if (installed()) return "";
    if (!open && state.dismissed) return "";
    const p = platform();
    if (!open) {
      return `<div class="card guide-teaser">
        <img src="assets/logo-128.png" alt="" width="40" height="40">
        <div class="guide-teaser-text"><b>${p === "desktop" ? "Put it on your phone" : "Add it to your home screen"}</b><span class="muted small">Open it like an app, even offline.</span></div>
        <button type="button" class="btn small primary" data-i="open">Show me how</button>
        <button type="button" class="icon-btn" data-i="dismiss" aria-label="Hide this">×</button>
      </div>`;
    }
    return `<div class="card guide" role="region" aria-label="Add to your phone">
      <div class="sum-head"><h3>${p === "ios" ? "Add to your iPhone" : p === "android" ? "Add to your phone" : "Put it on your phone"}</h3><button type="button" class="icon-btn" data-i="close" aria-label="Close">×</button></div>
      ${steps(p)}
      <p class="muted small">It'll appear on your home screen with the Semester Calendar icon and open full screen, like any other app.</p>
    </div>`;
  }

  function linkHTML() {
    return installed() ? "" : `<button type="button" class="link-btn muted" data-i="open">Add to your phone</button>`;
  }

  async function handle(e) {
    const el = e.target.closest("[data-i]");
    if (!el) return false;
    switch (el.dataset.i) {
      case "open": open = true; break;
      case "close": open = false; state.dismissed = true; save(); break;
      case "dismiss": state.dismissed = true; save(); break;
      case "prompt":
        if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r && r.outcome === "accepted") { open = false; state.dismissed = true; save(); } }
        break;
      default: return false;
    }
    if (Install.onChange) Install.onChange();
    if (open) { const g = document.querySelector(".guide"); if (g) g.scrollIntoView({ block: "nearest" }); }
    return true;
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    root.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  root.Install = { cardHTML, linkHTML, handle, installed, platform, onChange: null };
})(window);
