/**
 * Tests for parseRuleEvaluations — accepts both the legacy flat-array shape
 * (Selam's seed) and the ENG-1669 sectioned-trace shape (rules-engine output).
 */

import { describe, it, expect } from 'vitest';
import { parseRuleEvaluations } from './MagiRulesEngine';

describe('parseRuleEvaluations — legacy flat-array shape (Selam ENG-1754 seed)', () => {
  it('returns empty array for null/undefined', () => {
    expect(parseRuleEvaluations(null)).toEqual([]);
  });

  it('parses well-formed flat rows', () => {
    const raw = [
      { ruleId: 'r1', ruleName: 'Income', status: 'PASSED', description: 'Under threshold' },
      { ruleId: 'r2', ruleName: 'Identity', status: 'FAILED', description: 'SSN mismatch' },
    ];
    const result = parseRuleEvaluations(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ruleId: 'r1', status: 'PASSED' });
    expect(result[1]).toMatchObject({ ruleId: 'r2', status: 'FAILED' });
  });

  it('drops malformed rows in the flat-array shape', () => {
    const raw = [
      { ruleId: 'good', ruleName: 'OK', status: 'PASSED', description: 'fine' },
      { ruleName: 'No ruleId', status: 'PASSED', description: 'bad' },
      { ruleId: 'bad-status', ruleName: 'X', status: 'WHAT', description: 'wrong status' },
      null,
    ];
    const result = parseRuleEvaluations(raw as unknown as Record<string, unknown>[]);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('good');
  });
});

describe('parseRuleEvaluations — ENG-1669 sectioned-trace shape', () => {
  it('flattens DISPLAY-tagged rows to legacy flat rows', () => {
    const raw = {
      outcome: 'ELIGIBLE',
      sections: [
        {
          name: 'Income',
          ordering: 0,
          rows: [
            // Tagged: displayCode != ruleName, leftLabel populated → renders.
            {
              ruleId: 'MAGI-INC-001',
              ruleName: 'MAGI Income Threshold',
              displayCode: 'MAGI-INC-001',
              status: 'PASS',
              leftLabel: 'Stated income',
              rightValue: '$1,800/mo',
            },
            // Tagged FAIL row.
            {
              ruleId: 'MAGI-INC-002',
              ruleName: 'IRS Wage Match',
              displayCode: 'MAGI-INC-002',
              status: 'FAIL',
              leftLabel: 'IRS total',
              rightValue: '$2,750/mo',
            },
          ],
        },
        {
          name: 'Disability',
          ordering: 1,
          rows: [
            // Tagged PENDING row.
            {
              ruleId: 'NMAGI-DIS-001',
              ruleName: 'DDS Determination',
              displayCode: 'NMAGI-DIS-001',
              status: 'PENDING',
              leftLabel: 'DDS status',
              rightValue: 'Awaiting',
              note: 'Referral packet sent',
            },
          ],
        },
      ],
    };
    const result = parseRuleEvaluations(raw);
    expect(result).toHaveLength(3);
    // PASS → PASSED, FAIL → FAILED, PENDING → INFO
    expect(result.map((r) => r.status)).toEqual(['PASSED', 'FAILED', 'INFO']);
    // Description composed from leftLabel — rightValue
    expect(result[0].description).toBe('Stated income — $1,800/mo');
    expect(result[1].description).toBe('IRS total — $2,750/mo');
    expect(result[2].description).toBe('DDS status — Awaiting');
    // ENG-1983: section names carried through for Verify-step filtering.
    expect(result.map((r) => r.section)).toEqual(['Income', 'Income', 'Disability']);
  });

  it('leaves section undefined for the flat-array shape (no section metadata)', () => {
    const result = parseRuleEvaluations([
      { ruleId: 'r1', ruleName: 'Income', status: 'PASSED', description: 'Under threshold' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].section).toBeUndefined();
  });

  it('drops untagged rows (engine fallback: displayCode === ruleName)', () => {
    // Vadim's demo feedback — the engine emits a row for every evaluated
    // rule. Caseworker trace should only surface explicitly user-facing
    // rules. Untagged rows fall through here.
    const raw = {
      sections: [
        {
          rows: [
            // Untagged: engine fallback sets displayCode === ruleName.
            { ruleId: 'IA-MAGI-WR-007', ruleName: 'IA-MAGI-WR-007', displayCode: 'IA-MAGI-WR-007', status: 'FAIL' },
            // Untagged: no displayCode at all.
            { ruleId: 'r2', ruleName: 'X', status: 'PASS' },
            // Isolates the `displayCode === ruleName` branch — this row has a
            // non-empty leftLabel, so the `!leftLabel` guard would NOT drop it.
            // It must still be dropped by the displayCode === ruleName check
            // alone (otherwise removing that condition would silently pass).
            {
              ruleId: 'IA-MAGI-WR-008',
              ruleName: 'IA-MAGI-WR-008',
              displayCode: 'IA-MAGI-WR-008',
              status: 'PASS',
              leftLabel: 'Work exempt',
              rightValue: 'yes',
            },
            // Tagged: passes the filter.
            {
              ruleId: 'r3',
              ruleName: 'Income Check',
              displayCode: 'MAGI-INC-001',
              status: 'PASS',
              leftLabel: 'Stated income',
              rightValue: '$1,800/mo',
            },
          ],
        },
      ],
    };
    const result = parseRuleEvaluations(raw);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('r3');
  });

  it('drops rows that have a displayCode but empty leftLabel (no DISPLAY action contribution)', () => {
    const raw = {
      sections: [
        {
          rows: [
            { ruleId: 'r1', ruleName: 'Note only', displayCode: 'TAG-001', status: 'PENDING', note: 'See attached' },
          ],
        },
      ],
    };
    expect(parseRuleEvaluations(raw)).toHaveLength(0);
  });

  it('skips malformed sections + rows in the sectioned shape', () => {
    const raw = {
      sections: [
        {
          rows: [
            {
              ruleId: 'good',
              ruleName: 'OK',
              displayCode: 'TAG-OK',
              status: 'PASS',
              leftLabel: 'a',
              rightValue: 'b',
            },
          ],
        },
        { rows: 'not-an-array' },
        null,
        { rows: [null, { ruleName: 'No ruleId', status: 'PASS' }] },
      ],
    };
    const result = parseRuleEvaluations(raw as unknown as Record<string, unknown>);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('good');
  });

  it('returns empty array for sectioned trace with no sections', () => {
    const raw = { outcome: 'NEEDS_REVIEW', sections: [] };
    expect(parseRuleEvaluations(raw)).toEqual([]);
  });
});
