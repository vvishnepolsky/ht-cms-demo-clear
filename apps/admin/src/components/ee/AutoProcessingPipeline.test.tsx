/**
 * AutoProcessingPipeline tests.
 *
 * ENG-1891: "Coverage Group Routing" is removed from both pathways — it is a
 * routing decision, not a verification source, so it no longer renders in the
 * pipeline. These tests assert the routing row is absent for either pathway.
 *
 * ENG-1983: the pipeline renders DATA VERIFICATIONS only. buildVerificationSteps
 * derives the steps: curated verification sources, with real BRE trace rows from
 * the verification sections (Residency, Citizenship & Immigration) substituted
 * in. Eligibility rows (Pathway, Coverage Group, MAGI Gates, ABD …) are dropped
 * — they belong to the Evaluate step's SectionedRuleTrace.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AutoProcessingPipeline,
  buildVerificationSteps,
  STEP_LABEL_CITIZENSHIP,
  STEP_LABEL_RESIDENCY,
} from './AutoProcessingPipeline';
import { parseRuleEvaluations } from './MagiRulesEngine';

describe('AutoProcessingPipeline', () => {
  describe('default fallback steps (no steps passed)', () => {
    it('omits the Coverage Group Routing step by default (MAGI)', () => {
      render(<AutoProcessingPipeline />);
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.queryByText('Coverage Group Routing')).toBeNull();
      expect(screen.queryByText(/MAGI Adult pathway selected/i)).toBeNull();
    });

    it('omits the Coverage Group Routing step when pathway=NON_MAGI', () => {
      render(<AutoProcessingPipeline pathway="NON_MAGI" />);
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.queryByText('Coverage Group Routing')).toBeNull();
      expect(screen.queryByText(/Non-MAGI ABD pathway selected/i)).toBeNull();
    });

    // ENG-1874: the Non-MAGI curated pipeline excludes the MAGI-only
    // "Income — Stated vs. IRS" reconciliation step but keeps the assumed-
    // verified key sources (identity, citizenship, residency, household).
    it('Non-MAGI default omits the MAGI IRS income step', () => {
      render(<AutoProcessingPipeline pathway="NON_MAGI" />);
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.queryByText('Income — Stated vs. IRS')).toBeNull();
      expect(screen.getByText('Identity & SSA Match')).toBeInTheDocument();
      expect(screen.getByText(STEP_LABEL_CITIZENSHIP)).toBeInTheDocument();
      expect(screen.getByText(STEP_LABEL_RESIDENCY)).toBeInTheDocument();
      expect(screen.getByText('Household Composition')).toBeInTheDocument();
    });

    it('MAGI default retains the IRS income step', () => {
      render(<AutoProcessingPipeline pathway="MAGI" />);
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.getByText('Income — Stated vs. IRS')).toBeInTheDocument();
    });

    it('empty steps array falls back to pathway default', () => {
      // The guard is `steps && steps.length > 0`, so an empty array must fall
      // through to defaultStepsForPathway rather than rendering zero steps.
      render(<AutoProcessingPipeline pathway="NON_MAGI" steps={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.getByText('Identity & SSA Match')).toBeInTheDocument();
      expect(screen.queryByText('Coverage Group Routing')).toBeNull();
    });
  });

  describe('caller-supplied steps short-circuit the default', () => {
    it('caller-supplied `steps` wins over the pathway default', () => {
      render(
        <AutoProcessingPipeline
          pathway="NON_MAGI"
          steps={[{ label: 'Only Step', status: 'pass', note: 'Provided directly.' }]}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /verification sources passed/i }));
      expect(screen.getByText('Only Step')).toBeInTheDocument();
      expect(screen.queryByText(/MAGI Adult/i)).toBeNull();
      expect(screen.queryByText(/Non-MAGI ABD/i)).toBeNull();
    });
  });
});

describe('buildVerificationSteps (ENG-1983)', () => {
  it('returns the curated pathway defaults when the trace has no verification rows', () => {
    const steps = buildVerificationSteps([], 'MAGI');
    expect(steps.map((s) => s.label)).toEqual([
      'Identity & SSA Match',
      STEP_LABEL_CITIZENSHIP,
      STEP_LABEL_RESIDENCY,
      'Household Composition',
      'Income — Stated vs. IRS',
    ]);
    expect(steps.every((s) => s.status === 'pass')).toBe(true);
  });

  it('drops eligibility rows — pathway routing, coverage groups, gates never reach Verify', () => {
    const steps = buildVerificationSteps(
      [
        {
          ruleId: 'CMS-PATH-001',
          ruleName: 'MAGI Pathway',
          status: 'PASSED',
          description: 'Eligibility pathway — MAGI',
          section: 'Pathway',
        },
        {
          ruleId: 'CMS-PATH-002',
          ruleName: 'Non-MAGI Pathway',
          status: 'FAILED',
          description: 'condition not met',
          section: 'Pathway',
        },
        {
          ruleId: 'CMS-MAGI-006',
          ruleName: 'Medicaid — Adult (ACA Expansion)',
          status: 'PASSED',
          description: 'MAGI coverage group — Adult',
          section: 'Coverage Group',
        },
        {
          ruleId: 'CMS-ABD-CAT-001',
          ruleName: 'ABD Category — Aged',
          status: 'FAILED',
          description: 'condition not met',
          section: 'ABD Category',
        },
        {
          ruleId: 'CMS-MAGI-GATE-001',
          ruleName: 'MAGI — Medicare Enrolled',
          status: 'FAILED',
          description: 'condition not met',
          section: 'MAGI Gates',
        },
      ],
      'MAGI',
    );
    const labels = steps.map((s) => s.label);
    expect(labels).not.toContain('MAGI Pathway');
    expect(labels).not.toContain('Non-MAGI Pathway');
    expect(labels).not.toContain('Medicaid — Adult (ACA Expansion)');
    expect(labels).not.toContain('ABD Category — Aged');
    // Nothing leaked → curated defaults only, all passing.
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => s.status === 'pass')).toBe(true);
  });

  it('substitutes a real verification-section row for its curated step (residency denial shows blocked)', () => {
    const steps = buildVerificationSteps(
      [
        {
          ruleId: 'CMS-GATE-001',
          ruleName: 'State Residency — Required',
          status: 'FAILED',
          description: 'State residency — out of state',
          section: 'Residency',
        },
      ],
      'MAGI',
    );
    const residency = steps.find((s) => s.label === STEP_LABEL_RESIDENCY);
    expect(residency).toMatchObject({ status: 'block', note: 'State residency — out of state' });
    // Only the Residency step changed; count is unchanged.
    expect(steps).toHaveLength(5);
    expect(steps.filter((s) => s.status === 'pass')).toHaveLength(4);
  });

  it('maps Citizenship & Immigration section rows onto the Citizenship / Immigration step', () => {
    const steps = buildVerificationSteps(
      [
        {
          ruleId: 'CMS-GATE-002',
          ruleName: 'Citizenship / Immigration Status',
          status: 'PASSED',
          description: 'Citizenship / qualified status — Verified via SSA',
          section: 'Citizenship & Immigration',
        },
      ],
      'NON_MAGI',
    );
    const cit = steps.find((s) => s.label === STEP_LABEL_CITIZENSHIP);
    expect(cit).toMatchObject({ status: 'pass', note: 'Citizenship / qualified status — Verified via SSA' });
    expect(steps).toHaveLength(4); // Non-MAGI: no IRS income step
  });

  it('maps an INFO-status verification row to warn (PENDING trace rows)', () => {
    // parseRuleEvaluations maps trace PENDING → INFO; a verification source
    // that is still pending must render amber, not a green assumed-pass.
    const steps = buildVerificationSteps(
      [
        {
          ruleId: 'CMS-GATE-002',
          ruleName: 'Citizenship / Immigration Status',
          status: 'INFO',
          description: 'Citizenship / qualified status — Awaiting SSA response',
          section: 'Citizenship & Immigration',
        },
      ],
      'MAGI',
    );
    expect(steps.find((s) => s.label === STEP_LABEL_CITIZENSHIP)).toMatchObject({
      status: 'warn',
      note: 'Citizenship / qualified status — Awaiting SSA response',
    });
  });

  it('drops flat-shape rows (no section metadata) — seeded showcase cases fall back to curated steps', () => {
    const steps = buildVerificationSteps(
      [
        { ruleId: 'r1', ruleName: 'State Residency', status: 'PASSED', description: 'Verified' },
        { ruleId: 'r3', ruleName: 'Income Threshold (MAGI)', status: 'PASSED', description: 'Under 138% FPL' },
      ],
      'MAGI',
    );
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.label)).not.toContain('Income Threshold (MAGI)');
  });

  // Regression for the live case in the ENG-1983 ticket
  // (cmpwn09pp00000zlhwpb5txj1 on dev): the persisted BRE result is the
  // sectioned trace PLUS internal matchedRules/failedRules bookkeeping. The
  // old adaptBreResult() path flattened every failedRules entry ("Non-MAGI
  // Pathway", ABD categories, all coverage groups, raw engine reasons) into
  // the Verify pipeline. End-to-end: parseRuleEvaluations + buildVerificationSteps
  // must keep verification rows only.
  it('end-to-end: live-case trace shape produces verification steps only', () => {
    const persistedRuleEvaluations = {
      outcome: 'INELIGIBLE',
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
          name: 'Pathway',
          ordering: 1,
          rows: [
            {
              ruleId: 'CMS-PATH-001',
              ruleName: 'MAGI Pathway',
              displayCode: 'CMS-PATH-MAGI',
              status: 'PASS',
              leftLabel: 'Eligibility pathway',
              rightValue: 'MAGI',
            },
          ],
        },
        {
          name: 'Coverage Group',
          ordering: 2,
          rows: [
            {
              ruleId: 'CMS-MAGI-006',
              ruleName: 'Medicaid — Adult (ACA Expansion)',
              displayCode: 'CMS-MAGI-006',
              status: 'PASS',
              leftLabel: 'MAGI coverage group',
              rightValue: 'Adult (ACA Expansion)',
            },
          ],
        },
      ],
      // Engine bookkeeping — every unmatched rule. Must NEVER render.
      failedRules: [
        { ruleId: 'CMS-GATE-002', name: 'Citizenship / Immigration Status', reason: 'condition not met' },
        { ruleId: 'CMS-PATH-002', name: 'Non-MAGI Pathway', reason: 'applicant.age gte threshold — condition not met' },
        { ruleId: 'CMS-MAGI-001', name: 'Medicaid — Deemed Newborn', reason: 'condition not met' },
        { ruleId: 'CMS-ABD-CAT-001', name: 'ABD Category — Aged', reason: 'condition not met' },
      ],
      evaluatedAt: '2026-06-02T12:52:11.773Z',
    };

    const steps = buildVerificationSteps(parseRuleEvaluations(persistedRuleEvaluations), 'MAGI');
    const labels = steps.map((s) => s.label);

    // The ticket's complaint: these must not appear on Verify.
    expect(labels).not.toContain('Non-MAGI Pathway');
    expect(labels).not.toContain('MAGI Pathway');
    expect(labels).not.toContain('Medicaid — Adult (ACA Expansion)');
    expect(labels).not.toContain('ABD Category — Aged');
    expect(labels).not.toContain('Medicaid — Deemed Newborn');

    // Verification sources only — with the real residency row substituted in.
    expect(labels).toEqual([
      'Identity & SSA Match',
      STEP_LABEL_CITIZENSHIP,
      STEP_LABEL_RESIDENCY,
      'Household Composition',
      'Income — Stated vs. IRS',
    ]);
    expect(steps.find((s) => s.label === STEP_LABEL_RESIDENCY)).toMatchObject({
      status: 'pass',
      note: 'State residency — Verified — State-X',
    });
  });
});
