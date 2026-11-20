#!/bin/sh
# The reminders function uses the same schedule rules as the app. Run this after
# changing js/engine.js or js/reminders.js, then redeploy the reminders function.
cd "$(dirname "$0")/.." && cp js/engine.js js/reminders.js supabase/functions/_shared/ && echo "Copied engine.js and reminders.js to supabase/functions/_shared/"
