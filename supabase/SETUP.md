# Backend setup (Supabase + Claude API)

This turns on:
- **Accounts and sync**: students sign in with their Queen's email and see the same semester on every device.
- **Uploads**: "Upload syllabus" and "Upload timetable screenshot" in setup, limited per student.
- **Course names**, filled in automatically from the Queen's Academic Calendar.
- **Push reminders** before classes and commitments, when study blocks start, and before deadlines.

It takes about 30 minutes, and you only do it once. Run the commands on your laptop, in this repo folder.

## Pilot budget: $50

The pilot is set up to stay under $50 for one term with about 50 students:

| | Plan | Cost |
| --- | --- | --- |
| Website | GitHub Pages | Free |
| Accounts, sync, reminders, shared syllabi | Supabase Free plan | Free |
| Sign-in emails | Resend Free plan (100 emails a day) | Free |
| Domain for sending email | Any registrar | About $15–25 a year |
| Reading uploads | Claude API, with a **$30 spend limit** | About $25–30 at most |

What keeps it there:
- **Upload limits:** each student gets 10 uploads a day and 15 a term (the defaults in the extract function). A full setup takes about 6.
- **Shared syllabi:** once one student shares a course's syllabus, classmates pick it from the list for free.
- **A hard cap:** set the Anthropic spend limit to $30 a month (step 1). If it's ever reached, uploads stop working and students can still type things in. Nothing else is affected.

After the pilot, raise the upload limits and spend cap, and move Supabase to the Pro plan ($25/month) before a full launch.

## 1. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in.
2. Under **Billing**, add a small prepaid credit.
3. Under **API keys**, create a key named `semester-calendar` and copy it. You'll only see it once.
4. Under **Limits**, set a monthly spend limit of **$30** for the pilot.

Never put this key in the website code or commit it to GitHub.

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up and create a new project, for example `semester-calendar`. Pick the Canada region if it's offered.
2. Open **Project Settings → General** and copy the **Project ID**.
3. Open **Project Settings → API keys** and copy the **Project URL** and the **publishable key** (`sb_publishable_...`).

## 3. Set up sign-in emails

Students sign in with a 6-digit code sent to their email.

1. Go to **Authentication → Sign In / Providers** and make sure **Email** is turned on.
2. Go to **Authentication → Emails → Templates → Magic Link** and replace the body with:

   ```html
   <h2>Your Semester Calendar code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:28px; letter-spacing:6px;"><b>{{ .Token }}</b></p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```

3. Under **Authentication → Emails**, the same one-time code also powers the QR code on a laptop that signs the phone in. Leave **Email OTP Expiration** at a short time, like 10 minutes (600 seconds), so an old QR code can't be reused later.
4. Go to **Authentication → URL Configuration** and set **Site URL** to `https://lailawilcox07.github.io/queens-semester-calendar/`.
5. **Before the pilot:** Supabase's built-in email sender only allows a handful of emails per hour and is meant for testing. Under **Authentication → Emails → SMTP Settings**, connect a real email service, such as Resend.

## 4. Create the database tables and deploy the functions

```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase db push
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy extract
npx supabase functions deploy course-lookup
npx supabase functions deploy phone-link
npx supabase functions deploy reminders
```

`db push` creates:
- `student_data`: one row per student holding their semester. Each student can only read and change their own row.
- `uploads`: a record of each upload, used for the limits.
- `shared_syllabi`: syllabi students chose to share. Signed-in students can see the ones for the current term. Each one is hidden two weeks after its term's exams end, or once 3 students report it as wrong.
- A rule that only `@queensu.ca` emails can create accounts. To test with another address, run this in **SQL Editor**: `drop trigger if exists queens_email_only on auth.users;`

Optional settings, with `npx supabase secrets set NAME=value`:

| Name | Default | What it does |
| --- | --- | --- |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Set to `claude-haiku-5-5` to cut costs |
| `UPLOADS_PER_DAY` | `10` | Uploads per student per day (pilot setting) |
| `UPLOADS_PER_TERM` | `15` | Uploads per student in any 120 days (pilot setting) |
| `ALLOWED_ORIGINS` | `https://lailawilcox07.github.io,http://localhost:8000` | Sites allowed to use the functions |

## 5. Turn on push reminders

1. Make the reminder keys (a public and a private half):

   ```
   npx web-push generate-vapid-keys
   ```

2. Save them, plus a made-up password for the scheduler (any long random text), as secrets:

   ```
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@queensu.ca CRON_SECRET=some-long-random-text
   ```

3. In Supabase, go to **Database → Extensions** and turn on **pg_cron** and **pg_net**.
4. In **SQL Editor**, run this with your project ID and the same `CRON_SECRET`. It checks for reminders to send every 5 minutes:

   ```sql
   select cron.schedule('send-reminders', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/reminders',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'some-long-random-text'),
       body := '{}'::jsonb
     );
   $$);
   ```

Reminder times use Kingston time (America/Toronto). If you change `js/engine.js` or `js/reminders.js`, run `scripts/sync-shared.sh` and redeploy the reminders function so the server uses the same rules.

## 6. Connect the site

Edit `js/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseKey: "sb_publishable_...",
  vapidPublicKey: "the VAPID_PUBLIC_KEY from step 5",
};
```

Commit and push. "Sign in to sync" appears in the top right, and the upload buttons appear in setup.

## Checking it works

1. On your laptop, click **Sign in to sync**, enter your Queen's email, then the code from the email.
2. On your laptop, open **Add to your phone** at the bottom and scan the QR code with your phone. Your semester should open on the phone, already signed in. (Or open the site on your phone and sign in with the same email.)
3. Tick something off on your phone, then switch back to the laptop tab. It should update within a few seconds.
4. In setup, upload a syllabus.
5. Upload a syllabus with **Share this with other students** ticked. Then sign in as a second student, add the same course for the same term, and check it appears under **Syllabi shared by other students**.
6. On your phone (added to the home screen on iPhone), go to **To-Do → Reminders**, turn them on and tap **Send a test**.

If something fails:
- **Edge Functions → extract → Logs** shows upload errors, and **reminders → Logs** shows reminder runs.
- **Authentication → Users** shows who has signed up.
- **Table Editor → student_data** shows saved semesters.

## How sync works

- Every change is saved on the device first, then sent to the account a moment later, so the app works offline.
- When the app opens or comes back to the front, it checks the account. Whichever copy was changed most recently wins.
- If someone edits on two devices while both are offline, the later edit replaces the earlier one. That's fine for a pilot.
- Signing out removes the semester from that device. It stays in the account.
- The demo is never saved to an account.
