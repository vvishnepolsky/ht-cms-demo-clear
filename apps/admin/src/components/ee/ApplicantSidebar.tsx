import {
  coverageEndDate,
  retroactiveWindow,
  toIsoDate,
  DEFAULT_CERTIFICATION_MONTHS,
  RETROACTIVE_COVERAGE_MONTHS,
} from '@ht/coverage-dates';
import { cn, fmtDate, formatCategory, caseDisplayNumber, toCalendarDate } from '../../lib/utils';
import { isIdentityVerified, UNKNOWN_APPLICANT, type EECase } from '../../types/ee';
import { SensitiveValue } from './SensitiveValue';
import { ClearVerifiedChip } from './ClearVerifiedChip';

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Coverage-date Date → ISO YYYY-MM-DD string (or null) for the display rows.
// All coverage-date math lives in @ht/coverage-dates (ENG-1820) so the sidebar,
// the member cards, the generated PDF, and the seed data never drift apart.
function isoOrNull(d: Date | null): string | null {
  return d ? toIsoDate(d) : null;
}

interface SidebarRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
  labelClass?: string;
  valueClass?: string;
}

function Row({ label, value, mono, bold, labelClass, valueClass }: SidebarRowProps) {
  const displayValue = value === null || value === undefined || value === '' ? '—' : value;
  return (
    <>
      <div className={cn('text-[11px] font-medium uppercase tracking-wider text-muted-foreground pt-0.5', labelClass)}>
        {label}
      </div>
      <div
        className={cn(
          'text-[13px] text-foreground leading-snug',
          mono && 'font-mono',
          bold && 'font-semibold',
          valueClass,
        )}
      >
        {displayValue}
      </div>
    </>
  );
}

export interface ApplicantSidebarProps {
  eeCase: EECase;
  applicantName: string;
}

export function ApplicantSidebar({ eeCase, applicantName }: ApplicantSidebarProps) {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const dm = (intake.displayMeta ?? {}) as Record<string, unknown>;
  const members = (intake.householdMembers ?? []) as Array<Record<string, unknown>>;
  const headMember = members[0];

  const iv = eeCase.identityVerification ?? null;
  const clearVerified = isIdentityVerified(iv);
  // Name: the caller's resolved name, falling back to what CLEAR verified when
  // the determinations / intake carry no name yet.
  const displayName =
    applicantName && applicantName !== UNKNOWN_APPLICANT ? applicantName : (iv?.subjectName ?? applicantName);
  const ivDoc = iv?.traits?.document ?? null;
  const dob =
    typeof headMember?.dateOfBirth === 'string'
      ? headMember.dateOfBirth
      : clearVerified && ivDoc?.date_of_birth
        ? ivDoc.date_of_birth
        : null;
  const age = calcAge(dob);
  const dobDisplay = dob ? `${fmtDate(dob)}${age !== null ? ` (Age ${age})` : ''}` : null;

  const county = typeof intake.county === 'string' ? intake.county : null;
  const householdSize = typeof intake.householdSize === 'number' ? intake.householdSize : null;
  const applicationDate = typeof intake.applicationDate === 'string' ? intake.applicationDate : null;

  const mcNumber = typeof dm.mcNumber === 'string' ? dm.mcNumber : null;
  const daysRemaining = typeof dm.daysRemaining === 'number' ? dm.daysRemaining : null;
  // Prefer the full unmasked seed value (so SensitiveValue can reveal it on
  // the eye toggle). Legacy `ssnMasked` entries can't be revealed — keep
  // them as a fallback display-only path. When neither is present the SSN row
  // falls through to its DASH sentinel — matching the Application Data tab
  // (derive-case-detail), which no longer synthesizes a demo SSN.
  const ssnFull = typeof dm.ssn === 'string' ? dm.ssn : null;
  const ssnLegacyMasked = typeof dm.ssnMasked === 'string' ? dm.ssnMasked : null;
  const ssnReveal: string | null = ssnFull;
  const phoneNumber = typeof dm.phoneNumber === 'string' ? dm.phoneNumber : null;
  const preferredContact = typeof dm.preferredContact === 'string' ? dm.preferredContact : null;
  // Identity-service federation returns null for seeded personIds, so fall
  // back to displayMeta.preferredLanguage when PersonRecord lacks it.
  const personLanguage =
    eeCase.determinations[0]?.person?.preferredLanguage ??
    (typeof dm.preferredLanguage === 'string' ? dm.preferredLanguage : null);
  const assignedTo = typeof dm.assignedTo === 'string' ? dm.assignedTo : null;
  const deliverySystem = typeof dm.deliverySystem === 'string' ? dm.deliverySystem : null;

  const isNonMagi = eeCase.determinations.some((d) => d.category === 'NON_MAGI');
  const programLabel = isNonMagi ? 'Non-MAGI Medicaid — ABD' : 'State Medicaid (MAGI)';

  const caseTypeLabel =
    eeCase.caseType === 'INITIAL'
      ? 'Application'
      : eeCase.caseType === 'RENEWAL'
        ? 'Renewal'
        : eeCase.caseType === 'REDETERMINATION'
          ? 'Redetermination'
          : eeCase.caseType;

  // ENG-1912: prefer the citizen-facing case number persisted on displayMeta so
  // the sidebar matches what the citizen saw and what the Application Data tab
  // shows. Shared resolution lives in caseDisplayNumber().
  const caseId = caseDisplayNumber(eeCase);
  const householdLabel = householdSize !== null ? String(householdSize) : null;

  const actionByLabel = (() => {
    if (daysRemaining === null) return null;
    if (daysRemaining <= 0) return 'Past due';
    return `${daysRemaining} days remaining`;
  })();
  const actionByTone =
    daysRemaining === null
      ? 'text-foreground'
      : daysRemaining <= 3
        ? 'text-red-600 font-medium'
        : daysRemaining <= 7
          ? 'text-amber-600 font-medium'
          : 'text-foreground';

  // Coverage block — surfaces only on approved cases. Effective date comes
  // from the latest determination; retro is filed - 3 months; coverage end
  // is effective + 12 months. Storyboard pulls the same values from a hard-
  // coded per-case map; here we derive them so any approved case shows them.
  const isApproved = eeCase.status === 'APPROVED';
  const latestDetermination = isApproved
    ? (eeCase.determinations
        .filter((d) => d.effectiveDate != null)
        .sort((a, b) => new Date(b.effectiveDate!).getTime() - new Date(a.effectiveDate!).getTime())[0] ??
      eeCase.determinations[0])
    : null;
  // toCalendarDate (ENG-1978): determination dates are midnight-UTC DateTime
  // values; normalize to a calendar date so fmtDate doesn't render the prior day.
  const effectiveIso = toCalendarDate(latestDetermination?.effectiveDate) ?? null;
  // ENG-1820: retroactive coverage reaches back to the first of the earliest of
  // the three months before the application month; coverage ends at end of
  // month after a 12-month certification. Shared logic in @ht/coverage-dates.
  const retro = retroactiveWindow(applicationDate ?? effectiveIso);
  const retroIso = retro ? toIsoDate(retro.start) : null;
  const coverageEndsIso =
    toCalendarDate(latestDetermination?.expirationDate) ?? isoOrNull(coverageEndDate(effectiveIso));

  return (
    <aside className="w-[280px] shrink-0 border-r border-border bg-card self-stretch">
      {/* Person block */}
      <div className="px-4 py-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 border-b border-border items-start">
        <Row
          label="Name"
          value={
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span>{displayName || '—'}</span>
              {clearVerified && <ClearVerifiedChip />}
            </span>
          }
          bold
        />
        <Row label="DOB" value={dobDisplay} />
        <Row
          label="SSN"
          value={ssnReveal ? <SensitiveValue value={ssnReveal} type="ssn" /> : ssnLegacyMasked}
          mono={!ssnReveal}
        />
        {mcNumber && <Row label="MCID" value={mcNumber} mono />}
        <Row label="Phone" value={phoneNumber ?? (clearVerified ? iv?.traits?.phone ?? null : null)} />
        <Row label="County" value={county} />
        <Row label="Contact" value={preferredContact} />
        <Row label="Language" value={personLanguage} />
        <Row label="Household" value={householdLabel} />
      </div>

      {/* Case block */}
      <div
        className={cn(
          'px-4 py-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 items-start',
          isApproved && 'border-b border-border',
        )}
      >
        <Row label="Case ID" value={caseId} mono />
        <Row label="Type" value={caseTypeLabel} />
        <Row label="Program" value={programLabel} />
        {applicationDate && <Row label="Filed" value={fmtDate(applicationDate)} />}
        {actionByLabel && <Row label="Action by" value={actionByLabel} valueClass={actionByTone} />}
        <Row label="Worker" value={assignedTo} />
      </div>

      {/* Coverage block — surfaces only on approved cases. Reuses the same
          Row component as the Person + Case blocks; the green-tinted label
          color is applied via the labelClass override and Tailwind's
          later-class-wins source order on text-color utilities. */}
      {isApproved && effectiveIso && (
        <div className="bg-green-50 px-4 py-3 border-b border-green-200">
          <div className="flex items-center gap-1.5 mb-2">
            <span
              aria-hidden="true"
              className="w-4 h-4 rounded-full bg-green-600 text-white flex items-center justify-center text-[9px] font-bold"
            >
              ✓
            </span>
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Coverage Active</p>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 items-start">
            <Row
              label="Effective"
              value={fmtDate(effectiveIso)}
              labelClass="text-green-700/80"
              valueClass="font-semibold"
            />
            {retroIso && retroIso !== effectiveIso && (
              <>
                <Row
                  label="Retroactive"
                  value={fmtDate(retroIso)}
                  labelClass="text-green-700/80"
                  valueClass="font-semibold"
                />
                <div className="col-span-2 text-[11px] text-green-700 leading-snug">
                  Retroactive coverage available for unpaid medical bills back {RETROACTIVE_COVERAGE_MONTHS} months.
                </div>
              </>
            )}
            {coverageEndsIso && (
              <Row
                label="Coverage ends"
                value={`${fmtDate(coverageEndsIso)} (${DEFAULT_CERTIFICATION_MONTHS} mo)`}
                labelClass="text-green-700/80"
              />
            )}
            {mcNumber && <Row label="Medicaid ID" value={mcNumber} mono labelClass="text-green-700/80" />}
            {deliverySystem && <Row label="Delivery" value={deliverySystem} labelClass="text-green-700/80" />}
          </div>
        </div>
      )}

      {/* Members block — shown when there are multiple determinations */}
      {eeCase.determinations.length > 1 && (
        <div className="px-4 py-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 border-t border-border items-start">
          <div className="col-span-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Members
          </div>
          {eeCase.determinations.map((d) => {
            // Prefer the federated PersonRecord; fall back to the intake
            // householdMembers row matched by personId (ENG-1973). Identity
            // federation returns null person for these personIds on dev (and for
            // any un-hydrated case), so without this fallback every member
            // rendered "—". Mirrors MemberCards.intakeMemberByPersonId — the
            // names already live on the case's intakeData.
            const intakeMatch = members.find((m) => m.personId === d.personId);
            const firstName =
              d.person?.firstName ?? (typeof intakeMatch?.firstName === 'string' ? intakeMatch.firstName : undefined);
            const lastName =
              d.person?.lastName ?? (typeof intakeMatch?.lastName === 'string' ? intakeMatch.lastName : undefined);
            const name = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '—';
            const statusCls =
              d.status === 'ELIGIBLE'
                ? 'text-green-700'
                : d.status === 'DEFERRED'
                  ? 'text-gray-500'
                  : d.status === 'INELIGIBLE'
                    ? 'text-red-600'
                    : 'text-amber-600';
            return (
              <div key={d.id} className="contents">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground pt-0.5">
                  {name.split(' ')[0]}
                </div>
                <div className={cn('text-[10px] font-semibold leading-snug pt-0.5', statusCls)}>
                  {d.status} · {formatCategory(d.category)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
