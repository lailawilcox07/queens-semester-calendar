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
      routine: { wake: "08:00", bed: "23:00", commute: 15, commitments: [] },
      study: { style: "spread", weeklyHours: 15 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyProfile();
      const p = JSON.parse(raw);
      // Fill any fields added in later versions so old saves keep working.
      const base = emptyProfile();
      return Object.assign(base, p, {
        term: Object.assign(base.term, p.term),
        routine: Object.assign(base.routine, p.routine),
        study: Object.assign(base.study, p.study),
      });
    } catch (e) {
      return emptyProfile();
    }
  }

  let saveTimer = null;
  function save(profile) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
    }, 150);
  }
  function saveNow(profile) {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  root.Store = { load, save, saveNow, clear, emptyProfile };
})(window);
