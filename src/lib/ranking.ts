/**
 * Fractional indexing for rank_key.
 * Produces a string key that sorts lexicographically, allowing
 * insertion between any two items without updating other rows.
 *
 * Format: padded base-36 string. New items get the midpoint between neighbors.
 */

const BASE = 36;
const MIN_LEN = 8;
const MID_CHAR = Math.floor(BASE / 2); // 18

function pad(s: string, len: number): string {
  return s.padStart(len, '0');
}

function increment(s: string): string {
  const chars = s.split('').map((c) => parseInt(c, BASE));
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < BASE - 1) {
      chars[i]++;
      return chars.map((n) => n.toString(BASE)).join('');
    }
    chars[i] = 0;
  }
  return '1' + chars.map((n) => n.toString(BASE)).join('');
}

function midpoint(a: string, b: string): string {
  const len = Math.max(a.length, b.length, MIN_LEN);
  const aPadded = pad(a, len);
  const bPadded = pad(b, len);

  const aVal = parseInt(aPadded, BASE);
  const bVal = parseInt(bPadded, BASE);

  if (bVal - aVal > 1) {
    const mid = Math.floor((aVal + bVal) / 2);
    return mid.toString(BASE).padStart(len, '0');
  }

  // No space between a and b — append a mid character
  return aPadded + MID_CHAR.toString(BASE);
}

/** Initial rank key for the very first item in a bucket. */
export function initialRankKey(): string {
  return pad(MID_CHAR.toString(BASE).repeat(MIN_LEN), MIN_LEN);
}

/** Key for inserting before the current first item. */
export function keyBefore(first: string): string {
  const val = parseInt(pad(first, MIN_LEN), BASE);
  if (val > 1) {
    return Math.floor(val / 2).toString(BASE).padStart(first.length, '0');
  }
  return '0' + MID_CHAR.toString(BASE).repeat(MIN_LEN);
}

/** Key for inserting after the current last item. */
export function keyAfter(last: string): string {
  return increment(last);
}

/** Key for inserting between two existing items. */
export function keyBetween(before: string, after: string): string {
  return midpoint(before, after);
}

/**
 * Given an ordered list of rank_keys, returns the binary search midpoint
 * index to use for the next comparison (0-based).
 */
export function binarySearchMidIndex(rankedKeys: string[]): number {
  return Math.floor(rankedKeys.length / 2);
}
