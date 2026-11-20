# Backend setup (Supabase + Claude API)

This turns on:
- **Accounts and sync**: students sign in with their Queen's email and see the same semester on every device.
- **Uploads**: "Upload syllabus" and "Upload timetable screenshot" in setup, limited per student.
- **Course names**, filled in automatically from the Queen's Academic Calendar.

It takes about 20 minutes, and you only do it once. Run the commands on your laptop, in this repo folder.

## 1. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in.
2. Under **Billing**, add a small prepaid credit.
3. Under **API keys**, create a key named `semester-calendar` and copy it. You'll only see it once.
4. Under **Limits**, set a monthly spend limit.

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
```

`db push` creates:
- `student_data`: one row per student holding their semester. Each student can only read and change their own row.
- `uploads`: a record of each upload, used for the limits.
- A rule that only `@queensu.ca` emails can create accounts. To test with another address, run this in **SQL Editor**: `drop trigger if exists queens_email_only on auth.users;`

Optional settings, with `npx supabase secrets set NAME=value`:

| Name | Default | What it does |
| --- | --- | --- |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Set to `claude-haiku-5-5` to cut costs |
| `UPLOADS_PER_DAY` | `20` | Uploads per student per day |
| `UPLOADS_PER_TERM` | `40` | Uploads per student in any 120 days |
| `ALLOWED_ORIGINS` | `https://lailawilcox07.github.io,http://localhost:8000` | Sites allowed to use the functions |

## 5. Connect the site

Edit `js/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseKey: "sb_publishable_...",
};
```

Commit and push. "Sign in to sync" appears in the top right, and the upload buttons appear in setup.

## Checking it works

1. On your laptop, click **Sign in to sync**, enter your Queen's email, then the code from the email.
2. On your laptop, open **Add to your phone** at the bottom and scan the QR code with your phone. Your semester should open on the phone, already signed in. (Or open the site on your phone and sign in with the same email.)
3. Tick something off on your phone, then switch back to the laptop tab. It should update within a few seconds.
4. In setup, upload a syllabus.

If something fails:
- **Edge Functions → extract → Logs** shows upload errors.
- **Authentication → Users** shows who has signed up.
- **Table Editor → student_data** shows saved semesters.

## How sync works

- Every change is saved on the device first, then sent to the account a moment later, so the app works offline.
- When the app opens or comes back to the front, it checks the account. Whichever copy was changed most recently wins.
- If someone edits on two devices while both are offline, the later edit replaces the earlier one. That's fine for a pilot.
- Signing out removes the semester from that device. It stays in the account.
- The demo is never saved to an account.
