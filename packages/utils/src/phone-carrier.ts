/**
 * Detect Vietnamese mobile carrier from a normalized phone number.
 * Expects the input to be already normalized (e.g. via normalizePhone()).
 * Returns null when prefix does not match any known VN mobile carrier
 * (e.g. landlines, hotlines like 1900xxxx, foreign numbers).
 *
 * Source of prefix list: Bộ TT&TT số chuyển đổi 2018 + mở rộng dải mới.
 */
export type Carrier =
  | 'VIETTEL'
  | 'MOBI'
  | 'VINA'
  | 'VIETNAMOBILE'
  | 'GMOBILE'
  | 'ITELECOM'
  | null;

const CARRIER_PREFIXES: Array<{ prefixes: string[]; carrier: Exclude<Carrier, null> }> = [
  { carrier: 'VIETTEL', prefixes: ['032', '033', '034', '035', '036', '037', '038', '039', '086', '096', '097', '098'] },
  { carrier: 'MOBI',    prefixes: ['070', '076', '077', '078', '079', '089', '090', '093'] },
  { carrier: 'VINA',    prefixes: ['081', '082', '083', '084', '085', '088', '091', '094'] },
  { carrier: 'VIETNAMOBILE', prefixes: ['052', '056', '058', '092'] },
  { carrier: 'GMOBILE', prefixes: ['059', '099'] },
  { carrier: 'ITELECOM', prefixes: ['087'] },
];

export function detectCarrier(phone: string | null | undefined): Carrier {
  if (!phone) return null;
  const trimmed = phone.replace(/[\s\-\.()]/g, '');
  // Strip +84 / 84 prefix to compare against 0xxx prefix table
  let normalized = trimmed;
  if (normalized.startsWith('+84')) normalized = '0' + normalized.slice(3);
  else if (normalized.startsWith('84') && normalized.length >= 11) normalized = '0' + normalized.slice(2);

  if (!normalized.startsWith('0') || normalized.length < 10) return null;

  const prefix3 = normalized.slice(0, 3);
  for (const group of CARRIER_PREFIXES) {
    if (group.prefixes.includes(prefix3)) return group.carrier;
  }
  return null;
}

// Display name in Vietnamese UI - all caps, short
export const CARRIER_LABEL: Record<Exclude<Carrier, null>, string> = {
  VIETTEL: 'VIETTEL',
  MOBI: 'MOBI',
  VINA: 'VINA',
  VIETNAMOBILE: 'VNM',
  GMOBILE: 'GMOBILE',
  ITELECOM: 'ITEL',
};
