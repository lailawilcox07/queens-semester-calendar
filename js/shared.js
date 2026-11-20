// Shared syllabi: a per-term list of syllabi other students have already
// checked, searchable by course and instructor. Needs sign-in (see sync.js).
(function (root) {
  "use strict";

  let cache = { term: null, list: null, at: 0 };

  // Only official Queen's terms can be shared, so everyone means the same term.
  function termKey(P) {
    const t = P.term || {};
    return t.presetId && t.presetId !== "custom" && t.examEnd ? t.presetId : null;
  }
  const enabled = () => root.Sync && Sync.enabled();
  const ready = (P) => enabled() && !!Sync.user() && !!termKey(P);
  const db = () => Sync.client();

  // All syllabi shared for this term (a few KB each). Refreshed every 5 minutes.
  async function list(P, force) {
    const key = termKey(P);
    if (!ready(P)) return [];
    if (!force && cache.term === key && cache.list && Date.now() - cache.at < 5 * 60e3) return cache.list;
    const { data, error } = await db().from("shared_syllabi")
      .select("id, course_code, course_name, instructor, assessments, uses, created_at")
      .eq("term_id", key).order("uses", { ascending: false }).limit(500);
    if (error) throw new Error("Couldn't load shared syllabi.");
    cache = { term: key, list: data || [], at: Date.now() };
    return cache.list;
  }
  const cached = (P) => (cache.term === termKey(P) && cache.list) || null;

  function search(items, q) {
    const words = String(q || "").toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((s) => {
      const hay = `${s.course_code} ${s.course_name || ""} ${s.instructor}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  // Share the graded work the student just checked. Replaces their own earlier
  // share for the same course and instructor.
  async function share(P, course, instructor, assessments) {
    const key = termKey(P);
    if (!ready(P) || !instructor) return false;
    const uid = Sync.user().id;
    await db().from("shared_syllabi").delete().eq("term_id", key).eq("course_code", course.code).eq("instructor", instructor).eq("created_by", uid);
    const { error } = await db().from("shared_syllabi").insert({
      term_id: key, term_end: P.term.examEnd, course_code: course.code, course_name: course.name || null,
      instructor, created_by: uid,
      assessments: assessments.map((a) => ({ name: a.name, type: a.type, due: a.due || "", weight: a.weight === "" ? null : a.weight, note: a.note || "" })),
    });
    if (!error) cache.at = 0;
    return !error;
  }

  const use = (id) => db().rpc("use_shared_syllabus", { sid: id });
  const report = (id) => db().rpc("report_shared_syllabus", { sid: id });

  // In the same shape as an upload's result, so it goes through the same review.
  const asResult = (s) => ({
    course_code: s.course_code, course_name: s.course_name, instructor: s.instructor, shared_id: s.id,
    assessments: (s.assessments || []).map((a) => ({ name: a.name, type: a.type, due_date: a.due || null, weight: a.weight == null ? null : Number(a.weight), note: a.note || null })),
    warnings: [],
  });

  root.Shared = { termKey, enabled, ready, list, cached, search, share, use, report, asResult };
})(window);
