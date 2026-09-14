/**
 * SectionedRuleTrace tests — covers the four ACs this component closes
 * on ENG-1670:
 *   R-001 outcome badge
 *   R-006 evaluatedAt timestamp
 *   R-007 case-aware empty state
 *   AC-008 sectioned layout (section grouping + per-row status)
 *
 * Also asserts the parser's defensive behavior: malformed inputs return
 * null / drop bad rows rather than throwing, so the workspace stays
 * renderable when the engine emits something unexpected.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
// The BRE client package is not part of this demo repo — the engine version is
// only echoed into the trace footer, so a literal is enough for the fixtures.
const ENGINE_VERSION = 'demo-rules-engine';
import {
  SectionedRuleTrace,
  parseSectionedTrace,
  presentNonMagiTrace,
  SECTION_ABD_CATEGORY,
  SECTION_SSI_STATUS,
  SLOT_HIERARCHY,
} from './SectionedRuleTrace';

const SAMPLE_TRACE = {
  outcome: 'NEEDS_REVIEW',
  evaluatedAt: '2026-05-26T17:00:00.000Z',
  engineVersion: ENGINE_VERSION,
  sections: [
    {
      name: 'Residency',
      ordering: 0,
      rows: [
        {
          ruleId: 'CMS-GATE-001',
          ruleName: 'State Residency — Required',
          displayCode: 'CMS-RES-001',
          status: 'PASS',
          leftLabel: 'State residency',
          rightValue: 'Verified — State-X',
        },
      ],
    },
    {
      name: 'ABD Category',
      ordering: 200,
      rows: [
        {
          ruleId: 'CMS-ABD-CAT-001',
          ruleName: 'ABD Category — Aged',
          displayCode: 'CMS-ABD-CAT-001',
          status: 'PASS',
          leftLabel: 'ABD category',
          rightValue: 'Aged',
        },
        {
          ruleId: 'CMS-ABD-CAT-002',
          ruleName: 'ABD Category — Blind',
          displayCode: 'CMS-ABD-CAT-002',
          status: 'FAIL',
          leftLabel: 'ABD category',
          rightValue: 'Blind',
        },
      ],
    },
  ],
};

const SSI_ABD_TRACE = {
  outcome: 'NEEDS_REVIEW',
  evaluatedAt: '2026-05-26T17:00:00.000Z',
  engineVersion: ENGINE_VERSION,
  sections: [
    {
      name: SECTION_SSI_STATUS,
      ordering: 205,
      rows: [
        {
          ruleId: 'CMS-ABD-SSI-001',
          ruleName: 'SSI Recipient — Automatically Eligible for Medicaid',
          displayCode: 'CMS-ABD-SSI-001',
          status: 'PENDING',
          leftLabel: 'SSI status',
          rightValue: 'Not on file',
        },
      ],
    },
    {
      name: SECTION_ABD_CATEGORY,
      ordering: 200,
      rows: [
        {
          ruleId: 'CMS-ABD-CAT-003',
          ruleName: 'ABD Category — Disabled',
          displayCode: 'CMS-ABD-CAT-003',
          status: 'PASS',
          leftLabel: 'ABD category',
          rightValue: 'Disabled',
        },
      ],
    },
  ],
};

describe('presentNonMagiTrace (ENG-1874)', () => {
  it('drops the SSI Status section when the applicant does not receive SSI', () => {
    const parsed = parseSectionedTrace(SSI_ABD_TRACE)!;
    const result = presentNonMagiTrace(parsed, { receivingSSI: false });
    expect(result.sections.map((s) => s.name)).not.toContain(SECTION_SSI_STATUS);
    expect(result.sections.map((s) => s.name)).toContain(SECTION_ABD_CATEGORY);
  });

  it('keeps the SSI Status section when the applicant receives SSI', () => {
    const parsed = parseSectionedTrace(SSI_ABD_TRACE)!;
    const result = presentNonMagiTrace(parsed, { receivingSSI: true });
    expect(result.sections.map((s) => s.name)).toContain(SECTION_SSI_STATUS);
  });

  it('marks ABD Category rows as PENDING when abdPending is set', () => {
    const parsed = parseSectionedTrace(SSI_ABD_TRACE)!;
    const result = presentNonMagiTrace(parsed, { receivingSSI: false, abdPending: true });
    const abd = result.sections.find((s) => s.name === SECTION_ABD_CATEGORY)!;
    expect(abd.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(abd.rows[0].note).toMatch(/Pending DDS/i);
  });

  it('switches the ABD pending note to "referral sent" when ddsReferralSent is set', () => {
    const parsed = parseSectionedTrace(SSI_ABD_TRACE)!;
    const result = presentNonMagiTrace(parsed, { receivingSSI: false, abdPending: true, ddsReferralSent: true });
    const abd = result.sections.find((s) => s.name === SECTION_ABD_CATEGORY)!;
    expect(abd.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(abd.rows[0].note).toMatch(/DDS referral sent — awaiting disability determination/);
  });

  it('leaves ABD Category status untouched when abdPending is not set', () => {
    const parsed = parseSectionedTrace(SSI_ABD_TRACE)!;
    const result = presentNonMagiTrace(parsed, { receivingSSI: true });
    const abd = result.sections.find((s) => s.name === SECTION_ABD_CATEGORY)!;
    expect(abd.rows[0].status).toBe('PASS');
  });

  it('hides the outcome badge when hideOutcomeBadge is set (post-validation)', () => {
    render(<SectionedRuleTrace ruleEvaluations={SSI_ABD_TRACE} receivingSSI={false} hideOutcomeBadge defaultOpen />);
    expect(screen.queryByText('Needs review')).toBeNull();
  });

  it('shows the outcome badge by default', () => {
    render(<SectionedRuleTrace ruleEvaluations={SSI_ABD_TRACE} receivingSSI={false} defaultOpen />);
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('renders no SSI Status section in the component when receivingSSI is false', () => {
    render(<SectionedRuleTrace ruleEvaluations={SSI_ABD_TRACE} receivingSSI={false} abdPending defaultOpen />);
    expect(screen.queryByText(SECTION_SSI_STATUS)).toBeNull();
    expect(screen.getByText(SECTION_ABD_CATEGORY)).toBeInTheDocument();
  });
});

describe('parseSectionedTrace', () => {
  it('returns null for non-objects', () => {
    expect(parseSectionedTrace(null)).toBeNull();
    expect(parseSectionedTrace(undefined)).toBeNull();
    expect(parseSectionedTrace('not an object')).toBeNull();
    expect(parseSectionedTrace([])).toBeNull();
  });

  it('returns null when sections array is missing', () => {
    expect(parseSectionedTrace({ outcome: 'ELIGIBLE' })).toBeNull();
  });

  it('parses a well-formed sectioned trace', () => {
    const parsed = parseSectionedTrace(SAMPLE_TRACE);
    expect(parsed).not.toBeNull();
    expect(parsed!.outcome).toBe('NEEDS_REVIEW');
    expect(parsed!.evaluatedAt).toBe('2026-05-26T17:00:00.000Z');
    expect(parsed!.sections).toHaveLength(2);
    expect(parsed!.sections[0]!.name).toBe('Residency');
    expect(parsed!.sections[1]!.rows).toHaveLength(2);
  });

  it('drops rows with invalid status values', () => {
    const parsed = parseSectionedTrace({
      sections: [
        {
          name: 'Test',
          ordering: 0,
          rows: [
            { ruleId: 'R1', ruleName: 'Rule 1', status: 'PASS', leftLabel: 'A', rightValue: 'B' },
            { ruleId: 'R2', ruleName: 'Rule 2', status: 'BOGUS', leftLabel: 'A', rightValue: 'B' },
          ],
        },
      ],
    });
    expect(parsed!.sections[0]!.rows).toHaveLength(1);
    expect(parsed!.sections[0]!.rows[0]!.ruleId).toBe('R1');
  });

  it('returns null outcome when outcome field is missing or invalid', () => {
    const parsed = parseSectionedTrace({ sections: [], outcome: 'BOGUS' });
    expect(parsed!.outcome).toBeNull();
  });
});

describe('SectionedRuleTrace', () => {
  it('R-007: renders case-aware empty state when ruleEvaluations is null', () => {
    render(<SectionedRuleTrace ruleEvaluations={null} />);
    expect(screen.getByText(/Eligibility Determination Rule Trace/i)).toBeInTheDocument();
    expect(screen.getByText(/has not been evaluated yet/i)).toBeInTheDocument();
  });

  it('R-007: renders empty state when sections array is empty', () => {
    render(<SectionedRuleTrace ruleEvaluations={{ sections: [], outcome: 'ELIGIBLE' }} />);
    expect(screen.getByText(/has not been evaluated yet/i)).toBeInTheDocument();
  });

  it('R-001 + collapsed header: renders outcome badge and rule count in collapsed state', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} />);
    // Outcome badge for NEEDS_REVIEW
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    // Section + row counts
    expect(screen.getByText(/2 sections.*3 rules/)).toBeInTheDocument();
  });

  it('R-006: renders evaluatedAt timestamp on the collapsed header', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} />);
    // Header should include the human-formatted timestamp
    expect(screen.getByText(/Last evaluated May 26, 2026/)).toBeInTheDocument();
  });

  it('AC-008: expanding the card reveals section headers and per-row content', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} />);
    // Initially collapsed — section names not in DOM
    expect(screen.queryByText('Residency')).toBeNull();
    // Click to expand
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    // Section headers now visible
    expect(screen.getByText('Residency')).toBeInTheDocument();
    expect(screen.getByText('ABD Category')).toBeInTheDocument();
    // Row content
    expect(screen.getByText('State residency')).toBeInTheDocument();
    expect(screen.getByText('Verified — State-X')).toBeInTheDocument();
  });

  it('opens by default when defaultOpen is true', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} defaultOpen={true} />);
    expect(screen.getByText('Residency')).toBeInTheDocument();
  });

  it('uses a custom title when provided', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} title="Custom Trace Title" defaultOpen={true} />);
    expect(screen.getByText('Custom Trace Title')).toBeInTheDocument();
  });

  it('R-006: omits the timestamp for an unparseable evaluatedAt (review S-4)', () => {
    // formatEvaluatedAt returns '' for invalid ISO; exercised through the component
    render(<SectionedRuleTrace ruleEvaluations={{ ...SAMPLE_TRACE, evaluatedAt: 'not-a-date' }} defaultOpen={true} />);
    expect(screen.queryByText(/Last evaluated/)).toBeNull();
  });

  it('renders the per-section empty message when a section has no rows (review S-5)', () => {
    const emptySectionTrace = {
      outcome: 'NEEDS_REVIEW',
      evaluatedAt: '2026-05-26T17:00:00.000Z',
      engineVersion: ENGINE_VERSION,
      sections: [{ name: 'Empty Section', ordering: 0, rows: [] }],
    };
    render(<SectionedRuleTrace ruleEvaluations={emptySectionTrace} defaultOpen={true} />);
    expect(screen.getByText('Empty Section')).toBeInTheDocument();
    expect(screen.getByText(/No rules in this section/i)).toBeInTheDocument();
  });

  it('renders FAIL rows alongside PASS rows', () => {
    render(<SectionedRuleTrace ruleEvaluations={SAMPLE_TRACE} defaultOpen={true} />);
    // Both Aged (PASS) and Blind (FAIL) categories should render
    expect(screen.getByText('Aged')).toBeInTheDocument();
    expect(screen.getByText('Blind')).toBeInTheDocument();
  });
});

describe('SectionedRuleTrace — hierarchy slot rendering (AC-008)', () => {
  // Storyboard parity: when rows are tagged with `slot: 'hierarchy'`, the
  // Coverage Group section renders as a 3-column table (group | threshold |
  // result) with the PASS row highlighted "ASSIGNED" instead of generic rows.
  const HIERARCHY_TRACE = {
    outcome: 'ELIGIBLE',
    evaluatedAt: '2026-05-26T17:00:00.000Z',
    engineVersion: ENGINE_VERSION,
    sections: [
      {
        name: 'Coverage Group',
        ordering: 100,
        rows: [
          {
            ruleId: 'CMS-MAGI-002',
            ruleName: 'Medicaid — Infants (0–1)',
            displayCode: 'CMS-MAGI-002',
            status: 'FAIL',
            leftLabel: 'MAGI coverage group',
            rightValue: 'Infant (0–1)',
            slot: SLOT_HIERARCHY,
            threshold: '≤ 205% FPL',
          },
          {
            ruleId: 'CMS-MAGI-006',
            ruleName: 'Medicaid — Adult (ACA Expansion)',
            displayCode: 'CMS-MAGI-006',
            status: 'PASS',
            leftLabel: 'MAGI coverage group',
            rightValue: 'Adult (ACA Expansion)',
            slot: SLOT_HIERARCHY,
            threshold: '≤ 138% FPL',
          },
        ],
      },
    ],
  };

  it('renders hierarchy section with group/threshold/result columns', () => {
    render(<SectionedRuleTrace ruleEvaluations={HIERARCHY_TRACE} defaultOpen={true} />);
    expect(screen.getByText('Coverage group')).toBeInTheDocument();
    expect(screen.getByText('Threshold')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
  });

  it('shows ASSIGNED on the PASS row and SKIP on FAIL rows', () => {
    render(<SectionedRuleTrace ruleEvaluations={HIERARCHY_TRACE} defaultOpen={true} />);
    expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
    expect(screen.getByText('SKIP')).toBeInTheDocument();
  });

  it('renders threshold strings from the row data', () => {
    render(<SectionedRuleTrace ruleEvaluations={HIERARCHY_TRACE} defaultOpen={true} />);
    expect(screen.getByText('≤ 205% FPL')).toBeInTheDocument();
    expect(screen.getByText('≤ 138% FPL')).toBeInTheDocument();
  });

  it('renders group names from rightValue', () => {
    render(<SectionedRuleTrace ruleEvaluations={HIERARCHY_TRACE} defaultOpen={true} />);
    expect(screen.getByText('Infant (0–1)')).toBeInTheDocument();
    expect(screen.getByText('Adult (ACA Expansion)')).toBeInTheDocument();
  });

  it('falls back to generic rendering when no row has a slot value', () => {
    const noSlotTrace = {
      ...HIERARCHY_TRACE,
      sections: HIERARCHY_TRACE.sections.map((s) => ({
        ...s,
        rows: s.rows.map(({ slot: _slot, threshold: _threshold, ...rest }) => rest),
      })),
    };
    render(<SectionedRuleTrace ruleEvaluations={noSlotTrace} defaultOpen={true} />);
    // Hierarchy column headers should NOT appear when no slot is present
    expect(screen.queryByText('Coverage group')).toBeNull();
    expect(screen.queryByText('Threshold')).toBeNull();
    // But the row content (rightValue) should still appear via generic renderer
    expect(screen.getByText('Adult (ACA Expansion)')).toBeInTheDocument();
  });
});
