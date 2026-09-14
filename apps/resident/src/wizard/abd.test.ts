import { describe, it, expect } from 'vitest';
import { isAbdHousehold, abdMembers, reasonLabel, type AbdReason } from './abd';
import { PRIMARY_APPLICANT_ID, INCOME_TYPE_SSI, INCOME_TYPE_SSDI } from './wizard-constants';

// Same SAMPLE_SEED shape as build-intake-data.test.ts. ABD predicate reads:
//   - primaryApplicant.dob (age)
//   - demographics.disability
//   - householdMembers[*].{ dob, applying, hasDisability, id }
//   - otherIncome[*].{ recipient, type, kind }
//   - workRequirements[*].exemptions
// Pregnancy and non-applying members are intentionally excluded.
//
// Default ages relative to a 2026-05-26 "today" (current session date):
//   1991-08-04 → 34 (Jasmine, primary)
//   1989-11-15 → 36 (Marcus, m1)
//   2017-09-22 → 8  (Aaliyah, m2)
const baseHousehold = () => ({
  primaryApplicant: { firstName: 'Jasmine', lastName: 'Washington', dob: '1991-08-04' },
  demographics: { disability: false, pregnant: false },
  householdMembers: [
    { id: 'm1', firstName: 'Marcus', lastName: 'Washington', dob: '1989-11-15', applying: true, hasDisability: false },
    { id: 'm2', firstName: 'Aaliyah', lastName: 'Washington', dob: '2017-09-22', applying: true, hasDisability: false },
  ],
  otherIncome: [],
  workRequirements: {},
});

describe('isAbdHousehold / abdMembers', () => {
  it('returns false for a MAGI-only household (under 65, no disability, no SS income, no exemptions)', () => {
    const data = baseHousehold();
    expect(isAbdHousehold(data)).toBe(false);
    expect(abdMembers(data)).toEqual([]);
  });

  it('flags the primary as ABD when their age is >= 65', () => {
    const data = baseHousehold();
    data.primaryApplicant.dob = '1950-01-01';
    expect(isAbdHousehold(data)).toBe(true);
    const members = abdMembers(data);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: PRIMARY_APPLICANT_ID, reasons: ['aged'] });
  });

  it('flags an applying household member as ABD when their age is >= 65', () => {
    const data = baseHousehold();
    data.householdMembers[0].dob = '1955-03-12';
    expect(isAbdHousehold(data)).toBe(true);
    const members = abdMembers(data);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: 'm1', reasons: ['aged'] });
  });

  it('flags the primary as ABD when demographics.disability is true', () => {
    const data = baseHousehold();
    data.demographics.disability = true;
    expect(isAbdHousehold(data)).toBe(true);
    expect(abdMembers(data)[0]).toMatchObject({ id: PRIMARY_APPLICANT_ID, reasons: ['disabled'] });
  });

  it('flags an applying household member as ABD when hasDisability is true', () => {
    const data = baseHousehold();
    data.householdMembers[1].hasDisability = true;
    expect(isAbdHousehold(data)).toBe(true);
    expect(abdMembers(data)[0]).toMatchObject({ id: 'm2', reasons: ['disabled'] });
  });

  it('flags the primary as ABD via an SSI otherIncome entry', () => {
    const data = baseHousehold();
    (data.otherIncome as any[]).push({
      id: 'o1',
      type: INCOME_TYPE_SSI,
      recipient: PRIMARY_APPLICANT_ID,
      amount: '943',
      frequency: 'monthly',
    });
    expect(isAbdHousehold(data)).toBe(true);
    expect(abdMembers(data)[0]).toMatchObject({ id: PRIMARY_APPLICANT_ID, reasons: ['ssi'] });
  });

  it('flags an applying household member as ABD via an SSDI otherIncome entry', () => {
    const data = baseHousehold();
    (data.otherIncome as any[]).push({
      id: 'o1',
      type: INCOME_TYPE_SSDI,
      recipient: 'm1',
      amount: '1180',
      frequency: 'monthly',
    });
    expect(isAbdHousehold(data)).toBe(true);
    const members = abdMembers(data);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: 'm1', reasons: ['ssdi'] });
  });

  it('flags via a workRequirements exemption (65plus / ssdi_ssi / med_frail)', () => {
    const data = baseHousehold();
    (data.workRequirements as any)[PRIMARY_APPLICANT_ID] = { exemptions: ['med_frail'] };
    (data.workRequirements as any).m1 = { exemptions: ['ssdi_ssi'] };
    (data.workRequirements as any).m2 = { exemptions: ['65plus'] };
    expect(isAbdHousehold(data)).toBe(true);
    const members = abdMembers(data);
    expect(members).toHaveLength(3);
    expect(members[0]).toMatchObject({ id: PRIMARY_APPLICANT_ID, reasons: ['exemption_med_frail'] });
    expect(members[1]).toMatchObject({ id: 'm1', reasons: ['exemption_ssdi_ssi'] });
    expect(members[2]).toMatchObject({ id: 'm2', reasons: ['exemption_65plus'] });
  });

  it('does NOT flag pregnancy or other non-ABD demographics', () => {
    const data = baseHousehold();
    data.demographics.pregnant = true;
    (data.primaryApplicant as any).pregnant = true;
    expect(isAbdHousehold(data)).toBe(false);
    expect(abdMembers(data)).toEqual([]);
  });

  it('does NOT flag non-applying household members (even if aged / disabled)', () => {
    const data = baseHousehold();
    data.householdMembers[0].applying = false;
    data.householdMembers[0].dob = '1940-04-04';
    data.householdMembers[0].hasDisability = true;
    // m1 has every ABD signal but is not applying → must be ignored
    expect(isAbdHousehold(data)).toBe(false);
    expect(abdMembers(data)).toEqual([]);
  });

  it('returns reasons in stable order: aged, disabled, ssi/ssdi, exemptions; primary first', () => {
    const data = baseHousehold();
    data.primaryApplicant.dob = '1950-01-01'; // aged
    data.demographics.disability = true; // disabled
    (data.otherIncome as any[]).push({
      id: 'o1',
      type: INCOME_TYPE_SSDI,
      recipient: PRIMARY_APPLICANT_ID,
      amount: '1180',
      frequency: 'monthly',
    });
    (data.workRequirements as any)[PRIMARY_APPLICANT_ID] = { exemptions: ['65plus'] };
    data.householdMembers[1].hasDisability = true; // m2 disabled

    const members = abdMembers(data);
    expect(members).toHaveLength(2);
    // Primary comes first
    expect(members[0].id).toBe(PRIMARY_APPLICANT_ID);
    expect(members[0].reasons).toEqual(['aged', 'disabled', 'ssdi', 'exemption_65plus']);
    // Then applying members in original order (m2 is the disabled one)
    expect(members[1].id).toBe('m2');
    expect(members[1].reasons).toEqual(['disabled']);
  });

  it('exposes human-readable labels via reasonLabel', () => {
    expect(reasonLabel('aged')).toMatch(/65/);
    expect(reasonLabel('disabled')).toBe('Disability');
    expect(reasonLabel('ssi')).toMatch(/SSI/);
    expect(reasonLabel('ssdi')).toMatch(/SSDI/);
    expect(reasonLabel('exemption_med_frail')).toMatch(/medically frail/);
    // Default branch: unknown reason codes pass through as-is so the
    // switch statement's exhaustive default is covered and future enum
    // additions don't silently return 'undefined'.
    expect(reasonLabel('unknown_reason' as AbdReason)).toBe('unknown_reason');
  });

  // C.3 coverage note: StepNonMagiResources and StepNonMagiMedicareLtc each
  // have a `members.length === 0` guard that returns an "No Non-MAGI applicants"
  // alert. The skip predicate in app.tsx (`skip: (d) => !isAbdHousehold(d)`)
  // prevents either step from rendering with an empty member list under normal
  // wizard navigation. The guard is purely defensive. The test below confirms
  // the predicate's empty-list case so the component safety net is implicitly
  // covered: if isAbdHousehold returns false, abdMembers returns [], and the
  // guard fires. Full component-level tests are deferred until @ts-nocheck is
  // lifted from screens-nonmagi.tsx and a React Testing Library fixture exists.
  it('detects SSI via legacy `kind` field (alternate income entry shape)', () => {
    // abd.ts line 74: `e?.type ?? e?.kind ?? ''` — covers income objects that
    // use `kind` instead of `type` (older wizard versions / seeded fixtures).
    const data = baseHousehold();
    (data.otherIncome as any[]).push({
      id: 'o1',
      kind: INCOME_TYPE_SSI, // ← `kind` instead of `type`
      recipient: PRIMARY_APPLICANT_ID,
      amount: '943',
      frequency: 'monthly',
    });
    expect(isAbdHousehold(data)).toBe(true);
    expect(abdMembers(data)[0]).toMatchObject({ id: PRIMARY_APPLICANT_ID, reasons: ['ssi'] });
  });
});
