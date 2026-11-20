// Supabase project settings, from Project Settings → API keys in the Supabase dashboard.
// The publishable key (sb_publishable_...) is meant to be public.
// Leave these empty to run without accounts, sync, uploads or reminders.
window.APP_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  // Public half of the push reminder keys (see supabase/SETUP.md). Empty = no reminders.
  vapidPublicKey: "",
};
