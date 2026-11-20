# Backend setup (Supabase + Claude API)

This turns on "Upload syllabus", "Upload timetable screenshot" and automatic course names in setup. It takes about 15 minutes, and you only do it once.

## 1. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in.
2. Under **Billing**, add a small prepaid credit.
3. Under **API keys**, create a key named `semester-calendar` and copy it. You'll only see it once.
4. Optional but recommended: under **Limits**, set a monthly spend limit.

Never put this key in the website code or commit it to GitHub.

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up and create a new project, for example `semester-calendar`. Pick the Canada region if it's offered.
2. Open **Project Settings → General** and copy the **Project ID** (also called the reference ID).
3. Open **Project Settings → API keys** and copy the **Project URL** and the **publishable key** (`sb_publishable_...`).

## 3. Deploy the function

On your laptop, in this repo folder:

```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy extract
npx supabase functions deploy course-lookup
```

Optional settings, with `npx supabase secrets set NAME=value`:

| Name | Default | What it does |
| --- | --- | --- |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Set to `claude-haiku-5-5` to cut costs |
| `ALLOWED_ORIGINS` | `https://lailawilcox07.github.io,http://localhost:8000` | Sites allowed to use the function |

## 4. Connect the site

Edit `js/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseKey: "sb_publishable_...",
};
```

Commit and push. The upload buttons appear once these are filled in.

## Checking it works

Open the site, go to the Deadlines step and upload a syllabus. If something fails, open **Edge Functions → extract → Logs** in Supabase to see the error.

## Before going public

Anyone can call this function from your site, and each call costs a little. Before the pilot, add a per-student daily limit. That's planned alongside accounts.
