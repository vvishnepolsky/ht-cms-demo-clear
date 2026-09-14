/**
 * ApplicationDataTab — Layer 2 of ENG-1708.
 *
 * Storyboard parity: /Downloads/CMS Demo Storyboard/src/components/CaseDetailsDrawer.jsx
 * (search for `{tab === "application" && (`). Renders the full applicant
 * snapshot — Identity, Contact, Household, Programs, Income, Assets,
 * Disability & Medical, Existing Health Coverage, Employment, Signature &
 * Declaration — sourced from the typed CaseDetailFixture in case-details.ts.
 *
 * Why this is pure layout (no useState, no effects):
 *   The storyboard's interactive bits on this tab (SSN reveal toggle, copy
 *   button, audit log) are out of scope for the L2 layer. SSN is rendered
 *   masked (***-**-####) for the demo; a follow-up can graft a real
 *   SensitiveValue widget on top without rewriting the layout. Keeping the
 *   tab presentational also keeps the diff readable and conflict-free with
 *   L3-L5.
 *
 * Civic tokens for all color; Tailwind utilities for layout. No raw
 * useEffect (none needed).
 */

import type { LucideIcon } from 'lucide-react';
import { Check, Minus } from 'lucide-react';
import type {
  AssetsSection,
  ContactSection,
  CoverageSection,
  DisabilitySection,
  EmploymentSection,
  HouseholdSection,
  IdentitySection,
  IncomeSection,
  ProgramRow,
  SignatureSection,
} from '../../../../data/case-details';
import type { DrawerTabProps } from '../types';
import { ArgyleMark, ARGYLE_BRAND } from '../../renewal/ArgyleMark';
import { DrawerEmptyState } from '../DrawerEmptyState';

/**
 * Token aliases. Each color token is read 3+ times on this page; pulling
 * them to consts also documents intent — e.g. `LABEL_COLOR` reads better
 * than the raw `var(--civic-text-placeholder)` at the call site. Per the
 * C.1 magic-literal extraction discipline.
 */
const LABEL_COLOR = 'var(--civic-text-placeholder)';
const VALUE_COLOR = 'var(--civic-text-primary)';
const MUTED_COLOR = 'var(--civic-text-secondary)';
const CARD_BG = 'var(--civic-bg-card)';
const TABLE_HEADER_BG = 'var(--civic-bg-app)';
const BORDER_SUBTLE = 'var(--civic-border-subtle)';
const BORDER_COMPONENT = 'var(--civic-border-component)';
const WARN_TEXT = 'var(--civic-warning-text)';

/**
 * Mask an SSN to its last-four-only display form. The storyboard ships a
 * full SensitiveValue widget (reveal + copy + audit-log via window globals);
 * L2 inlines the masked form only — reveal/copy is out of scope and can be
 * added in a follow-up without touching this file's layout.
 */
function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length < 4) return '***-**-****';
  return `***-**-${digits.slice(-4)}`;
}

export function ApplicationDataTab({ caseRow, details, hasRealDetails = true }: DrawerTabProps) {
  if (!hasRealDetails) {
    return <DrawerEmptyState label="Application data" caseRow={caseRow} />;
  }
  const { identity, contact, household, programs, income, assets, disability, coverage, employment, signature } =
    details;

  return (
    <div className="space-y-4">
      {/* Identity + Contact */}
      <div className="grid grid-cols-2 gap-4">
        <IdentityCard data={identity} />
        <ContactCard data={contact} />
      </div>

      {/* Household + Programs */}
      <div className="grid grid-cols-2 gap-4">
        <HouseholdCard data={household} />
        <ProgramsCard rows={programs} />
      </div>

      {/* Income table */}
      <IncomeCard data={income} />

      {/* Assets table (optional) */}
      {assets && <AssetsCard data={assets} />}

      {/* Disability + Coverage (paired only when disability claimed) */}
      {disability && (
        <div className="grid grid-cols-2 gap-4">
          <DisabilityCard data={disability} />
          <CoverageCard data={coverage} />
        </div>
      )}

      {/* Employment + Signature — always together in the last row */}
      <div className="grid grid-cols-2 gap-4">
        <EmploymentCard data={employment} />
        <SignatureCard data={signature} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card primitive (tab-local — only this tab uses this layout)        */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  icon: Icon,
  rightAside,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  rightAside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: CARD_BG, borderColor: BORDER_SUBTLE }}
    >
      <header
        className="px-4 py-2.5 border-b flex items-center justify-between gap-3"
        style={{ borderColor: BORDER_SUBTLE }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
          style={{ color: MUTED_COLOR }}
        >
          {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
          {title}
        </p>
        {rightAside && (
          <span className="text-xs" style={{ color: LABEL_COLOR }}>
            {rightAside}
          </span>
        )}
      </header>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: LABEL_COLOR }}>
        {label}
      </span>
      <span className="text-xs font-medium text-right" style={{ color: valueColor ?? VALUE_COLOR }}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section components                                                  */
/* ------------------------------------------------------------------ */

function IdentityCard({ data }: { data: IdentitySection }) {
  return (
    <SectionCard title="Identity">
      <Row label="Full Name" value={data.fullName} />
      <Row label="Date of Birth" value={data.dob} />
      <Row
        label="SSN"
        value={
          <span
            className="font-mono tabular-nums"
            aria-label={data.ssn === '—' ? 'Social Security Number, not on file' : 'Social Security Number, masked'}
          >
            {data.ssn === '—' ? '—' : maskSSN(data.ssn)}
          </span>
        }
      />
      <Row label="Gender" value={data.gender} />
      <Row label="Marital Status" value={data.maritalStatus} />
      <Row label="Citizenship" value={data.citizenship} />
      <Row label="Immigration" value={data.immigration} />
      <Row label="Race / Ethnicity" value={data.raceEthnicity} />
    </SectionCard>
  );
}

function ContactCard({ data }: { data: ContactSection }) {
  return (
    <SectionCard title="Contact Information">
      <Row label="Home Address" value={data.homeAddress} />
      <Row label="Mailing Address" value={data.mailingAddress} />
      <Row label="Phone" value={data.phone} />
      <Row label="Email" value={data.email} />
      <Row label="Preferred Contact" value={data.preferredContact} />
      <Row label="Primary Language" value={data.primaryLanguage} />
      <Row label="Interpreter Needed" value={data.interpreterNeeded} />
      <Row label="Accessibility Needs" value={data.accessibilityNeeds} />
    </SectionCard>
  );
}

function HouseholdCard({ data }: { data: HouseholdSection }) {
  const title = `Household Composition (${data.count} member${data.count === 1 ? '' : 's'})`;
  return (
    <SectionCard title={title}>
      <div className="-mx-4 -mt-1">
        <div
          className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wide border-y"
          style={{
            backgroundColor: TABLE_HEADER_BG,
            color: MUTED_COLOR,
            borderColor: BORDER_SUBTLE,
          }}
        >
          <span className="col-span-5">Name</span>
          <span className="col-span-3">Relation</span>
          <span className="col-span-2 text-center">Age</span>
          <span className="col-span-2 text-right">DOB</span>
        </div>
        {data.members.map((m, i) => (
          <div
            key={`${m.name}-${i}`}
            className="grid grid-cols-12 px-4 py-3 text-xs items-center border-b last:border-0"
            style={{ borderColor: BORDER_SUBTLE }}
          >
            <span className="col-span-5 font-medium" style={{ color: VALUE_COLOR }}>
              {m.name}
            </span>
            <span className="col-span-3" style={{ color: MUTED_COLOR }}>
              {m.relation}
            </span>
            <span className="col-span-2 text-center" style={{ color: MUTED_COLOR }}>
              {m.age}
            </span>
            <span className="col-span-2 text-right" style={{ color: MUTED_COLOR }}>
              {m.dob}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs pt-1" style={{ color: LABEL_COLOR }}>
        {data.note}
      </p>
    </SectionCard>
  );
}

function ProgramsCard({ rows }: { rows: ProgramRow[] }) {
  return (
    <SectionCard title="Programs Applied For">
      {rows.map((r) => {
        // WCAG 1.4.1 — distinguish checked vs. unchecked by shape (icon),
        // not color alone. Check = applied, Minus = not applied.
        const StatusIcon = r.checked ? Check : Minus;
        return (
          <div key={r.prog} className="flex items-center gap-2.5 text-xs py-0.5">
            <span
              className="font-bold flex-shrink-0 inline-flex items-center"
              style={{ color: r.checked ? 'var(--civic-accent-text)' : LABEL_COLOR }}
              aria-hidden="true"
            >
              <StatusIcon className="w-3.5 h-3.5" />
            </span>
            <span className="font-medium w-28 flex-shrink-0" style={{ color: r.checked ? VALUE_COLOR : LABEL_COLOR }}>
              {r.prog}
            </span>
            <span style={{ color: LABEL_COLOR }}>{r.note}</span>
          </div>
        );
      })}
    </SectionCard>
  );
}

function IncomeCard({ data }: { data: IncomeSection }) {
  return (
    <section
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: CARD_BG, borderColor: BORDER_SUBTLE }}
    >
      <div className="px-4 py-2.5 border-b" style={{ borderColor: BORDER_SUBTLE }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED_COLOR }}>
          Self-Attested Income
        </p>
      </div>
      <div
        className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b"
        style={{
          backgroundColor: TABLE_HEADER_BG,
          color: MUTED_COLOR,
          borderColor: BORDER_SUBTLE,
        }}
      >
        <span className="col-span-4">Source</span>
        <span className="col-span-2">Type</span>
        <span className="col-span-2">Frequency</span>
        <span className="col-span-2 text-right">Amount</span>
        <span className="col-span-2 text-right">Monthly</span>
      </div>
      {data.rows.map((r, i) => (
        <div
          key={`${r.source}-${i}`}
          className="grid grid-cols-12 px-4 py-3 text-xs items-center border-b last:border-0"
          style={{ borderColor: BORDER_SUBTLE }}
        >
          <div className="col-span-4">
            <p className="font-medium inline-flex items-center gap-1.5 flex-wrap" style={{ color: VALUE_COLOR }}>
              {r.source}
              {r.brand === ARGYLE_BRAND && <ArgyleMark size={11} wordmark={false} />}
            </p>
            <p style={{ color: LABEL_COLOR }}>{r.sub}</p>
          </div>
          <span className="col-span-2" style={{ color: MUTED_COLOR }}>
            {r.type}
          </span>
          <span className="col-span-2" style={{ color: MUTED_COLOR }}>
            {r.freq}
          </span>
          <span className="col-span-2 text-right font-medium" style={{ color: VALUE_COLOR }}>
            {r.amount}
          </span>
          <span className="col-span-2 text-right font-semibold" style={{ color: VALUE_COLOR }}>
            {r.monthly}
          </span>
        </div>
      ))}
      <div
        className="grid grid-cols-12 px-4 py-3 text-xs border-t"
        style={{ backgroundColor: TABLE_HEADER_BG, borderColor: BORDER_SUBTLE }}
      >
        <span className="col-span-10 font-bold" style={{ color: VALUE_COLOR }}>
          Total Self-Attested Monthly
        </span>
        <span className="col-span-2 text-right font-bold" style={{ color: VALUE_COLOR }}>
          {data.total}
        </span>
      </div>
      {data.note && (
        <p className="px-4 pb-3 text-xs" style={{ color: WARN_TEXT }}>
          {data.note}
        </p>
      )}
    </section>
  );
}

function AssetsCard({ data }: { data: AssetsSection }) {
  return (
    <section
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: CARD_BG, borderColor: BORDER_SUBTLE }}
    >
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between gap-4"
        style={{ borderColor: BORDER_SUBTLE }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED_COLOR }}>
          Self-Attested Assets &amp; Resources
        </p>
        {data.note && (
          <p className="text-xs text-right" style={{ color: LABEL_COLOR }}>
            {data.note}
          </p>
        )}
      </div>
      <div
        className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b"
        style={{
          backgroundColor: TABLE_HEADER_BG,
          color: MUTED_COLOR,
          borderColor: BORDER_SUBTLE,
        }}
      >
        <span className="col-span-5">Asset</span>
        <span className="col-span-3">Institution / Notes</span>
        <span className="col-span-2 text-right">Est. Value</span>
        <span className="col-span-2 text-right">Countable?</span>
      </div>
      {data.rows.map((r, i) => (
        <div
          key={`${r.asset}-${i}`}
          className="grid grid-cols-12 px-4 py-3 text-xs items-center border-b last:border-0"
          style={{ borderColor: BORDER_SUBTLE }}
        >
          <span className="col-span-5 font-medium" style={{ color: VALUE_COLOR }}>
            {r.asset}
          </span>
          <span className="col-span-3" style={{ color: MUTED_COLOR }}>
            {r.inst}
          </span>
          <span className="col-span-2 text-right" style={{ color: VALUE_COLOR }}>
            {r.value}
          </span>
          <div className="col-span-2 flex justify-end">
            <CountablePill value={r.countable} />
          </div>
        </div>
      ))}
    </section>
  );
}

function CountablePill({ value }: { value: 'Yes' | 'No' | 'Exempt' }) {
  const style =
    value === 'Yes'
      ? {
          backgroundColor: 'var(--civic-warning-bg)',
          color: WARN_TEXT,
          borderColor: 'var(--civic-amber-6)',
        }
      : value === 'Exempt'
        ? {
            backgroundColor: 'var(--civic-info-bg)',
            color: 'var(--civic-info-text)',
            borderColor: 'var(--civic-blue-6)',
          }
        : {
            backgroundColor: 'var(--civic-bg-component)',
            color: MUTED_COLOR,
            borderColor: BORDER_COMPONENT,
          };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border" style={style}>
      {value}
    </span>
  );
}

function DisabilityCard({ data }: { data: DisabilitySection }) {
  return (
    <SectionCard title="Disability & Medical">
      <Row label="Disability Claimed" value={data.claimed} />
      <Row label="Disability Type" value={data.type} />
      <Row label="SSDI Start Date" value={data.ssdiStart} />
      <Row label="Physician" value={data.physician} />
      <Row label="Physician Cert" value={data.certStatus} />
      <Row label="Long-Term Care" value={data.ltc} />
      <Row label="Nursing Home" value={data.nursingHome} />
      <Row label="Medicare" value={data.medicare} />
    </SectionCard>
  );
}

function CoverageCard({ data }: { data: CoverageSection }) {
  return (
    <SectionCard title="Existing Health Coverage">
      <Row label="Has Insurance Now" value={data.hasInsurance} />
      <Row label="Plan Name" value={data.planName} />
      <Row label="Policy / ID" value={data.policyId} />
      <Row label="Coverage Type" value={data.coverageType} />
      <Row label="Monthly Premium" value={data.premium} />
      <Row label="Effective Date" value={data.effectiveDate} />
      <Row label="Employer-Sponsored?" value={data.employerSponsored} />
      <Row label="Spouse / Parent Coverage" value={data.spouseParentCoverage} />
    </SectionCard>
  );
}

function EmploymentCard({ data }: { data: EmploymentSection }) {
  return (
    <SectionCard title="Employment & Work Status">
      <Row label="Currently Employed" value={data.currentlyEmployed} />
      <Row label="Employer" value={data.employer} />
      <Row label="Employment Type" value={data.employmentType} />
      <Row label="Start Date" value={data.startDate} />
      <Row label="Work Exemption" value={data.workExemption} />
      <Row label="Exemption Basis" value={data.exemptionBasis} />
      <Row label="IHAWP Threshold" value={data.ihawpThreshold} />
      <Row label="Volunteer / Training" value={data.volunteerTraining} />
    </SectionCard>
  );
}

function SignatureCard({ data }: { data: SignatureSection }) {
  return (
    <SectionCard title="Signature & Declaration">
      <Row label="Application ID" value={data.applicationId} />
      <Row label="Submission Method" value={data.submissionMethod} />
      <Row label="Submitted" value={data.submitted} />
      <Row label="IP Address" value={<span className="font-mono">{data.ipAddress}</span>} />
      <Row label="Electronic Signature" value={data.electronicSignature} />
      <Row label="R&amp;R Acknowledged" value={data.rrAcknowledged} />
      <Row label="Penalty Clause" value={data.penaltyClause} />
      <Row label="Authorized Rep" value={data.authorizedRep} />
    </SectionCard>
  );
}

export default ApplicationDataTab;
