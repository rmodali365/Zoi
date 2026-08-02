// Pulls in Deno + Supabase Edge runtime type definitions (resolved by the Deno LSP).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Edge Function: public share-link landing page (#56).
// shareProfile() shares https://<ref>.supabase.co/functions/v1/link/user/<id> instead
// of a bare zoi:// URL, so the link does something for everyone:
//   - app installed  -> the page immediately tries zoi://user/<id> (Safari prompts
//     "Open in Zoi?"), with a manual "Open in Zoi" button as backup
//   - no app         -> get-the-app fallback copy (App Store link once we're listed)
// Public on purpose (verify_jwt = false): recipients aren't signed in. The page
// renders no profile data — just the deep link — so nothing private leaks.

const APP_SCHEME_URL = (id: string) => `zoi://user/${id}`;

// Path is /link/user/<uuid>; match the uuid wherever it sits so a proxy prefix
// can't break parsing.
const USER_PATH = /user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function page(userId: string): string {
  const deepLink = APP_SCHEME_URL(userId);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zoi — Rank what you do. Share your taste.</title>
<style>
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #FAF6EF;
         color: #1F1B16; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  main { text-align: center; padding: 32px; max-width: 420px; }
  h1 { font-size: 40px; letter-spacing: -1px; margin: 0 0 8px; }
  p { color: #6B6459; line-height: 1.5; margin: 0 0 24px; }
  a.btn { display: inline-block; background: #1B6E8C; color: #fff; text-decoration: none;
          padding: 14px 28px; border-radius: 12px; font-weight: 600; }
  .hint { font-size: 13px; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <h1>Zoi</h1>
  <p>Someone shared their taste with you.<br>Rank what you do. Share your taste.</p>
  <a class="btn" href="${deepLink}">Open in Zoi</a>
  <p class="hint">Don&rsquo;t have Zoi yet? It&rsquo;s in early access &mdash; ask your friend for an invite.</p>
</main>
<script>
  // Try the app straight away; if it isn't installed this is a silent no-op and
  // the page (with the button + fallback copy) simply stays.
  window.location.href = ${JSON.stringify(deepLink)};
</script>
</body>
</html>`;
}

Deno.serve((req: Request) => {
  const match = new URL(req.url).pathname.match(USER_PATH);
  if (!match) return new Response('Not found', { status: 404 });
  return new Response(page(match[1]), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
});
