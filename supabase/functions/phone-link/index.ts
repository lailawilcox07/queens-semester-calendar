// Supabase Edge Function: makes a one-time sign-in code for the QR code shown
// on a laptop, so scanning it on a phone opens the student's semester already
// signed in. Only a signed-in student can ask, and only for their own account.
// The code works once and expires (Authentication → Email OTP expiration).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, originAllowed, validApiKey } from "../_shared/http.ts";

// The admin key is provided to functions automatically.
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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Not found." }, 404, cors);
  if (!originAllowed(origin)) return json({ error: "Not allowed." }, 403, cors);
  if (!validApiKey(req.headers.get("apikey") || "")) return json({ error: "Not allowed." }, 401, cors);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401, cors);
  const url = Deno.env.get("SUPABASE_URL") || "";

  // Who is asking? (Checked with their own sign-in token.)
  const asUser = createClient(url, req.headers.get("apikey") || "", { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who, error: whoErr } = await asUser.auth.getUser(auth.slice(7));
  if (whoErr || !who?.user?.email) return json({ error: "Please sign in again." }, 401, cors);

  // Make a one-time sign-in link for that same email, and return just its code.
  const admin = createClient(url, adminKey(), { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: who.user.email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) {
    console.log("generateLink failed", error?.message);
    return json({ error: "Couldn't make a sign-in code." }, 500, cors);
  }
  return json({ ok: true, hash }, 200, cors);
});
