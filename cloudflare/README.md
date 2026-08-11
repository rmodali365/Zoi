# zoisocial.com Cloudflare Worker

Serves the Universal Links **AASA** file and the share **landing pages** for `zoisocial.com`.
Replaces the old Supabase `link` Edge Function (share links now point at `zoisocial.com`).

## One-time deploy

Prereqs: the `zoisocial.com` zone is active on Cloudflare (it is — registered there).

1. **Install wrangler + log in**
   ```sh
   npm install -g wrangler
   wrangler login
   ```

2. **Add a proxied placeholder DNS record for the apex** (so the Worker route can attach to
   `zoisocial.com`). In the Cloudflare dashboard → DNS → Records, add:
   - Type `AAAA`, Name `@`, IPv6 `100::` (the discard address), **Proxied (orange cloud) ON**.
   (A Worker route needs a proxied DNS record on the hostname it matches; `100::` is the
   standard "there's no real origin, the Worker answers" placeholder.)

3. **Deploy the Worker** (from this folder)
   ```sh
   cd cloudflare
   wrangler deploy
   ```

4. **Verify** — all three should work:
   ```sh
   curl -s https://zoisocial.com/.well-known/apple-app-site-association   # JSON, HTTP 200, no redirect
   curl -sI https://zoisocial.com/user/00000000-0000-0000-0000-000000000000 | head -1  # 200 text/html
   ```
   The AASA must return `content-type: application/json` and **must not redirect**.

## After deploy

- The app must be built with `ios.associatedDomains: ["applinks:zoisocial.com"]` (already in
  `app.json`) — Universal Links go live on the **next build**, not OTA.
- Apple caches the AASA. When testing on device, reinstall the app to force a re-fetch.
- The Supabase `link` function is now superseded and can be deleted once shares point here.

## support@zoisocial.com (optional, free)

Cloudflare dashboard → Email → Email Routing → add `support@zoisocial.com` forwarding to your
personal inbox, and verify. Lets you retire the personal address in the privacy policy.
