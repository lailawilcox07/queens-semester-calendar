// Term presets from the Queen's Faculty of Arts and Science sessional dates.
// Source: https://www.queensu.ca/registrar/sites/uregwww/files/uploaded_files/pdfs/Sessional%20Dates/2026-27/SessionalDates_2026-2027_ASC.pdf
// Other faculties' dates can differ slightly; students can edit every date in setup.
// Add a new entry here each year when the Registrar publishes the next sessional dates.
window.TERM_PRESETS = [
  {
    id: "W2027",
    label: "Winter 2027",
    classesStart: "2027-01-04",
    classesEnd: "2027-04-05",
    examStart: "2027-04-09",
    examEnd: "2027-04-23",
    breaks: [
      { label: "Reading week", start: "2027-02-15", end: "2027-02-19" },
      { label: "Good Friday", start: "2027-03-26", end: "2027-03-26" },
    ],
  },
  {
    id: "F2026",
    label: "Fall 2026",
    classesStart: "2026-09-08",
    classesEnd: "2026-12-08",
    examStart: "2026-12-10",
    examEnd: "2026-12-23",
    breaks: [
      { label: "National Day for Truth and Reconciliation", start: "2026-09-30", end: "2026-09-30" },
      { label: "Reading week", start: "2026-10-12", end: "2026-10-16" },
      { label: "Day of Remembrance and Action", start: "2026-11-06", end: "2026-11-06" },
    ],
  },
];
