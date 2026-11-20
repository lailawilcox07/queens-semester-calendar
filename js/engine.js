// The schedule engine. Turns a student's setup (the profile) into "what's
// happening on date X": classes, commitments, one-time events, deadlines and
// planned study blocks. No DOM, no storage: give it a profile, ask it questions.
(function (root) {
  "use strict";

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- dates as "YYYY-MM-DD" strings, done in UTC so DST never shifts a day ----------
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fmtISO = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (iso, n) => fmtISO(parse(iso) + n * 864e5);
  const dow = (iso) => DAYS[(new Date(parse(iso)).getUTCDay() + 6) % 7];
  const mondayOf = (iso) => addDays(iso, -DAYS.indexOf(dow(iso)));
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const shortDate = (iso) => { const d = new Date(parse(iso)); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toTime = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

  function localToday() {
    // ?today=2027-02-10 lets you preview any day of the term (handy for demos).
    const q = typeof location !== "undefined" && new URLSearchParams(location.search).get("today");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Remove [a,b) ranges from a list of free ranges.
  function subtract(free, busy) {
    let out = free;
    busy.forEach(([bs, be]) => {
      const next = [];
      out.forEach(([fs, fe]) => {
        if (be <= fs || bs >= fe) { next.push([fs, fe]); return; }
        if (bs > fs) next.push([fs, bs]);
        if (be < fe) next.push([be, fe]);
      });
      out = next;
    });
    return out;
  }

  const STUDY = { minBlock: 45, maxBlock: 120, gap: 15, lookahead: 21, walk: 10 };
  const MEALS = [[12 * 60, 12 * 60 + 30], [17 * 60 + 30, 18 * 60 + 15]];

  function create(P) {
    const t = P.term;
    const progress = P.progress || {};
    const done = progress.done || {};
    const termStart = t.classesStart;
    const termEnd = t.examEnd || t.classesEnd;
    const courseById = {};
    P.courses.forEach((c) => { courseById[c.id] = c; });

    const breakOn = (iso) => (t.breaks || []).find((b) => b.start && iso >= b.start && iso <= (b.end || b.start));
    const inTerm = (iso) => !!termStart && iso >= termStart && iso <= termEnd;
    const isClassDay = (iso) => !!termStart && iso >= termStart && iso <= t.classesEnd && !breakOn(iso);
    const isExamDay = (iso) => !!t.examStart && iso >= t.examStart && iso <= (t.examEnd || t.examStart);

    // ---------- deadlines ----------
    const deadlines = [];
    P.courses.forEach((c) => c.assessments.forEach((a) => deadlines.push({ id: a.id, course: c, a, due: a.due || "" })));
    deadlines.sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999") || x.course.code.localeCompare(y.course.code));
    const dueOn = (iso) => deadlines.filter((d) => d.due === iso);

    // ---------- fixed events on a date ----------
    function fixedItems(iso) {
      const day = dow(iso);
      const items = [];
      if (isClassDay(iso)) {
        P.courses.forEach((c) => c.meetings.forEach((m) => m.slots.forEach((sl) => {
          if (sl.day === day && sl.start && sl.end && toMin(sl.end) > toMin(sl.start))
            items.push({ kind: "class", id: `cls:${sl.id}:${iso}`, course: c, title: c.code, sub: m.type, location: m.location, start: sl.start, end: sl.end });
        })));
      }
      if (inTerm(iso)) {
        P.routine.commitments.forEach((m) => m.slots.forEach((sl) => {
          if (sl.day === day && sl.start && sl.end && toMin(sl.end) > toMin(sl.start))
            items.push({ kind: "fixed", id: `fix:${sl.id}:${iso}`, title: m.label || "Commitment", sub: "", start: sl.start, end: sl.end, travel: Number(m.commute) || 0 });
        }));
      }
      (P.routine.oneoffs || []).forEach((o) => {
        if (o.date === iso && o.start && o.end && toMin(o.end) > toMin(o.start))
          items.push({ kind: "event", id: `evt:${o.id}`, title: o.label || "Event", sub: "", start: o.start, end: o.end, travel: Number(o.commute) || 0 });
      });
      return items.sort((a, b) => toMin(a.start) - toMin(b.start));
    }

    // Free time on a date, after classes (plus the trip to and from campus),
    // commitments and events (plus their travel), and meals.
    function freeRanges(iso) {
      const wake = toMin(P.routine.wake) ?? 8 * 60, bed = toMin(P.routine.bed) ?? 23 * 60;
      let free = [[wake + 30, bed - 30]];
      const items = fixedItems(iso);
      const busy = [];
      const classes = items.filter((i) => i.kind === "class");
      const commute = Number(P.routine.commute) || 0;
      if (classes.length) {
        busy.push([toMin(classes[0].start) - commute, toMin(classes[0].start)]);
        busy.push([toMin(classes[classes.length - 1].end), toMin(classes[classes.length - 1].end) + commute]);
      }
      // Classes get a few minutes either side for walking between buildings.
      items.forEach((i) => {
        const pad = i.kind === "class" ? STUDY.walk : (i.travel || 0);
        busy.push([toMin(i.start) - pad, toMin(i.end) + pad]);
      });
      MEALS.forEach((m) => busy.push(m));
      free = subtract(free, busy);
      return free.filter(([s, e]) => e - s >= STUDY.minBlock);
    }

    // How much a course needs attention on a date: upcoming, unfinished,
    // heavily weighted work counts most, and sooner counts more.
    function priority(c, iso) {
      let p = 1;
      c.assessments.forEach((a) => {
        if (!a.due || done[a.id]) return;
        const d = daysBetween(iso, a.due);
        if (d < 0 || d > STUDY.lookahead) return;
        p += (Number(a.weight) || 5) * (STUDY.lookahead - d + 1) / STUDY.lookahead;
      });
      return p;
    }

    function nextFor(c, iso) {
      return c.assessments
        .filter((a) => a.due && a.due >= iso && !done[a.id] && daysBetween(iso, a.due) <= 14)
        .sort((a, b) => a.due.localeCompare(b.due))[0];
    }

    // ---------- the weekly study plan ----------
    const planCache = {};
    function weekPlan(monday) {
      if (planCache[monday]) return planCache[monday];
      const dates = DAYS.map((_, i) => addDays(monday, i)).filter(inTerm);
      const plan = {};
      if (!P.courses.length || !dates.length) return (planCache[monday] = plan);

      // Split each day's free time into study-sized blocks.
      const blocks = {};
      let freeTotal = 0;
      dates.forEach((iso) => {
        blocks[iso] = [];
        freeRanges(iso).forEach(([s, e]) => {
          let cur = Math.ceil(s / 15) * 15; // start on :00, :15, :30 or :45
          while (e - cur >= STUDY.minBlock) {
            const len = Math.floor(Math.min(STUDY.maxBlock, e - cur) / 15) * 15;
            blocks[iso].push([cur, cur + len]);
            freeTotal += len;
            cur += len + STUDY.gap;
          }
        });
      });

      // Share the weekly goal across days in proportion to their free time.
      const goal = Math.max(0, Number(P.study.weeklyHours) || 0) * 60 * (dates.length / 7);
      const used = {};
      P.courses.forEach((c) => { used[c.id] = 0; });
      dates.forEach((iso) => {
        const dayFree = blocks[iso].reduce((s, [a, b]) => s + (b - a), 0);
        let quota = freeTotal ? Math.round((goal * dayFree / freeTotal) / 15) * 15 : 0;
        const out = [];
        let focus = null;
        if (P.study.style === "focus") {
          focus = P.courses.slice().sort((a, b) => priority(b, iso) / (1 + used[b.id] / 180) - priority(a, iso) / (1 + used[a.id] / 180))[0];
        }
        const todayUsed = {};
        for (const [s, e] of blocks[iso]) {
          if (quota < STUDY.minBlock) break;
          const len = Math.floor(Math.min(e - s, quota) / 15) * 15;
          if (len < STUDY.minBlock) continue;
          const c = focus || P.courses.slice().sort((a, b) => {
            const score = (x) => priority(x, iso) / (1 + used[x.id] / 120) * (todayUsed[x.id] ? 0.4 : 1);
            return score(b) - score(a);
          })[0];
          used[c.id] += len;
          todayUsed[c.id] = true;
          quota -= len;
          const next = nextFor(c, iso);
          out.push({
            kind: "study", id: `std:${iso}:${toTime(s)}`, course: c, title: c.code, start: toTime(s), end: toTime(s + len),
            sub: !next ? "Review this week's material"
              : next.due === iso ? `Finish ${next.name || next.type} (due today)`
              : `Prep for ${next.name || next.type} (${shortDate(next.due)})`,
          });
        }
        plan[iso] = out;
      });
      return (planCache[monday] = plan);
    }

    const studyOn = (iso) => (inTerm(iso) ? weekPlan(mondayOf(iso))[iso] || [] : []);

    function day(iso) {
      const br = breakOn(iso);
      return {
        iso, dow: dow(iso), label: shortDate(iso),
        inTerm: inTerm(iso), isBreak: !!br, breakLabel: br ? br.label : "", isExam: isExamDay(iso), isClassDay: isClassDay(iso),
        items: fixedItems(iso).concat(studyOn(iso)).sort((a, b) => toMin(a.start) - toMin(b.start)),
        due: dueOn(iso),
      };
    }

    // ---------- the weeks of the term, for the week picker ----------
    function weeks() {
      if (!termStart) return [];
      const out = [];
      let n = 0, e = 0;
      for (let m = mondayOf(termStart); m <= termEnd; m = addDays(m, 7)) {
        const days = DAYS.map((_, i) => addDays(m, i));
        const weekdays = days.slice(0, 5);
        const classDays = weekdays.filter(isClassDay).length;
        const examDays = days.filter(isExamDay).length;
        const breakDays = weekdays.filter((d) => d <= t.classesEnd && d >= termStart && breakOn(d)).length;
        let label;
        if (classDays) label = `Wk ${++n}`;
        else if (examDays) label = `Exams ${++e}`;
        else if (breakDays) label = "Break";
        else label = "—";
        if (breakDays >= 4) label = "Reading wk";
        out.push({ monday: m, label, range: `${shortDate(m)} – ${shortDate(addDays(m, 6))}`, days });
      }
      return out;
    }

    return { day, weeks, deadlines: () => deadlines, dueOn, studyOn, inTerm, isClassDay, termStart, termEnd };
  }

  // Queen's letter grade for a percentage.
  const SCALE = [[90, "A+"], [85, "A"], [80, "A-"], [77, "B+"], [73, "B"], [70, "B-"], [67, "C+"], [63, "C"], [60, "C-"], [57, "D+"], [53, "D"], [50, "D-"], [0, "F"]];
  const letter = (pct) => (SCALE.find(([min]) => pct >= min) || [0, "F"])[1];

  root.Engine = { create, addDays, dow, mondayOf, daysBetween, shortDate, toMin, localToday, DAYS, SCALE, letter };
})(typeof window !== "undefined" ? window : globalThis);
