/**
 * NonMagiDeterminePanel tests — DDS render states (ENG-1748)
 *
 * The panel has four distinct render branches gated on `ddsReferralSent`,
 * `ddsConfirmed`, and `ddsValidated` props:
 *   1. Default   — no referral sent yet (pending callout / locked card)
 *   2. Referred  — DDS referral sent, awaiting decision (amber callout)
 *   3. Confirmed — DDS confirmed disability (green ABD Eligible success view)
 *   4. Validated — caseworker validation accepted (DecisionHero summary card)
 *
 * Program Enrollment intentionally does not render on the Determine step
 * (storyboard decide-step parity) — asserted across all states below.
 *
 * These are pure render tests — no Apollo, no router, no mutations.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NonMagiDeterminePanel, ABD_ELIGIBLE_LABEL } from './NonMagiDeterminePanel';
import type { EECase } from '../../types/ee';

// The panel reads income/asset/date fields with safe fallbacks — a minimal
// cast satisfies the prop type without requiring a full EECase fixture.
const STUB_CASE = { id: 'case-001', createdAt: '2026-02-26T00:00:00Z' } as unknown as EECase;

describe('NonMagiDeterminePanel — DDS render states (ENG-1748)', () => {
  // ── State 1: default (pre-referral) ─────────────────────────────────────
  describe('default state — no props passed', () => {
    it('shows amber callout about pending DDS determination', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} />);
      expect(screen.getByText(/Pending DDS disability determination/i)).toBeInTheDocument();
    });

    it('shows locked determination card and no ABD Eligible success card', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} />);
      expect(screen.getByText(/locked until DDS confirms disability/i)).toBeInTheDocument();
      expect(screen.queryByText(ABD_ELIGIBLE_LABEL)).not.toBeInTheDocument();
    });
  });

  // ── State 2: ddsReferralSent=true (referral in-flight) ──────────────────
  describe('ddsReferralSent=true — referral packet sent, awaiting DDS decision', () => {
    it('shows DDS referral sent callout text', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsReferralSent />);
      expect(screen.getByText(/DDS referral sent — awaiting determination/i)).toBeInTheDocument();
    });

    it('still shows locked determination card (unlock requires DDS confirmation)', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsReferralSent />);
      expect(screen.getByText(/locked until DDS confirms disability/i)).toBeInTheDocument();
    });
  });

  // ── State 3: ddsConfirmed=true (disability confirmed by DDS) ────────────
  describe('ddsConfirmed=true — DDS returned favorable determination', () => {
    it('shows green DDS confirmed callout', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsConfirmed />);
      expect(screen.getByText(/DDS confirmed disability — ABD category assigned/i)).toBeInTheDocument();
    });

    it('shows ABD Eligible success card and removes locked determination card', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsConfirmed />);
      expect(screen.getByText(ABD_ELIGIBLE_LABEL)).toBeInTheDocument();
      expect(screen.queryByText(/locked until DDS confirms disability/i)).not.toBeInTheDocument();
    });
  });

  // ── State 4: ddsValidated=true (caseworker validation accepted) ─────────
  describe('ddsValidated=true — DecisionHero summary card', () => {
    it('shows the DecisionHero with category and MMIS facts', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsConfirmed ddsValidated />);
      expect(screen.getByText('Eligibility Determination')).toBeInTheDocument();
      expect(screen.getByText('Non-MAGI ABD — Disabled')).toBeInTheDocument();
      expect(screen.getByText('Ready to submit')).toBeInTheDocument();
      expect(screen.getByText('MMIS transmission')).toBeInTheDocument();
    });

    it('removes the callout and determination card once validated', () => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} ddsConfirmed ddsValidated />);
      expect(screen.queryByText(/locked until DDS confirms disability/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/DDS confirmed disability — ABD category assigned/i)).not.toBeInTheDocument();
    });

    it('renders em-dash fallbacks (not "Invalid Date") for an unparseable createdAt', () => {
      const badDateCase = { ...STUB_CASE, createdAt: 'not-a-date' } as unknown as EECase;
      render(<NonMagiDeterminePanel eeCase={badDateCase} ddsConfirmed ddsValidated />);
      // fmtMDY + coverageEnd defensive guards: hero renders with '—' values.
      expect(screen.getByText('Eligibility Determination')).toBeInTheDocument();
      expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
      expect(screen.getByText('— (application date)')).toBeInTheDocument();
    });
  });

  // ── Program Enrollment removed from Determine (all states) ──────────────
  describe('Program Enrollment does not render on the Determine step', () => {
    it.each([
      ['default', {}],
      ['referred', { ddsReferralSent: true }],
      ['confirmed', { ddsConfirmed: true }],
      ['validated', { ddsConfirmed: true, ddsValidated: true }],
    ] as const)('%s state', (_name, props) => {
      render(<NonMagiDeterminePanel eeCase={STUB_CASE} {...props} />);
      expect(screen.queryByText('Program Enrollment')).not.toBeInTheDocument();
    });
  });
});
