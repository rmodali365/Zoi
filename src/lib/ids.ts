import * as Crypto from 'expo-crypto';

// Client-generated uuids. Used for `experiences.group_id` — the link between the
// rows different people logged for the same outing. Generated on the device
// rather than by the DB because the first row of a group and the rows that join
// it later are separate inserts, often by different users.
export function newGroupId(): string {
  return Crypto.randomUUID();
}
