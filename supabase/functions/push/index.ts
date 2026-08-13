// Pulls in Deno + Supabase Edge runtime type definitions (resolved by the Deno LSP).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Edge Function: send a push for one `notifications` row (#74).
//
// Called by the `notifications_push` DB trigger via pg_net, never by the app —
// hence verify_jwt = false plus a shared-secret header. The trigger passes only
// the row id; everything else is re-read here with the service role, so the
// caller can't forge the recipient or the copy.
//
// Push mirrors the in-app activity feed exactly: one trigger on `notifications`
// means every type is covered, including ones added later.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUSH_SECRET = Deno.env.get('PUSH_SECRET')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'follow' | 'save' | 'trip_invite' | 'trip_join' | 'experience_tag';
  experience_id: string | null;
  trip_id: string | null;
  actor: { name: string | null; handle: string | null } | null;
  experience: { title: string | null } | null;
  trip: { title: string | null } | null;
};

// Lock-screen copy per event. Kept close to the in-app wording in
// ActivityScreen.line() so the two don't tell different stories, and short
// enough not to truncate on a notification banner.
function compose(n: NotificationRow): { title: string; body: string } | null {
  const who = n.actor?.name || (n.actor?.handle ? `@${n.actor.handle}` : 'Someone');
  const trip = n.trip?.title;
  const experience = n.experience?.title;

  switch (n.type) {
    case 'follow':
      return { title: 'New follower', body: `${who} started following you` };
    case 'save':
      return {
        title: 'Saved to a wishlist',
        body: experience ? `${who} wants to do "${experience}"` : `${who} saved one of your experiences`,
      };
    case 'trip_invite':
      return {
        title: trip ? `Added to ${trip}` : 'Added to a trip',
        body: `${who} added you — open Zoi to join and start planning`,
      };
    case 'trip_join':
      return {
        title: trip ? `${trip} has a new member` : 'Someone joined your trip',
        body: `${who} joined${trip ? ` ${trip}` : ' your trip'}`,
      };
    case 'experience_tag':
      return {
        title: 'You were there too',
        body: experience
          ? `${who} says you were there for "${experience}"`
          : `${who} added you to an experience`,
      };
    default:
      return null;
  }
}

// Where tapping the notification should land. The app already deep-links these
// schemes (see navigation/index.tsx), and the payload is read in lib/push.ts.
function deepLinkData(n: NotificationRow): Record<string, string> {
  if (n.type === 'trip_invite' || n.type === 'trip_join') {
    return n.trip_id ? { screen: 'TripDetail', tripId: n.trip_id } : {};
  }
  if (n.type === 'save' || n.type === 'experience_tag') {
    return n.experience_id ? { screen: 'ExperienceDetail', experienceId: n.experience_id } : {};
  }
  return { screen: 'UserProfile', userId: n.actor_id };
}

Deno.serve(async (req: Request) => {
  // Only the database calls this, and it proves it with the shared secret.
  if (req.headers.get('x-push-secret') !== PUSH_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const { notification_id } = await req.json();
    if (!notification_id) return json({ error: 'notification_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // GOTCHA: notifications has two FKs to users (recipient + actor), so the
    // actor embed must name its FK.
    const { data, error } = await admin
      .from('notifications')
      .select(
        '*, actor:users!notifications_actor_id_fkey(name, handle)'
        + ', experience:experiences(title), trip:trips(title)',
      )
      .eq('id', notification_id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ skipped: 'notification not found' });

    const n = data as unknown as NotificationRow;

    // Never push someone their own action (the triggers guard this too).
    if (n.user_id === n.actor_id) return json({ skipped: 'self' });

    const content = compose(n);
    if (!content) return json({ skipped: `unhandled type ${n.type}` });

    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', n.user_id);
    if (!tokens || tokens.length === 0) return json({ skipped: 'no devices' });

    // Unread count drives the app icon badge, so it stays right when several
    // notifications land while the app is closed.
    const { count: unread } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', n.user_id)
      .eq('read', false);

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: content.title,
      body: content.body,
      sound: 'default',
      badge: unread ?? undefined,
      data: { notificationId: n.id, ...deepLinkData(n) },
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();

    // Expo reports per-message status. DeviceNotRegistered means the app was
    // uninstalled or the token rotated — drop it so we stop paying for it and
    // don't accumulate dead rows.
    const stale: string[] = [];
    const receipts = Array.isArray(result?.data) ? result.data : [];
    receipts.forEach((r: { status?: string; details?: { error?: string } }, i: number) => {
      if (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered') {
        stale.push(messages[i].to);
      }
    });
    if (stale.length > 0) {
      await admin.from('device_tokens').delete().in('token', stale);
    }

    return json({ sent: messages.length, pruned: stale.length });
  } catch (e) {
    // Swallow rather than 500 loudly: pg_net is fire-and-forget, so a throw here
    // is invisible anyway, and a failed push must never look like a failed write.
    console.error('push failed', e);
    return json({ error: String(e) }, 500);
  }
});
