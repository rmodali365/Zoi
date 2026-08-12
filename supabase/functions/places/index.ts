// Pulls in Deno + Supabase Edge runtime type definitions (resolved by the Deno LSP).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Edge Function: Google Places proxy.
// Keeps the Google API key server-side (set as the GOOGLE_PLACES_API_KEY secret) so it
// never ships in the app bundle. Requires a valid Supabase JWT (verify_jwt = true), so
// only authenticated users can call it. Uses the Places API (New).
//
// Actions:
//   { action: "autocomplete", input, sessionToken? } -> { suggestions: [...] }
//   { action: "details", placeId, sessionToken? }     -> { location: {...} }

const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')!;

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, input, placeId, sessionToken } = await req.json();

    if (action === 'autocomplete') {
      if (!input || input.trim().length < 2) return json({ suggestions: [] });

      const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
        body: JSON.stringify({ input, sessionToken }),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: data?.error?.message ?? 'autocomplete failed' }, r.status);

      const suggestions = (data.suggestions ?? [])
        .map((s: any) => {
          const p = s.placePrediction;
          if (!p) return null;
          return {
            placeId: p.placeId,
            primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
            secondary: p.structuredFormat?.secondaryText?.text ?? '',
            description: p.text?.text ?? '',
          };
        })
        .filter((s: any) => s && s.placeId);

      return json({ suggestions });
    }

    if (action === 'details') {
      if (!placeId) return json({ error: 'placeId required' }, 400);

      const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': GOOGLE_KEY,
          // types/primaryType let the client auto-detect a stop's kind (Part 1 of #72);
          // they stay inside the Pro SKU we're already billed at.
          'X-Goog-FieldMask':
            'id,displayName,formattedAddress,location,addressComponents,types,primaryType,primaryTypeDisplayName',
        },
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message ?? 'details failed' }, r.status);

      const comp = (type: string) =>
        d.addressComponents?.find((c: any) => c.types?.includes(type));

      // Widen the city resolution chain: Google omits `locality` for national parks,
      // airports and many non-US addresses, so walk further down the components
      // rather than dropping the stop into "Other" (Part 2 of #72).
      const city =
        comp('locality')?.longText ??
        comp('postal_town')?.longText ??
        comp('administrative_area_level_3')?.longText ??
        comp('sublocality_level_1')?.longText ??
        comp('administrative_area_level_2')?.longText ??
        comp('administrative_area_level_1')?.longText ??
        null;
      const region = comp('administrative_area_level_1')?.shortText ?? null;
      const country = comp('country')?.shortText ?? null;

      // Canonical grouping key (slug|region|country), lowercased with diacritics +
      // punctuation stripped and a trailing "city" dropped — mirrors lib/cities.ts.
      const slug = (s: string) =>
        s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
          .replace(/[^a-z0-9]/g, '').replace(/city$/, '');
      const cityKey = city
        ? [slug(city), region ? slug(region) : '', country ? slug(country) : '']
            .filter(Boolean).join('|')
        : null;

      const location = {
        name: d.displayName?.text ?? '',
        lat: d.location?.latitude ?? 0,
        lng: d.location?.longitude ?? 0,
        place_id: d.id ?? placeId,
        city,
        region,
        country,
        city_key: cityKey,
        types: d.types ?? null,
        primaryType: d.primaryType ?? null,
        formattedAddress: d.formattedAddress ?? null,
      };

      return json({ location });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
