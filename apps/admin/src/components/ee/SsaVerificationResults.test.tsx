/**
 * SsaVerificationResults tests (ENG-1947, ENG-2039)
 *
 * The "Title II Benefit" row reads through readSsaVerifiedSsdiIncome:
 *   - Non-MAGI/ABD case reporting $0 → $0/mo (no fabricated benefit — the old
 *     $950 stub is gone; Robert has no SSDI determination yet, ENG-2039).
 *   - Non-MAGI case reporting real income → that figure, unchanged.
 * The header date comes from the case's createdAt (when the simulated
 * verification ran), not the frozen DEMO_TODAY storyboard anchor.
 * Status chips were removed from this panel — values alone carry the state —
 * and Medicare Status renders as the last row.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SsaVerificationResults } from './SsaVerificationResults';
import type { EECase } from '../../types/ee';

describe('SsaVerificationResults — Title II Benefit figure (ENG-1947, ENG-2039)', () => {
  it('shows $0/mo for a Non-MAGI $0-report case — no fabricated benefit (no chips, Medicare last)', () => {
    const eeCase = {
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;

    const { container } = render(<SsaVerificationResults eeCase={eeCase} />);

    expect(screen.getByText('Title II Benefit')).toBeInTheDocument();
    expect(screen.getByText('$0/mo')).toBeInTheDocument();
    expect(screen.queryByText('$950/mo')).not.toBeInTheDocument();
    // Chips removed from this panel.
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Caseworker review required')).not.toBeInTheDocument();
    // Medicare Status renders as the last row.
    const labels = Array.from(container.querySelectorAll('p.text-xs.text-muted-foreground')).map(
      (el) => el.textContent,
    );
    expect(labels[labels.length - 1]).toBe('Medicare Status');
  });

  it('renders the reported figure unchanged for an income-reporting Non-MAGI case ($1,180)', () => {
    const eeCase = {
      intakeData: { monthlyHouseholdIncome: 1_180 },
      determinations: [{ category: 'NON_MAGI' }],
    } as unknown as EECase;

    render(<SsaVerificationResults eeCase={eeCase} />);

    expect(screen.getByText('$1,180/mo')).toBeInTheDocument();
    expect(screen.queryByText('$950/mo')).not.toBeInTheDocument();
  });

  // ENG-2039: the header verification date is the case's createdAt (when the
  // simulated verification pipeline ran), not the frozen 03/15/2026 anchor.
  it('dates the FDSH header from the case createdAt, not DEMO_TODAY', () => {
    const eeCase = {
      createdAt: '2026-05-20T14:30:00.000Z',
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;

    render(<SsaVerificationResults eeCase={eeCase} />);

    expect(screen.getByText(/Source: FDSH · 05\/20\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/03\/15\/2026/)).not.toBeInTheDocument();
  });

  it('renders an em dash for the header date when createdAt is missing/invalid', () => {
    const eeCase = {
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;

    render(<SsaVerificationResults eeCase={eeCase} />);

    expect(screen.getByText(/Source: FDSH · —/)).toBeInTheDocument();
  });

  it('Disability Case Status flips "Pending" → "Confirmed" (sentence case) when ddsConfirmed', () => {
    const eeCase = {
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;

    const { rerender } = render(<SsaVerificationResults eeCase={eeCase} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
    // One "Confirmed" pre-flip (SSN Match row only).
    expect(screen.getAllByText('Confirmed')).toHaveLength(1);

    rerender(<SsaVerificationResults eeCase={eeCase} ddsConfirmed />);
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    // Two post-flip: SSN Match + Disability Case Status.
    expect(screen.getAllByText('Confirmed')).toHaveLength(2);
  });
});
