// Shared request checks for the site's Edge Functions.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://lailawilcox07.github.io,http://localhost:8000")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const originAllowed = (origin: string) => ALLOWED_ORIGINS.includes(origin);

export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": originAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// The site sends the project's publishable key in the apikey header. Supabase
// gives functions the valid keys in SUPABASE_PUBLISHABLE_KEYS.
export function validApiKey(key: string) {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return true; // local testing
  let keys: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    keys = Array.isArray(parsed) ? parsed : Object.values(parsed);
  } catch {
    keys = raw.split(",").map((s) => s.trim());
  }
  return keys.includes(key);
}
