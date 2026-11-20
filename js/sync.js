// Accounts and sync. Students sign in with their Queen's email (a 6-digit
// code is emailed to them, no password) and their whole profile is saved to
// Supabase, so a laptop and a phone stay in step. Signing in is optional: the
// app works fully on one device without it.
(function (root) {
  "use strict";

  const cfg = () => root.APP_CONFIG || {};
  const enabled = () => !!(cfg().supabaseUrl && cfg().supabaseKey);
  const domain = () => cfg().emailDomain || "queensu.ca";
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let sb = null;
  let user = null;
  let status = "off"; // off | signed-out | syncing | synced | offline | error
  let lastSync = 0;
  let pushTimer = null;
  let hooks = null; // { getProfile, replace(profile), clearLocal(), rerender() }
  const panel = { open: false, step: "email", email: "", error: "", busy: false, remote: null, confirmOut: false };

  function loadLib() {
    if (root.supabase && root.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = cfg().supabaseLib || LIB;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load sign-in."));
      document.head.appendChild(s);
    });
  }

  // Nothing worth keeping on this device: no setup yet, or just the demo.
  const isEmpty = (P) => (!P.setupComplete && !P.courses.length) || !!(P.meta && P.meta.demo);
  const describe = (P) => P && P.term ? `${P.term.label || "A term"} · ${P.courses.length} course${P.courses.length === 1 ? "" : "s"}` : "Nothing saved";
  const ago = (ms) => {
    if (!ms) return "never";
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  };

  async function init(h) {
    hooks = h;
    if (!enabled()) return;
    status = "signed-out";
    try {
      await loadLib();
      sb = root.supabase.createClient(cfg().supabaseUrl, cfg().supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      const { data } = await sb.auth.getSession();
      // Opened from the laptop's QR code: sign in with its one-time code.
      const params = new URLSearchParams(location.search);
      const hash = params.get("signin");
      if (hash) {
        params.delete("signin");
        history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
        await signInWithHash(hash, data && data.session);
      } else if (data && data.session) { user = data.session.user; await pull(); }
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") { user = null; status = "signed-out"; hooks.rerender(); }
        else if (session) user = session.user;
      });
    } catch (e) {
      status = "error";
    }
    // Pick up changes made on another device when coming back to this one.
    document.addEventListener("visibilitychange", () => { if (!document.hidden && user) pull(); });
    window.addEventListener("online", () => { if (user) push(); });
    hooks.rerender();
  }

  // Just the time the account copy last changed: a tiny request, so checking
  // often (every time the app comes to the front) costs almost nothing.
  async function remoteTime() {
    const { data, error } = await sb.from("student_data").select("updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data ? data.updated_at : null;
  }
  const sameTime = (a, b) => !!a && !!b && Date.parse(a) === Date.parse(b);

  async function fetchRemote() {
    const { data, error } = await sb.from("student_data").select("data, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  // Bring this device and the account into line. Newest change wins.
  async function pull() {
    if (!user) return;
    setStatus("syncing");
    try {
      const P = hooks.getProfile();
      const linked = P.meta && P.meta.userId === user.id;
      // Nothing changed in the account since this device last synced: only send local changes, if any.
      if (linked && sameTime(await remoteTime(), P.meta.remoteAt)) {
        if ((P.meta.updatedAt || 0) > (P.meta.pushedAt || 0)) await push();
        lastSync = Date.now();
        if (status === "syncing") status = "synced";
        hooks.rerender();
        return;
      }
      const row = await fetchRemote();
      if (!row) {
        await push();
      } else if (!linked) {
        // First sign-in on this device.
        if (isEmpty(P)) take(row);
        else { panel.open = true; panel.step = "choose"; panel.remote = row; }
      } else {
        const remoteStamp = (row.data.meta || {}).updatedAt || 0, localTime = (P.meta || {}).updatedAt || 0;
        if (remoteStamp > localTime) take(row);
        else if (localTime > remoteTime) await push();
      }
      lastSync = Date.now();
      if (status === "syncing") status = "synced";
    } catch (e) {
      status = navigator.onLine ? "error" : "offline";
    }
    hooks.rerender();
  }

  function take(row) {
    const data = row.data;
    data.meta = Object.assign({}, data.meta, { userId: user.id, remoteAt: row.updated_at, pushedAt: (data.meta || {}).updatedAt || 0 });
    hooks.replace(data);
  }

  async function push() {
    if (!user || !sb) return;
    clearTimeout(pushTimer);
    const P = hooks.getProfile();
    if (P.meta && P.meta.demo) return; // never save the demo to an account
    const stamp = new Date().toISOString();
    const sentAt = (P.meta || {}).updatedAt || 0;
    P.meta = Object.assign({}, P.meta, { userId: user.id });
    setStatus("syncing");
    try {
      const { error } = await sb.from("student_data").upsert({ user_id: user.id, data: P, updated_at: stamp });
      if (error) throw error;
      // Remember what the account now holds, so the next check can be a tiny one.
      P.meta.remoteAt = stamp;
      P.meta.pushedAt = sentAt;
      if (root.Store) root.Store.saveNow(P, { keepTime: true });
      lastSync = Date.now();
      setStatus("synced");
    } catch (e) {
      setStatus(navigator.onLine ? "error" : "offline");
    }
  }

  // Called after every local save; waits for a pause in typing before uploading.
  function schedulePush() {
    if (!user || panel.step === "choose" && panel.open) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  // Update the header chip in place, without redrawing the page.
  function setStatus(s) {
    status = s;
    const el = document.getElementById("account");
    if (el) el.innerHTML = chipHTML();
  }

  function chipHTML() {
    if (!enabled()) return "";
    if (!user) return `<button type="button" class="acct-btn" data-s="open">Sign in to sync</button>`;
    const label = { syncing: "Saving…", synced: "Synced", offline: "Offline", error: "Not synced" }[status] || "Synced";
    return `<button type="button" class="acct-btn signed st-${status}" data-s="open" aria-label="Account: ${esc(user.email)}, ${label}"><span class="acct-dot"></span>${label}</button>`;
  }

  function panelHTML() {
    if (!enabled() || !panel.open) return "";
    const err = panel.error ? `<p class="field-error">${esc(panel.error)}</p>` : "";
    let body = "";
    if (panel.step === "choose") {
      const P = hooks.getProfile();
      const remote = panel.remote.data;
      body = `
        <h3>Which semester should we keep?</h3>
        <p class="muted small">Your account already has a semester saved, and so does this device.</p>
        <div class="choices">
          <button type="button" class="choice" data-s="keep-remote"><span class="choice-title">Use my account's</span><span class="choice-sub">${esc(describe(remote))} · saved ${esc(ago((remote.meta || {}).updatedAt))}</span></button>
          <button type="button" class="choice" data-s="keep-local"><span class="choice-title">Use this device's</span><span class="choice-sub">${esc(describe(P))} · replaces what's in your account</span></button>
        </div>`;
    } else if (user) {
      body = `
        <h3>Your account</h3>
        <p><b>${esc(user.email)}</b></p>
        <p class="muted small">${status === "synced" ? `Synced ${esc(ago(lastSync))}.` : status === "offline" ? "You're offline. Changes will sync when you're back online." : status === "error" ? "Couldn't sync just now. We'll keep trying." : "Saving…"} Open the app on any device and sign in with this email to see your semester there.</p>
        ${panel.confirmOut
          ? `<p class="small">Signing out removes your semester from this device. It stays saved in your account.</p>
             <div class="add-row"><button type="button" class="btn danger small" data-s="signout-yes">Sign out</button><button type="button" class="btn small ghost" data-s="signout-no">Cancel</button></div>`
          : `<div class="add-row"><button type="button" class="btn small" data-s="sync-now">Sync now</button><button type="button" class="btn small ghost" data-s="signout">Sign out</button><button type="button" class="btn small ghost" data-s="close">Close</button></div>`}`;
    } else if (panel.step === "code") {
      body = `
        <h3>Check your email</h3>
        <p class="muted small">We sent a 6-digit code to <b>${esc(panel.email)}</b>. It can take a minute, so check your junk folder too.</p>
        <form data-s-form="code" class="acct-form" autocomplete="off">
          <input id="acctCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456" aria-label="6-digit code" required>
          <button type="submit" class="btn primary small" ${panel.busy ? "disabled" : ""}>${panel.busy ? "Checking…" : "Sign in"}</button>
        </form>${err}
        <div class="add-row"><button type="button" class="link-btn" data-s="back">Use a different email</button><button type="button" class="link-btn" data-s="resend">Send a new code</button></div>`;
    } else {
      body = `
        <h3>Sign in to sync</h3>
        <p class="muted small">Use your Queen's email to keep your semester on your laptop and phone. No password: we'll email you a code.</p>
        <form data-s-form="email" class="acct-form">
          <input id="acctEmail" type="email" autocomplete="email" placeholder="you@${esc(domain())}" value="${esc(panel.email)}" aria-label="Queen's email" required>
          <button type="submit" class="btn primary small" ${panel.busy ? "disabled" : ""}>${panel.busy ? "Sending…" : "Send code"}</button>
        </form>${err}
        <button type="button" class="link-btn muted" data-s="close">Not now</button>`;
    }
    return `<div class="card acct-panel" role="region" aria-label="Account">${body}</div>`;
  }

  function open() { panel.open = true; panel.error = ""; hooks.rerender(); }

  async function sendCode(email) {
    email = email.trim().toLowerCase();
    if (!new RegExp("@" + domain().replace(/\./g, "\\.") + "$").test(email)) {
      panel.error = `Use your Queen's email (@${domain()}).`;
      return;
    }
    panel.email = email; panel.busy = true; panel.error = ""; hooks.rerender();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    panel.busy = false;
    if (error) panel.error = error.message && /rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another code." : "Couldn't send the code. Check the address and try again.";
    else panel.step = "code";
  }

  async function verify(code) {
    panel.busy = true; panel.error = ""; hooks.rerender();
    const { data, error } = await sb.auth.verifyOtp({ email: panel.email, token: code.trim(), type: "email" });
    panel.busy = false;
    if (error || !data || !data.user) { panel.error = "That code didn't work. Check it, or send a new one."; return; }
    user = data.user;
    panel.open = false; panel.step = "email";
    await pull();
  }

  // Click and submit handling for anything with data-s / data-s-form.
  async function handle(e) {
    if (e.type === "submit") {
      const f = e.target.closest("[data-s-form]");
      if (!f) return false;
      e.preventDefault();
      if (f.dataset.sForm === "email") await sendCode(document.getElementById("acctEmail").value);
      else await verify(document.getElementById("acctCode").value);
      hooks.rerender();
      if (panel.step === "code" && !panel.error) { const c = document.getElementById("acctCode"); if (c) c.focus(); }
      return true;
    }
    const el = e.target.closest("[data-s]");
    if (!el) return false;
    switch (el.dataset.s) {
      case "open": panel.open = !panel.open; panel.error = ""; panel.confirmOut = false; break;
      case "close": panel.open = false; break;
      case "back": panel.step = "email"; panel.error = ""; break;
      case "resend": await sendCode(panel.email); break;
      case "sync-now": await pull(); break;
      case "signout": panel.confirmOut = true; break;
      case "signout-no": panel.confirmOut = false; break;
      case "signout-yes":
        clearTimeout(pushTimer);
        await push();
        await sb.auth.signOut();
        user = null; status = "signed-out"; panel.open = false; panel.confirmOut = false;
        hooks.clearLocal();
        break;
      case "keep-remote": panel.open = false; take(panel.remote); panel.remote = null; lastSync = Date.now(); status = "synced"; break;
      case "keep-local": panel.open = false; panel.remote = null; await push(); break;
      default: return false;
    }
    hooks.rerender();
    if (panel.open && panel.step === "email" && !user) { const i = document.getElementById("acctEmail"); if (i && !i.value) i.focus(); }
    return true;
  }

  async function signInWithHash(hash, existing) {
    const { data, error } = await sb.auth.verifyOtp({ token_hash: hash, type: "email" });
    if (error || !data || !data.user) {
      if (existing) { user = existing.user; await pull(); return; }
      panel.open = true; panel.step = "email";
      panel.error = "That QR code has expired or was already used. Sign in with your email instead.";
      return;
    }
    user = data.user;
    await pull();
  }

  // A one-time sign-in code for the QR code on the laptop (see phone-link function).
  async function phoneLink() {
    const token = await accessToken();
    if (!token) return null;
    try {
      const res = await fetch(cfg().supabaseUrl.replace(/\/$/, "") + "/functions/v1/phone-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg().supabaseKey, Authorization: "Bearer " + token },
        body: "{}",
      });
      const body = await res.json();
      return body && body.ok ? body.hash : null;
    } catch (e) {
      return null;
    }
  }

  async function accessToken() {
    if (!sb || !user) return null;
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  root.Sync = {
    enabled, init, handle, chipHTML, panelHTML, schedulePush, accessToken, open, phoneLink,
    user: () => user,
    client: () => sb,
  };
})(window);
