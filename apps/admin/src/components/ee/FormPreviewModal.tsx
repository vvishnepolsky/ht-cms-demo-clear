/**
 * FormPreviewModal — read-only "as sent" preview of the pre-populated Medicaid
 * renewal form (Form A-5170), rendered as a paper document.
 *
 * Storyboard intent (ENG-1773 gap #7): clicking "Preview form as sent" opens a
 * paper-document preview with letterhead and highlighted pre-filled fields — NOT
 * an editable compose UI. ENG-1821 (CMS feedback, May 18) builds that preview out
 * to match the CMS model renewal form, with three pre-filled sections —
 * Contact information, People in your household, and Income from jobs — plus the
 * standard instructional text and a signature / certification block.
 *
 * Content is sourced from the mocked `data/renewals` archetype member (Diane M.
 * Caldwell). The `applicantName` / `mcNumber` props remain for the call site and
 * drive the highlighted name + Medicaid ID at the top of the form.
 */
import { useRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKeyToClose, useFocusTrapAndRestore } from './drawer/hooks';
import { RENEWAL_MEMBER, RENEWAL_HOUSEHOLD, RENEWAL_JOB_INCOME, RESPONSE_DUE_DISPLAY } from '../../data/renewals';

interface FormPreviewModalProps {
  open: boolean;
  onClose: () => void;
  applicantName: string;
  mcNumber: string;
  formNumber?: string;
}

export function FormPreviewModal(props: FormPreviewModalProps) {
  if (!props.open) return null;
  return <FormPreviewModalInner {...props} />;
}

function FormPreviewModalInner({ onClose, applicantName, mcNumber, formNumber = 'A-5170' }: FormPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEscapeKeyToClose(onClose);
  useFocusTrapAndRestore(containerRef, closeButtonRef);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Form ${formNumber}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm font-medium text-slate-700">Form {formNumber} — Renewal of Medicaid Coverage</span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-white p-12 font-serif text-slate-900">
          {/* Letterhead */}
          <div className="mb-6 border-b pb-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">State X</p>
            <p className="text-lg font-bold">Department of Health and Human Services</p>
            <p className="text-xs text-slate-500">Medicaid Annual Renewal · Form {formNumber}</p>
          </div>

          {/* Instructional intro (CMS standard) */}
          <div className="mb-6 space-y-3 text-sm leading-relaxed">
            <p className="text-base font-bold">It&rsquo;s time to renew your Medicaid coverage.</p>
            <p>
              We already filled in what we know about you from your record. Please review each section below, cross out
              and correct anything that is wrong or out of date, answer any blank questions, then sign and date the
              form.
            </p>
            <p>
              <span className="font-semibold">Return your completed form by {RESPONSE_DUE_DISPLAY}.</span> You can
              return it by mail, through your online account at the State Self-Service Portal, or by calling us. If you
              do not respond by this date, your coverage may end at the close of your current coverage period.
            </p>
            <p className="text-slate-700">
              <span className="font-semibold">Need help?</span> Call 1-800-555-0147 (TTY: 711), Monday–Friday, 8:00 a.m.
              to 5:00 p.m. Free help and translation services are available in your language at no cost to you.
            </p>
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Fields <span className="bg-amber-100 px-1 font-medium">highlighted in yellow</span> are pre-filled from
              your current record. Blank lines (
              <span className="border-b border-slate-400 inline-block w-10">&nbsp;</span>) require your completion.
            </p>
          </div>

          {/* Applicant header line (driven by call-site props) */}
          <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p>
              Name: <span className="bg-amber-100 px-1 font-medium">{applicantName}</span>
            </p>
            <p>
              Medicaid ID: <span className="bg-amber-100 px-1 font-mono">{mcNumber}</span>
            </p>
          </div>

          {/* Step 1 — Contact information (pre-filled) */}
          <PaperSection step="1" title="Contact information" tag="Pre-filled from your record">
            <PaperField label="Full name" value={RENEWAL_MEMBER.name} />
            <PaperField label="Date of birth" value={RENEWAL_MEMBER.dateOfBirth} />
            <PaperField label="Social Security Number" value={RENEWAL_MEMBER.ssnMasked} mono />
            <PaperField label="Home address" value={RENEWAL_MEMBER.address} />
            <PaperField label="Mailing address" value={RENEWAL_MEMBER.mailingAddress} />
            <PaperField label="Phone" value={RENEWAL_MEMBER.phone} />
            <PaperField label="Email" value={RENEWAL_MEMBER.email} />
            <PaperField label="Preferred written language" value={RENEWAL_MEMBER.preferredWrittenLanguage} />
            <PaperField label="Preferred spoken language" value={RENEWAL_MEMBER.preferredSpokenLanguage} />
          </PaperSection>

          {/* Step 2 — People in your household (pre-filled) */}
          <PaperSection step="2" title="People in your household" tag="Pre-filled from your record">
            <p className="mb-3 text-xs text-slate-600">
              We pre-filled the people on your case. Cross out anyone who no longer lives with you, and write in anyone
              who is missing.
            </p>
            <div className="overflow-hidden rounded border border-slate-300">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-left text-slate-600">
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Name
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Relationship
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Date of birth
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      SSN
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Sex
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Seeking coverage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RENEWAL_HOUSEHOLD.map((m) => (
                    <tr key={m.name} className="border-t border-slate-200">
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1 font-medium">{m.name}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1">{m.relationship}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1">{m.dateOfBirth}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1 font-mono">{m.ssnMasked}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1">{m.sex}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="bg-amber-100 px-1">{m.seekingCoverage ? 'Yes' : 'No'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PaperSection>

          {/* Step 3 — Income from jobs (pre-filled; confirm or update) */}
          <PaperSection step="3" title="Income from jobs" tag="Pre-filled — confirm or update">
            <p className="mb-3 text-xs text-slate-600">
              We could not verify your current wages from electronic sources, so we pre-filled the most recent job on
              file. Confirm it is still correct, or write your current employer and wages on the blank lines.
            </p>
            <PaperField label="Person" value={RENEWAL_JOB_INCOME.memberName} />
            <PaperField label="Employer" value={RENEWAL_JOB_INCOME.employer} />
            <PaperField label="Employer phone" value={RENEWAL_JOB_INCOME.employerPhone} mono />
            <PaperField label="Employer address" value={RENEWAL_JOB_INCOME.employerAddress} />
            <PaperField label="Wages before taxes" value={RENEWAL_JOB_INCOME.monthlyWages} />
            <PaperField label="How often paid" value={RENEWAL_JOB_INCOME.payFrequency} />
            <PaperField label="Average hours per week" value={RENEWAL_JOB_INCOME.hoursPerWeek} />
            <div className="mt-3 space-y-3">
              <PaperBlank label="If different, current employer" width="w-72" />
              <PaperBlank label="If different, current monthly wages" width="w-40" />
            </div>
            <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Please include your most recent pay stubs (last 30 days), a W-2, or an employer letter with this form.
            </p>
          </PaperSection>

          {/* Signature & certification */}
          <PaperSection step="4" title="Signature & certification" tag="Your signature required">
            <p className="mb-4 text-sm leading-relaxed">
              I certify, under penalty of perjury, that the information on this form is true, correct, and complete to
              the best of my knowledge. I understand that I must report any changes to my household or income, and that
              giving false information may affect my eligibility.
            </p>
            <div className="flex items-end gap-6 text-sm">
              <p className="flex-1">
                Signature: <span className="border-b border-slate-400 inline-block w-full align-bottom">&nbsp;</span>
              </p>
              <p>
                Date: <span className="border-b border-slate-400 inline-block w-32 align-bottom">&nbsp;</span>
              </p>
            </div>
            <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
              <p className="font-semibold">Return by {RESPONSE_DUE_DISPLAY}.</p>
              <p>
                Your coverage continues through the current certification period. If no response is received by that
                date, coverage will end at the close of the period — not retroactively. You have the right to appeal any
                decision about your coverage.
              </p>
            </div>
          </PaperSection>

          <p className="mt-6 border-t pt-3 text-[10px] leading-relaxed text-slate-500">
            This agency does not discriminate on the basis of race, color, national origin, age, disability, or sex.
            Auxiliary aids and services are available upon request to individuals with disabilities.
          </p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

interface PaperSectionProps {
  step: string;
  title: string;
  tag: string;
  children: React.ReactNode;
}

function PaperSection({ step, title, tag, children }: PaperSectionProps) {
  const headingId = `paper-section-step-${step}`;
  return (
    <section aria-labelledby={headingId} className="mb-6 border-t pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
            {step}
          </span>
          <h3 id={headingId} className="text-sm font-bold uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
          {tag}
        </span>
      </div>
      {children}
    </section>
  );
}

interface PaperFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function PaperField({ label, value, mono }: PaperFieldProps) {
  return (
    <dl className="grid grid-cols-12 gap-3 py-1 text-sm">
      <dt className="col-span-4 text-slate-600">{label}</dt>
      <dd className="col-span-8 m-0">
        <span className={`bg-amber-100 px-1 font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
      </dd>
    </dl>
  );
}

interface PaperBlankProps {
  label: string;
  width: string;
}

function PaperBlank({ label, width }: PaperBlankProps) {
  return (
    <dl className="grid grid-cols-12 items-end gap-3 text-sm">
      <dt className="col-span-4 text-slate-600">{label}</dt>
      <dd className="col-span-8 m-0">
        <span className={`border-b border-slate-400 inline-block ${width}`}>&nbsp;</span>
      </dd>
    </dl>
  );
}
