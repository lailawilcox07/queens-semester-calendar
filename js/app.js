// The everyday app, shown once setup is finished: Calendar, To-Do, Due and
// Grades. It reads the profile through the Engine and saves progress (done,
// started, grades, finished study blocks) back into the profile.
(function (root) {
  "use strict";

  const E = () => root.Engine;
  const DAYS_FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  const UI_KEY = "qsc.ui.v1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function fmtTime(t) {
    if (!t) return "";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }
  const dateLabel = (iso) => `${E().dow(iso)}, ${E().shortDate(iso)}`;
  const round1 = (n) => Math.round(n * 10) / 10;

  let ui = { tab: "cal", week: null, dueCourse: "all", showDone: false };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || "{}")); } catch (e) {}
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} };

  let ctx = null; // { getProfile, save, rerender }
  let eng = null;

  function progress(P) {
    P.progress = P.progress || {};
    ["done", "started", "grades", "predicted", "studyDone", "target", "locked"].forEach((k) => { P.progress[k] = P.progress[k] || {}; });
    P.progress.sessions = P.progress.sessions || [];
    return P.progress;
  }

  function relDays(iso, today) {
    const d = E().daysBetween(today, iso);
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    if (d === -1) return "1 day late";
    if (d < 0) return `${-d} days late`;
    return `in ${d} days`;
  }

  // ---------- "right now" strip ----------
  function nowStrip(P, today) {
    const pr = progress(P);
    const pills = [];
    const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
    const isRealToday = today === E().localToday() && !new URLSearchParams(location.search).get("today");
    if (today < eng.termStart) {
      pills.push(`<div class="now-pill"><span class="now-label">Soon</span><span>${esc(P.term.label || "Your term")} starts ${esc(relDays(eng.termStart, today))}</span></div>`);
    } else {
      const items = eng.day(today).items.filter((i) => i.kind !== "study" || !pr.studyDone[i.id]);
      const now = isRealToday ? items.find((i) => E().toMin(i.start) <= nowMin && E().toMin(i.end) > nowMin) : null;
      const next = items.find((i) => !isRealToday || E().toMin(i.start) > nowMin);
      if (now) pills.push(`<div class="now-pill"><span class="now-label">Now</span><span><b>${esc(now.title)}</b> ${esc(now.kind === "study" ? "Study" : now.sub)}</span><span class="mono">until ${fmtTime(now.end)}</span></div>`);
      if (next) pills.push(`<div class="now-pill next"><span class="now-label">${isRealToday ? "Next" : "Today"}</span><span><b>${esc(next.title)}</b> ${esc(next.kind === "study" ? "Study" : next.sub)}</span><span class="mono">${fmtTime(next.start)}</span></div>`);
    }
    const due = eng.deadlines().find((d) => d.due && d.due >= today && !pr.done[d.id]);
    if (due) {
      const soon = E().daysBetween(today, due.due) <= 3;
      pills.push(`<div class="now-pill ${soon ? "deadline" : ""}"><span class="now-label">Due</span><span><b>${esc(due.course.code)}</b> ${esc(due.a.name || due.a.type)}</span><span class="mono">${esc(relDays(due.due, today))}</span></div>`);
    }
    return pills.length ? `<div class="nowstrip">${pills.join("")}</div>` : "";
  }

  // ---------- Calendar ----------
  function pickWeek(today) {
    const weeks = eng.weeks();
    if (!weeks.length) return null;
    if (ui.week && weeks.some((w) => w.monday === ui.week)) return ui.week;
    const cur = weeks.find((w) => today >= w.monday && today <= w.days[6]);
    return cur ? cur.monday : (today < weeks[0].monday ? weeks[0].monday : weeks[weeks.length - 1].monday);
  }

  function itemClass(i) {
    if (i.kind === "class") return `class c${i.course.color}`;
    if (i.kind === "study") return `study c${i.course.color} st-${i.status}`;
    return i.kind; // fixed, event, meal
  }
  const itemSub = (i) => (i.kind === "study" ? (i.status === "missed" ? "Study · missed" : "Study") : i.sub);

  function calendarView(P, today) {
    const weeks = eng.weeks();
    if (!weeks.length) return `<p class="empty">Add your term dates in setup to see your calendar.</p>`;
    const monday = pickWeek(today);
    const week = weeks.find((w) => w.monday === monday);
    const days = week.days.map((iso) => eng.day(iso));
    const pr = progress(P);

    const bar = `<div class="weekbar" role="tablist" aria-label="Weeks">${weeks.map((w) => {
      const isCur = today >= w.monday && today <= w.days[6];
      return `<button type="button" role="tab" class="wk-btn ${w.monday === monday ? "on" : ""} ${isCur ? "cur" : ""}" aria-selected="${w.monday === monday}" data-a="week" data-w="${w.monday}">
        <b>${esc(w.label)}</b><span>${esc(E().shortDate(w.monday))}</span></button>`;
    }).join("")}</div>`;

    // Notes for the week: breaks, exams, deadlines count.
    const notes = [];
    const breaks = [...new Set(days.filter((d) => d.isBreak && d.inTerm).map((d) => d.breakLabel))];
    if (breaks.length) notes.push(`No classes: ${breaks.map(esc).join(", ")}.`);
    if (days.some((d) => d.isExam)) notes.push("Exam period.");
    const weekDue = days.flatMap((d) => d.due);
    if (weekDue.length) {
      const w = weekDue.reduce((s, d) => s + (Number(d.a.weight) || 0), 0);
      notes.push(`${weekDue.length} deadline${weekDue.length === 1 ? "" : "s"} this week, worth ${round1(w)}% in total.`);
    }
    if (monday > E().mondayOf(today)) {} // future weeks: nothing extra
    const studyMin = days.flatMap((d) => d.items).filter((i) => i.kind === "study").reduce((s, i) => s + E().toMin(i.end) - E().toMin(i.start), 0);
    if (studyMin) notes.push(`${round1(studyMin / 60)} h of study planned.`);

    const dueChip = (d) => `<span class="due-chip c${d.course.color} ${pr.done[d.id] ? "done" : ""}" title="${esc(d.course.code)} ${esc(d.a.name)}"><b>${esc(d.course.code)}</b> ${esc(d.a.name || d.a.type)}${d.a.weight !== "" && d.a.weight != null ? ` · ${esc(d.a.weight)}%` : ""}</span>`;

    // Phone: a list per day.
    const agenda = `<div class="agenda">${days.map((d) => `
      <section class="ag-day ${d.iso === today ? "today" : ""}">
        <h4>${esc(DAYS_FULL[d.dow])}, ${esc(E().shortDate(d.iso))}${d.iso === today ? ` <span class="today-tag">Today</span>` : ""}${d.isBreak && d.inTerm ? ` <span class="break-tag">${esc(d.breakLabel)}</span>` : ""}</h4>
        ${d.due.map(dueChip).join("")}
        ${d.items.length ? d.items.map((i) => `
          <div class="ag-item ${itemClass(i)}">
            <span class="ag-time mono">${fmtTime(i.start)}<br>${fmtTime(i.end)}</span>
            <span class="ag-body"><b>${esc(i.title)}</b> ${esc(itemSub(i))}${i.location ? `<span class="muted"> · ${esc(i.location)}</span>` : ""}${i.kind === "study" ? `<span class="ag-why">${esc(i.sub)}</span>` : ""}</span>
          </div>`).join("") : (d.due.length ? "" : `<p class="empty small">Nothing scheduled</p>`)}
      </section>`).join("")}</div>`;

    // Laptop: a grid.
    let lo = 8 * 60, hi = 21 * 60;
    days.forEach((d) => d.items.forEach((i) => { lo = Math.min(lo, E().toMin(i.start)); hi = Math.max(hi, E().toMin(i.end)); }));
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    const px = 1.05, height = (hi - lo) * px;
    const hours = []; for (let m = lo; m <= hi; m += 60) hours.push(m);
    function lanes(list) {
      list = list.map((x) => Object.assign({}, x)).sort((a, b) => E().toMin(a.start) - E().toMin(b.start));
      const ends = [];
      list.forEach((b) => {
        let i = ends.findIndex((e) => e <= E().toMin(b.start));
        if (i < 0) { i = ends.length; ends.push(0); }
        ends[i] = E().toMin(b.end); b.lane = i;
      });
      list.forEach((b) => { b.lanes = 1 + Math.max(...list.filter((o) => E().toMin(o.start) < E().toMin(b.end) && E().toMin(b.start) < E().toMin(o.end)).map((o) => o.lane)); });
      return list;
    }
    const grid = `<div class="cal-grid" style="--cols:7">
      <div class="cg-corner"></div>
      ${days.map((d) => `<div class="cg-head ${d.iso === today ? "today" : ""}"><b>${d.dow}</b> ${esc(E().shortDate(d.iso).split(" ")[1])}${d.isBreak && d.inTerm ? `<span class="break-tag">${esc(d.breakLabel)}</span>` : ""}</div>`).join("")}
      <div class="cg-corner small muted">Due</div>
      ${days.map((d) => `<div class="cg-due">${d.due.map(dueChip).join("")}</div>`).join("")}
      <div class="cg-times" style="height:${height}px">${hours.map((m) => `<span style="top:${(m - lo) * px}px">${fmtTime(String(m / 60).padStart(2, "0") + ":00")}</span>`).join("")}</div>
      ${days.map((d) => `<div class="cg-col ${d.iso === today ? "today" : ""} ${d.isBreak && d.inTerm ? "break" : ""}" style="height:${height}px">
        ${hours.map((m) => `<div class="cg-line" style="top:${(m - lo) * px}px"></div>`).join("")}
        ${lanes(d.items).map((i) => `<div class="cg-block ${itemClass(i)} ${(E().toMin(i.end) - E().toMin(i.start)) < 55 ? "short" : ""}" style="top:${(E().toMin(i.start) - lo) * px}px;height:${Math.max(20, (E().toMin(i.end) - E().toMin(i.start)) * px - 2)}px;left:calc(${(i.lane / i.lanes) * 100}% + 2px);width:calc(${100 / i.lanes}% - 4px)" title="${esc(i.title)} ${esc(itemSub(i))} ${fmtTime(i.start)}–${fmtTime(i.end)}${i.kind === "study" ? " · " + esc(i.sub) : ""}">
          <b>${esc(i.title)}</b><span>${esc(itemSub(i))}</span><span class="cg-time">${fmtTime(i.start)}–${fmtTime(i.end)}</span>
        </div>`).join("")}
      </div>`).join("")}
    </div>`;

    const legend = `<div class="legend"><span><i class="sw class"></i>Class</span><span><i class="sw study"></i>Study</span><span><i class="sw fixed"></i>Commitment</span><span><i class="sw event"></i>One-time event</span><span><i class="sw meal"></i>Meal</span><span><i class="sw missed"></i>Missed study</span><span><i class="sw due"></i>Deadline</span></div>`;

    return `${bar}
      <div class="week-head"><h3>${esc(week.label === "—" ? "Week" : week.label)} · ${esc(week.range)}</h3>
        ${monday !== E().mondayOf(today) && today >= weeks[0].monday && today <= weeks[weeks.length - 1].days[6] ? `<button type="button" class="link-btn" data-a="week" data-w="${E().mondayOf(today)}">This week</button>` : ""}</div>
      ${notes.length ? `<p class="week-note">${notes.join(" ")}</p>` : ""}
      ${legend}${agenda}<div class="grid-wrap">${grid}</div>`;
  }

  // ---------- Due ----------
  const STATUS = ["todo", "started", "done"];
  function statusOf(pr, id) { return pr.done[id] ? "done" : pr.started[id] ? "started" : "todo"; }

  function dueView(P, today) {
    const pr = progress(P);
    let list = eng.deadlines();
    if (ui.dueCourse !== "all") list = list.filter((d) => d.course.id === ui.dueCourse);
    const hiddenDone = list.filter((d) => pr.done[d.id]).length;
    if (!ui.showDone) list = list.filter((d) => !pr.done[d.id]);
    const groups = [
      { name: "Overdue", test: (d) => d.due && d.due < today },
      { name: "This week", test: (d) => d.due && d.due >= today && E().daysBetween(today, d.due) <= 6 },
      { name: "Next week", test: (d) => d.due && E().daysBetween(today, d.due) >= 7 && E().daysBetween(today, d.due) <= 13 },
      { name: "Later", test: (d) => d.due && E().daysBetween(today, d.due) >= 14 },
      { name: "Date not set", test: (d) => !d.due },
    ];
    const label = { todo: "Not started", started: "Started", done: "Done" };
    const row = (d) => {
      const st = statusOf(pr, d.id);
      return `<li class="due-row c${d.course.color} st-${st}">
        <span class="dot"></span>
        <span class="due-main"><span><b>${esc(d.course.code)}</b> ${esc(d.a.name || d.a.type)}</span>
          <span class="due-meta">${d.due ? `${esc(dateLabel(d.due))} · ${esc(relDays(d.due, today))}` : esc(d.a.note || "Date not set yet")}</span></span>
        <span class="due-weight mono">${d.a.weight !== "" && d.a.weight != null ? esc(d.a.weight) + "%" : ""}</span>
        <button type="button" class="status-btn st-${st}" data-a="cycle" data-id="${d.id}" aria-label="${esc(d.a.name)}: ${label[st]}. Change status.">${label[st]}</button>
      </li>`;
    };
    const body = groups.map((g) => {
      const items = list.filter(g.test);
      if (!items.length) return "";
      return `<section class="due-group ${g.name === "Overdue" ? "overdue" : ""}"><h3>${g.name} <span class="muted small">${items.length}</span></h3><ul class="due-rows">${items.map(row).join("")}</ul></section>`;
    }).join("");
    const filters = `<div class="filters"><button type="button" class="chip ${ui.dueCourse === "all" ? "on" : ""}" data-a="due-course" data-id="all">All</button>${P.courses.map((c) => `<button type="button" class="chip c${c.color} ${ui.dueCourse === c.id ? "on" : ""}" data-a="due-course" data-id="${c.id}"><span class="dot"></span>${esc(c.code)}</button>`).join("")}</div>`;
    return `${filters}
      ${body || `<p class="empty">${hiddenDone ? "Everything here is done." : "No deadlines yet. Add them in setup."}</p>`}
      ${hiddenDone || ui.showDone ? `<button type="button" class="link-btn" data-a="show-done">${ui.showDone ? "Hide finished work" : `Show ${hiddenDone} finished`}</button>` : ""}`;
  }

  // ---------- To-Do ----------
  function todoView(P, today) {
    const pr = progress(P);
    if (today < eng.termStart) {
      return `<div class="card"><h3>Your term starts ${esc(relDays(eng.termStart, today))}</h3><p class="muted">Your daily study plan starts on ${esc(dateLabel(eng.termStart))}. Tip: add <span class="mono">?today=${esc(eng.termStart)}</span> to the address to preview a day in term.</p></div>`;
    }
    const d = eng.day(today);
    const study = d.items.filter((i) => i.kind === "study");
    const tm = pr.timer;
    const studyRows = study.map((i) => {
      const running = tm && tm.blockId === i.id;
      return `<div class="todo-row c${i.course.color} ${i.status === "done" ? "is-done" : ""}">
        <input type="checkbox" data-a="study-done" data-id="${esc(i.id)}" aria-label="Mark ${esc(i.course.code)} study done" ${i.status === "done" ? "checked" : ""}>
        <span class="todo-main"><span><b>${esc(i.course.code)}</b> ${esc(i.sub)}</span><span class="todo-meta mono">${fmtTime(i.start)}–${fmtTime(i.end)}</span></span>
        ${i.status === "done" ? "" : running ? `<span class="pill-run">In progress</span>` : tm ? "" : `<button type="button" class="btn small start-btn" data-a="t-start" data-c="${i.course.id}" data-id="${esc(i.id)}" data-label="${esc(i.sub)}">Start</button>`}
      </div>`;
    }).join("");
    const freeStart = tm ? "" : `<div class="free-start"><label class="inline">Study something else:
      <select id="freeCourse">${P.courses.map((c) => `<option value="${c.id}">${esc(c.code)}</option>`).join("")}</select></label>
      <button type="button" class="btn small" data-a="t-start-free">Start timer</button></div>`;

    const soon = eng.deadlines().filter((x) => x.due && !pr.done[x.id] && E().daysBetween(today, x.due) <= 3);
    const dueRows = soon.map((x) => `
      <label class="todo-row c${x.course.color} ${x.due < today ? "late" : ""}">
        <input type="checkbox" data-a="due-done" data-id="${x.id}">
        <span class="todo-main"><span><b>${esc(x.course.code)}</b> ${esc(x.a.name || x.a.type)}</span><span class="todo-meta">${x.due < today ? "Overdue · " : ""}${esc(relDays(x.due, today))}${x.a.weight !== "" && x.a.weight != null ? ` · ${esc(x.a.weight)}%` : ""}</span></span>
      </label>`).join("");

    // This week's study progress: planned blocks vs time actually studied.
    const monday = E().mondayOf(today);
    let plannedMin = 0, doneMin = 0;
    for (let k = 0; k < 7; k++) {
      const iso = E().addDays(monday, k);
      eng.studyOn(iso).forEach((b) => { plannedMin += E().toMin(b.end) - E().toMin(b.start); });
      if (iso < today) P.courses.forEach((c) => { doneMin += eng.actualMinutes(c.id, iso); });
    }
    // Today: timed sessions, plus blocks ticked off without the timer.
    const timedToday = pr.sessions.filter((x) => x.date === today);
    doneMin += timedToday.reduce((s2, x) => s2 + x.minutes, 0);
    study.forEach((b) => { if (pr.studyDone[b.id] && !timedToday.some((x) => x.blockId === b.id)) doneMin += E().toMin(b.end) - E().toMin(b.start); });
    const pct = plannedMin ? Math.min(100, Math.round((doneMin / plannedMin) * 100)) : 0;

    const tomorrow = eng.day(E().addDays(today, 1));
    const firstTomorrow = tomorrow.items.find((i) => i.kind !== "meal");

    return `
      <h3 class="todo-date">${esc(DAYS_FULL[d.dow])}, ${esc(E().shortDate(today))}${d.isBreak ? ` <span class="break-tag">${esc(d.breakLabel)}</span>` : ""}</h3>
      <div class="card">
        <h3>Study today</h3>
        <p class="muted small">Press Start when you begin, so the app learns how long each course really takes.</p>
        ${studyRows || `<p class="empty">No study blocks planned today.</p>`}
        ${freeStart}
      </div>
      <div class="card">
        <h3>Due soon</h3>
        ${dueRows || `<p class="empty">Nothing due in the next 3 days.</p>`}
      </div>
      <div class="card">
        <div class="sum-head"><h3>This week</h3><span class="mono small">${round1(doneMin / 60)} of ${round1(plannedMin / 60)} h</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        ${firstTomorrow ? `<p class="muted small">Tomorrow starts with <b>${esc(firstTomorrow.title)}</b> ${esc(itemSub(firstTomorrow))} at ${fmtTime(firstTomorrow.start)}.</p>` : ""}
      </div>
      ${forgotCard(P, today)}
      ${insightsCard(P)}`;
  }

  // ---------- logging study done without the timer ----------
  const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240];
  const durLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) : ""}`);
  function durationSelect(attrs, preferred) {
    const pick = DURATIONS.reduce((a, b) => (Math.abs(b - preferred) < Math.abs(a - preferred) ? b : a));
    return `<select ${attrs}>${DURATIONS.map((m) => `<option value="${m}" ${m === pick ? "selected" : ""}>${durLabel(m)}</option>`).join("")}</select>`;
  }

  function forgotCard(P, today) {
    const pr = progress(P);
    const since = pr.since || today;
    const missed = [];
    for (let k = 1; k <= 7; k++) {
      const iso = E().addDays(today, -k);
      if (iso < since) break;
      eng.studyOn(iso).filter((b) => b.status === "missed").forEach((b) => missed.push({ b, iso }));
    }
    const minDate = since > eng.termStart ? eng.termStart : since;
    const rows = missed.map(({ b, iso }) => {
      const len = E().toMin(b.end) - E().toMin(b.start);
      return `<div class="log-row c${b.course.color}">
        <span class="log-main"><span><b>${esc(b.course.code)}</b> ${esc(dateLabel(iso))}</span><span class="todo-meta mono">planned ${fmtTime(b.start)}–${fmtTime(b.end)}</span></span>
        ${durationSelect(`aria-label="How long you studied ${esc(b.course.code)} on ${esc(dateLabel(iso))}"`, len)}
        <button type="button" class="btn small" data-a="log-block" data-id="${esc(b.id)}" data-c="${b.course.id}" data-date="${iso}">I did this</button>
      </div>`;
    }).join("");
    return `<div class="card forgot">
      <h3>Forgot to time it?</h3>
      <p class="muted small">If you studied without the timer, log it here so your plan and time insights stay accurate.</p>
      ${rows ? `<p class="small log-sub">Missed in the last week</p>${rows}` : ""}
      <p class="small log-sub">Other study</p>
      <div class="log-other">
        <select id="logCourse" aria-label="Course">${P.courses.map((c) => `<option value="${c.id}">${esc(c.code)}</option>`).join("")}</select>
        <input type="date" id="logDate" aria-label="Date" value="${today}" max="${today}" min="${minDate}">
        ${durationSelect('id="logMin" aria-label="How long"', 60)}
        <button type="button" class="btn small" data-a="log-other">Log it</button>
      </div>
    </div>`;
  }

  // ---------- study timer ----------
  // P.progress.timer = { courseId, blockId, label, start (ms, null when paused), elapsed (ms before this run) }
  const timerMs = (tm) => tm.elapsed + (tm.start ? Date.now() - tm.start : 0);
  function clock(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  }
  function timerBar(P) {
    const tm = progress(P).timer;
    if (!tm) return "";
    const c = P.courses.find((x) => x.id === tm.courseId);
    if (!c) return "";
    return `<div class="timer-bar c${c.color} ${tm.start ? "running" : "paused"}" role="timer" aria-live="off">
      <span class="timer-info"><b>${esc(c.code)}</b> ${esc(tm.label || "Study")}<span class="timer-state">${tm.start ? "Studying" : "Paused"}</span></span>
      <span class="timer-clock mono">${clock(timerMs(tm))}</span>
      <span class="timer-btns">
        ${tm.start ? `<button type="button" class="btn small" data-a="t-pause">Pause</button>` : `<button type="button" class="btn small" data-a="t-resume">Resume</button>`}
        <button type="button" class="btn small primary" data-a="t-finish">Finish</button>
        <button type="button" class="icon-btn" data-a="t-cancel" aria-label="Discard this session">×</button>
      </span>
    </div>`;
  }
  // Keep the clock ticking without re-drawing the page.
  setInterval(() => {
    const el = document.querySelector(".timer-clock");
    if (!el || !ctx) return;
    const tm = (ctx.profile().progress || {}).timer;
    if (tm && tm.start) el.textContent = clock(timerMs(tm));
  }, 1000);

  function insightsCard(P) {
    const rep = eng.timeReport().filter((r) => r.planned || r.actual);
    if (!rep.length) return "";
    const max = Math.max(...rep.map((r) => Math.max(r.planned, r.actual)), 60);
    const notes = [];
    rep.forEach((r) => {
      if (r.effort > 1) notes.push(`<b>${esc(r.course.code)}</b> is taking more time than planned, so it's getting extra study time.`);
      if (r.missed >= 30) notes.push(`<b>${esc(r.course.code)}</b>: ${round1(r.missed / 60)} h of missed study is being moved into your coming days.`);
    });
    return `<div class="card insights">
      <h3>Your study time, last 2 weeks</h3>
      <p class="muted small">Planned vs. actually studied, from your timer and ticked-off blocks.</p>
      ${rep.map((r) => `<div class="ins-row c${r.course.color}">
        <span class="ins-name"><b>${esc(r.course.code)}</b></span>
        <span class="ins-bars"><span class="ins-plan" style="width:${(r.planned / max) * 100}%"></span><span class="ins-act" style="width:${(r.actual / max) * 100}%"></span></span>
        <span class="ins-num mono">${round1(r.actual / 60)} / ${round1(r.planned / 60)} h</span>
      </div>`).join("")}
      ${notes.length ? `<ul class="ins-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  // ---------- Grades ----------
  const hasVal = (v) => v !== undefined && v !== null && v !== "";

  // Marks so far, the student's predictions for work not yet marked, and what's left.
  function courseGrade(c, pr) {
    let earned = 0, gradedW = 0, totalW = 0, predicted = 0, predictedW = 0;
    c.assessments.forEach((a) => {
      const w = Number(a.weight) || 0;
      totalW += w;
      if (!w) return;
      if (hasVal(pr.grades[a.id])) { earned += (w * Number(pr.grades[a.id])) / 100; gradedW += w; }
      else if (hasVal(pr.predicted[a.id])) { predicted += (w * Number(pr.predicted[a.id])) / 100; predictedW += w; }
    });
    const openW = Math.max(0, totalW - gradedW - predictedW); // neither marked nor predicted
    return { earned, gradedW, totalW, predicted, predictedW, openW, avg: gradedW ? (earned / gradedW) * 100 : null };
  }

  function gradesView(P) {
    const pr = progress(P);
    if (!P.courses.length) return `<p class="empty">Add courses in setup to track grades.</p>`;
    const targets = E().SCALE.filter(([min]) => min >= 50);
    return `<p class="muted small grades-intro">Enter marks as they come back. For work that isn't marked yet, type the mark you think you'll realistically get. The blank boxes show what you'd need on the rest to hit your goal.</p>` + P.courses.map((c) => {
      const g = courseGrade(c, pr);
      const target = Number(pr.target[c.id] || 80);
      const goalPts = (target * g.totalW) / 100;
      const need = g.openW ? ((goalPts - g.earned - g.predicted) / g.openW) * 100 : null;
      const projected = g.totalW ? ((g.earned + g.predicted) / g.totalW) * 100 : null;
      let msg = "";
      if (!g.totalW) msg = "Add weights in setup to see what you need.";
      else if (!g.predictedW && !g.openW) msg = `All marked. Final mark: <b>${round1(projected)}%</b> (${E().letter(projected)}).`;
      else if (g.openW) {
        const base = g.predictedW ? "With your predictions, you need" : "You need";
        msg = need <= 0 ? `${g.predictedW ? "With your predictions, you've" : "You've"} already locked in ${E().letter(target)} or better.`
          : need > 100 ? `${E().letter(target)} isn't reachable${g.predictedW ? " with these predictions" : ""}. You'd need ${round1(need)}% on the remaining ${round1(g.openW)}%.${g.predictedW ? " Try raising a prediction you think you can beat." : ""}`
          : `${base} an average of <b>${round1(need)}%</b> on the remaining ${round1(g.openW)}% of the course.`;
      } else {
        // Everything is marked or predicted: show where the predictions land.
        const gap = target - projected;
        msg = gap <= 0 ? `Your predictions put you at <b>${round1(projected)}%</b> (${E().letter(projected)}). That reaches ${E().letter(target)}.`
          : `Your predictions put you at <b>${round1(projected)}%</b> (${E().letter(projected)}), ${round1(gap)}% short of ${E().letter(target)}. You'd need about ${round1(gap * g.totalW / Math.max(1, g.predictedW))}% more on each predicted item.`;
      }
      const lost = g.gradedW - g.earned;
      const pct = (x) => (g.totalW ? (x / g.totalW) * 100 : 0);
      const needHint = need != null && need > 0 && need <= 100 ? Math.ceil(need) : "";
      return `<div class="card grade-card c${c.color}">
        <div class="course-head"><span class="dot"></span><h3>${esc(c.code)}</h3>${c.name ? `<span class="muted small">${esc(c.name)}</span>` : ""}
          <span class="grade-now">${g.avg == null ? `<span class="muted small">No marks yet</span>` : `<b>${round1(g.avg)}%</b> <span class="letter">${E().letter(g.avg)}</span>`}</span></div>
        <div class="gbar" aria-label="${round1(g.earned)}% earned, ${round1(lost)}% lost, ${round1(g.predicted)}% predicted, ${round1(g.openW)}% still open">
          <div class="gbar-earned" style="width:${pct(g.earned)}%"></div><div class="gbar-lost" style="width:${pct(lost)}%"></div><div class="gbar-pred" style="width:${pct(g.predicted)}%"></div>
        </div>
        <p class="muted small">${round1(g.gradedW)}% marked · ${round1(g.earned)}% earned${g.predictedW ? ` · ${round1(g.predictedW)}% predicted` : ""}</p>
        <div class="target-row"><label class="inline">Aiming for
          <select data-a="target" data-id="${c.id}">${targets.map(([min, l]) => `<option value="${min}" ${min === target ? "selected" : ""}>${l} (${min}%+)</option>`).join("")}</select></label></div>
        <p class="need">${msg}</p>
        <div class="grade-head"><span></span><span>Predicted</span><span>Actual</span></div>
        <ul class="grade-items">${c.assessments.map((a) => {
          const marked = hasVal(pr.grades[a.id]);
          return `<li class="${marked ? "marked" : ""}"><span class="gi-name">${esc(a.name || a.type)}<span class="muted small"> · ${a.weight !== "" && a.weight != null ? esc(a.weight) + "%" : "no weight"}</span></span>
            <label class="grade-in pred">${marked ? "" : `<input type="number" inputmode="decimal" min="0" max="150" step="1" placeholder="${needHint}" aria-label="Predicted mark on ${esc(a.name)}${needHint ? `, you need about ${needHint}%` : ""}" value="${pr.predicted[a.id] ?? ""}" data-a="predict" data-id="${a.id}"><span>%</span>`}</label>
            <label class="grade-in"><input type="number" inputmode="decimal" min="0" max="150" step="0.1" placeholder="—" aria-label="Your actual mark on ${esc(a.name)} in percent" value="${pr.grades[a.id] ?? ""}" data-a="grade" data-id="${a.id}"><span>%</span></label></li>`;
        }).join("")}
        </ul>
      </div>`;
    }).join("") + `<p class="muted small">Letter grades use the Queen's grading scale. Your syllabus decides how marks are combined, so check it for drop-the-lowest rules or alternative grading schemes.</p>`;
  }

  // ---------- shell ----------
  function render(P) {
    const pr = progress(P);
    if (!pr.since) { pr.since = E().localToday(); ctx.save(); }
    eng = E().create(P);
    // Lock in the plan for any days that have passed, so they never change.
    const newlyPast = eng.unlockedPast();
    if (Object.keys(newlyPast).length) {
      Object.assign(pr.locked, newlyPast);
      ctx.save();
      eng = E().create(P);
    }
    // Remember today's plan as shown, so it's what gets locked once today has passed.
    const todayIso = E().localToday();
    const shown = eng.studyOn(todayIso).map((b) => ({ id: b.id, courseId: b.courseId, start: b.start, end: b.end, sub: b.sub }));
    if (eng.inTerm(todayIso) && JSON.stringify(pr.lastSeen) !== JSON.stringify({ date: todayIso, blocks: shown })) {
      pr.lastSeen = { date: todayIso, blocks: shown };
      ctx.save();
    }
    const today = E().localToday();
    const tabs = [["cal", "Calendar"], ["todo", "To-Do"], ["due", "Due"], ["grades", "Grades"]];
    const view = { cal: calendarView, todo: todoView, due: dueView, grades: gradesView }[ui.tab] || calendarView;
    return `
      <header class="app-head">
        <p class="eyebrow">${esc(P.term.label || "Your term")} · ${P.courses.map((c) => esc(c.code)).join(" · ")}</p>
        <button type="button" class="link-btn" data-act="edit" data-step="7">Edit setup</button>
      </header>
      ${timerBar(P)}
      ${nowStrip(P, today)}
      <nav class="tabbar" role="tablist">${tabs.map(([id, l]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" class="${ui.tab === id ? "active" : ""}" data-a="tab" data-id="${id}">${l}</button>`).join("")}</nav>
      <section class="view view-${ui.tab}">${view(P, today)}</section>`;
  }

  function handle(e, P) {
    const el = e.target.closest("[data-a]");
    if (!el) return false;
    const d = el.dataset, pr = progress(P);
    if (e.type === "click") {
      switch (d.a) {
        case "tab": ui.tab = d.id; saveUI(); window.scrollTo(0, 0); break;
        case "week": ui.week = d.w; saveUI(); break;
        case "due-course": ui.dueCourse = d.id; saveUI(); break;
        case "show-done": ui.showDone = !ui.showDone; saveUI(); break;
        case "cycle": {
          const next = STATUS[(STATUS.indexOf(statusOf(pr, d.id)) + 1) % 3];
          delete pr.started[d.id]; delete pr.done[d.id];
          if (next === "started") pr.started[d.id] = true;
          if (next === "done") pr.done[d.id] = true;
          ctx.save(); break;
        }
        case "study-done": if (el.checked) pr.studyDone[d.id] = true; else delete pr.studyDone[d.id]; ctx.save(); break;
        case "due-done": pr.done[d.id] = true; delete pr.started[d.id]; ctx.save(); break;
        case "t-start":
          pr.timer = { courseId: d.c, blockId: d.id, label: d.label, start: Date.now(), elapsed: 0 };
          ctx.save(); break;
        case "t-start-free": {
          const sel = document.getElementById("freeCourse");
          pr.timer = { courseId: sel.value, blockId: null, label: "Extra study", start: Date.now(), elapsed: 0 };
          ctx.save(); break;
        }
        case "log-block": {
          const minutes = Number(el.closest(".log-row").querySelector("select").value);
          pr.sessions.push({ id: Math.random().toString(36).slice(2, 9), courseId: d.c, blockId: d.id, date: d.date, minutes, manual: true });
          pr.studyDone[d.id] = true;
          ctx.save(); break;
        }
        case "log-other": {
          const date = document.getElementById("logDate").value, minutes = Number(document.getElementById("logMin").value);
          if (!date || date > E().localToday()) break;
          pr.sessions.push({ id: Math.random().toString(36).slice(2, 9), courseId: document.getElementById("logCourse").value, blockId: null, date, minutes, manual: true });
          ctx.save(); break;
        }
        case "t-pause": if (pr.timer && pr.timer.start) { pr.timer.elapsed += Date.now() - pr.timer.start; pr.timer.start = null; } ctx.save(); break;
        case "t-resume": if (pr.timer && !pr.timer.start) pr.timer.start = Date.now(); ctx.save(); break;
        case "t-cancel": delete pr.timer; ctx.save(); break;
        case "t-finish": {
          const tm = pr.timer;
          if (tm) {
            const minutes = Math.min(360, Math.round(timerMs(tm) / 60000));
            if (minutes >= 1) pr.sessions.push({ id: Math.random().toString(36).slice(2, 9), courseId: tm.courseId, blockId: tm.blockId, date: E().localToday(), minutes });
            if (tm.blockId) pr.studyDone[tm.blockId] = true;
            delete pr.timer;
            ctx.save();
          }
          break;
        }
        default: return false;
      }
      ctx.rerender();
      return true;
    }
    if (e.type === "change" && d.a === "target") { pr.target[d.id] = Number(el.value); ctx.save(); ctx.rerender(); return true; }
    if (e.type === "change" && (d.a === "grade" || d.a === "predict")) {
      const store = d.a === "grade" ? pr.grades : pr.predicted;
      const v = el.value.trim();
      if (v === "") delete store[d.id]; else store[d.id] = Math.max(0, Math.min(150, Number(v)));
      // Wait for focus to move (e.g. Tab to the next mark) so it's kept after re-rendering.
      ctx.save(); setTimeout(ctx.rerender, 0); return true;
    }
    return false;
  }

  // After drawing: scroll the week picker so the chosen week is in view.
  function afterRender(container) {
    const bar = container.querySelector(".weekbar"), on = bar && bar.querySelector(".wk-btn.on");
    if (on) bar.scrollLeft = on.offsetLeft - bar.clientWidth / 2 + on.offsetWidth / 2 - bar.offsetLeft;
  }

  function init(c) { ctx = c; }  // { save, rerender, profile }

  root.App = { render, handle, init, afterRender };
})(window);
