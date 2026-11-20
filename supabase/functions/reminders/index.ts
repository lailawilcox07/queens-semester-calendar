// Supabase Edge Function: sends push reminders.
//
// - Every 5 minutes a scheduled job calls it with the x-cron-secret header.
//   It works out each student's reminders for today (using the same rules as
//   the app, in _shared/reminders.js) and sends the ones due in the next 5 minutes.
// - A signed-in student can call it with {"test": true} to get a test notification.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, originAllowed, validApiKey } from "../_shared/http.ts";
import "../_shared/engine.js";
import "../_shared/reminders.js";

const Engine = (globalThis as any).Engine;
const Reminders = (globalThis as any).Reminders;
const TZ = "America/Toronto";
const WINDOW = 5; // minutes, matching the schedule

function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return (Array.isArray(keys) ? keys[0] : Object.values(keys)[0]) as string;
  } catch {
    return "";
  }
}

// Today's date and the minutes since midnight in Kingston.
export function torontoNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "", VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:semester-calendar@example.com", VAPID_PUBLIC, VAPID_PRIVATE);
else console.log("VAPID keys are not set; reminders can't be sent.");

export async function sendTo(admin: any, sub: any, payload: unknown) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 15 * 60 });
    return true;
  } catch (e: any) {
    // The browser unsubscribed or the app was removed: forget this device.
    if (e && (e.statusCode === 404 || e.statusCode === 410)) await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    else console.log("push failed", e && e.statusCode, e && (e.body || e.message));
    return false;
  }
}

export async function runSchedule(admin: any, now = torontoNow()) {
  const { data: subs } = await admin.from("push_subscriptions").select("user_id, endpoint, p256dh, auth");
  if (!subs || !subs.length) return { users: 0, sent: 0 };
  const byUser = new Map<string, any[]>();
  subs.forEach((s: any) => byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]));
  const { data: rows } = await admin.from("student_data").select("user_id, data").in("user_id", [...byUser.keys()]);
  let sent = 0;
  for (const row of rows || []) {
    const P = row.data;
    if (!P || !P.setupComplete || !Reminders.settings(P).enabled) continue;
    let due: any[] = [];
    try {
      const eng = Engine.create(P, { today: now.iso });
      due = Reminders.forDay(P, eng, now.iso).filter((r: any) => r.at >= now.min && r.at < now.min + WINDOW);
    } catch (e) {
      console.log("couldn't plan for", row.user_id, String(e));
      continue;
    }
    for (const r of due) {
      // Claim it first, so a retry or overlapping run can't send it twice.
      const { error } = await admin.from("reminder_log").insert({ user_id: row.user_id, day: now.iso, key: r.key });
      if (error) continue;
      for (const sub of byUser.get(row.user_id) || []) if (await sendTo(admin, sub, { title: r.title, body: r.body, url: r.url, tag: r.key })) sent++;
    }
  }
  return { users: byUser.size, sent };
}

if (import.meta.main) Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const admin = createClient(url, adminKey(), { auth: { persistSession: false } });

  // Scheduled run.
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const result = await runSchedule(admin);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }

  // Test notification from the app.
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST" || !originAllowed(origin) || !validApiKey(req.headers.get("apikey") || "")) return json({ error: "Not allowed." }, 403, cors);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401, cors);
  const { data: who } = await admin.auth.getUser(auth.slice(7));
  if (!who?.user) return json({ error: "Please sign in again." }, 401, cors);
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", who.user.id);
  let sent = 0;
  for (const sub of subs || []) if (await sendTo(admin, sub, { title: "Reminders are on", body: "This is what a Semester Calendar reminder looks like.", url: "./?tab=todo", tag: "test" })) sent++;
  return json({ ok: sent > 0, sent }, 200, cors);
});
