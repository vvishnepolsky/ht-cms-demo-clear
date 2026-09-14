/**
 * AssetTestSummary — opens the Evaluate phase with a quick read of the asset/
 * resource test status. Mirrors the storyboard's DynamicAssetsPanel framing
 * for MAGI cases (asset test not required) and the AssetsPanel framing for
 * Non-MAGI (resource limit enforced). Title + body use the Civic accent
 * (indigo on the CMS demo theme) so the card reads as informational, not neutral.
 */

import { Check } from 'lucide-react';

export interface AssetTestSummaryProps {
  pathway: 'MAGI' | 'NON_MAGI';
}

const ACCENT_TEXT = 'var(--civic-accent-text)';
const ACCENT_BG = 'var(--civic-accent-bg)';

export function AssetTestSummary({ pathway }: AssetTestSummaryProps) {
  if (pathway === 'MAGI') {
    const facts: ReadonlyArray<[string, string]> = [
      ['Asset Test', 'N/A — MAGI pathway'],
      ['AVS Request', 'Not submitted — not required'],
      ['Resource Limit', 'No resource limit under MAGI rules'],
      ['LTC Look-Back (60 mo)', 'N/A — not a long-term care case'],
    ];
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-5 flex items-start gap-4 shadow-sm">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: ACCENT_BG }}
          >
            <Check className="w-4 h-4" style={{ color: ACCENT_TEXT }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: ACCENT_TEXT }}>
              Asset Test Not Required — MAGI Case
            </p>
            <p className="text-xs leading-relaxed" style={{ color: ACCENT_TEXT }}>
              This case is being evaluated under MAGI income rules. Asset verification (AVS) and countable resource
              tests are only required for Non-MAGI pathways.
            </p>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border shadow-sm divide-y divide-border">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Non-MAGI ABD — Asset test required; AVS verified for demo cases (ENG-1871).
  const facts: ReadonlyArray<[string, string]> = [
    ['Asset Test', 'Required — countable resources vs. ABD limit'],
    ['AVS Request', 'Verified — Asset Verification System (FIS)'],
    ['Resource Limit', '$2,000 individual / $3,000 couple (ABD)'],
    ['LTC Look-Back (60 mo)', 'Applied only if LTC requested'],
  ];
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-5 flex items-start gap-4 shadow-sm">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: ACCENT_BG }}
        >
          <Check className="w-4 h-4" style={{ color: ACCENT_TEXT }} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: ACCENT_TEXT }}>
            Asset Test Verified — Non-MAGI ABD
          </p>
          <p className="text-xs leading-relaxed" style={{ color: ACCENT_TEXT }}>
            Non-MAGI ABD pathway requires the countable-resource test. Asset Verification System (AVS) confirmed
            countable resources within the ABD limit; results feed the ABD evaluation panel below.
          </p>
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border shadow-sm divide-y divide-border">
        {facts.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
