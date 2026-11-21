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
    // ?preview&today=2027-02-10 lets you preview any day of the term.
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
  const MEAL_SEARCH = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];

  function create(P, opts) {
    opts = opts || {};
    const today = opts.today || localToday();
    const t = P.term;
    const progress = P.progress || {};
    const done = progress.done || {};
    const studyDone = progress.studyDone || {};
    const sessions = progress.sessions || [];
    const locked = progress.locked || {};
    // The day the student started using the app. Days before it were never
    // planned with them, so they're not "missed" and don't count toward insights.
    const since = progress.since || today;
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

    const dayWindow = () => [toMin(P.routine.wake) ?? 8 * 60, toMin(P.routine.bed) ?? 23 * 60];

    // Time taken by classes (plus walking and the commute), commitments and events (plus travel).
    function busyRanges(iso) {
      const items = fixedItems(iso);
      const busy = [];
      const classes = items.filter((i) => i.kind === "class");
      const commute = Number(P.routine.commute) || 0;
      if (classes.length) {
        busy.push([toMin(classes[0].start) - commute, toMin(classes[0].start)]);
        busy.push([toMin(classes[classes.length - 1].end), toMin(classes[classes.length - 1].end) + commute]);
      }
      items.forEach((i) => {
        const pad = i.kind === "class" ? STUDY.walk : (i.travel || 0);
        busy.push([toMin(i.start) - pad, toMin(i.end) + pad]);
      });
      return busy;
    }

    // Meals go at the student's preferred time, or the nearest free time within 90 minutes.
    const mealCache = {};
    function mealItems(iso) {
      if (mealCache[iso]) return mealCache[iso];
      const m = P.routine.meals || {};
      const len = Number(m.length) || 30;
      const [wake, bed] = dayWindow();
      const busy = busyRanges(iso);
      const out = [];
      [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"]].forEach(([key, label]) => {
        const pref = toMin(m[key]);
        if (pref == null) return;
        for (const off of MEAL_SEARCH) {
          const s = pref + off, e = s + len;
          if (s < wake || e > bed) continue;
          if (busy.some(([bs, be]) => s < be && bs < e)) continue;
          busy.push([s, e]);
          out.push({ kind: "meal", id: `meal:${key}:${iso}`, title: label, sub: "", start: toTime(s), end: toTime(e) });
          break;
        }
      });
      return (mealCache[iso] = out);
    }

    function freeRanges(iso) {
      const [wake, bed] = dayWindow();
      const busy = busyRanges(iso).concat(mealItems(iso).map((i) => [toMin(i.start), toMin(i.end)]));
      return subtract([[wake + 30, bed - 30]], busy).filter(([s, e]) => e - s >= STUDY.minBlock);
    }

    // ---------- what's actually been studied ----------
    const blockMinutes = (b) => toMin(b.end) - toMin(b.start);
    // Minutes studied for a course on a date: timed sessions, plus study blocks ticked off without a timer.
    function actualMinutes(courseId, iso) {
      const timed = sessions.filter((x) => x.courseId === courseId && x.date === iso);
      let min = timed.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
      const timedBlocks = new Set(timed.map((x) => x.blockId).filter(Boolean));
      (locked[iso] || []).forEach((b) => { if (b.courseId === courseId && studyDone[b.id] && !timedBlocks.has(b.id)) min += blockMinutes(b); });
      return min;
    }

    // How much more time a course has been taking than planned over the last
    // two weeks, plus a nudge for low grades. 1 = as planned, up to 1.6.
    const effortCache = {};
    function effort(c) {
      if (effortCache[c.id]) return effortCache[c.id];
      let planned = 0, actual = 0;
      for (let k = 1; k <= 14; k++) {
        const iso = addDays(today, -k);
        if (iso < since) break;
        (locked[iso] || []).forEach((b) => { if (b.courseId === c.id) planned += blockMinutes(b); });
        actual += actualMinutes(c.id, iso);
      }
      let f = planned >= 120 && actual > planned ? Math.min(1.4, actual / planned) : 1;
      const avg = gradeAverage(c);
      if (avg != null && avg < 70) f *= 1.15;
      return (effortCache[c.id] = Math.round(f * 100) / 100);
    }

    function gradeAverage(c) {
      const grades = progress.grades || {};
      let earned = 0, w = 0;
      c.assessments.forEach((a) => {
        const g = grades[a.id], wt = Number(a.weight) || 0;
        if (g !== undefined && g !== "" && wt) { earned += wt * Number(g); w += wt; }
      });
      return w ? earned / w : null;
    }

    // Planned study from the last week that didn't happen, per course.
    const missedCache = {};
    function missedMinutes(c) {
      if (missedCache[c.id] != null) return missedCache[c.id];
      let m = 0;
      for (let k = 1; k <= 7; k++) {
        const iso = addDays(today, -k);
        if (iso < since) break;
        const planned = (locked[iso] || []).filter((b) => b.courseId === c.id).reduce((s, b) => s + blockMinutes(b), 0);
        m += Math.max(0, planned - actualMinutes(c.id, iso));
      }
      return (missedCache[c.id] = m);
    }

    // How much a course needs attention on a date: upcoming, unfinished,
    // heavily weighted work counts most, and sooner counts more. Missed study
    // and courses that take longer than planned get a boost.
    function priority(c, iso) {
      let p = 1;
      c.assessments.forEach((a) => {
        if (!a.due || done[a.id]) return;
        const d = daysBetween(iso, a.due);
        if (d < 0 || d > STUDY.lookahead) return;
        p += (Number(a.weight) || 5) * (STUDY.lookahead - d + 1) / STUDY.lookahead;
      });
      if (iso >= today) p += (missedMinutes(c) / 60) * 2;
      return p * effort(c);
    }

    function nextFor(c, iso) {
      return c.assessments
        .filter((a) => a.due && a.due >= iso && !done[a.id] && daysBetween(iso, a.due) <= 14)
        .sort((a, b) => a.due.localeCompare(b.due))[0];
    }

    function blockLabel(c, iso) {
      const next = nextFor(c, iso);
      return !next ? "Review this week's material"
        : next.due === iso ? `Finish ${next.name || next.type} (due today)`
        : `Prep for ${next.name || next.type} (${shortDate(next.due)})`;
    }

    // ---------- scheduling ----------
    // Fill the given days with study blocks: `goal` minutes in total, shared out
    // by free time, choosing a course for each block by priority.
    function schedule(dates, goal, used) {
      const plan = {};
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
      dates.forEach((iso) => {
        const dayFree = blocks[iso].reduce((s, [a, b]) => s + (b - a), 0);
        let quota = freeTotal ? Math.min(dayFree, Math.round((goal * dayFree / freeTotal) / 15) * 15) : 0;
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
          out.push({ kind: "study", id: `std:${iso}:${toTime(s)}`, course: c, courseId: c.id, title: c.code, start: toTime(s), end: toTime(s + len), sub: blockLabel(c, iso) });
        }
        plan[iso] = out;
      });
      return plan;
    }

    const weekGoal = (n) => Math.max(0, Number(P.study.weeklyHours) || 0) * 60 * (n / 7);
    const zeroUsed = () => { const u = {}; P.courses.forEach((c) => { u[c.id] = 0; }); return u; };

    // A week planned from scratch, ignoring what's happened. Used for past days
    // that were never locked (e.g. before the student started using the app).
    const plainCache = {};
    function plainWeek(monday) {
      if (!plainCache[monday]) {
        const dates = DAYS.map((_, i) => addDays(monday, i)).filter(inTerm);
        plainCache[monday] = P.courses.length && dates.length ? schedule(dates, weekGoal(dates.length), zeroUsed()) : {};
      }
      return plainCache[monday];
    }

    function lockedBlocks(iso) {
      if (!locked[iso]) return null;
      return locked[iso].filter((b) => courseById[b.courseId]).map((b) => {
        const c = courseById[b.courseId];
        return { kind: "study", id: b.id, course: c, courseId: c.id, title: c.code, start: b.start, end: b.end, sub: b.sub };
      });
    }

    // Past days are fixed (locked). Today and later are planned live: the week's
    // goal minus what's already been studied this week is spread over the days
    // left, so missed study moves forward instead of disappearing.
    const planCache = {};
    function weekPlan(monday) {
      if (planCache[monday]) return planCache[monday];
      const dates = DAYS.map((_, i) => addDays(monday, i)).filter(inTerm);
      const plan = {};
      if (!P.courses.length || !dates.length) return (planCache[monday] = plan);
      const past = dates.filter((d) => d < today), live = dates.filter((d) => d >= today);
      past.forEach((d) => { plan[d] = lockedBlocks(d) || plainWeek(monday)[d] || []; });
      if (live.length) {
        const used = zeroUsed();
        let studied = 0;
        past.forEach((d) => P.courses.forEach((c) => { const m = actualMinutes(c.id, d); used[c.id] += m; studied += m; }));
        // If the week has already started, the remaining goal is what's left of the full week's goal.
        const goal = past.length ? Math.max(0, weekGoal(dates.length) - studied) : weekGoal(dates.length);
        Object.assign(plan, schedule(live, goal, used));
      }
      return (planCache[monday] = plan);
    }

    function studyStatus(b, iso) {
      const timed = sessions.some((x) => x.blockId === b.id);
      if (studyDone[b.id] || timed) return "done";
      if (iso < since) return "past";
      return iso < today ? "missed" : "planned";
    }

    const studyOn = (iso) => (inTerm(iso) ? (weekPlan(mondayOf(iso))[iso] || []).map((b) => Object.assign({}, b, { status: studyStatus(b, iso) })) : []);

    // Days before today whose plan hasn't been saved yet, so the app can lock them.
    function unlockedPast() {
      const out = {};
      if (!termStart) return out;
      const end = addDays(today, -1) < termEnd ? addDays(today, -1) : termEnd;
      for (let d = termStart > since ? termStart : since; d <= end; d = addDays(d, 1)) {
        if (locked[d]) continue;
        // Prefer the plan the student actually saw that day, if the app was opened.
        const seen = progress.lastSeen;
        if (seen && seen.date === d) { out[d] = seen.blocks; continue; }
        out[d] = (weekPlan(mondayOf(d))[d] || []).map((b) => ({ id: b.id, courseId: b.courseId, start: b.start, end: b.end, sub: b.sub }));
      }
      return out;
    }

    function day(iso) {
      const br = breakOn(iso);
      return {
        iso, dow: dow(iso), label: shortDate(iso),
        inTerm: inTerm(iso), isBreak: !!br, breakLabel: br ? br.label : "", isExam: isExamDay(iso), isClassDay: isClassDay(iso),
        items: fixedItems(iso).concat(inTerm(iso) ? mealItems(iso) : [], studyOn(iso)).sort((a, b) => toMin(a.start) - toMin(b.start)),
        due: dueOn(iso),
      };
    }

    // Planned vs actual study per course over the last 14 days (for insights).
    function timeReport() {
      return P.courses.map((c) => {
        let planned = 0, actual = 0;
        for (let k = 0; k < 14; k++) {
          const iso = addDays(today, -k);
          if (iso < since) break;
          const blocks = k === 0 ? studyOn(iso) : (lockedBlocks(iso) || []);
          planned += blocks.filter((b) => b.courseId === c.id).reduce((s, b) => s + blockMinutes(b), 0);
          actual += actualMinutes(c.id, iso);
        }
        return { course: c, planned, actual, effort: effort(c), missed: missedMinutes(c) };
      });
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

    return { today, day, weeks, deadlines: () => deadlines, dueOn, studyOn, inTerm, isClassDay, termStart, termEnd, unlockedPast, timeReport, actualMinutes };
  }

  // Queen's letter grade for a percentage.
  const SCALE = [[90, "A+"], [85, "A"], [80, "A-"], [77, "B+"], [73, "B"], [70, "B-"], [67, "C+"], [63, "C"], [60, "C-"], [57, "D+"], [53, "D"], [50, "D-"], [0, "F"]];
  const letter = (pct) => (SCALE.find(([min]) => pct >= min) || [0, "F"])[1];

  root.Engine = { create, addDays, dow, mondayOf, daysBetween, shortDate, toMin, localToday, DAYS, SCALE, letter };
})(typeof window !== "undefined" ? window : globalThis);
