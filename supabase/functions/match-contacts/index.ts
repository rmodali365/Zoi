// Pulls in Deno + Supabase Edge runtime type definitions (resolved by the Deno LSP).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Edge Function: match phone contacts to Zoi users (#60).
// The client sends SHA-256 hashes of normalized phone numbers (digits only,
// US-default 11 digits — see src/lib/contacts.ts, which must normalize the same
// way). Raw contact numbers never leave the device. We hash registered users'
// phones server-side and return the matching public profile fields.
// verify_jwt = true, and the caller is re-derived from the JWT so the requester
// can never appear in their own matches.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Digits only; 10-digit numbers get the US country code. Mirrors normalizePhone
// in src/lib/contacts.ts — the two must stay in lockstep or hashes never match.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `1${digits}` : digits;
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Who's asking (from their JWT) — excluded from their own results.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { hashes } = await req.json();
    if (!Array.isArray(hashes) || hashes.length === 0) return json({ matches: [] });
    const wanted = new Set<string>(hashes.map((h) => String(h).toLowerCase()));

    // Fine at current scale: hash every registered phone and compare. Move to a
    // stored phone-hash column when the user count makes this slow.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: users, error } = await admin
      .from('users')
      .select('id, name, handle, avatar_url, phone')
      .not('phone', 'is', null);
    if (error) return json({ error: error.message }, 500);

    const matches = [];
    for (const u of users ?? []) {
      if (u.id === user.id || !u.phone) continue;
      if (wanted.has(await sha256Hex(normalizePhone(u.phone)))) {
        matches.push({ id: u.id, name: u.name, handle: u.handle, avatar_url: u.avatar_url });
      }
    }
    return json({ matches });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
