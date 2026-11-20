// Profile storage. Everything a student enters lives in this one object, saved
// in their own browser (localStorage). Nothing is sent anywhere.
(function (root) {
  const KEY = "qsc.profile.v1";

  function emptyProfile() {
    return {
      version: 1,
      setupComplete: false,
      step: 0,
      term: { presetId: "", label: "", classesStart: "", classesEnd: "", examStart: "", examEnd: "", breaks: [] },
      courses: [],
      routine: { wake: "08:00", bed: "23:00", commute: 15, commitments: [], oneoffs: [], meals: { breakfast: "", lunch: "12:00", dinner: "18:00", length: 30 } },
      study: { style: "spread", weeklyHours: 15 },
    };
  }

  // Saves from before per-day times stored one time for all days. Split them.
  function migrate(p) {
    const id = () => Math.random().toString(36).slice(2, 9);
    const toSlots = (m) => {
      if (m.slots) return;
      m.slots = (m.days || []).map((day) => ({ id: id(), day, start: m.start || "", end: m.end || "" }));
      delete m.days; delete m.start; delete m.end;
    };
    (p.courses || []).forEach((c) => (c.meetings || []).forEach(toSlots));
    if (p.routine) {
      (p.routine.commitments || []).forEach((m) => { toSlots(m); if (m.commute == null) m.commute = ""; });
      if (!p.routine.oneoffs) p.routine.oneoffs = [];
    }
  }

  // Fill in defaults and convert old formats, for saves from this device or the account.
  function normalize(p) {
    const base = emptyProfile();
    migrate(p);
    return Object.assign(base, p, {
      term: Object.assign(base.term, p.term),
      routine: Object.assign(base.routine, p.routine),
      study: Object.assign(base.study, p.study),
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyProfile();
    } catch (e) {
      return emptyProfile();
    }
  }

  // Every change stamps the time, so sync can tell which copy is newer.
  // keepTime is for copies that came from the account and shouldn't look new.
  function stamp(profile, opts) {
    if (opts && opts.keepTime) return;
    profile.meta = Object.assign({}, profile.meta, { updatedAt: Date.now() });
    if (root.Sync && !profile.meta.demo) root.Sync.schedulePush();
  }

  let saveTimer = null;
  function save(profile) {
    stamp(profile);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
    }, 150);
  }
  function saveNow(profile, opts) {
    stamp(profile, opts);
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  root.Store = { load, save, saveNow, clear, emptyProfile, normalize };
})(window);
