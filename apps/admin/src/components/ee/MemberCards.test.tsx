/**
 * MemberCards tests — Non-MAGI (ABD) eligibility determination completeness (ENG-1876).
 *
 * The Non-MAGI branch of the per-member EligibilityCard must show the full ABD
 * determination breakdown, not just the income/FPL test:
 *   1. 100% FPL income test (pre-existing — regression guard)
 *   2. Asset / Resource limit test ($2,000 individual / $3,000 couple, PASS)
 *   3. Disability determination — copy varies on receivingSSI:
 *        - receivingSSI true  → "deemed via SSI receipt"
 *        - receivingSSI false → DDS favorable determination, "no SSI on file"
 *
 * Pure render tests — no Apollo, no router, no mutations. The HEAD member is
 * expanded by default, so its EligibilityCard renders without interaction.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemberCards, MAGI_COVERAGE_THRESHOLD_PCT } from './MemberCards';
import type { EEDetermination, EEHouseholdMember, PersonRecord } from '../../types/ee';

// Shared fixture case id — consolidated per coding-standards.md § C.1 (7 sites).
const FIXTURE_CASE_ID = 'case-1';

const HEAD_MEMBER = {
  id: 'm-head',
  role: 'HEAD',
  relationshipToHead: null,
  startDate: '2026-01-01',
  person: { personId: 'p-head' },
} as unknown as EEHouseholdMember;

const NON_MAGI_DETERMINATION = {
  id: 'd-1',
  customerId: 'cust-1',
  caseId: FIXTURE_CASE_ID,
  person: {
    personId: 'p-head',
    policyId: 'pol-1',
    firstName: 'Jordan',
    lastName: 'Avery',
    middleName: null,
    suffix: null,
    dateOfBirth: '1958-03-12',
    preferredLanguage: null,
    ssnLast4: null,
    addresses: [],
    emails: [],
    phones: [],
  },
  status: 'ELIGIBLE',
  category: 'NON_MAGI',
  effectiveDate: '2026-05-01',
  expirationDate: '2027-04-30',
  denialReason: null,
  notes: null,
  determinedAt: '2026-05-10T00:00:00.000Z',
  determinedBy: 'caseworker-1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
} as unknown as EEDetermination;

function renderNonMagi(opts: { householdSize?: number; receivingSSI?: boolean } = {}) {
  const { householdSize = 1, receivingSSI = false } = opts;
  return render(
    <MemberCards
      members={[HEAD_MEMBER]}
      determinations={[NON_MAGI_DETERMINATION]}
      intakeData={{
        householdSize,
        monthlyHouseholdIncome: 950,
        applicant: { receivingSSI },
      }}
      isNonMagi
      caseApproved
      caseId={FIXTURE_CASE_ID}
    />,
  );
}

describe('MemberCards — Non-MAGI (ABD) determination completeness (ENG-1876)', () => {
  it('still renders the 100% FPL income test (regression guard)', () => {
    renderNonMagi();
    expect(screen.getByText(/Non-MAGI \(ABD\) — 100% FPL Test/)).toBeInTheDocument();
  });

  it('renders an Asset / Resource Test block with a PASS state and the individual limit', () => {
    renderNonMagi({ householdSize: 1 });
    // "PASS" also appears in the 100% FPL block, so scope the assertion to the
    // Asset / Resource block to confirm the named PASS state actually renders.
    const assetBlock = screen.getByText('Asset / Resource Test').closest('div')!;
    expect(within(assetBlock).getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText(/\$2,000 \(individual\)/)).toBeInTheDocument();
    expect(screen.getByText(/within Non-MAGI \(ABD\) limit per 42 CFR §435\.601/)).toBeInTheDocument();
  });

  it('shows the couple resource limit for a household of two or more', () => {
    renderNonMagi({ householdSize: 2 });
    expect(screen.getByText(/\$3,000 \(couple\)/)).toBeInTheDocument();
  });

  it('shows DDS-verified disability copy when the applicant is not receiving SSI', () => {
    renderNonMagi({ receivingSSI: false });
    expect(screen.getByText('Disability Determination')).toBeInTheDocument();
    expect(screen.getByText(/favorable disability determination \(no SSI on file\)/)).toBeInTheDocument();
  });

  it('shows SSI-deemed disability copy when the applicant is receiving SSI', () => {
    renderNonMagi({ receivingSSI: true });
    expect(screen.getByText(/Disability deemed via SSI receipt/)).toBeInTheDocument();
    expect(screen.queryByText(/no SSI on file/)).not.toBeInTheDocument();
  });
});

// ENG-1865 review (Justin): a MAGI determination with no recognized coverageGroup
// (e.g. created before this deploy) must NOT render a blank '—' — it falls back to
// the age-based label so the demo column stays populated on un-reevaluated cases.
describe('MemberCards — MAGI coverageGroup age fallback (ENG-1865 review)', () => {
  const CHILD_MEMBER = {
    id: 'm-head',
    role: 'CHILD',
    relationshipToHead: 'child',
    startDate: '2026-01-01',
    person: { personId: 'p-head', dateOfBirth: '2018-01-01' },
  } as unknown as EEHouseholdMember;

  function renderMagi(coverageGroup: string | null) {
    const det = {
      ...NON_MAGI_DETERMINATION,
      category: 'MAGI',
      coverageGroup,
      person: { ...(NON_MAGI_DETERMINATION as any).person, dateOfBirth: '2018-01-01' },
    } as unknown as EEDetermination;
    return render(
      <MemberCards
        members={[CHILD_MEMBER]}
        determinations={[det]}
        intakeData={{ householdSize: 3, monthlyHouseholdIncome: 1200, applicant: {} }}
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
  }

  it('falls back to the age-based label (not blank) when coverageGroup is null', () => {
    renderMagi(null);
    expect(screen.getAllByText(/Children's MAGI/).length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('renders the real coverageGroup when present (wins over the age fallback)', () => {
    renderMagi('Adult Group MAGI');
    expect(screen.getAllByText(/Adult Group MAGI/).length).toBeGreaterThan(0);
  });

  // ENG-1906: the children's FPL-math panel must show the engine's 167% children's
  // standard, not the adult 138% (ENG-1885's interim value) or the legacy 305%.
  // Drives off determination.coverageGroup via the map. The lone CHILD-role member
  // is collapsed by default (only HEAD auto-expands), so expand the row to render
  // the EligibilityCard panel where the % copy lives.
  it("shows the 167% children's MAGI ceiling (not 138% or the legacy 305%)", () => {
    renderMagi("Children's MAGI");
    fireEvent.click(screen.getByRole('button', { name: /Children's MAGI/ }));
    expect(screen.getAllByText(/167% FPL/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/305%/)).not.toBeInTheDocument();
  });
});

// ENG-1885 + ENG-1906: the admin's MAGI FPL ceilings must mirror the rules-engine seed
// (services/rules-engine/prisma/seed-data/cms-medicaid-rules.ts): Adult/Parent cap at
// MAGI_FPL_THRESHOLD = 138 (133% + 5% disregard), while Children (167%), Pregnant (215%),
// and Infant (205%) have separate higher standards. The admin app does not depend on
// @ht/rules-engine, so these are intentional literals — this block pins them to the
// engine values to catch admin-side drift.
describe('MAGI_COVERAGE_THRESHOLD_PCT — parity with rules-engine seed (ENG-1906)', () => {
  it('caps the Adult/Parent groups at the engine 138% effective threshold', () => {
    expect(MAGI_COVERAGE_THRESHOLD_PCT['Adult Group MAGI']).toBe(138);
    expect(MAGI_COVERAGE_THRESHOLD_PCT['Parent/Caretaker']).toBe(138);
  });

  it("caps children at the engine 167% children's MAGI standard", () => {
    expect(MAGI_COVERAGE_THRESHOLD_PCT["Children's MAGI"]).toBe(167);
  });

  it('caps pregnant women at the engine 215% standard', () => {
    expect(MAGI_COVERAGE_THRESHOLD_PCT['Pregnant']).toBe(215);
  });

  it('caps infants (0–1) at the engine 205% FPL ceiling', () => {
    expect(MAGI_COVERAGE_THRESHOLD_PCT['Infant (0–1)']).toBe(205);
  });

  it('maps deemed newborns to the 205% infant standard (not the 167% children fallback)', () => {
    // Deemed newborns are auto-eligible (no income test) but carry the
    // 'Deemed Newborn' label and are age<1 → without this entry the card would
    // fall back to the 167% children's threshold.
    expect(MAGI_COVERAGE_THRESHOLD_PCT['Deemed Newborn']).toBe(205);
  });

  it('carries no legacy 305% ceiling for any MAGI group', () => {
    expect(Object.values(MAGI_COVERAGE_THRESHOLD_PCT)).not.toContain(305);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENG-1886 — mixed-outcome households. Shared fixture builders.
// ─────────────────────────────────────────────────────────────────────────────
function makeMember(id: string, personId: string, role: EEHouseholdMember['role']): EEHouseholdMember {
  return {
    id,
    role,
    relationshipToHead: role === 'HEAD' ? null : 'daughter',
    startDate: '2026-01-01',
    person: { personId },
  } as unknown as EEHouseholdMember;
}

function makeMagiDet(
  personId: string,
  firstName: string,
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'DEFERRED' | 'PENDING',
  coverageGroup: string,
  dateOfBirth: string,
): EEDetermination {
  return {
    ...NON_MAGI_DETERMINATION,
    id: `d-${personId}`,
    personId,
    status,
    category: 'MAGI',
    coverageGroup,
    person: { ...(NON_MAGI_DETERMINATION.person as PersonRecord), personId, firstName, dateOfBirth },
  } as unknown as EEDetermination;
}

// ENG-1886 — the per-member badge must reflect each member's OWN determination,
// not the case-level approval flag. The bug: a single ELIGIBLE member set the
// case-level `hasApprovedDet` flag true and painted EVERY row (including the
// ineligible adults) green "Approved" — the literal opposite of surfacing the
// mixed outcome. Fix: the member's own determination drives the badge; the
// case-level flag is the fallback ONLY for a member with no determination
// (preserving the NON-MAGI/DDS-confirmed ABD path that has no ELIGIBLE row).
describe('MemberCards — mixed-outcome per-member badges (ENG-1886)', () => {
  function renderMixed() {
    return render(
      <MemberCards
        members={[makeMember('m-head', 'p-adult', 'HEAD'), makeMember('m-child', 'p-child', 'CHILD')]}
        determinations={[
          makeMagiDet('p-adult', 'Jasmine', 'INELIGIBLE', 'Adult Group MAGI', '1990-01-01'),
          makeMagiDet('p-child', 'Aaliyah', 'ELIGIBLE', "Children's MAGI", '2017-01-01'),
        ]}
        intakeData={{ householdSize: 2, monthlyHouseholdIncome: 3000, applicant: {} }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
  }

  it('shows the ineligible adult as "Ineligible", not the case-level "Approved"', () => {
    renderMixed();
    const adultRow = screen.getByRole('button', { name: /Jasmine/ });
    expect(within(adultRow).getByText('INELIGIBLE')).toBeInTheDocument();
    expect(within(adultRow).queryByText('APPROVED')).not.toBeInTheDocument();
  });

  it('shows the eligible child as "Approved", decoupled from the adults', () => {
    renderMixed();
    const childRow = screen.getByRole('button', { name: /Aaliyah/ });
    expect(within(childRow).getByText('APPROVED')).toBeInTheDocument();
    expect(within(childRow).queryByText('INELIGIBLE')).not.toBeInTheDocument();
  });

  // The per-member flag also drives the expanded CoverageCard MCO/Delivery cell:
  // an ineligible member must NOT show an MCO, while the eligible member does.
  it("drives the expanded CoverageCard MCO off each member's own outcome", () => {
    renderMixed();
    // The adult HEAD (INELIGIBLE) is expanded by default — its MCO/Delivery cell reads "—".
    const adultMco = screen.getByText('MCO / Delivery').closest('div')!;
    expect(within(adultMco).getByText('—')).toBeInTheDocument();

    // Expand the eligible child — its CoverageCard shows the assigned MCO.
    fireEvent.click(screen.getByRole('button', { name: /Aaliyah/ }));
    const mcoCells = screen.getAllByText('MCO / Delivery').map((el) => el.closest('div')!);
    expect(mcoCells.some((cell) => within(cell).queryByText('State Total Care'))).toBe(true);
  });

  it('falls back to the case-level approval when a member has NO determination (NON-MAGI/DDS path)', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-adult', 'HEAD')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {} }}
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
    const row = screen.getByRole('button', { name: /Head of Household/ });
    expect(within(row).getByText('APPROVED')).toBeInTheDocument();
  });

  it('a member with no determination on a non-approved case shows "Pending", not "Approved"', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-adult', 'HEAD')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {} }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    const row = screen.getByRole('button', { name: /Head of Household/ });
    expect(within(row).getByText('PENDING')).toBeInTheDocument();
    expect(within(row).queryByText('APPROVED')).not.toBeInTheDocument();
  });
});

// ENG-1886 (D1a) — neutral per-member eligibility count in the household header.
// The CMS Demo Admin design surfaces mixed outcomes purely per-member (decoupled
// coverage) and has NO case-level "partial" verdict, so this is a neutral
// "N of M eligible" count appended to the existing "Household Composition · N
// Members" header, shown ONLY when the household is genuinely mixed.
describe('MemberCards — mixed-household eligibility count (ENG-1886 D1a)', () => {
  function renderCounts(statuses: Array<'ELIGIBLE' | 'INELIGIBLE'>) {
    const members = statuses.map((_s, i) => makeMember(`m-${i}`, `p-${i}`, i === 0 ? 'HEAD' : 'OTHER_ADULT'));
    const determinations = statuses.map((s, i) =>
      makeMagiDet(`p-${i}`, `Member${i}`, s, s === 'ELIGIBLE' ? "Children's MAGI" : 'Adult Group MAGI', '1990-01-01'),
    );
    return render(
      <MemberCards
        members={members}
        determinations={determinations}
        intakeData={{ householdSize: statuses.length, applicant: {} }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
  }

  it('shows "N of M eligible" for a mixed household', () => {
    renderCounts(['ELIGIBLE', 'ELIGIBLE', 'INELIGIBLE']);
    expect(screen.getByText(/2 of 3 eligible/)).toBeInTheDocument();
  });

  it('omits the count when every applying member is eligible', () => {
    renderCounts(['ELIGIBLE', 'ELIGIBLE']);
    expect(screen.queryByText(/of \d+ eligible/)).not.toBeInTheDocument();
  });

  it('omits the count when no applying member is eligible', () => {
    renderCounts(['INELIGIBLE', 'INELIGIBLE']);
    expect(screen.queryByText(/of \d+ eligible/)).not.toBeInTheDocument();
  });
});

// ENG-1943 — the per-member avatar must never render the literal '?' sentinel.
// When a structured first/last name exists it shows initials; when the name is
// absent (e.g. the Robert Mitchell default fixture carries only a fullName
// string), the avatar degrades to a neutral Lucide person icon — not '?'.
// This render-site fix is self-contained: it does NOT depend on ENG-1945
// populating names upstream.
describe('MemberCards — avatar fallback (ENG-1943)', () => {
  const NAMELESS_MEMBER = {
    id: 'm-head',
    role: 'HEAD',
    relationshipToHead: null,
    startDate: '2026-01-01',
    person: { personId: 'p-head' },
  } as unknown as EEHouseholdMember;

  // Mirrors the Robert Mitchell fixture: a determination whose person has
  // explicit null first/last name (only a fullName lives elsewhere).
  const NAMELESS_DETERMINATION = {
    ...NON_MAGI_DETERMINATION,
    person: {
      ...(NON_MAGI_DETERMINATION.person as PersonRecord),
      firstName: null,
      lastName: null,
    },
  } as unknown as EEDetermination;

  function renderNameless() {
    return render(
      <MemberCards
        members={[NAMELESS_MEMBER]}
        determinations={[NAMELESS_DETERMINATION]}
        intakeData={{ householdSize: 1, applicant: {} }}
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
  }

  it('never renders the literal "?" for a name-less member (regression guard)', () => {
    renderNameless();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });

  it('renders the person-icon fallback (no text) when names are absent', () => {
    renderNameless();
    const avatar = screen.getByTestId('member-avatar');
    // No text initials in the avatar...
    expect(within(avatar).queryByText(/\S/)).not.toBeInTheDocument();
    // ...and a Lucide icon (svg) is present instead.
    expect(avatar.querySelector('svg')).not.toBeNull();
  });

  it('still renders derived initials when a structured name exists (happy path)', () => {
    render(
      <MemberCards
        members={[HEAD_MEMBER]}
        determinations={[NON_MAGI_DETERMINATION]}
        intakeData={{ householdSize: 1, applicant: {} }}
        isNonMagi
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
    // Jordan Avery → "JA"
    const avatar = screen.getByTestId('member-avatar');
    expect(within(avatar).getByText('JA')).toBeInTheDocument();
    expect(within(avatar).queryByText('?')).not.toBeInTheDocument();
  });
});

// ENG-1945 — head-of-household name label. When the federated PersonRecord is
// null (the ENG-1476 deferral leaves determination.person unpopulated) AND the
// per-member intakeData.householdMembers[] row carries no first/last name, the
// row used to render the literal "Head of Household" instead of the applicant's
// name. The fix extends memberName()'s fallback chain to consult the case-level
// applicant name the rest of the app already trusts (intakeData.applicantName,
// then displayMeta.applicantName) — mirroring CompletedCaseDetail's displayName
// chain — before degrading to the role label. Name-agnostic: surfaces whatever
// applicant name the case carries.
describe('MemberCards — head-of-household name label (ENG-1945)', () => {
  it('resolves the HEAD name from intakeData.applicantName when no PersonRecord and no per-member intake name', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-head', 'HEAD')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {}, applicantName: 'Robert Mitchell' }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /Robert Mitchell/ })).toBeInTheDocument();
    expect(screen.queryByText('Head of Household')).not.toBeInTheDocument();
  });

  it('resolves the HEAD name from displayMeta.applicantName when intakeData.applicantName is absent', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-head', 'HEAD')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {}, displayMeta: { applicantName: 'Robert Mitchell' } }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /Robert Mitchell/ })).toBeInTheDocument();
    expect(screen.queryByText('Head of Household')).not.toBeInTheDocument();
  });

  it('still resolves the HEAD name from the per-member intakeData.householdMembers entry (regression guard)', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-head', 'HEAD')]}
        determinations={[]}
        intakeData={{
          householdSize: 1,
          applicant: {},
          householdMembers: [{ personId: 'p-head', firstName: 'Robert', lastName: 'Mitchell' }],
        }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /Robert Mitchell/ })).toBeInTheDocument();
    expect(screen.queryByText('Head of Household')).not.toBeInTheDocument();
  });

  it('does NOT apply the applicant-name fallback to a non-HEAD member', () => {
    render(
      <MemberCards
        members={[makeMember('m-other', 'p-other', 'OTHER_ADULT')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {}, applicantName: 'Robert Mitchell' }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    // The case-level applicant name is a single value; it must not leak onto a
    // non-HEAD member, which still degrades to "Unknown".
    expect(screen.getByRole('button', { name: /Unknown/ })).toBeInTheDocument();
    expect(screen.queryByText('Robert Mitchell')).not.toBeInTheDocument();
  });

  it('still degrades to "Head of Household" for a HEAD with no name signal at all', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-head', 'HEAD')]}
        determinations={[]}
        intakeData={{ householdSize: 1, applicant: {} }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    // No PersonRecord, no matching householdMembers row, no applicantName — the
    // fallback chain bottoms out at the role label, unchanged by this fix.
    expect(screen.getByRole('button', { name: /Head of Household/ })).toBeInTheDocument();
  });
});

// ENG-1978: the Adult-Group 5% disregard is +5 percentage points of FPL — the
// effective ceiling is 138% FPL and income is NOT reduced. The trace must show
// the household's true FPL % against the 138% ceiling, not a shrunk income.
describe('MemberCards — Adult Group 5% disregard presentation (ENG-1978)', () => {
  function renderDisregardCase() {
    // HH-of-3 at $3,040/mo = $36,480/yr. 133% FPL (HH3 = $27,320) = $36,335.60 →
    // step 1 fails by ~$12/mo; income clears the 138% ceiling ($37,701.60) at
    // the household's true 133.5% FPL.
    return render(
      <MemberCards
        members={[makeMember('m-head', 'p-adult', 'HEAD')]}
        determinations={[makeMagiDet('p-adult', 'Jasmine', 'ELIGIBLE', 'Adult Group MAGI', '1990-01-01')]}
        intakeData={{ householdSize: 3, monthlyHouseholdIncome: 3040, applicant: {} }}
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
  }

  it("shows the household's true FPL % (133.5%) within the 138% ceiling, income unchanged", () => {
    renderDisregardCase();
    expect(screen.getByText(/≈133\.5% of FPL · within 138% ceiling/)).toBeInTheDocument();
  });

  it('does NOT shrink income ("After disregard"/126.9% are the old wrong behavior)', () => {
    renderDisregardCase();
    expect(screen.queryByText(/After disregard/)).not.toBeInTheDocument();
    expect(screen.queryByText(/126\.9% of FPL/)).not.toBeInTheDocument();
  });

  it('renders the corrected disregard footnote (income clears the 138% ceiling)', () => {
    renderDisregardCase();
    expect(
      screen.getByText(
        /Initial 133% test failed by \$12\/mo, but income clears the 138% FPL ceiling \(case is at 133\.5% FPL\)/,
      ),
    ).toBeInTheDocument();
  });
});

// ENG-1978: determination dates arrive as midnight-UTC DateTime values; they must
// render as the intended calendar day, not the prior day (US-timezone off-by-one).
describe('MemberCards — coverage dates render without UTC off-by-one (ENG-1978)', () => {
  it('renders the effective date as the stored calendar day (Jun 1, not May 31)', () => {
    const det = {
      ...makeMagiDet('p-adult', 'Jasmine', 'ELIGIBLE', 'Adult Group MAGI', '1990-01-01'),
      effectiveDate: '2026-06-01T00:00:00.000Z',
      expirationDate: '2027-05-31T00:00:00.000Z',
    } as unknown as EEDetermination;
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-adult', 'HEAD')]}
        determinations={[det]}
        intakeData={{ householdSize: 3, monthlyHouseholdIncome: 3040, applicant: {} }}
        caseApproved
        caseId={FIXTURE_CASE_ID}
      />,
    );
    // Collapsed row shows "Effective Jun 1, 2026"; expanded card shows the End date.
    expect(screen.getAllByText(/Jun 1, 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/May 31, 2027/)).toBeInTheDocument();
    expect(screen.queryByText(/May 31, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/May 30, 2027/)).not.toBeInTheDocument();
  });
});

// DEFERRED→Eligible chip presentation on pure Non-MAGI cases. The BRE maps its
// NEEDS_REVIEW outcome to DEFERRED determinations; a Non-MAGI member on a pure
// Non-MAGI case is financially eligible (DDS is the case-level gate), so the
// chip reads ELIGIBLE. Split households keep the genuine Deferred chip.
describe('MemberCards — Non-MAGI DEFERRED presents as Eligible', () => {
  const DEFERRED_NON_MAGI = {
    ...NON_MAGI_DETERMINATION,
    status: 'DEFERRED',
    effectiveDate: null,
    expirationDate: null,
  } as unknown as EEDetermination;

  it('renders ELIGIBLE (not DEFERRED) for a deferred member on a pure Non-MAGI case', () => {
    render(
      <MemberCards
        members={[HEAD_MEMBER]}
        determinations={[DEFERRED_NON_MAGI]}
        intakeData={{ householdSize: 1, applicant: {} }}
        isNonMagi
        caseId={FIXTURE_CASE_ID}
      />,
    );
    const row = screen.getByRole('button', { name: /Jordan/ });
    expect(within(row).getByText('ELIGIBLE')).toBeInTheDocument();
    expect(within(row).queryByText('DEFERRED')).not.toBeInTheDocument();
  });

  it('keeps the genuine DEFERRED chip on a mixed/split household (Gloria archetype)', () => {
    render(
      <MemberCards
        members={[makeMember('m-head', 'p-head', 'HEAD'), makeMember('m-child', 'p-child', 'CHILD')]}
        determinations={[
          { ...DEFERRED_NON_MAGI, id: 'd-def' } as unknown as EEDetermination,
          makeMagiDet('p-child', 'Zoe', 'ELIGIBLE', "Children's MAGI", '2017-01-01'),
        ]}
        intakeData={{ householdSize: 2, applicant: {} }}
        caseId={FIXTURE_CASE_ID}
      />,
    );
    const row = screen.getByRole('button', { name: /Jordan/ });
    expect(within(row).getByText('DEFERRED')).toBeInTheDocument();
  });
});
