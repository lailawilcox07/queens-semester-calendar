# Semester Calendar for Queen's students

A free semester planner for Queen's University students. Students enter their courses, class times and syllabus deadlines once, and get a weekly calendar, deadline tracker and study plan built around their term.

Everything a student enters is saved in their own browser. There are no accounts, and no data is sent to a server.

## Status

**Milestone 1: setup flow (done).** Covers term dates, courses, class times, deadlines and weights, weekly routine, study style, and a review screen with clash and weight checks.

**Milestone 2: upload to autofill (built, needs backend setup).** Students can upload a SOLUS or Qflow timetable screenshot to fill in courses and class times, or a syllabus to fill in deadlines and weights. Claude reads the uploads through a Supabase Edge Function, and students review everything before it's added. See [supabase/SETUP.md](supabase/SETUP.md).

**Milestone 3: the everyday app (done).** After setup, students get:
- **Calendar**: each week of the term with real dates, classes (skipping reading week and holidays), commitments, one-time events, deadlines, and study blocks planned into free time around classes, travel and meals. A grid on laptops, a day list on phones.
- **To-Do**: today's study blocks and anything due in the next 3 days, with a weekly study progress bar.
- **Due**: every deadline grouped by week, filterable by course, marked Not started / Started / Done.
- **Grades**: marks per assessment, a running average with the Queen's letter grade, and what's needed on the remaining work to reach a target grade.

Add `?preview&today=YYYY-MM-DD` to the address to view any day of the term.

**Milestone 4: accounts and sync (built, needs backend setup).** Optional sign-in with a Queen's email (a code is emailed, no password). The semester syncs between devices through Supabase. Uploads need an account and are limited per student (20 a day, 40 a term by default). See [supabase/SETUP.md](supabase/SETUP.md).

**Milestone 5: add to your phone (done).** After setup, a card offers "Add it to your home screen" with steps for the student's own phone: iPhone (Safari, including the iOS 26 menu), Android (Chrome's install prompt when available), or a QR code on laptops. It can be reopened from "Add to your phone" at the bottom. A service worker lets the app open offline.

**Milestone 6: push reminders (built, needs backend setup).** In To-Do → Reminders, students turn on notifications for classes (with the commute before the first class), commitments and events (with travel time), study blocks, and deadlines (morning of and evening before). A scheduled Supabase function sends them every 5 minutes using the same rules as the app (`js/reminders.js`). On iPhone, reminders need the app on the home screen.

**Shared syllabi.** After checking an uploaded syllabus, a student can share it, along with its instructor, with others taking the same course in the same term. On the Deadlines step, signed-in students can search the term's shared syllabi by course or instructor and use one instead of uploading. Shared syllabi are anonymous, only visible for their own term, and hidden if 3 students report them.

**Pilot budget: $50.** See [supabase/SETUP.md](supabase/SETUP.md#pilot-budget-50).

## Shared code

`supabase/functions/_shared/engine.js` and `reminders.js` are copies of the files in `js/`, so the server plans reminders exactly like the app. After changing either, run `scripts/sync-shared.sh`.

## Updating term dates

Term presets live in `js/terms.js`. Each year, add the new terms from the [Queen's sessional dates](https://www.queensu.ca/registrar/).

## Running locally

It's a static site with no build step:

```
python3 -m http.server
```

Then open http://localhost:8000.
