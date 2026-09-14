import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { cn } from '../../lib/utils';

interface ResourceRow {
  institution: string;
  accountType: string;
  balance: string;
  limit?: string;
  result?: 'PASS' | 'FAIL' | null;
  isSummary?: boolean;
}

const AVS_ROWS: ResourceRow[] = [
  { institution: 'First State Bank', accountType: 'Checking', balance: '$423.00' },
  { institution: 'First State Bank', accountType: 'Savings', balance: '$1,327.00' },
  {
    institution: 'Total Countable Resources',
    accountType: '—',
    balance: '$1,750.00',
    limit: '$2,000.00',
    result: 'PASS',
    isSummary: true,
  },
];

interface ExemptItem {
  label: string;
  note: string;
}

const EXEMPT_ITEMS: ExemptItem[] = [
  { label: 'Principal home', note: 'Owner-occupied — exempt' },
  { label: 'One vehicle', note: 'Single vehicle allowance — exempt' },
];

export interface AbdEvaluationPanelProps {
  className?: string;
}

export function AbdEvaluationPanel({ className }: AbdEvaluationPanelProps) {
  return (
    <Card className={className}>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-0.5">Asset Verification</h3>
          <p className="text-[11px] text-muted-foreground">
            State Asset Verification System (AVS) · Queried Dec 3, 2025
          </p>
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">AVS Resource Query Results</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Institution
                </th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Type
                </th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  Balance
                </th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  Limit
                </th>
                <th scope="col" className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-[70px]">
                  Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {AVS_ROWS.map((row) => (
                <tr
                  key={`${row.institution}-${row.accountType}`}
                  className={cn(row.isSummary && 'bg-muted/30 font-medium')}
                >
                  <td className="px-3 py-2">{row.institution}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.accountType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.balance}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.limit ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {row.result === 'PASS' && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        PASS
                      </span>
                    )}
                    {row.result === 'FAIL' && (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
                        <XCircle className="h-3.5 w-3.5" />
                        FAIL
                      </span>
                    )}
                    {!row.result && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            SSI Income Verification
          </p>
          <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Social Security Administration · IEVS</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PASS
              </span>
            </div>
            <p className="mt-1 text-sm font-medium">$943.00 / month · SSI benefits confirmed</p>
            <p className="text-xs text-muted-foreground mt-0.5">SSI income is excluded from countable resources</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Exempt Resources</p>
          <div className="space-y-1.5">
            {EXEMPT_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground text-xs">— {item.note}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
