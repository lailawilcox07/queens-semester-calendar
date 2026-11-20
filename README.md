# Semester Calendar for Queen's students

A free semester planner for Queen's University students. Students enter their courses, class times and syllabus deadlines once, and get a weekly calendar, deadline tracker and study plan built around their term.

Everything a student enters is saved in their own browser. There are no accounts, and no data is sent to a server.

## Status

**Milestone 1: setup flow (done).** Covers term dates, courses, class times, deadlines and weights, weekly routine, study style, and a review screen with clash and weight checks.

Coming next:
- Calendar, To-Do, Due and Grades views built from the setup data
- Guide for adding the app to a phone's home screen
- Export and import, for backups and moving between devices

## Updating term dates

Term presets live in `js/terms.js`. Each year, add the new terms from the [Queen's sessional dates](https://www.queensu.ca/registrar/).

## Running locally

It's a static site with no build step:

```
python3 -m http.server
```

Then open http://localhost:8000.
