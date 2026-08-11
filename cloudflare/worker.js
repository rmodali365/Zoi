// Cloudflare Worker for zoisocial.com.
//
// Serves two things off the domain that Universal Links require:
//   1. GET /.well-known/apple-app-site-association  → the AASA file (JSON, no redirect),
//      which tells iOS that this domain is allowed to open the Zoi app.
//   2. GET /user/<uuid>                             → a share landing page. If the app is
//      installed, iOS intercepts and opens it (Universal Link) before this HTML loads;
//      otherwise the page shows a fallback. This replaces the old Supabase `link` function.
//
// Deploy: see cloudflare/README.md. App ID = <Apple Team ID>.<bundle id>.

const APP_ID = '39AY5ML2YA.app.zoi.mobile';

// Apple App Site Association. `components` scopes which paths open the app — only share
// links (/user/*) do, so the AASA file and any future web-only pages don't hijack Safari.
const AASA = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [{ '/': '/user/*', comment: 'User profile share links' }],
      },
    ],
  },
};

const USER_PATH = /^\/user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function landingPage(userId) {
  const deepLink = `zoi://user/${userId}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zoi — Rank what you do. Share your taste.</title>
<style>
  body { margin:0; font-family:-apple-system,system-ui,sans-serif; background:#FAF6EF;
         color:#1F1B16; display:flex; min-height:100vh; align-items:center; justify-content:center; }
  main { text-align:center; padding:32px; max-width:420px; }
  h1 { font-size:40px; letter-spacing:-1px; margin:0 0 8px; color:#0E7C9D; }
  p { color:#6B6459; line-height:1.5; margin:0 0 24px; }
  a.btn { display:inline-block; background:#0E7C9D; color:#fff; text-decoration:none;
          padding:14px 28px; border-radius:12px; font-weight:600; }
  .hint { font-size:13px; margin-top:24px; }
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
  // If the app is installed, the Universal Link already opened it before this loaded.
  // Otherwise this scheme attempt is a silent no-op and the fallback above stays.
  window.location.href = ${JSON.stringify(deepLink)};
</script>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/.well-known/apple-app-site-association') {
      return new Response(JSON.stringify(AASA), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const match = pathname.match(USER_PATH);
    if (match) {
      return new Response(landingPage(match[1]), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    // Root / anything else → a minimal home page.
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Zoi</title>` +
      `<body style="font-family:-apple-system,system-ui,sans-serif;background:#FAF6EF;color:#1F1B16;` +
      `display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">` +
      `<div><h1 style="color:#0E7C9D">Zoi</h1><p style="color:#6B6459">Rank what you do. Share your taste.</p></div>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  },
};
