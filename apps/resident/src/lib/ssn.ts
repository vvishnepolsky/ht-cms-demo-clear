/** Format raw SSN digits as XXX-XX-XXXX, showing a partial hyphenated form while typing. */
export function formatSSN(raw?: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Mask all but the last 4 digits of a raw SSN for read-only display (e.g. review screens). Not used by SSNInput, which delegates masking to type="password". */
export function maskSSN(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '***-**-' + digits;
  return `***-**-${digits.slice(-4)}`;
}
