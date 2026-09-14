/**
 * Demo "today" anchor for the resident wizard mock data.
 *
 * Frozen at 2026-03-15 (matches the cms-demo/admin storyboard convention).
 * Any mock timestamp in this app (Argyle connection time, pay-stub upload
 * timestamps, etc.) should use DEMO_TODAY instead of new Date() so the
 * demo timeline stays self-consistent regardless of the real calendar date.
 *
 * Rule: ht/no-wallclock-in-demo enforces this automatically — any no-arg
 * `new Date()` or `Date.now()` in the cms-demo path is a violation.
 */

export const DEMO_TODAY = new Date(Date.UTC(2026, 2, 15, 12, 0, 0));
export const DEMO_TODAY_ISO = DEMO_TODAY.toISOString();
