# Apolaki

Stock, sales and accounts app for Apolaki by Jason Labunda.
Static web app (GitHub Pages) + Supabase database (project `apolaki`, Singapore).

## Files
- `index.html`, `styles.css`, `app.js` – the app
- `config.js` – Supabase address and publishable key
- `sw.js`, `manifest.webmanifest`, `icon.svg` – lets it install on a phone, open offline and show notifications
- `notify-icon.png` – icon on order notifications

## Who can sign in
Only emails listed in the `allowed_users` table. Add a person in two steps:
1. Supabase → Authentication → Users → Add user (tick Auto Confirm).
2. Supabase → Table Editor → `allowed_users` → Insert row with the same email.

## Updating the app
Edit a file on GitHub and commit. Pages republishes in about a minute.
If your phone still shows the old version, close and reopen the app twice.
When you change app files, bump `CACHE` in `sw.js` (apolaki-v1 → apolaki-v2).

## Order notifications
Accounts → Notifications → **Turn on notifications** (once per phone). Every new shop order then
pops up on that phone, even when the app is closed; tapping it opens Online orders.
On iPhone the app must be added to the Home Screen first (Share → Add to Home Screen) and opened from there.

How it works: a trigger on `shop_orders` calls the `notify-new-order` Supabase function
(source in `supabase/functions/`), which sends to every phone in `push_subscriptions`.
Its keys live in `push_config` (no one but the function can read it).
