/**
 * ExParteVerifyPanel — Step 1 (Verify) content for an ex-parte renewal-fallout
 * case (archetype: Diane M. Caldwell).
 *
 * Renders the ex-parte renewal narrative the prototype shows on the Verify tab:
 *   · "Ex-Parte Renewal Attempt" intro (result: not possible — income unverified)
 *   · Ex-Parte Renewal — Data Source Results (SSA / FDSH-IRS / SWICA / Argyle)
 *   · Reasonable Compatibility Evaluation (FAIL)
 *   · Pre-Populated Renewal Form (Form A-5170) with a "preview as sent" action
 *   · Multi-Channel Delivery Status (each row previews what the member received)
 *   · Response Window countdown
 *
 * Extracted from RenewalPage so the generic WorkspacePage and the dedicated
 * RenewalPage render the exact same panel (single source of truth). The panel
 * is self-contained: it owns the FormPreviewModal + DeliveryPreviewModal state
 * so callers only need to drop in `<ExParteVerifyPanel />` — no modal wiring.
 *
 * All copy/data come from `data/renewals.ts`, anchored to DEMO_TODAY.
 */

import { useState } from 'react';
import { Check, AlertTriangle, XCircle, Circle, FileText, Mail, MessageSquare, Smartphone, Info } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '../../ui';
import { FormPreviewModal } from '../FormPreviewModal';
import { DeliveryPreviewModal, type PreviewingChannel } from '../drawer/MessagePreviewModal';
import {
  DATA_SOURCES,
  DELIVERY_ROWS,
  REASONABLE_COMPATIBILITY,
  RENEWAL_MEMBER,
  FORM_SENT_DISPLAY,
  RESPONSE_DUE_DISPLAY,
  COVERAGE_ENDS_DISPLAY,
  DAYS_REMAINING,
  RESPONSE_WINDOW_DAYS,
  type DataSource,
  type DeliveryChannelKind,
} from '../../../data/renewals';
import { ArgyleMark } from './ArgyleMark';

export function ExParteVerifyPanel() {
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [previewingChannel, setPreviewingChannel] = useState<PreviewingChannel | null>(null);

  const progressPct = Math.round(((RESPONSE_WINDOW_DAYS - DAYS_REMAINING) / RESPONSE_WINDOW_DAYS) * 100);

  return (
    <>
      <div className="space-y-6">
        {/* Ex-parte attempt intro */}
        <Card>
          <CardContent className="px-5 py-4 flex items-start gap-3 bg-sky-50/40">
            <Info aria-hidden="true" className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-sky-900 mb-1">Ex-Parte Renewal Attempt</p>
              <p className="text-xs text-sky-900/80 leading-relaxed">
                Triggered automatically 90 days before certification expiration. The system queried available electronic
                data sources to verify current eligibility without member contact.
                <span className="block mt-1.5 font-semibold">
                  Result: Ex-parte not possible — income unable to verify.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data sources */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Ex-Parte Renewal — Data Source Results
          </p>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              <span className="col-span-3">Source</span>
              <span className="col-span-5">Query</span>
              <span className="col-span-2">Last Queried</span>
              <span className="col-span-2 text-right">Result</span>
            </div>
            {DATA_SOURCES.map((s, i) => (
              <DataSourceRow key={i} source={s} />
            ))}
          </Card>
        </div>

        {/* Reasonable compatibility */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Reasonable Compatibility Evaluation
          </p>
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-2">
                <XCircle aria-hidden="true" className="w-4 h-4 text-red-600" /> Reasonable Compatibility Test
              </p>
              <Badge variant="destructive" size="sm">
                FAIL
              </Badge>
            </div>
            <div className="px-4 py-3 text-xs space-y-1.5">
              {REASONABLE_COMPATIBILITY.map((row) => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {row.brand === 'argyle' ? <ArgyleMark size={12} /> : row.label}
                  </span>
                  <span className={row.tone === 'warn' ? 'text-amber-700 font-semibold' : ''}>
                    {row.value}
                    {row.note && <span className="text-muted-foreground"> · {row.note}</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 bg-muted/30 border-t">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Available data is missing or inconsistent with current income. Ex-parte renewal cannot be completed.
                Case routed to pre-populated form workflow.
              </p>
            </div>
          </Card>
        </div>

        {/* Pre-populated renewal form */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Pre-Populated Renewal Form
          </p>
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText aria-hidden="true" className="w-4 h-4 text-sky-600" />
                <p className="text-sm font-semibold">Form A-5170 — Pre-Populated Renewal</p>
              </div>
              <Badge variant="secondary" size="sm">
                Auto-generated
              </Badge>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-b">
              <div>
                <span className="text-muted-foreground">Generated: </span>
                <span>{FORM_SENT_DISPLAY}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Response deadline: </span>
                <span className="font-semibold">
                  {RESPONSE_DUE_DISPLAY} ({RESPONSE_WINDOW_DAYS} days)
                </span>
              </div>
            </div>
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Pre-filled data (from verified sources)
              </p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> Name: {RENEWAL_MEMBER.name}
                </li>
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> SSN: {RENEWAL_MEMBER.ssnMasked}
                </li>
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> Address:{' '}
                  {RENEWAL_MEMBER.address}
                </li>
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> Current category:{' '}
                  {RENEWAL_MEMBER.category}
                </li>
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> Household:{' '}
                  {RENEWAL_MEMBER.householdSize}
                </li>
                <li className="flex items-center gap-2">
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" /> Last reported income:{' '}
                  {RENEWAL_MEMBER.lastReportedIncome} ({RENEWAL_MEMBER.lastEmployer})
                </li>
              </ul>
            </div>
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Beneficiary action required
              </p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border inline-block" /> Confirm or update current employment
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border inline-block" /> Confirm or update current monthly income
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border inline-block" /> Provide income documentation (pay stubs,
                  W-2, or employer letter)
                </li>
              </ul>
            </div>
            <div className="px-4 py-3 bg-muted/30 flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={() => setFormPreviewOpen(true)}>
                Preview form as sent →
              </Button>
            </div>
          </Card>
        </div>

        {/* Multi-channel delivery */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Multi-Channel Delivery Status
          </p>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              <span className="col-span-5">Channel</span>
              <span className="col-span-4">Status</span>
              <span className="col-span-3 text-right">Timestamp</span>
            </div>
            {DELIVERY_ROWS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setPreviewingChannel({
                    kind: d.kind,
                    ch: d.channel,
                    ts: d.timestamp,
                    to: RENEWAL_MEMBER.name,
                    subject: 'Renewal of Medicaid Coverage — Form A-5170',
                    body: `Dear ${RENEWAL_MEMBER.name},\n\nYour Medicaid renewal form (A-5170) has been sent. Please complete and return it by ${RESPONSE_DUE_DISPLAY}.\n\nMCID: ${RENEWAL_MEMBER.medicaidId}`,
                  })
                }
                className="grid grid-cols-12 items-center px-4 py-3 border-b last:border-0 gap-2 w-full text-left hover:bg-muted/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--iris-9)]"
                aria-label={`Preview ${d.channel} delivery`}
              >
                <div className="col-span-5 flex items-center gap-2">
                  <DeliveryIcon kind={d.kind} />
                  <p className="text-xs font-semibold">{d.channel}</p>
                </div>
                <p className="col-span-4 text-xs text-muted-foreground">{d.status}</p>
                <p className="col-span-3 text-xs text-muted-foreground text-right">{d.timestamp}</p>
              </button>
            ))}
          </Card>
        </div>

        {/* Response window */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Response Window</p>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                <div>
                  <p className="text-muted-foreground mb-0.5">Form sent</p>
                  <p className="font-semibold">{FORM_SENT_DISPLAY}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Response due</p>
                  <p className="font-semibold">{RESPONSE_DUE_DISPLAY}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Days remaining</p>
                  <p className="font-semibold text-amber-700">
                    {DAYS_REMAINING} of {RESPONSE_WINDOW_DAYS}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="leading-relaxed">
                  <span className="font-semibold text-foreground">If the beneficiary responds:</span> system processes
                  updated info and re-runs eligibility determination.
                </p>
                <p className="leading-relaxed">
                  <span className="font-semibold text-foreground">If no response by {RESPONSE_DUE_DISPLAY}:</span>{' '}
                  system generates advance notice of termination (10-day advance notice required before any coverage
                  reduction or termination, effective {COVERAGE_ENDS_DISPLAY}).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FormPreviewModal
        open={formPreviewOpen}
        onClose={() => setFormPreviewOpen(false)}
        applicantName={RENEWAL_MEMBER.name}
        mcNumber={RENEWAL_MEMBER.medicaidId}
      />

      {previewingChannel && (
        <DeliveryPreviewModal channel={previewingChannel} onClose={() => setPreviewingChannel(null)} />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Data-source row + tone/delivery icon helpers
// ────────────────────────────────────────────────────────────────────────

function DataSourceRow({ source }: { source: DataSource }) {
  const detailToneClass = source.tone === 'warn' || source.tone === 'fail' ? 'text-amber-700' : 'text-muted-foreground';
  return (
    <div className="px-4 py-3 border-b last:border-0">
      <div className="grid grid-cols-12 gap-2 items-start">
        <div className="col-span-3 flex items-start gap-2">
          <ToneIcon tone={source.tone} />
          <div>
            {source.brand === 'argyle' ? (
              <ArgyleMark size={13} />
            ) : (
              <p className="text-xs font-semibold">{source.src}</p>
            )}
            <p className="text-xs text-muted-foreground leading-snug">{source.full}</p>
          </div>
        </div>
        <span className="col-span-5 text-xs text-muted-foreground">{source.query}</span>
        <span className="col-span-2 text-xs text-muted-foreground">{FORM_SENT_DISPLAY}</span>
        <div className="col-span-2 flex justify-end">
          <Badge
            variant={source.tone === 'pass' ? 'secondary' : source.tone === 'warn' ? 'outline' : 'destructive'}
            size="sm"
          >
            {source.result}
          </Badge>
        </div>
      </div>
      <p className={`text-xs mt-1.5 ml-7 leading-relaxed ${detailToneClass}`}>{source.detail}</p>
    </div>
  );
}

// Decorative — the result tone is conveyed by the adjacent Badge text
// ("MATCHED" / "STALE" / "INCOMPLETE" / "NO MATCH"), so the glyph is hidden
// from assistive tech (a11y-frontend.md rule 3).
function ToneIcon({ tone }: { tone: DataSource['tone'] }) {
  const base = 'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0';
  if (tone === 'pass') {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        <Check aria-hidden="true" className="w-3 h-3" />
      </span>
    );
  }
  if (tone === 'warn') {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        <AlertTriangle aria-hidden="true" className="w-3 h-3" />
      </span>
    );
  }
  if (tone === 'fail') {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>
        <XCircle aria-hidden="true" className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span className={`${base} bg-muted text-muted-foreground`}>
      <Circle aria-hidden="true" className="w-3 h-3" />
    </span>
  );
}

// Decorative — rendered inside a button whose aria-label already names the
// channel ("Preview <channel> delivery"), so the icon is hidden from AT.
function DeliveryIcon({ kind }: { kind: DeliveryChannelKind }) {
  const cls = 'w-4 h-4 text-muted-foreground';
  if (kind === 'mail') return <Mail aria-hidden="true" className={cls} />;
  if (kind === 'portal') return <FileText aria-hidden="true" className={cls} />;
  if (kind === 'sms') return <Smartphone aria-hidden="true" className={cls} />;
  if (kind === 'email') return <MessageSquare aria-hidden="true" className={cls} />;
  return <Circle aria-hidden="true" className={cls} />;
}
