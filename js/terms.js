// Queen's term dates, from the Faculty of Arts and Science sessional dates.
// 2026–27 source: https://www.queensu.ca/registrar/sites/uregwww/files/uploaded_files/pdfs/Sessional%20Dates/2026-27/SessionalDates_2026-2027_ASC.pdf
// Add each new year's terms here when the Registrar publishes them. Terms not
// listed still appear in setup; students just enter those dates themselves.
(function (root) {
  const KNOWN = {
    F2026: {
      classesStart: "2026-09-08", classesEnd: "2026-12-08", examStart: "2026-12-10", examEnd: "2026-12-23",
      breaks: [
        { label: "Labour Day", start: "2026-09-07", end: "2026-09-07" },
        { label: "National Day for Truth and Reconciliation", start: "2026-09-30", end: "2026-09-30" },
        { label: "Reading week", start: "2026-10-12", end: "2026-10-16" },
        { label: "Day of Remembrance and Action", start: "2026-11-06", end: "2026-11-06" },
      ],
    },
    W2027: {
      classesStart: "2027-01-04", classesEnd: "2027-04-05", examStart: "2027-04-09", examEnd: "2027-04-23",
      breaks: [
        { label: "Reading week", start: "2027-02-15", end: "2027-02-19" },
        { label: "Good Friday", start: "2027-03-26", end: "2027-03-26" },
      ],
    },
  };

  // The next two Fall/Winter terms that haven't finished yet, oldest first.
  // In November 2026 that's Fall 2026 then Winter 2027; by May 2027 it
  // becomes Fall 2027 then Winter 2028.
  function upcomingTerms(today) {
    today = today || new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const y = today.getFullYear();
    const all = [];
    for (let year = y - 1; year <= y + 1; year++) {
      all.push({ id: "F" + year, label: "Fall " + year, ends: year + "-12-31" });
      all.push({ id: "W" + year, label: "Winter " + year, ends: year + "-04-30" });
    }
    return all
      .filter((t) => t.ends >= iso(today))
      .sort((a, b) => a.ends.localeCompare(b.ends))
      .slice(0, 2)
      .map((t) => Object.assign({ id: t.id, label: t.label, known: !!KNOWN[t.id] }, KNOWN[t.id] || { classesStart: "", classesEnd: "", examStart: "", examEnd: "", breaks: [] }));
  }

  root.Terms = { upcomingTerms };
})(window);
