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

Try it with sample data: open the site and click "Or try a demo with sample courses". Add `?today=YYYY-MM-DD` to the address to view any day of the term.

**Milestone 4: accounts and sync (built, needs backend setup).** Optional sign-in with a Queen's email (a code is emailed, no password). The semester syncs between devices through Supabase. Uploads need an account and are limited per student (20 a day, 40 a term by default). See [supabase/SETUP.md](supabase/SETUP.md).

Coming next:
- Guide for adding the app to a phone's home screen
- Push reminders

## Updating term dates

Term presets live in `js/terms.js`. Each year, add the new terms from the [Queen's sessional dates](https://www.queensu.ca/registrar/).

## Running locally

It's a static site with no build step:

```
python3 -m http.server
```

Then open http://localhost:8000.
