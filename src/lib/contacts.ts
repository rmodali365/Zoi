import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { UserResult } from '@/lib/follows';

// Contacts → Zoi users (#60). Phone numbers are normalized and SHA-256 hashed on
// device; only the hashes go to the match-contacts Edge Function, which compares
// them against registered users' (server-side hashed) phones.

// Digits only; 10-digit numbers get the US country code. MUST mirror
// normalizePhone in supabase/functions/match-contacts/index.ts — the two must
// stay in lockstep or hashes never match.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

// Registered users found in the device's contacts. Returns null when the user
// declined the contacts permission (so the UI can explain, not just show empty).
export async function findContactsOnZoi(): Promise<UserResult[] | null> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
  const normalized = new Set<string>();
  for (const contact of data) {
    for (const p of contact.phoneNumbers ?? []) {
      const n = p.number ? normalizePhone(p.number) : null;
      if (n) normalized.add(n);
    }
  }
  if (normalized.size === 0) return [];

  const hashes = await Promise.all(
    [...normalized].map((n) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, n)),
  );
  const { data: res, error } = await supabase.functions.invoke('match-contacts', { body: { hashes } });
  if (error) throw error;
  return ((res?.matches ?? []) as UserResult[]);
}
