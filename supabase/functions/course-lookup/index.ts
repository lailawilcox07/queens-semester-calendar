// Supabase Edge Function: looks up a Queen's course title from the public
// Academic Calendar, e.g. "CISC 124" -> "Introduction to Computing Science II".
// The browser can't read queensu.ca directly, so this fetches it server-side.

import { corsHeaders, json, originAllowed, validApiKey } from "../_shared/http.ts";

const BASE = Deno.env.get("CALENDAR_BASE") || "https://queensu-ca-public.courseleaf.com";
// Faculties whose course lists live on the Academic Calendar. Tried in order.
const FACULTIES = ["arts-science", "engineering-applied-science", "health-sciences", "business", "nursing", "education", "rehabilitation-therapy"];

// subject code -> { "124": "Introduction to Computing Science II", ... }
const cache = new Map<string, Record<string, string>>();

function decode(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");
}

export function parseCourses(html: string, subject: string) {
  const text = decode(html);
  const out: Record<string, string> = {};
  const re = new RegExp(`\\b${subject}\\s+(\\d{3}[A-Z]?)\\s+(.+?)\\s+Units:`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!out[m[1]]) out[m[1]] = m[2].trim().slice(0, 100);
  return out;
}

async function subjectCourses(subject: string) {
  if (cache.has(subject)) return cache.get(subject)!;
  let found: Record<string, string> = {};
  for (const fac of FACULTIES) {
    try {
      const res = await fetch(`${BASE}/${fac}/course-descriptions/${subject.toLowerCase()}/`);
      if (!res.ok) continue;
      const parsed = parseCourses(await res.text(), subject);
      if (Object.keys(parsed).length) { found = parsed; break; }
    } catch { /* try the next faculty */ }
  }
  if (Object.keys(found).length) cache.set(subject, found);
  return found;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Not found." }, 404, cors);
  if (!originAllowed(origin)) return json({ error: "Not allowed." }, 403, cors);
  if (!validApiKey(req.headers.get("apikey") || "")) return json({ error: "Not allowed." }, 401, cors);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400, cors); }
  const m = String(body.code || "").toUpperCase().match(/^([A-Z]{2,4})\s*(\d{3}[A-Z]?)$/);
  if (!m) return json({ error: "Enter a course code like MATH 121." }, 400, cors);
  const courses = await subjectCourses(m[1]);
  const name = courses[m[2]];
  return json({ ok: true, code: `${m[1]} ${m[2]}`, name: name || null }, 200, cors);
});
