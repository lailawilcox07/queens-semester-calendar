// Setup flow: walks a student through term, courses, class times, deadlines,
// routine and study style, then shows a review. All state lives in `P` (the
// profile) and is saved to the device on every change.
(function () {
  "use strict";

  const STEPS = [
    { id: "welcome", title: "Welcome" },
    { id: "term", title: "Term" },
    { id: "courses", title: "Courses" },
    { id: "classes", title: "Class times" },
    { id: "deadlines", title: "Deadlines" },
    { id: "routine", title: "Routine" },
    { id: "study", title: "Study plan" },
    { id: "review", title: "Review" },
  ];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_SHORT = { Mon: "M", Tue: "T", Wed: "W", Thu: "Th", Fri: "F", Sat: "Sa", Sun: "Su" };
  const MEETING_TYPES = ["Lecture", "Tutorial", "Lab", "Seminar"];
  const ASSESS_TYPES = ["Assignment", "Quiz", "Lab", "Midterm", "Final exam", "Project", "Participation", "Other"];
  const COLORS = 8;

  let P = Store.load();
  let returnToReview = false;
  let confirmingReset = false;
  const app = document.getElementById("app");

  // ---------- small helpers ----------
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  function fmtTime(t) {
    if (!t) return "";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }
  function fmtDate(d) {
    if (!d) return "";
    const [y, mo, da] = d.split("-").map(Number);
    return new Date(y, mo - 1, da).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  }
  function normCode(raw) {
    const s = String(raw || "").toUpperCase().replace(/\s+/g, " ").trim();
    const m = s.match(/^([A-Z]{2,4})\s*-?\s*(\d{3}[A-Z]?)$/);
    return m ? m[1] + " " + m[2] : s;
  }
  const isCode = (s) => /^[A-Z]{2,4} \d{3}[A-Z]?$/.test(s);
  function nextColor() {
    const used = P.courses.map((c) => c.color);
    for (let i = 1; i <= COLORS; i++) if (!used.includes(i)) return i;
    return (P.courses.length % COLORS) + 1;
  }
  const course = (id) => P.courses.find((c) => c.id === id);
  function persist() { Store.save(P); }

  // ---------- derived checks ----------
  function classHoursPerWeek() {
    let mins = 0;
    P.courses.forEach((c) => c.meetings.forEach((m) => {
      const a = toMin(m.start), b = toMin(m.end);
      if (a != null && b != null && b > a) mins += (b - a) * m.days.length;
    }));
    return Math.round((mins / 60) * 10) / 10;
  }

  // Every timed block in the week, for conflict checks and the preview grid.
  function weekBlocks() {
    const out = [];
    P.courses.forEach((c) => c.meetings.forEach((m) => m.days.forEach((d) => {
      if (m.start && m.end) out.push({ day: d, start: m.start, end: m.end, label: c.code + " " + m.type, sub: m.location, color: c.color, kind: "class", ref: m.id });
    })));
    P.routine.commitments.forEach((m) => m.days.forEach((d) => {
      if (m.start && m.end) out.push({ day: d, start: m.start, end: m.end, label: m.label || "Commitment", sub: "", color: 0, kind: "fixed", ref: m.id });
    }));
    return out;
  }

  function conflicts() {
    const blocks = weekBlocks();
    const found = [];
    const seen = new Set();
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.day !== b.day) continue;
      if (toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) {
        const key = [a.ref, b.ref, a.day].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ day: a.day, a, b, refs: [a.ref, b.ref] });
      }
    }
    return found;
  }

  function badTimes() {
    const bad = [];
    P.courses.forEach((c) => c.meetings.forEach((m) => {
      if (m.start && m.end && toMin(m.end) <= toMin(m.start)) bad.push(m.id);
    }));
    P.routine.commitments.forEach((m) => {
      if (m.start && m.end && toMin(m.end) <= toMin(m.start)) bad.push(m.id);
    });
    return bad;
  }

  const weightTotal = (c) => c.assessments.reduce((s, a) => s + (Number(a.weight) || 0), 0);

  function outsideTerm(a) {
    const t = P.term;
    if (!a.due || !t.classesStart) return false;
    const end = t.examEnd || t.classesEnd;
    return a.due < t.classesStart || (end && a.due > end);
  }

  function warnings() {
    const w = [];
    conflicts().forEach((x) => w.push(`${x.day}: ${x.a.label} (${fmtTime(x.a.start)}–${fmtTime(x.a.end)}) overlaps ${x.b.label} (${fmtTime(x.b.start)}–${fmtTime(x.b.end)}).`));
    if (badTimes().length) w.push("Some times end before they start.");
    P.courses.forEach((c) => {
      if (!c.meetings.length) w.push(`${c.code} has no class times yet.`);
      if (!c.assessments.length) w.push(`${c.code} has no deadlines yet.`);
      else {
        const t = weightTotal(c);
        if (t !== 100) w.push(`${c.code} weights add up to ${t}%, not 100%.`);
      }
      c.assessments.forEach((a) => { if (outsideTerm(a)) w.push(`${c.code} — ${a.name || a.type} is due outside the term dates.`); });
    });
    return w;
  }

  // ---------- step validation ----------
  function stepProblem(id) {
    if (id === "term") {
      const t = P.term;
      if (!t.classesStart || !t.classesEnd) return "Add the first and last day of classes.";
      if (t.classesEnd <= t.classesStart) return "The last day of classes must come after the first.";
    }
    if (id === "courses" && !P.courses.length) return "Add at least one course.";
    if ((id === "classes" || id === "routine") && badTimes().length) return "Fix the times that end before they start.";
    return "";
  }

  // ---------- rendering ----------
  function render() {
    const scrollY = window.scrollY;
    const keepScroll = render._sameStep === P.step;
    render._sameStep = P.step;
    if (P.setupComplete && P.step >= STEPS.length) app.innerHTML = renderDone();
    else app.innerHTML = renderShell(STEPS[P.step].id);
    window.scrollTo(0, keepScroll ? scrollY : 0);
    if (!keepScroll) {
      const h = app.querySelector("h2");
      if (h) h.focus({ preventScroll: true });
    }
  }

  function renderShell(id) {
    const body = {
      welcome: stepWelcome, term: stepTerm, courses: stepCourses, classes: stepClasses,
      deadlines: stepDeadlines, routine: stepRoutine, study: stepStudy, review: stepReview,
    }[id]();
    if (id === "welcome") return body;
    const n = P.step; // welcome is step 0, so this reads "Step 1 of 7" for Term
    const total = STEPS.length - 1;
    const problem = stepProblem(id);
    const isLast = id === "review";
    return `
      <div class="progress" aria-label="Step ${n} of ${total}">
        <div class="progress-label"><span>Step ${n} of ${total}</span><span>${esc(STEPS[n].title)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${(n / total) * 100}%"></div></div>
      </div>
      <section class="step">${body}</section>
      <div class="navbar">
        <button type="button" class="btn ghost" data-act="back">Back</button>
        ${returnToReview && !isLast
          ? `<button type="button" class="btn primary" data-act="to-review" ${problem ? "disabled" : ""}>Back to review</button>`
          : isLast
            ? `<button type="button" class="btn primary" data-act="finish">Finish setup</button>`
            : `<button type="button" class="btn primary" data-act="next" ${problem ? "disabled" : ""}>Next</button>`}
      </div>
      <p class="nav-hint" id="navHint" ${problem ? "" : "hidden"}>${esc(problem)}</p>`;
  }

  function stepWelcome() {
    const resuming = P.step === 0 && (P.courses.length || P.term.classesStart);
    return `
      <section class="welcome">
        <p class="eyebrow">For Queen's students</p>
        <h2 tabindex="-1">Set up your semester</h2>
        <p class="lede">Enter your courses, class times and syllabus deadlines once. You'll get a weekly calendar, a to-do list, a due-date tracker and a grade calculator built around your term.</p>
        <ol class="welcome-list">
          <li><b>Your term</b>: class dates, reading week and exams</li>
          <li><b>Your courses</b>: codes and class times</li>
          <li><b>Your deadlines</b>: from each syllabus, with grade weights</li>
          <li><b>Your routine</b>: commute, work, practice and study goals</li>
        </ol>
        <p class="privacy"><b>Private by default.</b> No account needed. Everything you enter stays on this device.</p>
        <p class="muted small">Have your syllabi handy. You can skip anything and come back to it later.</p>
        <button type="button" class="btn primary big" data-act="next">${resuming ? "Continue setup" : "Get started"}</button>
      </section>`;
  }

  function stepTerm() {
    const t = P.term;
    const presets = TERM_PRESETS.map((p) => `
      <button type="button" class="choice ${t.presetId === p.id ? "on" : ""}" data-act="preset" data-id="${p.id}" aria-pressed="${t.presetId === p.id}">
        <span class="choice-title">${esc(p.label)}</span>
        <span class="choice-sub">Classes ${esc(fmtDate(p.classesStart))} – ${esc(fmtDate(p.classesEnd))}</span>
      </button>`).join("");
    const breaks = t.breaks.map((b, i) => `
      <div class="row break-row">
        <input type="text" aria-label="Break name" placeholder="e.g. Reading week" value="${esc(b.label)}" data-bind="break" data-i="${i}" data-f="label">
        <input type="date" aria-label="Break starts" value="${esc(b.start)}" data-bind="break" data-i="${i}" data-f="start">
        <input type="date" aria-label="Break ends" value="${esc(b.end)}" data-bind="break" data-i="${i}" data-f="end">
        <button type="button" class="icon-btn" data-act="del-break" data-i="${i}" aria-label="Remove ${esc(b.label || "break")}">×</button>
      </div>`).join("");
    return `
      <h2 tabindex="-1">Which term are you planning?</h2>
      <p class="muted">Dates come from the Queen's Arts and Science sessional dates. If your faculty's dates are different, edit them below.</p>
      <div class="choices">${presets}
        <button type="button" class="choice ${t.presetId === "custom" ? "on" : ""}" data-act="preset" data-id="custom" aria-pressed="${t.presetId === "custom"}">
          <span class="choice-title">Other term</span><span class="choice-sub">Enter the dates yourself</span>
        </button>
      </div>
      ${t.presetId ? `
      <div class="card">
        ${t.presetId === "custom" ? `<label>Term name<input type="text" placeholder="e.g. Summer 2027" maxlength="40" value="${esc(t.label)}" data-bind="term" data-f="label"></label>` : ""}
        <div class="grid2">
          <label>First day of classes<input type="date" value="${esc(t.classesStart)}" data-bind="term" data-f="classesStart"></label>
          <label>Last day of classes<input type="date" value="${esc(t.classesEnd)}" data-bind="term" data-f="classesEnd"></label>
          <label>Exams start<input type="date" value="${esc(t.examStart)}" data-bind="term" data-f="examStart"></label>
          <label>Exams end<input type="date" value="${esc(t.examEnd)}" data-bind="term" data-f="examEnd"></label>
        </div>
        <h3>Breaks and days off</h3>
        <p class="muted small">No classes are scheduled on these days.</p>
        ${breaks || `<p class="empty">No breaks added.</p>`}
        <button type="button" class="btn small" data-act="add-break">+ Add a break</button>
      </div>` : ""}`;
  }

  function stepCourses() {
    const list = P.courses.map((c) => `
      <li class="course-chip c${c.color}">
        <span class="dot"></span>
        <span class="chip-text"><b>${esc(c.code)}</b>${c.name ? `<span class="muted"> · ${esc(c.name)}</span>` : ""}</span>
        <button type="button" class="icon-btn" data-act="del-course" data-id="${c.id}" aria-label="Remove ${esc(c.code)}">×</button>
      </li>`).join("");
    return `
      <h2 tabindex="-1">What courses are you taking?</h2>
      <p class="muted">Add each course code, like <span class="mono">MATH 121</span> or <span class="mono">PSYC 100</span>. The name is optional.</p>
      <form class="card add-course" data-form="course" autocomplete="off">
        <div class="grid2">
          <label>Course code<input id="newCode" name="code" placeholder="CISC 124" required autocapitalize="characters" maxlength="12"></label>
          <label>Name (optional)<input id="newName" name="name" placeholder="Intro to Computing II" maxlength="60"></label>
        </div>
        <p class="field-error" id="codeError" hidden></p>
        <button type="submit" class="btn">+ Add course</button>
      </form>
      ${P.courses.length ? `<ul class="course-list">${list}</ul>` : `<p class="empty">No courses yet.</p>`}`;
  }

  function dayToggles(scope, id, days) {
    return `<div class="days" role="group" aria-label="Days">${DAYS.map((d) => `
      <button type="button" class="day ${days.includes(d) ? "on" : ""}" data-act="toggle-day" data-scope="${scope}" data-id="${id}" data-day="${d}" aria-pressed="${days.includes(d)}" aria-label="${d}">${DAY_SHORT[d]}</button>`).join("")}</div>`;
  }

  function stepClasses() {
    const conf = conflicts();
    const conflictIds = new Set(conf.flatMap((x) => x.refs));
    const bad = new Set(badTimes());
    const cards = P.courses.map((c) => {
      const rows = c.meetings.map((m) => `
        <div class="meeting ${conflictIds.has(m.id) ? "warn" : ""} ${bad.has(m.id) ? "error" : ""}">
          <div class="meeting-top">
            <select aria-label="Class type" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="type">
              ${MEETING_TYPES.map((t) => `<option ${m.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <button type="button" class="icon-btn" data-act="del-meeting" data-c="${c.id}" data-id="${m.id}" aria-label="Remove this ${esc(m.type)}">×</button>
          </div>
          ${dayToggles("meeting", m.id, m.days)}
          <div class="meeting-bottom">
            <label class="inline">From<input type="time" value="${esc(m.start)}" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="start"></label>
            <label class="inline">to<input type="time" value="${esc(m.end)}" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="end"></label>
            <input type="text" class="grow" placeholder="Room (optional)" aria-label="Room" value="${esc(m.location)}" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="location">
          </div>
          ${bad.has(m.id) ? `<p class="field-error">The end time is before the start time.</p>` : ""}
        </div>`).join("");
      return `
        <div class="card course-card c${c.color}">
          <div class="course-head"><span class="dot"></span><h3>${esc(c.code)}</h3>${c.name ? `<span class="muted small">${esc(c.name)}</span>` : ""}</div>
          ${rows || `<p class="empty">No class times yet.</p>`}
          <div class="add-row">
            ${MEETING_TYPES.map((t) => `<button type="button" class="btn small" data-act="add-meeting" data-c="${c.id}" data-type="${t}">+ ${t}</button>`).join("")}
          </div>
        </div>`;
    }).join("");
    return `
      <h2 tabindex="-1">When are your classes?</h2>
      <p class="muted">Add each lecture, tutorial and lab, and tap the days it meets. You can find these on SOLUS or your Qflow timetable.</p>
      ${conf.length ? `<div class="alert warn" role="status"><b>Time clash:</b> ${conf.map((x) => `${x.day} ${esc(x.a.label)} and ${esc(x.b.label)}`).join("; ")}.</div>` : ""}
      ${cards}`;
  }

  function stepDeadlines() {
    const cards = P.courses.map((c) => {
      const total = weightTotal(c);
      const rows = c.assessments.map((a) => `
        <div class="assess ${outsideTerm(a) ? "warn" : ""}">
          <input type="text" class="grow" placeholder="Name, e.g. Assignment 1" aria-label="Assessment name" value="${esc(a.name)}" data-bind="assess" data-c="${c.id}" data-id="${a.id}" data-f="name">
          <select aria-label="Type" data-bind="assess" data-c="${c.id}" data-id="${a.id}" data-f="type">
            ${ASSESS_TYPES.map((t) => `<option ${a.type === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <input type="date" aria-label="Due date" value="${esc(a.due)}" data-bind="assess" data-c="${c.id}" data-id="${a.id}" data-f="due">
          <label class="weight"><input type="number" inputmode="decimal" min="0" max="100" step="0.5" aria-label="Weight in percent" value="${esc(a.weight)}" data-bind="assess" data-c="${c.id}" data-id="${a.id}" data-f="weight"><span>%</span></label>
          <button type="button" class="icon-btn" data-act="del-assess" data-c="${c.id}" data-id="${a.id}" aria-label="Remove ${esc(a.name || a.type)}">×</button>
          ${a.type === "Final exam" && !a.due ? `<p class="hint">Leave the date blank until the exam schedule is posted.</p>` : ""}
          ${outsideTerm(a) ? `<p class="hint warn-text">This date is outside your term.</p>` : ""}
        </div>`).join("");
      return `
        <div class="card course-card c${c.color}">
          <div class="course-head"><span class="dot"></span><h3>${esc(c.code)}</h3>
            <span class="total ${c.assessments.length && total !== 100 ? "off" : ""}" data-total="${c.id}">${c.assessments.length ? `Total ${total}%` : ""}</span></div>
          ${rows || `<p class="empty">No deadlines yet.</p>`}
          <div class="add-row">
            ${["Assignment", "Quiz", "Lab", "Midterm", "Final exam", "Other"].map((t) => `<button type="button" class="btn small" data-act="add-assess" data-c="${c.id}" data-type="${t}">+ ${t}</button>`).join("")}
          </div>
        </div>`;
    }).join("");
    return `
      <h2 tabindex="-1">What's due, and what's it worth?</h2>
      <p class="muted">Copy the graded work from each syllabus: name, due date and weight. Weights for each course should add up to 100%.</p>
      ${cards}`;
  }

  function stepRoutine() {
    const r = P.routine;
    const bad = new Set(badTimes());
    const rows = r.commitments.map((m) => `
      <div class="meeting ${bad.has(m.id) ? "error" : ""}">
        <div class="meeting-top">
          <input type="text" class="grow" placeholder="e.g. Work shift, Volleyball" aria-label="What is it?" value="${esc(m.label)}" data-bind="commit" data-id="${m.id}" data-f="label">
          <button type="button" class="icon-btn" data-act="del-commit" data-id="${m.id}" aria-label="Remove ${esc(m.label || "commitment")}">×</button>
        </div>
        ${dayToggles("commit", m.id, m.days)}
        <div class="meeting-bottom">
          <label class="inline">From<input type="time" value="${esc(m.start)}" data-bind="commit" data-id="${m.id}" data-f="start"></label>
          <label class="inline">to<input type="time" value="${esc(m.end)}" data-bind="commit" data-id="${m.id}" data-f="end"></label>
        </div>
        ${bad.has(m.id) ? `<p class="field-error">The end time is before the start time.</p>` : ""}
      </div>`).join("");
    return `
      <h2 tabindex="-1">What does a normal week look like?</h2>
      <p class="muted">This helps fit study time around everything else in your week.</p>
      <div class="card">
        <div class="grid3">
          <label>Usually up by<input type="time" value="${esc(r.wake)}" data-bind="routine" data-f="wake"></label>
          <label>Usually in bed by<input type="time" value="${esc(r.bed)}" data-bind="routine" data-f="bed"></label>
          <label>Commute to campus<span class="with-unit"><input type="number" min="0" max="180" step="5" inputmode="numeric" value="${esc(r.commute)}" data-bind="routine" data-f="commute"><span>min</span></span></label>
        </div>
      </div>
      <div class="card">
        <h3>Regular commitments</h3>
        <p class="muted small">Work, sports, clubs, appointments: anything that happens at the same time every week.</p>
        ${rows || `<p class="empty">Nothing added.</p>`}
        <button type="button" class="btn small" data-act="add-commit">+ Add a commitment</button>
      </div>`;
  }

  function stepStudy() {
    const s = P.study;
    const hrs = classHoursPerWeek();
    const styles = [
      { id: "spread", title: "A bit of everything", sub: "Study blocks rotate through all your courses each day." },
      { id: "focus", title: "One course a day", sub: "Each day focuses on a single course. Good for deep work." },
    ];
    return `
      <h2 tabindex="-1">How do you like to study?</h2>
      <div class="choices">${styles.map((o) => `
        <button type="button" class="choice ${s.style === o.id ? "on" : ""}" data-act="style" data-id="${o.id}" aria-pressed="${s.style === o.id}">
          <span class="choice-title">${o.title}</span><span class="choice-sub">${o.sub}</span>
        </button>`).join("")}
      </div>
      <div class="card">
        <label for="hours">Study goal outside of class</label>
        <div class="slider-row">
          <input id="hours" type="range" min="0" max="50" step="1" value="${esc(s.weeklyHours)}" data-bind="study" data-f="weeklyHours">
          <output id="hoursOut" class="mono">${esc(s.weeklyHours)} h/week</output>
        </div>
        <p class="muted small">You have ${hrs} hours of class a week. You can change this goal at any time.</p>
      </div>`;
  }

  function weekPreview() {
    const blocks = weekBlocks();
    const days = DAYS.filter((d, i) => i < 5 || blocks.some((b) => b.day === d));
    let lo = 8 * 60, hi = 18 * 60;
    blocks.forEach((b) => { lo = Math.min(lo, toMin(b.start)); hi = Math.max(hi, toMin(b.end)); });
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    const pxPerMin = 0.8, height = (hi - lo) * pxPerMin;
    const hours = [];
    for (let m = lo; m <= hi; m += 60) hours.push(m);
    // Overlapping blocks sit side by side instead of on top of each other.
    function lanes(list) {
      list = list.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
      const ends = [];
      list.forEach((b) => {
        let i = ends.findIndex((e) => e <= toMin(b.start));
        if (i < 0) { i = ends.length; ends.push(0); }
        ends[i] = toMin(b.end); b.lane = i;
      });
      list.forEach((b) => {
        b.lanes = 1 + Math.max(...list.filter((o) => toMin(o.start) < toMin(b.end) && toMin(b.start) < toMin(o.end)).map((o) => o.lane));
      });
      return list;
    }
    const col = (d) => `
      <div class="wk-col">
        <div class="wk-day">${d}</div>
        <div class="wk-body" style="height:${height}px">
          ${hours.map((m) => `<div class="wk-line" style="top:${(m - lo) * pxPerMin}px"></div>`).join("")}
          ${lanes(blocks.filter((b) => b.day === d)).map((b) => `
            <div class="wk-block ${b.kind === "fixed" ? "fixed" : "c" + b.color}" style="top:${(toMin(b.start) - lo) * pxPerMin}px;left:calc(${(b.lane / b.lanes) * 100}% + 2px);width:calc(${100 / b.lanes}% - 4px);height:${Math.max(18, (toMin(b.end) - toMin(b.start)) * pxPerMin)}px" title="${esc(b.label)} ${fmtTime(b.start)}–${fmtTime(b.end)}">
              <b>${esc(b.label)}</b><span>${fmtTime(b.start)}</span>
            </div>`).join("")}
        </div>
      </div>`;
    return `
      <div class="wk" style="--cols:${days.length}">
        <div class="wk-times" style="height:${height}px">${hours.map((m) => `<span style="top:${(m - lo) * pxPerMin}px">${fmtTime(String(Math.floor(m / 60)).padStart(2, "0") + ":00")}</span>`).join("")}</div>
        ${days.map(col).join("")}
      </div>`;
  }

  function deadlineList(limit) {
    const all = [];
    P.courses.forEach((c) => c.assessments.forEach((a) => all.push({ c, a })));
    all.sort((x, y) => (x.a.due || "9999").localeCompare(y.a.due || "9999"));
    const shown = limit ? all.slice(0, limit) : all;
    if (!all.length) return `<p class="empty">No deadlines added.</p>`;
    return `<ul class="due-list">${shown.map(({ c, a }) => `
      <li class="c${c.color}"><span class="dot"></span>
        <span class="due-date mono">${a.due ? esc(fmtDate(a.due)) : "Date TBA"}</span>
        <span class="due-name"><b>${esc(c.code)}</b> ${esc(a.name || a.type)}</span>
        <span class="due-weight mono">${a.weight !== "" && a.weight != null ? esc(a.weight) + "%" : ""}</span>
      </li>`).join("")}</ul>${limit && all.length > limit ? `<p class="muted small">+ ${all.length - limit} more</p>` : ""}`;
  }

  function summaryCards(editable) {
    const t = P.term;
    const edit = (step) => editable ? `<button type="button" class="link-btn" data-act="edit" data-step="${step}">Edit</button>` : "";
    const nDue = P.courses.reduce((s, c) => s + c.assessments.length, 0);
    return `
      <div class="summary">
        <div class="card sum"><div class="sum-head"><h3>Term</h3>${edit(1)}</div>
          <p><b>${esc(t.label || "Custom term")}</b></p>
          <p class="muted small">Classes ${esc(fmtDate(t.classesStart))} – ${esc(fmtDate(t.classesEnd))}${t.examStart ? `<br>Exams ${esc(fmtDate(t.examStart))} – ${esc(fmtDate(t.examEnd))}` : ""}${t.breaks.length ? `<br>${t.breaks.length} break${t.breaks.length > 1 ? "s" : ""}` : ""}</p></div>
        <div class="card sum"><div class="sum-head"><h3>Courses</h3>${edit(2)}</div>
          <ul class="mini-courses">${P.courses.map((c) => `<li class="c${c.color}"><span class="dot"></span>${esc(c.code)}</li>`).join("")}</ul>
          <p class="muted small">${classHoursPerWeek()} h of class a week</p></div>
        <div class="card sum"><div class="sum-head"><h3>Routine</h3>${edit(5)}</div>
          <p class="muted small">Up by ${fmtTime(P.routine.wake)}, bed by ${fmtTime(P.routine.bed)}<br>${esc(P.routine.commute)} min commute<br>${P.routine.commitments.length} regular commitment${P.routine.commitments.length === 1 ? "" : "s"}</p></div>
        <div class="card sum"><div class="sum-head"><h3>Study plan</h3>${edit(6)}</div>
          <p class="muted small">${P.study.style === "focus" ? "One course a day" : "A bit of everything"}<br>${esc(P.study.weeklyHours)} h/week goal<br>${nDue} deadline${nDue === 1 ? "" : "s"} tracked</p></div>
      </div>`;
  }

  function stepReview() {
    const w = warnings();
    return `
      <h2 tabindex="-1">Here's your semester</h2>
      ${w.length ? `<div class="alert warn" role="status"><b>Worth a second look</b><ul>${w.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="small">You can finish now and fix these later.</p></div>` : `<div class="alert ok" role="status">Everything checks out.</div>`}
      ${summaryCards(true)}
      <div class="card"><div class="sum-head"><h3>Your week</h3><button type="button" class="link-btn" data-act="edit" data-step="3">Edit</button></div>${weekPreview()}</div>
      <div class="card"><div class="sum-head"><h3>Deadlines</h3><button type="button" class="link-btn" data-act="edit" data-step="4">Edit</button></div>${deadlineList()}</div>`;
  }

  function renderDone() {
    return `
      <section class="done">
        <p class="eyebrow">${esc(P.term.label || "Your term")}</p>
        <h2 tabindex="-1">You're all set up</h2>
        <p class="lede">Your semester is saved on this device. The calendar, to-do list and grade tracker views will appear here next.</p>
      </section>
      ${summaryCards(true)}
      <div class="card"><div class="sum-head"><h3>Your week</h3><button type="button" class="link-btn" data-act="edit" data-step="3">Edit</button></div>${weekPreview()}</div>
      <div class="card"><div class="sum-head"><h3>Coming up</h3><button type="button" class="link-btn" data-act="edit" data-step="4">Edit</button></div>${deadlineList(8)}</div>
      <div class="reset">
        ${confirmingReset
          ? `<p>This deletes everything you've entered on this device.</p><button type="button" class="btn danger" data-act="reset-yes">Yes, start over</button> <button type="button" class="btn ghost" data-act="reset-no">Cancel</button>`
          : `<button type="button" class="link-btn muted" data-act="reset">Start over</button>`}
      </div>`;
  }

  // ---------- actions ----------
  function go(step) {
    P.step = Math.max(0, Math.min(step, STEPS.length - 1));
    persist();
    render();
  }

  function addCourse(form) {
    const code = normCode(form.code.value);
    const err = document.getElementById("codeError");
    let msg = "";
    if (!isCode(code)) msg = "Enter a course code like MATH 121.";
    else if (P.courses.some((c) => c.code === code)) msg = code + " is already added.";
    if (msg) { err.textContent = msg; err.hidden = false; form.code.focus(); return; }
    P.courses.push({ id: uid(), code, name: form.name.value.trim(), color: nextColor(), meetings: [], assessments: [] });
    persist();
    render();
    const input = document.getElementById("newCode");
    if (input) input.focus();
  }

  app.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.dataset.form === "course") { e.preventDefault(); addCourse(f); }
  });

  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const d = b.dataset;
    const c = d.c ? course(d.c) : null;
    switch (d.act) {
      case "next": go(P.step + 1); break;
      case "back":
        if (returnToReview) { returnToReview = false; go(STEPS.length - 1); }
        else go(P.step - 1);
        break;
      case "to-review": returnToReview = false; go(STEPS.length - 1); break;
      case "edit":
        returnToReview = true;
        if (P.setupComplete) P.setupComplete = false;
        go(Number(d.step));
        break;
      case "finish":
        P.setupComplete = true;
        P.step = STEPS.length;
        returnToReview = false;
        Store.saveNow(P);
        render();
        break;
      case "preset": {
        if (d.id === "custom") {
          P.term = Object.assign({}, P.term, { presetId: "custom", label: P.term.presetId === "custom" ? P.term.label : "" });
        } else {
          const p = TERM_PRESETS.find((x) => x.id === d.id);
          P.term = { presetId: p.id, label: p.label, classesStart: p.classesStart, classesEnd: p.classesEnd, examStart: p.examStart, examEnd: p.examEnd, breaks: p.breaks.map((x) => Object.assign({}, x)) };
        }
        persist(); render(); break;
      }
      case "add-break": P.term.breaks.push({ label: "", start: "", end: "" }); persist(); render(); break;
      case "del-break": P.term.breaks.splice(Number(d.i), 1); persist(); render(); break;
      case "del-course": P.courses = P.courses.filter((x) => x.id !== d.id); persist(); render(); break;
      case "add-meeting": c.meetings.push({ id: uid(), type: d.type, days: [], start: "", end: "", location: "" }); persist(); render(); break;
      case "del-meeting": c.meetings = c.meetings.filter((m) => m.id !== d.id); persist(); render(); break;
      case "toggle-day": {
        const list = d.scope === "meeting"
          ? P.courses.flatMap((x) => x.meetings).find((m) => m.id === d.id)
          : P.routine.commitments.find((m) => m.id === d.id);
        const i = list.days.indexOf(d.day);
        if (i >= 0) list.days.splice(i, 1); else list.days.push(d.day);
        list.days.sort((a, z) => DAYS.indexOf(a) - DAYS.indexOf(z));
        persist(); render(); break;
      }
      case "add-assess": {
        const n = c.assessments.filter((a) => a.type === d.type).length + 1;
        const name = d.type === "Final exam" ? "Final exam" : d.type === "Other" ? "" : `${d.type} ${n}`;
        c.assessments.push({ id: uid(), name, type: d.type, due: "", weight: "" });
        persist(); render(); break;
      }
      case "del-assess": c.assessments = c.assessments.filter((a) => a.id !== d.id); persist(); render(); break;
      case "add-commit": P.routine.commitments.push({ id: uid(), label: "", days: [], start: "", end: "" }); persist(); render(); break;
      case "del-commit": P.routine.commitments = P.routine.commitments.filter((m) => m.id !== d.id); persist(); render(); break;
      case "style": P.study.style = d.id; persist(); render(); break;
      case "reset": confirmingReset = true; render(); break;
      case "reset-no": confirmingReset = false; render(); break;
      case "reset-yes": confirmingReset = false; Store.clear(); P = Store.emptyProfile(); returnToReview = false; render(); break;
    }
  });

  // Typing updates the profile without re-rendering, so focus stays put.
  // Things that change other parts of the page re-render on "change" instead.
  function bind(el) {
    const d = el.dataset;
    if (!d.bind) return null;
    let v = el.value;
    if (el.type === "number" || el.type === "range") v = v === "" ? "" : Number(v);
    switch (d.bind) {
      case "term": P.term[d.f] = v; break;
      case "break": P.term.breaks[Number(d.i)][d.f] = v; break;
      case "meeting": course(d.c).meetings.find((m) => m.id === d.id)[d.f] = v; break;
      case "assess": course(d.c).assessments.find((a) => a.id === d.id)[d.f] = v; break;
      case "commit": P.routine.commitments.find((m) => m.id === d.id)[d.f] = v; break;
      case "routine": P.routine[d.f] = v; break;
      case "study": P.study[d.f] = v; break;
    }
    persist();
    return d;
  }

  function refreshNav() {
    const id = STEPS[P.step] && STEPS[P.step].id;
    if (!id) return;
    const problem = stepProblem(id);
    const btn = app.querySelector('[data-act="next"], [data-act="to-review"]');
    if (btn && btn.closest(".navbar")) btn.disabled = !!problem;
    const hint = document.getElementById("navHint");
    if (hint) { hint.textContent = problem; hint.hidden = !problem; }
  }

  app.addEventListener("input", (e) => {
    const d = bind(e.target);
    if (!d) return;
    if (d.bind === "assess" && d.f === "weight") {
      const c = course(d.c), t = weightTotal(c), el = app.querySelector(`[data-total="${d.c}"]`);
      if (el) { el.textContent = `Total ${t}%`; el.classList.toggle("off", t !== 100); }
    }
    if (d.bind === "study") { const o = document.getElementById("hoursOut"); if (o) o.textContent = `${e.target.value} h/week`; }
    if (d.bind === "term") P.term.presetId = P.term.presetId || "custom";
    refreshNav();
  });

  app.addEventListener("change", (e) => {
    const d = e.target.dataset;
    if (!d.bind) return;
    // Times, dates and selects affect warnings elsewhere on the page.
    if (["start", "end", "due", "type"].includes(d.f) && ["meeting", "assess", "commit"].includes(d.bind)) render();
    else refreshNav();
  });

  // Clear the course-code error as soon as they type again.
  app.addEventListener("keydown", (e) => {
    if (e.target.id === "newCode") { const err = document.getElementById("codeError"); if (err) err.hidden = true; }
  });

  if (P.setupComplete) P.step = STEPS.length;
  render();
})();
