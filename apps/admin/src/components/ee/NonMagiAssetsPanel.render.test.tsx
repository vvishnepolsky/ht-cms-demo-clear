/**
 * NonMagiAssetsPanel render tests — Disability Determination card states.
 *
 * Sibling parity with NonMagiDeterminePanel.test.tsx: the panel's three DDS
 * card variants (amber pending → blue packet-prepared → blue confirmed) are
 * asserted at the component level. The pure-helper tests live in
 * NonMagiAssetsPanel.test.ts (node env, no JSX) — render tests live here.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MockedProvider } from '@apollo/client/testing/react';
import { NonMagiAssetsPanel } from './NonMagiAssetsPanel';
import { DDS_DETERMINATION_REF } from '../../lib/case-assist-constants';
import { DEMO_TODAY_DISPLAY } from '../../data/demoToday';
import type { EECase } from '../../types/ee';

const STUB_CASE = {
  id: 'case-001',
  intakeData: {},
  assetVerification: null,
  household: { members: [] },
  determinations: [],
} as unknown as EECase;

function renderPanel(props: { ddsReferralSent?: boolean; ddsConfirmed?: boolean; applicantFirstName?: string } = {}) {
  return render(
    <MockedProvider mocks={[]}>
      <NonMagiAssetsPanel eeCase={STUB_CASE} {...props} />
    </MockedProvider>,
  );
}

describe('NonMagiAssetsPanel — Disability Determination card states', () => {
  it('renders the amber pending card by default (action required + unchecked packet list)', () => {
    renderPanel();
    expect(screen.getByText('Disability Status')).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();
    expect(screen.queryByText('✓ DDS Referral Packet Prepared')).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Disability Confirmed by DDS')).not.toBeInTheDocument();
  });

  it('renders the blue packet-prepared card once the referral is sent', () => {
    renderPanel({ ddsReferralSent: true, applicantFirstName: 'Robert' });
    expect(screen.getByText('✓ DDS Referral Packet Prepared')).toBeInTheDocument();
    expect(screen.getByText('Submitted · Awaiting DDS')).toBeInTheDocument();
    // Frozen demo anchor for the referral date.
    expect(screen.getByText(DEMO_TODAY_DISPLAY)).toBeInTheDocument();
    // Applicant-personalized eligibility footer.
    expect(screen.getByText(/Robert remains eligible on all financial criteria/)).toBeInTheDocument();
    expect(screen.queryByText('Action Required')).not.toBeInTheDocument();
  });

  it('renders the confirmed card (packet contents + DDS response) once DDS confirms', () => {
    renderPanel({ ddsReferralSent: true, ddsConfirmed: true });
    expect(screen.getByText('✓ Disability Confirmed by DDS')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(DDS_DETERMINATION_REF)).toBeInTheDocument();
    // Packet contents persist on the confirmed card.
    expect(screen.getByText('Referral packet contents')).toBeInTheDocument();
    expect(screen.queryByText('✓ DDS Referral Packet Prepared')).not.toBeInTheDocument();
  });
});
