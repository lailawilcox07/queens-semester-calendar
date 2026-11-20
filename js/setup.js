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
  // Uploads being read or reviewed. Not saved: a review is finished in one sitting.
  const pending = { timetable: null, syllabus: {}, unassigned: [] };
  let dropNotice = false;
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
  // Classes and weekly commitments are stored as "slots": one day + start + end
  // each, so the same lecture can run at different times on different days.
  const validSlot = (sl) => sl.start && sl.end && toMin(sl.end) > toMin(sl.start);
  const DAY_OF_DATE = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DAYS[(new Date(y, m - 1, d).getDay() + 6) % 7]; };

  function classHoursPerWeek() {
    let mins = 0;
    P.courses.forEach((c) => c.meetings.forEach((m) => m.slots.forEach((sl) => {
      if (validSlot(sl)) mins += toMin(sl.end) - toMin(sl.start);
    })));
    return Math.round((mins / 60) * 10) / 10;
  }

  // Every timed block in a normal week, for conflict checks and the preview.
  function weekBlocks() {
    const out = [];
    P.courses.forEach((c) => c.meetings.forEach((m) => m.slots.forEach((sl) => {
      if (validSlot(sl)) out.push({ day: sl.day, start: sl.start, end: sl.end, label: c.code + " " + m.type, title: c.code, type: m.type, sub: m.location, color: c.color, kind: "class", ref: sl.id });
    })));
    P.routine.commitments.forEach((m) => m.slots.forEach((sl) => {
      if (validSlot(sl)) out.push({ day: sl.day, start: sl.start, end: sl.end, label: m.label || "Commitment", title: m.label || "Commitment", type: "", sub: m.commute ? `${m.commute} min travel each way` : "", color: 0, kind: "fixed", ref: sl.id });
    }));
    return out;
  }

  const overlaps = (a, b) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

  function conflicts() {
    const blocks = weekBlocks();
    const found = [];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.day === b.day && overlaps(a, b)) found.push({ day: a.day, a, b, refs: [a.ref, b.ref] });
    }
    return found;
  }

  // One-off events that land on top of a weekly class or commitment.
  function oneoffClashes() {
    const blocks = weekBlocks();
    const out = [];
    P.routine.oneoffs.forEach((o) => {
      if (!o.date || !validSlot(o)) return;
      const day = DAY_OF_DATE(o.date);
      blocks.filter((b) => b.day === day && overlaps(b, o)).forEach((b) => out.push({ o, b }));
    });
    return out;
  }

  function badTimes() {
    const bad = [];
    const check = (sl) => { if (sl.start && sl.end && toMin(sl.end) <= toMin(sl.start)) bad.push(sl.id); };
    P.courses.forEach((c) => c.meetings.forEach((m) => m.slots.forEach(check)));
    P.routine.commitments.forEach((m) => m.slots.forEach(check));
    P.routine.oneoffs.forEach(check);
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
    oneoffClashes().forEach(({ o, b }) => w.push(`${o.label || "One-off event"} on ${fmtDate(o.date)} overlaps ${b.label} (${fmtTime(b.start)}–${fmtTime(b.end)}).`));
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
  // If a field loses focus because the student is pressing a button, re-drawing
  // right then would swap the button out from under the click. Wait until the
  // press is over; the button's own handler re-draws anyway.
  let pressing = false, renderWaiting = false;
  document.addEventListener("pointerdown", () => { pressing = true; }, true);
  document.addEventListener("pointerup", () => {
    pressing = false;
    if (renderWaiting) setTimeout(() => { if (renderWaiting) render(); }, 0);
  }, true);

  function render() {
    if (pressing) { renderWaiting = true; return; }
    renderWaiting = false;
    const scrollY = window.scrollY;
    const keepScroll = render._sameStep === P.step;
    render._sameStep = P.step;
    // Keep focus on the same control across re-renders (e.g. tabbing through grades).
    const a = document.activeElement;
    const focusKey = a && a.dataset && (a.dataset.a || a.dataset.bind) ? `[data-${a.dataset.a ? "a" : "bind"}="${a.dataset.a || a.dataset.bind}"][data-id="${a.dataset.id || ""}"]` : null;
    const acct = document.getElementById("account");
    if (acct) acct.innerHTML = Sync.chipHTML();
    if (P.setupComplete && P.step >= STEPS.length) app.innerHTML = Sync.panelHTML() + Install.cardHTML() + App.render(P) + renderFooter();
    else app.innerHTML = Sync.panelHTML() + renderShell(STEPS[P.step].id);
    window.scrollTo(0, keepScroll ? scrollY : 0);
    if (P.setupComplete && P.step >= STEPS.length) { App.afterRender(app); Install.afterRender(); }
    if (focusKey && keepScroll) { const el = app.querySelector(focusKey); if (el) el.focus({ preventScroll: true }); }
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
        <div class="card ready">
          <h3>Before you start, grab these</h3>
          <ol>
            <li><b>Your class schedule from MySOLUS.</b> ${Uploader.enabled() ? "Take a screenshot of your weekly schedule. You can upload it and we'll fill in your classes." : "You'll copy your class times from it."}</li>
            <li><b>The syllabus for each course from onQ.</b> ${Uploader.enabled() ? "Download each one as a PDF. You can upload them and we'll fill in your deadlines and weights." : "You'll copy the deadlines and weights from them."}</li>
          </ol>
          <p class="muted small">Setup is easiest on a laptop.</p>
        </div>
        ${dropboxHTML()}
        <p class="privacy"><b>Private by default.</b> No account needed. Everything you enter stays on this device.${Uploader.enabled() ? " If you upload a syllabus or timetable, it's sent to Claude, Anthropic's AI, to read it. This site doesn't keep a copy." : ""}</p>
        <p class="muted small">You can skip anything and come back to it later.</p>
        <button type="button" class="btn primary big" data-act="next">${resuming ? "Continue setup" : "Get started"}</button>
        ${resuming ? "" : `<p><button type="button" class="link-btn" data-act="demo">Or try a demo with sample courses</button></p>`}
        ${Sync.enabled() && !Sync.user() ? `<p class="small muted">Already set up on another device? <button type="button" class="link-btn" data-s="open">Sign in</button></p>` : ""}
      </section>`;
  }

  function stepTerm() {
    const t = P.term;
    const presets = Terms.upcomingTerms().map((p) => `
      <button type="button" class="choice ${t.presetId === p.id ? "on" : ""}" data-act="preset" data-id="${p.id}" aria-pressed="${t.presetId === p.id}">
        <span class="choice-title">${esc(p.label)}</span>
        <span class="choice-sub">${p.known ? `Classes ${esc(fmtDate(p.classesStart))} – ${esc(fmtDate(p.classesEnd))}` : "Dates not published yet. You'll enter them."}</span>
      </button>`).join("");
    const breaks = t.breaks.map((b, i) => `
      <div class="row break-row">
        <input type="text" aria-label="Break name" placeholder="e.g. Reading week" value="${esc(b.label)}" data-bind="break" data-i="${i}" data-f="label">
        <input type="date" aria-label="Break starts" value="${esc(b.start)}" data-bind="break" data-i="${i}" data-f="start">
        <input type="date" aria-label="Break ends" value="${esc(b.end)}" data-bind="break" data-i="${i}" data-f="end">
        <button type="button" class="icon-btn" data-act="del-break" data-i="${i}" aria-label="Remove ${esc(b.label || "break")}">×</button>
      </div>`).join("");
    return `
      ${dropNotice ? `<div class="alert ok" role="status">We read your files. Check your term here, then review what we found on the next steps: courses, class times and deadlines.</div>` : ""}
      <h2 tabindex="-1">Which term are you planning?</h2>
      <p class="muted">Dates come from the Queen's Arts and Science sessional dates, including reading week and holidays. If your faculty's dates are different, edit them below.</p>
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
        <span class="chip-text"><b>${esc(c.code)}</b><input class="chip-name" type="text" placeholder="Course name" aria-label="${esc(c.code)} name" maxlength="80" value="${esc(c.name)}" data-bind="course" data-id="${c.id}" data-f="name"></span>
        <button type="button" class="icon-btn" data-act="del-course" data-id="${c.id}" aria-label="Remove ${esc(c.code)}">×</button>
      </li>`).join("");
    return `
      <h2 tabindex="-1">What courses are you taking?</h2>
      <p class="muted">Add each course code, like <span class="mono">MATH 121</span> or <span class="mono">PSYC 100</span>.${Uploader.enabled() ? " We'll fill in the course name from the Queen's Academic Calendar, and you can change it." : " The name is optional."}</p>
      ${timetablePanel()}
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

  // Day buttons. Turning a day on adds its own time row, copied from the last one.
  function dayToggles(scope, id, slots) {
    const on = new Set(slots.map((sl) => sl.day));
    return `<div class="days" role="group" aria-label="Days">${DAYS.map((d) => `
      <button type="button" class="day ${on.has(d) ? "on" : ""}" data-act="toggle-day" data-scope="${scope}" data-id="${id}" data-day="${d}" aria-pressed="${on.has(d)}" aria-label="${d}">${DAY_SHORT[d]}</button>`).join("")}</div>`;
  }

  // Hour + minute dropdowns instead of the browser's time box, which shows
  // seconds on some phones. Minutes go in 5s; classes start on :00 or :30.
  const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am to 11pm
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
  function timePicker(attrs, value, label) {
    const [h, m] = value ? value.split(":").map(Number) : [null, null];
    const hourLabel = (x) => (x % 12 || 12) + (x < 12 ? " am" : " pm");
    return `<span class="tp" role="group" aria-label="${esc(label)}">
      <select aria-label="${esc(label)} hour" ${attrs} data-part="h">
        <option value="" ${h == null ? "selected" : ""}>--</option>
        ${HOURS.map((x) => `<option value="${x}" ${x === h ? "selected" : ""}>${hourLabel(x)}</option>`).join("")}
      </select><span class="tp-colon">:</span><select aria-label="${esc(label)} minutes" ${attrs} data-part="m">
        <option value="" ${m == null ? "selected" : ""}>--</option>
        ${MINUTES.map((x) => `<option value="${x}" ${x === m ? "selected" : ""}>${String(x).padStart(2, "0")}</option>`).join("")}
      </select></span>`;
  }

  function slotRows(scope, parentId, slots, bad, clashIds, extra) {
    if (!slots.length) return `<p class="hint">Tap the days it happens.</p>`;
    return `<div class="slots">${slots.map((sl) => {
      const a = `data-bind="slot" data-scope="${scope}" data-id="${parentId}" data-s="${sl.id}"${extra || ""}`;
      return `<div class="slot ${bad.has(sl.id) ? "error" : ""} ${clashIds.has(sl.id) ? "warn" : ""}">
        <span class="slot-day">${sl.day}</span>
        ${timePicker(a + ' data-f="start"', sl.start, sl.day + " start")}
        <span class="slot-to">to</span>
        ${timePicker(a + ' data-f="end"', sl.end, sl.day + " end")}
        ${bad.has(sl.id) ? `<span class="field-error slot-err">Ends before it starts</span>` : ""}
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- upload to autofill ----------
  const spinner = (text) => `<div class="upload-status" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;
  const warnList = (w) => w && w.length ? `<div class="alert warn"><b>Double-check</b><ul>${w.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  // Uploaded meetings come back as days + one time; stored meetings are slots.
  const slotSig = (slots) => slots.map((sl) => sl.day + sl.start + sl.end).sort().join("|");
  const toSlots = (m) => m.days.map((day) => ({ id: uid(), day, start: m.start, end: m.end }));
  const sameMeeting = (stored, up) => stored.type === up.type && slotSig(stored.slots) === slotSig(toSlots(up));

  function timetablePanel() {
    if (!Uploader.enabled()) return "";
    const st = pending.timetable;
    const btn = (label) => `<button type="button" class="btn small" data-act="upload" data-kind="timetable">${label}</button>`;
    if (!st) return `
      <div class="card upload-card">
        <h3>Have a screenshot of your timetable?</h3>
        <p class="muted small">Upload a screenshot from SOLUS or Qflow and we'll fill in your courses and class times. You'll check everything before it's added.</p>
        ${btn("Upload timetable screenshot")}
      </div>`;
    if (st.status === "loading") return `<div class="card upload-card">${spinner("Reading your timetable. This can take a little while.")}</div>`;
    if (st.status === "error") return `<div class="card upload-card"><div class="alert warn">${esc(st.error)}</div>${btn("Try again")} <button type="button" class="btn small ghost" data-act="discard" data-kind="timetable">Cancel</button></div>`;
    const r = st.result;
    if (!r.courses.length) return `<div class="card upload-card"><div class="alert warn">We couldn't find any classes in that image. Try a clearer screenshot of the weekly view, or type them in below.</div>${warnList(r.warnings)}${btn("Try another screenshot")} <button type="button" class="btn small ghost" data-act="discard" data-kind="timetable">Cancel</button></div>`;
    let n = 0;
    const groups = r.courses.map((c, ci) => {
      const existing = P.courses.find((x) => x.code === normCode(c.course_code));
      return `<div class="pick-group">
        <div class="pick-head"><b>${esc(normCode(c.course_code))}</b><span class="muted small">${existing ? "Already in your courses" : "New course, will be added"}</span></div>
        ${c.meetings.map((m, mi) => {
          const k = ci + ":" + mi, on = !st.skip.has(k);
          if (on) n++;
          return `<label class="pick"><input type="checkbox" data-act="pick" data-kind="timetable" data-k="${k}" ${on ? "checked" : ""}>
            <span><b>${esc(m.type)}</b> · ${esc(m.days.join(" "))} · ${fmtTime(m.start)}–${fmtTime(m.end)}${m.location ? ` · <span class="muted">${esc(m.location)}</span>` : ""}</span></label>`;
        }).join("")}
      </div>`;
    }).join("");
    return `<div class="card upload-card review">
      <h3>Here's what we found</h3>
      <p class="muted small">Untick anything that's wrong. You can edit times after adding them.</p>
      ${warnList(r.warnings)}${groups}
      <div class="add-row"><button type="button" class="btn primary small" data-act="apply-timetable" ${n ? "" : "disabled"}>Add ${n} class time${n === 1 ? "" : "s"}</button>
      <button type="button" class="btn small ghost" data-act="discard" data-kind="timetable">Discard</button></div>
    </div>`;
  }

  function syllabusPanel(c) {
    if (!Uploader.enabled()) return "";
    const st = pending.syllabus[c.id];
    const btn = (label) => `<button type="button" class="btn small" data-act="upload" data-kind="syllabus" data-c="${c.id}">${label}</button>`;
    if (!st) return `<div class="upload-row">${btn("Upload syllabus")}<span class="muted small">PDF or photos. We'll fill in the deadlines for you to check.</span></div>`;
    if (st.status === "loading") return spinner("Reading your syllabus. This can take a little while.");
    if (st.status === "error") return `<div class="alert warn">${esc(st.error)}</div><div class="add-row">${btn("Try again")}<button type="button" class="btn small ghost" data-act="discard" data-kind="syllabus" data-c="${c.id}">Cancel</button></div>`;
    const r = st.result;
    const found = r.course_code ? normCode(r.course_code) : "";
    const mismatch = found && isCode(found) && found !== c.code;
    let n = 0, total = 0;
    const rows = r.assessments.map((a, i) => {
      const on = !st.skip.has(String(i));
      if (on) { n++; total += a.weight || 0; }
      return `<label class="pick"><input type="checkbox" data-act="pick" data-kind="syllabus" data-c="${c.id}" data-k="${i}" ${on ? "checked" : ""}>
        <span class="pick-main"><b>${esc(a.name)}</b> <span class="muted">${esc(a.type)}</span>${a.note ? `<span class="hint">${esc(a.note)}</span>` : ""}</span>
        <span class="pick-date mono">${a.due_date ? esc(fmtDate(a.due_date)) : "No date"}</span>
        <span class="pick-weight mono">${a.weight != null ? esc(a.weight) + "%" : ""}</span></label>`;
    }).join("");
    return `<div class="review">
      ${mismatch ? `<div class="alert warn">This looks like the syllabus for <b>${esc(found)}</b>, not ${esc(c.code)}.</div>` : ""}
      <h3>Found ${r.assessments.length} graded item${r.assessments.length === 1 ? "" : "s"}</h3>
      <p class="muted small">Untick anything that's wrong. Selected items add up to ${Math.round(total * 100) / 100}%.</p>
      ${warnList(r.warnings)}
      ${rows || `<p class="empty">Nothing graded was found.</p>`}
      <div class="add-row"><button type="button" class="btn primary small" data-act="apply-syllabus" data-c="${c.id}" ${n ? "" : "disabled"}>Add ${n} to ${esc(c.code)}</button>
      <button type="button" class="btn small ghost" data-act="discard" data-kind="syllabus" data-c="${c.id}">Discard</button></div>
    </div>`;
  }

  // Review state for an upload's results. Items the student already has start unticked.
  function syllabusReview(courseId, result) {
    const have = new Set(course(courseId).assessments.map((a) => (a.name || "").toLowerCase()));
    const skip = new Set();
    result.assessments.forEach((a, i) => { if (have.has(a.name.toLowerCase())) skip.add(String(i)); });
    return { status: "review", result, skip };
  }
  function timetableReview(result) {
    const skip = new Set();
    result.courses.forEach((c, ci) => {
      const ex = P.courses.find((x) => x.code === normCode(c.course_code));
      c.meetings.forEach((m, mi) => { if (ex && ex.meetings.some((em) => sameMeeting(em, m))) skip.add(ci + ":" + mi); });
    });
    return { status: "review", result, skip };
  }

  // ---------- the welcome-page dropbox: upload everything at once ----------
  const drop = { files: [], running: false, over: false };
  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  function addDropFiles(list) {
    Array.from(list || []).forEach((f) => {
      if (!isPdf(f) && !/^image\//.test(f.type) && !/\.(heic|heif|png|jpe?g|webp)$/i.test(f.name)) return;
      // Guess: PDFs are syllabi; the first image is the schedule screenshot.
      const kind = isPdf(f) ? "syllabus" : drop.files.some((x) => x.kind === "timetable") ? "syllabus" : "timetable";
      drop.files.push({ id: uid(), file: f, kind, status: "ready", error: "" });
    });
    render();
  }

  function dropboxHTML() {
    if (!Uploader.enabled()) return "";
    const rows = drop.files.map((x) => `
      <li class="drop-file st-${x.status}">
        <span class="drop-name">${esc(x.file.name)}</span>
        ${x.status === "ready" ? `<select data-act="drop-kind" data-id="${x.id}" aria-label="What is ${esc(x.file.name)}?">
            <option value="timetable" ${x.kind === "timetable" ? "selected" : ""} ${isPdf(x.file) ? "disabled" : ""}>MySOLUS schedule</option>
            <option value="syllabus" ${x.kind === "syllabus" ? "selected" : ""}>Syllabus</option>
          </select>
          <button type="button" class="icon-btn" data-act="drop-remove" data-id="${x.id}" aria-label="Remove ${esc(x.file.name)}">×</button>`
        : x.status === "reading" ? `<span class="drop-status"><span class="spinner" aria-hidden="true"></span>Reading</span>`
        : x.status === "done" ? `<span class="drop-status ok">Read</span>`
        : `<span class="drop-status bad">${esc(x.error)}</span>`}
      </li>`).join("");
    const n = drop.files.filter((x) => x.status === "ready").length;
    const finished = drop.files.length && !drop.running && drop.files.every((x) => x.status === "done" || x.status === "error");
    return `
      <div class="card dropzone ${drop.over ? "over" : ""}" data-drop>
        <h3>Upload them here</h3>
        <p class="muted small">Drop your schedule screenshot and syllabus PDFs here, and we'll fill in your courses, class times and deadlines. You'll check everything before it's saved.</p>
        ${drop.files.length ? `<ul class="drop-files">${rows}</ul>` : ""}
        <div class="add-row">
          ${drop.running ? "" : `<button type="button" class="btn small" data-act="drop-pick">${drop.files.length ? "Add more files" : "Choose files"}</button>`}
          ${n && !drop.running ? `<button type="button" class="btn small primary" data-act="drop-go">Read ${n} file${n === 1 ? "" : "s"} and start</button>` : ""}
          ${finished ? `<button type="button" class="btn small primary" data-act="drop-review">Review what we found</button>` : ""}
          ${!drop.files.length ? `<span class="muted small drop-hint">or drag them onto this box</span>` : ""}
        </div>
      </div>`;
  }

  async function runDrop() {
    if (Sync.enabled() && !Sync.user()) { Sync.open(); window.scrollTo(0, 0); return; }
    // Syllabus dates need a term to work out the year; use the next one if none is set yet.
    if (!P.term.classesStart) {
      // The first term with more than 3 weeks of classes left (late in a term, students are planning the next one).
      const soon = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
      const known = Terms.upcomingTerms().filter((x) => x.known);
      const t = known.find((x) => x.classesEnd > soon) || known[known.length - 1];
      if (t) P.term = { presetId: t.id, label: t.label, classesStart: t.classesStart, classesEnd: t.classesEnd, examStart: t.examStart, examEnd: t.examEnd, breaks: t.breaks.map((b) => Object.assign({}, b)) };
    }
    drop.running = true;
    const todo = drop.files.filter((x) => x.status === "ready");
    const work = async (x) => {
      x.status = "reading"; render();
      try {
        const prepared = await Uploader.prepare([x.file], x.kind);
        x.result = await Uploader.send(x.kind, prepared, P.term);
        x.status = "done";
      } catch (e) {
        x.status = "error"; x.error = e.message;
      }
      render();
    };
    // Two at a time keeps it quick without tripping the upload limits.
    const queue = todo.slice();
    await Promise.all([0, 1].map(async () => { while (queue.length) await work(queue.shift()); }));
    drop.running = false;
    applyDrop();
    render();
  }

  // Turn what was read into the usual review panels on each step.
  function applyDrop() {
    const timetables = drop.files.filter((x) => x.status === "done" && x.kind === "timetable" && !x.applied);
    if (timetables.length) {
      const courses = [], warnings = [];
      timetables.forEach((x) => { courses.push(...x.result.courses); warnings.push(...x.result.warnings); x.applied = true; });
      if (courses.length) pending.timetable = timetableReview({ courses, warnings });
    }
    drop.files.filter((x) => x.status === "done" && x.kind === "syllabus" && !x.applied).forEach((x) => {
      x.applied = true;
      const code = x.result.course_code ? normCode(x.result.course_code) : "";
      if (!isCode(code)) { pending.unassigned.push({ id: x.id, name: x.file.name, result: x.result }); return; }
      let c = P.courses.find((y) => y.code === code);
      if (!c) {
        c = { id: uid(), code, name: x.result.course_name || "", color: nextColor(), meetings: [], assessments: [] };
        P.courses.push(c);
      }
      pending.syllabus[c.id] = syllabusReview(c.id, x.result);
    });
    persist();
  }

  function unassignedPanel() {
    if (!pending.unassigned.length) return "";
    return pending.unassigned.map((u) => `
      <div class="card upload-card review">
        <h3>Which course is this syllabus for?</h3>
        <p class="muted small">We couldn't find a course code in <b>${esc(u.name)}</b>.</p>
        <div class="add-row">
          <select id="assign-${u.id}" aria-label="Course for ${esc(u.name)}">${P.courses.map((c) => `<option value="${c.id}">${esc(c.code)}</option>`).join("")}</select>
          <button type="button" class="btn small primary" data-act="assign-syllabus" data-id="${u.id}" ${P.courses.length ? "" : "disabled"}>Use for this course</button>
          <button type="button" class="btn small ghost" data-act="drop-unassigned" data-id="${u.id}">Discard</button>
        </div>
      </div>`).join("");
  }

  function startUpload(kind, courseId) {
    if (Sync.enabled() && !Sync.user()) {
      // Uploads cost money to read, so they're limited per student and need an account.
      Sync.open();
      window.scrollTo(0, 0);
      return;
    }
    const input = document.getElementById("filePick");
    input.accept = kind === "timetable" ? "image/*" : "application/pdf,image/*";
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      input.value = "";
      if (!files.length) return;
      const set = (v) => { if (kind === "timetable") pending.timetable = v; else pending.syllabus[courseId] = v; };
      set({ status: "loading" });
      render();
      try {
        const prepared = await Uploader.prepare(files, kind);
        const result = await Uploader.send(kind, prepared, P.term);
        set(kind === "syllabus" ? syllabusReview(courseId, result) : timetableReview(result));
      } catch (e) {
        set({ status: "error", error: e.message });
      }
      render();
    };
    input.click();
  }

  function applyTimetable() {
    const st = pending.timetable;
    st.result.courses.forEach((c, ci) => {
      const picked = c.meetings.filter((m, mi) => !st.skip.has(ci + ":" + mi));
      if (!picked.length) return;
      const code = normCode(c.course_code);
      let target = P.courses.find((x) => x.code === code);
      if (!target) {
        target = { id: uid(), code, name: c.course_name || "", color: nextColor(), meetings: [], assessments: [] };
        P.courses.push(target);
      }
      picked.forEach((m) => {
        if (!target.meetings.some((em) => sameMeeting(em, m))) target.meetings.push({ id: uid(), type: m.type, slots: toSlots(m), location: m.location || "" });
      });
    });
    pending.timetable = null;
    persist();
    render();
    P.courses.forEach((c) => { if (!c.name) fillName(c); });
  }

  function applySyllabus(courseId) {
    const c = course(courseId), st = pending.syllabus[courseId];
    st.result.assessments.forEach((a, i) => {
      if (st.skip.has(String(i))) return;
      c.assessments.push({ id: uid(), name: a.name, type: a.type, due: a.due_date || "", weight: a.weight == null ? "" : a.weight, note: a.note || "" });
    });
    if (!c.name && st.result.course_name) c.name = st.result.course_name;
    delete pending.syllabus[courseId];
    persist();
    render();
  }

  function stepClasses() {
    const conf = conflicts();
    const clashIds = new Set(conf.flatMap((x) => x.refs));
    const bad = new Set(badTimes());
    const cards = P.courses.map((c) => {
      const rows = c.meetings.map((m) => `
        <div class="meeting">
          <div class="meeting-top">
            <select aria-label="Class type" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="type">
              ${MEETING_TYPES.map((t) => `<option ${m.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <input type="text" class="grow" placeholder="Room (optional)" aria-label="Room" value="${esc(m.location)}" data-bind="meeting" data-c="${c.id}" data-id="${m.id}" data-f="location">
            <button type="button" class="icon-btn" data-act="del-meeting" data-c="${c.id}" data-id="${m.id}" aria-label="Remove this ${esc(m.type)}">×</button>
          </div>
          ${dayToggles("meeting", m.id, m.slots)}
          ${slotRows("meeting", m.id, m.slots, bad, clashIds, ` data-c="${c.id}"`)}
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
      <p class="muted">Add each lecture, tutorial and lab, tap the days it meets, then set the time for each day. Your MySOLUS class schedule has all of this.</p>
      ${timetablePanel()}
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
          ${a.note ? `<p class="hint">${esc(a.note)}</p>` : ""}
          ${a.type === "Final exam" && !a.due && !a.note ? `<p class="hint">Leave the date blank until the exam schedule is posted.</p>` : ""}
          ${outsideTerm(a) ? `<p class="hint warn-text">This date is outside your term.</p>` : ""}
        </div>`).join("");
      return `
        <div class="card course-card c${c.color}">
          <div class="course-head"><span class="dot"></span><h3>${esc(c.code)}</h3>
            <span class="total ${c.assessments.length && total !== 100 ? "off" : ""}" data-total="${c.id}">${c.assessments.length ? `Total ${total}%` : ""}</span></div>
          ${syllabusPanel(c)}
          ${rows || `<p class="empty">No deadlines yet.</p>`}
          <div class="add-row">
            ${["Assignment", "Quiz", "Lab", "Midterm", "Final exam", "Other"].map((t) => `<button type="button" class="btn small" data-act="add-assess" data-c="${c.id}" data-type="${t}">+ ${t}</button>`).join("")}
          </div>
        </div>`;
    }).join("");
    return `
      <h2 tabindex="-1">What's due, and what's it worth?</h2>
      <p class="muted">Copy the graded work from each syllabus: name, due date and weight. Weights for each course should add up to 100%.</p>
      ${unassignedPanel()}
      ${cards}`;
  }

  function commuteField(bind, id, value) {
    return `<label class="inline commute">Travel each way<span class="with-unit"><input type="number" min="0" max="180" step="5" inputmode="numeric" placeholder="0" value="${esc(value)}" data-bind="${bind}" data-id="${id}" data-f="commute"><span>min</span></span></label>`;
  }

  function stepRoutine() {
    const r = P.routine;
    const bad = new Set(badTimes());
    const clashIds = new Set(conflicts().flatMap((x) => x.refs));
    const oneClash = new Set(oneoffClashes().map((x) => x.o.id));
    const weekly = r.commitments.map((m) => `
      <div class="meeting">
        <div class="meeting-top">
          <input type="text" class="grow" placeholder="e.g. Work shift, Volleyball" aria-label="What is it?" value="${esc(m.label)}" data-bind="commit" data-id="${m.id}" data-f="label">
          <button type="button" class="icon-btn" data-act="del-commit" data-id="${m.id}" aria-label="Remove ${esc(m.label || "commitment")}">×</button>
        </div>
        ${commuteField("commit", m.id, m.commute)}
        ${dayToggles("commit", m.id, m.slots)}
        ${slotRows("commit", m.id, m.slots, bad, clashIds, "")}
      </div>`).join("");
    const once = r.oneoffs.slice().sort((a, b) => (a.date || "9").localeCompare(b.date || "9")).map((o) => `
      <div class="meeting ${oneClash.has(o.id) ? "warn" : ""}">
        <div class="meeting-top">
          <input type="text" class="grow" placeholder="e.g. Dentist, Job interview" aria-label="What is it?" value="${esc(o.label)}" data-bind="oneoff" data-id="${o.id}" data-f="label">
          <button type="button" class="icon-btn" data-act="del-oneoff" data-id="${o.id}" aria-label="Remove ${esc(o.label || "event")}">×</button>
        </div>
        <div class="slot ${bad.has(o.id) ? "error" : ""}">
          <input type="date" class="slot-date" aria-label="Date" value="${esc(o.date)}" data-bind="oneoff" data-id="${o.id}" data-f="date">
          ${timePicker(`data-bind="oneoff" data-id="${o.id}" data-f="start"`, o.start, "Start")}
          <span class="slot-to">to</span>
          ${timePicker(`data-bind="oneoff" data-id="${o.id}" data-f="end"`, o.end, "End")}
          ${bad.has(o.id) ? `<span class="field-error slot-err">Ends before it starts</span>` : ""}
        </div>
        ${commuteField("oneoff", o.id, o.commute)}
        ${oneClash.has(o.id) ? `<p class="hint warn-text">This overlaps one of your weekly classes or commitments.</p>` : ""}
      </div>`).join("");
    return `
      <h2 tabindex="-1">What does a normal week look like?</h2>
      <p class="muted">This helps fit study time around everything else in your week.</p>
      <div class="card">
        <div class="grid3">
          <label>Usually up by${timePicker('data-bind="routine" data-f="wake"', r.wake, "Wake-up time")}</label>
          <label>Usually in bed by${timePicker('data-bind="routine" data-f="bed"', r.bed, "Bedtime")}</label>
          <label>Commute to campus<span class="with-unit"><input type="number" min="0" max="180" step="5" inputmode="numeric" value="${esc(r.commute)}" data-bind="routine" data-f="commute"><span>min</span></span></label>
        </div>
      </div>
      <div class="card">
        <h3>Meal times</h3>
        <p class="muted small">Study time is planned around these. If a class is in the way, the meal moves to the nearest free time.</p>
        <div class="grid3">
          <label>Breakfast <span class="muted small">(optional)</span>${timePicker('data-bind="meal" data-f="breakfast"', (r.meals || {}).breakfast, "Breakfast")}</label>
          <label>Lunch${timePicker('data-bind="meal" data-f="lunch"', (r.meals || {}).lunch, "Lunch")}</label>
          <label>Dinner${timePicker('data-bind="meal" data-f="dinner"', (r.meals || {}).dinner, "Dinner")}</label>
        </div>
        <label class="inline meal-len">Each meal takes
          <select data-bind="meal" data-f="length">${[20, 30, 45, 60].map((m) => `<option value="${m}" ${Number((r.meals || {}).length || 30) === m ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
      </div>
      <div class="card">
        <h3>Every week</h3>
        <p class="muted small">Work, sports, clubs, appointments: anything that repeats each week.</p>
        ${weekly || `<p class="empty">Nothing added.</p>`}
        <button type="button" class="btn small" data-act="add-commit">+ Add a weekly commitment</button>
      </div>
      <div class="card">
        <h3>One-time events</h3>
        <p class="muted small">Appointments, trips or events on a specific day. Study time will be planned around them.</p>
        ${once || `<p class="empty">Nothing added.</p>`}
        <button type="button" class="btn small" data-act="add-oneoff">+ Add a one-time event</button>
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
    const pxPerMin = 1.1, height = (hi - lo) * pxPerMin;
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
              <b>${esc(b.title)}</b>${b.type ? `<span>${esc(b.type)}</span>` : ""}<span class="wk-time">${fmtTime(b.start)}–${fmtTime(b.end)}</span>
            </div>`).join("")}
        </div>
      </div>`;
    // Phones get a day-by-day list; wider screens get the week grid.
    const agenda = `<div class="agenda">${days.map((d) => {
      const list = blocks.filter((b) => b.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
      return `<div class="ag-day"><h4>${({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" })[d]}</h4>
        ${list.length ? list.map((b) => `
          <div class="ag-item ${b.kind === "fixed" ? "fixed" : "c" + b.color}">
            <span class="ag-time mono">${fmtTime(b.start)}<br>${fmtTime(b.end)}</span>
            <span class="ag-body"><b>${esc(b.title)}</b>${b.type ? ` ${esc(b.type)}` : ""}${b.sub ? `<span class="muted"> · ${esc(b.sub)}</span>` : ""}</span>
          </div>`).join("") : `<p class="empty small">Nothing scheduled</p>`}</div>`;
    }).join("")}</div>`;
    return agenda + `
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
          <p class="muted small">Up by ${fmtTime(P.routine.wake)}, bed by ${fmtTime(P.routine.bed)}<br>${P.routine.meals && P.routine.meals.lunch ? `Lunch ${fmtTime(P.routine.meals.lunch)}${P.routine.meals.dinner ? `, dinner ${fmtTime(P.routine.meals.dinner)}` : ""}<br>` : ""}${esc(P.routine.commute)} min commute<br>${P.routine.commitments.length} weekly commitment${P.routine.commitments.length === 1 ? "" : "s"}${P.routine.oneoffs.length ? `<br>${P.routine.oneoffs.length} one-time event${P.routine.oneoffs.length === 1 ? "" : "s"}` : ""}</p></div>
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

  function renderFooter() {
    return `
      <div class="reset">
        ${confirmingReset
          ? `<p>This deletes everything you've entered on this device.</p><button type="button" class="btn danger" data-act="reset-yes">Yes, start over</button> <button type="button" class="btn ghost" data-act="reset-no">Cancel</button>`
          : `${Install.linkHTML()}${Install.linkHTML() ? " · " : ""}<button type="button" class="link-btn muted" data-act="reset">Start over</button>`}
      </div>`;
  }

  // ---------- actions ----------
  function go(step) {
    if (step !== 1) dropNotice = false;
    P.step = Math.max(0, Math.min(step, STEPS.length - 1));
    persist();
    render();
  }

  // Fill in a course's title from the Queen's Academic Calendar. It stays editable.
  async function fillName(c) {
    const name = await Uploader.lookupCourse(c.code);
    if (name && !c.name && P.courses.includes(c)) { c.name = name; persist(); render(); }
  }

  function addCourse(form) {
    const code = normCode(form.code.value);
    const err = document.getElementById("codeError");
    let msg = "";
    if (!isCode(code)) msg = "Enter a course code like MATH 121.";
    else if (P.courses.some((c) => c.code === code)) msg = code + " is already added.";
    if (msg) { err.textContent = msg; err.hidden = false; form.code.focus(); return; }
    const c = { id: uid(), code, name: form.name.value.trim(), color: nextColor(), meetings: [], assessments: [] };
    P.courses.push(c);
    persist();
    render();
    if (!c.name) fillName(c);
    const input = document.getElementById("newCode");
    if (input) input.focus();
  }

  app.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.dataset.form === "course") { e.preventDefault(); addCourse(f); }
  });

  app.addEventListener("click", (e) => {
    if (P.setupComplete && App.handle(e, P)) return;
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
          const p = Terms.upcomingTerms().find((x) => x.id === d.id);
          P.term = { presetId: p.id, label: p.label, classesStart: p.classesStart, classesEnd: p.classesEnd, examStart: p.examStart, examEnd: p.examEnd, breaks: p.breaks.map((x) => Object.assign({}, x)) };
        }
        persist(); render(); break;
      }
      case "add-break": P.term.breaks.push({ label: "", start: "", end: "" }); persist(); render(); break;
      case "del-break": P.term.breaks.splice(Number(d.i), 1); persist(); render(); break;
      case "del-course": P.courses = P.courses.filter((x) => x.id !== d.id); persist(); render(); break;
      case "add-meeting": c.meetings.push({ id: uid(), type: d.type, slots: [], location: "" }); persist(); render(); break;
      case "del-meeting": c.meetings = c.meetings.filter((m) => m.id !== d.id); persist(); render(); break;
      case "toggle-day": {
        const item = d.scope === "meeting"
          ? P.courses.flatMap((x) => x.meetings).find((m) => m.id === d.id)
          : P.routine.commitments.find((m) => m.id === d.id);
        const k = item.slots.findIndex((sl) => sl.day === d.day);
        if (k >= 0) item.slots.splice(k, 1);
        else {
          const last = item.slots[item.slots.length - 1];
          item.slots.push({ id: uid(), day: d.day, start: last ? last.start : "", end: last ? last.end : "" });
          item.slots.sort((a, z) => DAYS.indexOf(a.day) - DAYS.indexOf(z.day));
        }
        persist(); render(); break;
      }
      case "add-assess": {
        const n = c.assessments.filter((a) => a.type === d.type).length + 1;
        const name = d.type === "Final exam" ? "Final exam" : d.type === "Other" ? "" : `${d.type} ${n}`;
        c.assessments.push({ id: uid(), name, type: d.type, due: "", weight: "" });
        persist(); render(); break;
      }
      case "del-assess": c.assessments = c.assessments.filter((a) => a.id !== d.id); persist(); render(); break;
      case "add-commit": P.routine.commitments.push({ id: uid(), label: "", commute: "", slots: [] }); persist(); render(); break;
      case "add-oneoff": P.routine.oneoffs.push({ id: uid(), label: "", date: "", start: "", end: "", commute: "" }); persist(); render(); break;
      case "del-oneoff": P.routine.oneoffs = P.routine.oneoffs.filter((o) => o.id !== d.id); persist(); render(); break;
      case "del-commit": P.routine.commitments = P.routine.commitments.filter((m) => m.id !== d.id); persist(); render(); break;
      case "style": P.study.style = d.id; persist(); render(); break;
      case "upload": startUpload(d.kind, d.c); break;
      case "drop-pick": {
        const input = document.getElementById("filePick");
        input.accept = "application/pdf,image/*";
        input.onchange = () => { const f = Array.from(input.files || []); input.value = ""; addDropFiles(f); };
        input.click();
        break;
      }
      case "drop-remove": drop.files = drop.files.filter((x) => x.id !== d.id); render(); break;
      case "drop-go": runDrop(); break;
      case "drop-review": dropNotice = true; drop.files = drop.files.filter((x) => x.status === "error"); go(1); break;
      case "assign-syllabus": {
        const u = pending.unassigned.find((x) => x.id === d.id);
        const courseId = document.getElementById("assign-" + d.id).value;
        pending.syllabus[courseId] = syllabusReview(courseId, u.result);
        pending.unassigned = pending.unassigned.filter((x) => x.id !== d.id);
        render(); break;
      }
      case "drop-unassigned": pending.unassigned = pending.unassigned.filter((x) => x.id !== d.id); render(); break;
      case "pick": {
        const st = d.kind === "timetable" ? pending.timetable : pending.syllabus[d.c];
        if (st.skip.has(d.k)) st.skip.delete(d.k); else st.skip.add(d.k);
        render(); break;
      }
      case "apply-timetable": applyTimetable(); break;
      case "apply-syllabus": applySyllabus(d.c); break;
      case "discard":
        if (d.kind === "timetable") pending.timetable = null; else delete pending.syllabus[d.c];
        render(); break;
      case "demo":
        // Load a sample student and jump to a day in the middle of their term.
        P = JSON.parse(JSON.stringify(window.DEMO_PROFILE));
        P.meta = { demo: true };
        Store.saveNow(P);
        location.search = "?today=2027-02-08";
        break;
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
    if (d.part) {
      // Combine the hour and minute dropdowns into "HH:MM".
      const group = el.closest(".tp");
      const h = group.querySelector('[data-part="h"]').value, m = group.querySelector('[data-part="m"]').value;
      if (h === "") v = "";
      else {
        if (m === "") group.querySelector('[data-part="m"]').value = "0";
        v = String(h).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0");
      }
    }
    switch (d.bind) {
      case "term": P.term[d.f] = v; break;
      case "break": P.term.breaks[Number(d.i)][d.f] = v; break;
      case "meeting": course(d.c).meetings.find((m) => m.id === d.id)[d.f] = v; break;
      case "assess": course(d.c).assessments.find((a) => a.id === d.id)[d.f] = v; break;
      case "commit": P.routine.commitments.find((m) => m.id === d.id)[d.f] = v; break;
      case "course": course(d.id)[d.f] = v; break;
      case "oneoff": P.routine.oneoffs.find((o) => o.id === d.id)[d.f] = v; break;
      case "slot": {
        const item = d.scope === "meeting"
          ? course(d.c).meetings.find((m) => m.id === d.id)
          : P.routine.commitments.find((m) => m.id === d.id);
        item.slots.find((sl) => sl.id === d.s)[d.f] = v;
        break;
      }
      case "routine": P.routine[d.f] = v; break;
      case "meal": P.routine.meals = P.routine.meals || {}; P.routine.meals[d.f] = d.f === "length" ? Number(v) : v; break;
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
    if (P.setupComplete && App.handle(e, P)) return;
    if (e.target.dataset.act === "drop-kind") { const x = drop.files.find((f) => f.id === e.target.dataset.id); if (x) x.kind = e.target.value; return; }
    const d = e.target.dataset;
    if (!d.bind) return;
    // Times, dates and selects affect warnings elsewhere on the page.
    if (["start", "end", "due", "type", "date"].includes(d.f) && ["meeting", "assess", "commit", "slot", "oneoff"].includes(d.bind)) render();
    else refreshNav();
  });

  // While typing a course code, suggest its title in the name box.
  let lookupTimer = null;
  app.addEventListener("input", (e) => {
    if (e.target.id !== "newCode") return;
    clearTimeout(lookupTimer);
    const code = normCode(e.target.value);
    const nameBox = document.getElementById("newName");
    if (nameBox && nameBox.dataset.auto === "1") { nameBox.value = ""; nameBox.dataset.auto = ""; }
    if (!isCode(code)) return;
    lookupTimer = setTimeout(async () => {
      const name = await Uploader.lookupCourse(code);
      const box = document.getElementById("newName"), codeBox = document.getElementById("newCode");
      if (name && box && codeBox && normCode(codeBox.value) === code && !box.value) { box.value = name; box.dataset.auto = "1"; }
    }, 350);
  });
  app.addEventListener("input", (e) => { if (e.target.id === "newName") e.target.dataset.auto = ""; });

  // Drag and drop onto the welcome-page dropbox.
  const inDrop = (e) => e.target.closest && e.target.closest("[data-drop]");
  document.addEventListener("dragover", (e) => {
    if (!document.querySelector("[data-drop]")) return;
    e.preventDefault(); // allow dropping (and stop the browser opening the file)
    const over = !!inDrop(e);
    if (over !== drop.over) { drop.over = over; const z = document.querySelector("[data-drop]"); if (z) z.classList.toggle("over", over); }
  });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget && drop.over) { drop.over = false; const z = document.querySelector("[data-drop]"); if (z) z.classList.remove("over"); } });
  document.addEventListener("drop", (e) => {
    if (!document.querySelector("[data-drop]")) return;
    e.preventDefault();
    drop.over = false;
    if (!drop.running && e.dataTransfer && e.dataTransfer.files.length) addDropFiles(e.dataTransfer.files);
    else render();
  });

  // Clear the course-code error as soon as they type again.
  app.addEventListener("keydown", (e) => {
    if (e.target.id === "newCode") { const err = document.getElementById("codeError"); if (err) err.hidden = true; }
  });

  App.init({ save: () => persist(), rerender: () => render(), profile: () => P });

  // Account sign-in and sync (only when a Supabase project is configured).
  document.addEventListener("click", (e) => { Sync.handle(e); Install.handle(e); });
  Install.onChange = () => render();
  document.addEventListener("submit", (e) => { Sync.handle(e); });
  Sync.init({
    getProfile: () => P,
    replace: (data) => {
      P = Store.normalize(data);
      if (P.setupComplete) P.step = STEPS.length;
      returnToReview = false;
      Store.saveNow(P, { keepTime: true });
      render();
    },
    clearLocal: () => { Store.clear(); P = Store.emptyProfile(); returnToReview = false; render(); },
    rerender: () => render(),
  });
  if (P.setupComplete) P.step = STEPS.length;
  render();
})();
