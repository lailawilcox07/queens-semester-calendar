// Turning push reminders on and off for this device. The reminders themselves
// are sent by the server (supabase/functions/reminders), using the rules in
// js/reminders.js and the student's synced semester.
(function (root) {
  "use strict";

  const cfg = () => root.APP_CONFIG || {};

  const supported = () => "Notification" in root && "serviceWorker" in navigator && "PushManager" in root;
  // iPhones only allow reminders for apps added to the home screen.
  const needsInstall = () => root.Install && Install.platform() === "ios" && !Install.installed();
  const available = () => root.Sync && Sync.enabled() && !!cfg().vapidPublicKey;
  const permission = () => (supported() ? Notification.permission : "unsupported");

  function keyBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function currentSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function enable() {
    if (!supported()) throw new Error(needsInstall() ? "Add the app to your home screen first." : "This browser can't show reminders.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications are blocked. Allow them for this site in your browser or phone settings, then try again.");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg().vapidPublicKey) }));
    const j = sub.toJSON();
    const { error } = await Sync.client().from("push_subscriptions").upsert(
      { user_id: Sync.user().id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error("Couldn't turn on reminders. Please try again.");
  }

  async function disable() {
    const sub = await currentSub();
    if (!sub) return;
    if (Sync.client()) await Sync.client().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }

  async function test() {
    const token = await Sync.accessToken();
    const res = await fetch(cfg().supabaseUrl.replace(/\/$/, "") + "/functions/v1/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg().supabaseKey, Authorization: "Bearer " + token },
      body: JSON.stringify({ test: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) throw new Error("The test didn't reach this device. Try turning reminders off and on again.");
  }

  root.Push = { supported, needsInstall, available, permission, currentSub, enable, disable, test };
})(window);
