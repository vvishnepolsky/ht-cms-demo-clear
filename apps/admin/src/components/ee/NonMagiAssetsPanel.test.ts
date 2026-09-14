import { describe, it, expect, vi } from 'vitest';
import {
  resolveAssetStatus,
  buildSavingsRows,
  resolveSavingsRows,
  readCountableResources,
  executeAssetVerificationFlow,
  SANDBOX_INSTITUTION_NAME,
  SANDBOX_LAST_FOUR,
} from './NonMagiAssetsPanel';
import type { AssetVerification, EECase } from '../../types/ee';

// A genuinely AVS-verified account with a balance that is NOT the citizen-entered
// figure — used to prove which value wins.
const AVS_VERIFIED_BALANCE = 1_800;

const VERIFIED_AV: AssetVerification = {
  status: 'VERIFIED',
  totalAssets: AVS_VERIFIED_BALANCE,
  accounts: [{ institutionName: SANDBOX_INSTITUTION_NAME, accountType: 'savings', balance: AVS_VERIFIED_BALANCE }],
  verifiedAt: '2026-05-01T00:00:00Z',
};

const PENDING_AV: AssetVerification = {
  status: 'PENDING',
  totalAssets: null,
  accounts: [],
  verifiedAt: null,
};

describe('resolveAssetStatus', () => {
  it('returns verified when sandbox is true', () => {
    expect(resolveAssetStatus(null, true)).toBe('verified');
    expect(resolveAssetStatus(PENDING_AV, true)).toBe('verified');
  });

  it('returns not_started when assetVerification is null and sandbox is false', () => {
    expect(resolveAssetStatus(null, false)).toBe('not_started');
  });

  it('returns pending for PENDING status', () => {
    expect(resolveAssetStatus(PENDING_AV, false)).toBe('pending');
  });

  it('returns verified for VERIFIED status', () => {
    expect(resolveAssetStatus(VERIFIED_AV, false)).toBe('verified');
  });

  it('returns failed for FAILED status', () => {
    expect(resolveAssetStatus({ ...VERIFIED_AV, status: 'FAILED' }, false)).toBe('failed');
  });
});

describe('buildSavingsRows', () => {
  it('returns empty array when assetVerification is null — no real verified data (ENG-1914)', () => {
    // ENG-1914: removed the fabricated $1,800 sandbox AVS row (and the now-dead
    // sandbox flag). Sandbox/demo cases have no real AVS accounts, so
    // buildSavingsRows returns nothing and the displayed row is synthesised from
    // the citizen-entered value in resolveSavingsRows.
    expect(buildSavingsRows(null)).toHaveLength(0);
  });

  it('returns empty array when status is PENDING', () => {
    expect(buildSavingsRows(PENDING_AV)).toHaveLength(0);
  });

  it('maps real accounts when VERIFIED', () => {
    const rows = buildSavingsRows(VERIFIED_AV);
    expect(rows).toHaveLength(1);
    expect(rows[0].institutionName).toBe(SANDBOX_INSTITUTION_NAME);
    expect(rows[0].balance).toBe(AVS_VERIFIED_BALANCE);
    expect(rows[0].lastFour).toBeNull();
  });

  it('returns empty array when status is FAILED', () => {
    expect(buildSavingsRows({ ...VERIFIED_AV, status: 'FAILED' })).toHaveLength(0);
  });
});

describe('resolveSavingsRows — citizen-entered value is the source of truth (ENG-1914)', () => {
  it('synthesises a single account whose balance equals the citizen-entered countable when no real AVS', () => {
    const rows = resolveSavingsRows(null, false, 1_500);
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(1_500);
    expect(rows[0].institutionName).toBe(SANDBOX_INSTITUTION_NAME);
    expect(rows[0].lastFour).toBe(SANDBOX_LAST_FOUR);
  });

  it('synthesises from the citizen-entered countable for a PENDING AV (no verified accounts yet)', () => {
    const rows = resolveSavingsRows(PENDING_AV, false, 980);
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(980);
  });

  it('does NOT inject the old $1,800 stub under sandbox mode — uses the citizen-entered countable', () => {
    // ENG-1914 regression guard: the demo previously showed a fabricated $1,800
    // AVS balance regardless of what the applicant entered. The citizen value wins.
    const rows = resolveSavingsRows(null, true, 1_500);
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(1_500);
    expect(rows[0].balance).not.toBe(1_800);
  });

  it('TEMPORARY: real verified AVS accounts currently win over the citizen value (to be the long-term behaviour)', () => {
    // Once real AVS federation is wired, the AVS-returned balance is intended to
    // be the source of truth. Today only genuinely VERIFIED accounts take precedence.
    const rows = resolveSavingsRows(VERIFIED_AV, false, 1_500);
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(AVS_VERIFIED_BALANCE);
    expect(rows[0].balance).not.toBe(1_500);
  });
});

describe('readCountableResources — applicant attestation is the source of truth (ENG-1914)', () => {
  function caseWithResources(resources: Record<string, unknown>): EECase {
    return {
      intakeData: { householdMembers: [{ nonMagiResources: resources }] },
    } as unknown as EECase;
  }

  it('sums the citizen-entered countable resources from intake (e.g. $1,500), not a $1,800 stub', () => {
    const eeCase = caseWithResources({ hasSavings: true, savingsAmount: '$1,500' });
    expect(readCountableResources(eeCase)).toBe(1_500);
  });

  it('ignores an AVS-returned totalAssets that disagrees with the applicant attestation', () => {
    // Robert Mitchell bug bash (6/1): AVS returned $1,800 but the applicant entered $1,500.
    const eeCase = caseWithResources({ hasChecking: true, checkingAmount: '$1,500' });
    (eeCase as unknown as { assetVerification: AssetVerification }).assetVerification = VERIFIED_AV; // totalAssets $1,800
    expect(readCountableResources(eeCase)).toBe(1_500);
  });

  it('excludes exempt resource categories from the countable total', () => {
    const eeCase = caseWithResources({
      hasSavings: true,
      savingsAmount: '$1,000',
      hasBurialPlot: true,
      burialPlotValue: '$5,000',
    });
    expect(readCountableResources(eeCase)).toBe(1_000);
  });

  it('returns 0 when the applicant entered no resources — no fabricated default', () => {
    expect(readCountableResources(caseWithResources({}))).toBe(0);
  });

  it('sums countable resources additively across multiple household members, applying each member exemption independently', () => {
    // Member 1: $1,500 countable savings + $5,000 EXEMPT burial plot.
    // Member 2: $800 countable cash + $3,000 EXEMPT burial plot.
    // Expected total = 1,500 + 800 = 2,300; both burial plots excluded per-member.
    const eeCase = {
      intakeData: {
        householdMembers: [
          {
            nonMagiResources: {
              hasSavings: true,
              savingsAmount: '$1,500',
              hasBurialPlot: true,
              burialPlotValue: '$5,000',
            },
          },
          { nonMagiResources: { hasCash: true, cashAmount: '$800', hasBurialPlot: true, burialPlotValue: '$3,000' } },
        ],
      },
    } as unknown as EECase;
    expect(readCountableResources(eeCase)).toBe(2_300);
  });
});

describe('executeAssetVerificationFlow', () => {
  it('calls getBankingConnectUrl then requestAssetVerification when no domain errors', async () => {
    const getBankingConnectUrl = vi.fn().mockResolvedValue({ data: { getArgyleBankingConnectUrl: { errors: [] } } });
    const requestAssetVerification = vi.fn().mockResolvedValue(undefined);
    const onDomainError = vi.fn();

    await executeAssetVerificationFlow('case-1', getBankingConnectUrl, requestAssetVerification, onDomainError);

    expect(getBankingConnectUrl).toHaveBeenCalledWith({ variables: { input: { caseId: 'case-1' } } });
    expect(requestAssetVerification).toHaveBeenCalledWith({ variables: { input: { caseId: 'case-1' } } });
    expect(onDomainError).not.toHaveBeenCalled();
  });

  it('calls onDomainError and aborts when getBankingConnectUrl returns domain errors', async () => {
    const getBankingConnectUrl = vi
      .fn()
      .mockResolvedValue({ data: { getArgyleBankingConnectUrl: { errors: [{ code: 'NOT_FOUND' }] } } });
    const requestAssetVerification = vi.fn();
    const onDomainError = vi.fn();

    await executeAssetVerificationFlow('case-1', getBankingConnectUrl, requestAssetVerification, onDomainError);

    expect(onDomainError).toHaveBeenCalled();
    expect(requestAssetVerification).not.toHaveBeenCalled();
  });

  it('calls onDomainError and aborts when getBankingConnectUrl resolves with null data', async () => {
    const getBankingConnectUrl = vi.fn().mockResolvedValue({ data: null });
    const requestAssetVerification = vi.fn();
    const onDomainError = vi.fn();

    await executeAssetVerificationFlow('case-1', getBankingConnectUrl, requestAssetVerification, onDomainError);

    expect(onDomainError).toHaveBeenCalled();
    expect(requestAssetVerification).not.toHaveBeenCalled();
  });

  it('propagates rejection when requestAssetVerification throws', async () => {
    const getBankingConnectUrl = vi.fn().mockResolvedValue({ data: { getArgyleBankingConnectUrl: { errors: [] } } });
    const requestAssetVerification = vi.fn().mockRejectedValue(new Error('network error'));
    const onDomainError = vi.fn();

    await expect(
      executeAssetVerificationFlow('case-1', getBankingConnectUrl, requestAssetVerification, onDomainError),
    ).rejects.toThrow('network error');
    expect(onDomainError).not.toHaveBeenCalled();
  });
});
