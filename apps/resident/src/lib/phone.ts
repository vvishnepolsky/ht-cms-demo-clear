/** Strip non-digit characters and cap at 10 digits (raw storage form). */
export function stripPhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

/** Format raw phone digits as (XXX) XXX-XXXX, showing a partial form while typing. */
export function formatPhone(raw?: string): string {
  const d = (raw ?? '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
