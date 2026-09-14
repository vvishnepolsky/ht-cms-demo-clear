/**
 * personaAuditNarratives — ENG-2080.
 *
 * The properties that make the merged Activity Log read realistically:
 *   1. name matching (reseed-proof, like the Diane archetype)
 *   2. curated actions stay DISJOINT from organic backend actions
 *   3. pre-evaluate rows land strictly inside the real (create → evaluate)
 *      window; post-evaluate rows land after evaluate and before an existing
 *      approval
 *   4. deterministic now-anchored fallback when the feed is empty
 */
import { describe, it, expect } from 'vitest';
import {
  ACTION_CONFIRM_DDS,
  ACTION_RECEIVE_VERIFICATION,
  ACTION_REFER_DDS,
  ACTION_REQUEST_VERIFICATION,
  ACTION_RESOLVE_RFI,
  buildPersonaNarrativeRows,
  matchNarrativePersona,
  CURATED_ACTIONS,
  ORGANIC_ACTIONS,
} from './personaAuditNarratives';
import type { AuditLogEntry } from '../lib/audit-operations';

const NOW_MS = Date.UTC(2026, 5, 8, 15, 30, 0);

function feedEntry(id: string, timestamp: string, action: string): AuditLogEntry {
  return {
    id,
    timestamp,
    serviceId: 'medicaid-ee-service',
    eventType: 'RECORD_UPDATE',
    actorId: 'system',
    customerId: 'customer-statex',
    action,
    resourceType: 'medicaid_ee_case',
    resourceId: 'case-001',
    outcome: 'success',
    traceId: null,
  };
}

describe('matchNarrativePersona', () => {
  it('matches both personas, tolerant of middle initials and case', () => {
    expect(matchNarrativePersona('Jasmine Carter')).toBe('jasmine-carter');
    expect(matchNarrativePersona('jasmine t. carter')).toBe('jasmine-carter');
    expect(matchNarrativePersona('Robert Mitchell')).toBe('robert-mitchell');
    expect(matchNarrativePersona('ROBERT MITCHELL')).toBe('robert-mitchell');
  });

  it('rejects other applicants, partial matches, and empty names', () => {
    expect(matchNarrativePersona('Diane M. Caldwell')).toBeNull();
    expect(matchNarrativePersona('Robert Martinez')).toBeNull(); // seeded ABD persona — NOT Mitchell
    expect(matchNarrativePersona('Jasmine Mitchell')).toBeNull();
    expect(matchNarrativePersona(null)).toBeNull();
    expect(matchNarrativePersona(undefined)).toBeNull();
  });
});

describe("curated/organic action disjointness (complement, don't duplicate)", () => {
  it('no curated action collides with an organic backend action', () => {
    const organic = new Set<string>(ORGANIC_ACTIONS);
    for (const action of CURATED_ACTIONS) {
      expect(organic.has(action)).toBe(false);
    }
  });

  it('every generated row uses only curated actions', () => {
    for (const persona of ['jasmine-carter', 'robert-mitchell'] as const) {
      const rows = buildPersonaNarrativeRows(persona, [], NOW_MS);
      for (const row of rows) {
        expect(CURATED_ACTIONS).toContain(row.action);
      }
    }
  });
});

describe('buildPersonaNarrativeRows — anchoring', () => {
  const CREATE_TS = '2026-06-08T15:00:00.000Z';
  const EVALUATE_TS = '2026-06-08T15:01:00.000Z';
  const APPROVE_TS = '2026-06-08T15:05:00.000Z';

  const feed = [
    feedEntry('e1', CREATE_TS, 'CREATE'),
    feedEntry('e2', EVALUATE_TS, 'EVALUATE'),
    feedEntry('e3', APPROVE_TS, 'STATUS_TRANSITION'),
  ];

  it('places Jasmine handshake rows strictly inside (create, evaluate), in spec order', () => {
    const rows = buildPersonaNarrativeRows('jasmine-carter', feed, NOW_MS);
    expect(rows).toHaveLength(6);

    const createMs = Date.parse(CREATE_TS);
    const evaluateMs = Date.parse(EVALUATE_TS);
    let prev = createMs;
    for (const row of rows) {
      const ms = Date.parse(row.sortTimestamp);
      expect(ms).toBeGreaterThan(createMs);
      expect(ms).toBeLessThan(evaluateMs);
      expect(ms).toBeGreaterThanOrEqual(prev); // spec order preserved
      prev = ms;
    }
    // requests come before receives
    const firstReceive = rows.findIndex((r) => r.action === ACTION_RECEIVE_VERIFICATION);
    const lastRequest = rows.map((r) => r.action).lastIndexOf(ACTION_REQUEST_VERIFICATION);
    expect(lastRequest).toBeLessThan(firstReceive);
  });

  it('places Robert DDS rows after evaluate and before the existing approval', () => {
    const rows = buildPersonaNarrativeRows('robert-mitchell', feed, NOW_MS);
    expect(rows).toHaveLength(14);

    const evaluateMs = Date.parse(EVALUATE_TS);
    const approveMs = Date.parse(APPROVE_TS);
    const dds = rows.filter((r) => r.action === ACTION_REFER_DDS || r.action === ACTION_CONFIRM_DDS);
    expect(dds).toHaveLength(2);
    for (const row of dds) {
      const ms = Date.parse(row.sortTimestamp);
      expect(ms).toBeGreaterThan(evaluateMs);
      expect(ms).toBeLessThan(approveMs);
    }
    // pre-evaluate rows (incl. the asset RFI cycle) all precede the evaluation
    const pre = rows.filter((r) => r.action !== ACTION_REFER_DDS && r.action !== ACTION_CONFIRM_DDS);
    for (const row of pre) {
      expect(Date.parse(row.sortTimestamp)).toBeLessThan(evaluateMs);
    }
  });

  it('keeps causal order even when the BRE ran within the same second (degenerate window)', () => {
    const tight = [
      feedEntry('e1', '2026-06-08T15:00:00.000Z', 'CREATE'),
      feedEntry('e2', '2026-06-08T15:00:00.400Z', 'EVALUATE'),
    ];
    const rows = buildPersonaNarrativeRows('jasmine-carter', tight, NOW_MS);
    const stamps = rows.map((r) => r.sortTimestamp);
    const sorted = [...stamps].sort();
    expect(stamps).toEqual(sorted); // strictly non-decreasing
    expect(new Set(stamps).size).toBe(stamps.length); // ≥1ms apart — sortable
  });

  it('survives a zero-width window (create and evaluate at the identical millisecond)', () => {
    const SAME_TS = '2026-06-08T15:00:00.000Z';
    const degenerate = [feedEntry('e1', SAME_TS, 'CREATE'), feedEntry('e2', SAME_TS, 'EVALUATE')];
    const rows = buildPersonaNarrativeRows('jasmine-carter', degenerate, NOW_MS);
    const stamps = rows.map((r) => r.sortTimestamp);
    // spread()'s `Math.max(endMs - startMs, count + 1)` floor guarantees ≥1ms
    // separation even when the real window is 0ms wide.
    expect(new Set(stamps).size).toBe(stamps.length);
    expect(stamps).toEqual([...stamps].sort());
    for (const stamp of stamps) {
      expect(Date.parse(stamp)).toBeGreaterThan(Date.parse(SAME_TS));
    }
  });

  it('falls back to now-anchored placement on an empty feed (deterministic)', () => {
    const a = buildPersonaNarrativeRows('jasmine-carter', [], NOW_MS);
    const b = buildPersonaNarrativeRows('jasmine-carter', [], NOW_MS);
    expect(a.map((r) => r.sortTimestamp)).toEqual(b.map((r) => r.sortTimestamp));
    for (const row of a) {
      expect(Date.parse(row.sortTimestamp)).toBeLessThan(NOW_MS);
    }
  });
});

describe('buildPersonaNarrativeRows — row shape', () => {
  it('system rows carry the Auto badge; caseworker rows keep the outcome pill', () => {
    const rows = buildPersonaNarrativeRows('robert-mitchell', [], NOW_MS);
    const rfiResolved = rows.find((r) => r.action === ACTION_RESOLVE_RFI);
    const request = rows.find((r) => r.action === ACTION_REQUEST_VERIFICATION);
    expect(request?.badgeLabel).toBe('Auto');
    expect(rfiResolved?.badgeLabel).toBeUndefined();
    expect(rfiResolved?.actorDisplay).toBe('Sarah Mitchell');
  });

  it('the AVS asset sweep is the only failure-outcome row for Robert', () => {
    const rows = buildPersonaNarrativeRows('robert-mitchell', [], NOW_MS);
    const failures = rows.filter((r) => r.outcome === 'failure');
    expect(failures).toHaveLength(1);
    expect(failures[0].summary).toContain('AVS');
  });

  it('rows suppress identifier lines and carry bullet bodies (narrative style)', () => {
    const rows = buildPersonaNarrativeRows('jasmine-carter', [], NOW_MS);
    for (const row of rows) {
      expect(row.resourceType).toBe('');
      expect(row.eventType).toBe('');
      expect(row.noteLines?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('row copy never carries PHI-shaped content (no dollar amounts, no SSN patterns)', () => {
    for (const persona of ['jasmine-carter', 'robert-mitchell'] as const) {
      for (const row of buildPersonaNarrativeRows(persona, [], NOW_MS)) {
        const text = [row.summary, ...(row.noteLines ?? [])].join(' ');
        expect(text).not.toMatch(/\$\d/);
        expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
      }
    }
  });
});
