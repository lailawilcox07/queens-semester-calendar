// Which reminders a student gets on a given day, and when. Used by the app to
// preview them and by the server (supabase/functions/reminders) to send them,
// so both always agree. Keep supabase/functions/_shared/ copies in sync
// (see README "Shared code").
(function (root) {
  "use strict";

  const DEFAULTS = {
    enabled: false,
    classes: true,    // before each class; the first class of the day also counts the commute
    lead: 10,         // minutes of warning before classes and commitments
    study: true,      // when a study block starts
    events: true,     // weekly commitments and one-time events, counting travel time
    deadlines: true,  // morning of, and the evening before
  };

  function settings(P) {
    return Object.assign({}, DEFAULTS, P.reminders || {});
  }

  function fmtTime(t) {
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }

  const listDue = (items) => items.map((x) => `${x.course.code} ${x.a.name || x.a.type}${x.a.weight !== "" && x.a.weight != null ? ` (${x.a.weight}%)` : ""}`).join(", ");

  // All of a day's reminders: [{ key, at (minutes after midnight), title, body, url }].
  function forDay(P, eng, iso) {
    const E = root.Engine;
    const s = settings(P);
    const toMin = E.toMin;
    const d = eng.day(iso);
    const wake = toMin(P.routine.wake) ?? 8 * 60;
    const bed = toMin(P.routine.bed) ?? 23 * 60;
    const commute = Number(P.routine.commute) || 0;
    const lead = Number(s.lead) || 0;
    const done = (P.progress && P.progress.done) || {};
    const out = [];

    if (s.classes) {
      d.items.filter((i) => i.kind === "class").forEach((c, n) => {
        const leave = n === 0 && commute > 0;
        out.push({
          key: `class:${c.id}`,
          at: toMin(c.start) - lead - (leave ? commute : 0),
          title: `${c.title} ${c.sub} at ${fmtTime(c.start)}`,
          body: leave ? `Time to head to campus.${c.location ? " " + c.location : ""}` : c.location || "",
          url: "./",
        });
      });
    }
    if (s.events) {
      d.items.filter((i) => i.kind === "fixed" || i.kind === "event").forEach((e) => {
        out.push({
          key: `event:${e.id}`,
          at: toMin(e.start) - lead - (e.travel || 0),
          title: `${e.title} at ${fmtTime(e.start)}`,
          body: e.travel ? `Leave in ${lead} min. It's about ${e.travel} min away.` : "",
          url: "./",
        });
      });
    }
    if (s.study) {
      d.items.filter((i) => i.kind === "study" && i.status !== "done").forEach((b) => {
        out.push({ key: `study:${b.id}`, at: toMin(b.start), title: `Study time: ${b.title}`, body: `${b.sub}. Tap to start the timer.`, url: "./?tab=todo" });
      });
    }
    if (s.deadlines) {
      const today = d.due.filter((x) => !done[x.id]);
      if (today.length) out.push({ key: `due-today:${iso}`, at: wake, title: today.length === 1 ? "Due today" : `${today.length} things due today`, body: listDue(today), url: "./?tab=due" });
      const tomorrow = eng.dueOn(E.addDays(iso, 1)).filter((x) => !done[x.id]);
      if (tomorrow.length) out.push({ key: `due-tomorrow:${iso}`, at: Math.min(19 * 60, bed - 60), title: tomorrow.length === 1 ? "Due tomorrow" : `${tomorrow.length} things due tomorrow`, body: listDue(tomorrow), url: "./?tab=due" });
    }
    return out.filter((r) => r.at >= 0 && r.at < 24 * 60).sort((a, b) => a.at - b.at);
  }

  root.Reminders = { DEFAULTS, settings, forDay, fmtTime };
})(typeof window !== "undefined" ? window : globalThis);
