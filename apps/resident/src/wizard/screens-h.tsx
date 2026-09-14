// @ts-nocheck
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef,
  useLayoutEffect,
  Fragment,
  createContext,
} from 'react';
import {
  Icon,
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  RadioGroup,
  CheckboxGroup,
  YesNo,
  Alert,
  Stack,
  Panel,
  Avatar,
  ChoiceCard,
  QuestionRow,
  fmt$,
  fmtDate,
} from './ui';
import { useNavigate } from 'react-router';
import {
  useFormData,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
  FormDataContext,
} from './context';
import { computeEligibility, ageFrom } from './eligibility';
import { PRIMARY_APPLICANT_ID, INCOME_TYPE_SSI } from './wizard-constants';
import { abdMembers, reasonLabel } from './abd';
import { useSubmitCase } from '../hooks/useSubmitCase';
import { useStepSubmit } from './submit-hooks';
import { SESSION_KEYS } from '../lib/session-keys';

/* =========================================================================
   Screens H — Review, Sign (11 attestations + conditional Estate Recovery),
   Confirmation (status hero).
   ========================================================================= */

// ─────────────────────────────────────────────────────────────────────────
// ENG-1744 · NonMagiHandoffCard — rendered on the review screen when the
// ABD alternate flow is active. Tells the applicant a caseworker will
// follow up on the resource / Medicare / LTC information they provided.
// ─────────────────────────────────────────────────────────────────────────
function NonMagiHandoffCard({ members }) {
  if (members.length === 0) return null;

  const intro =
    members.length === 1
      ? `A caseworker will follow up with ${members[0].name} to complete their eligibility review.`
      : `A caseworker will follow up with ${members.length} household members to complete their eligibility review.`;

  return (
    <Panel title="Caseworker review pending">
      <Stack gap={12}>
        <Alert kind="info" title="What happens next">
          {intro}
        </Alert>
        {members.map((m) => (
          <KV key={m.id} k={m.name} v={m.reasons.map(reasonLabel).join(' · ')} />
        ))}
      </Stack>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 23 · Review
// ─────────────────────────────────────────────────────────────────────────
function StepReviewV2({ ctx, goTo }) {
  const { data, setData } = ctx;
  const elig = useMemo(() => computeEligibility(data), [data]);

  const primary = data.primaryApplicant;
  const fullName = [primary.firstName, primary.middleName, primary.lastName, primary.suffix].filter(Boolean).join(' ');

  const magiDeniedOnReview = elig.outcomes.filter((o) => !o.qualifies && o.pathwayPct !== 0);
  const abdMembersListReview = abdMembers(data);

  return (
    <Stack gap={24}>
      {/* ── Each member's pathway ───────────────────────────────────────── */}
      <Panel
        title="Which Medicaid coverage each person qualifies for"
        subtitle="The state has different coverage paths depending on age, parenting status, and pregnancy."
      >
        <div className="outcome-list">
          {elig.outcomes.map((o) => (
            <div key={o.memberId} className="outcome-row">
              <div className="who">
                <div className="avatar">
                  {(o.memberName || '')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase())
                    .join('') || '?'}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{o.memberName}</div>
                  <div className="pathway">
                    {o.pathway}
                    {o.withDisregard ? ' · with small-income allowance' : ''}
                  </div>
                </div>
              </div>
              <span className={'status-pill ' + (o.qualifies ? 'ok' : o.pathwayPct === 0 ? 'pending' : 'no')}>
                {o.qualifies ? (
                  <Fragment>
                    <Icon name="check" size={12} /> Qualifies
                  </Fragment>
                ) : o.pathwayPct === 0 ? (
                  <Fragment>
                    <Icon name="info" size={12} /> Pending review
                  </Fragment>
                ) : (
                  <Fragment>
                    <Icon name="info" size={12} /> Marketplace referral
                  </Fragment>
                )}
              </span>
            </div>
          ))}
        </div>

        {magiDeniedOnReview.length > 0 && !elig.outcomes.some((o) => o.qualifies) ? (
          <Alert kind="info" title="You may still get help">
            Based on your income, you may qualify for a subsidized plan at healthcare.gov. We'll send your information
            there if you'd like.
          </Alert>
        ) : null}
      </Panel>

      {/* ── ENG-1744 · Non-MAGI / ABD handoff card (only when branch active) */}
      {abdMembersListReview.length > 0 ? <NonMagiHandoffCard members={abdMembersListReview} /> : null}

      {/* ── Collapsible review sections ─────────────────────────────────── */}
      <ReviewSections data={data} goTo={goTo} fullName={fullName} elig={elig} />

      {/* ── Confirmation checkbox ───────────────────────────────────────── */}
      <Panel>
        <ChoiceCard
          kind="checkbox"
          name="confirmReview"
          value="ok"
          current={data._confirmReview ? ['ok'] : []}
          onChange={(arr) => setData((prev) => ({ ...prev, _confirmReview: arr.includes('ok') }))}
          title="I have reviewed my application and confirm all information is accurate."
          desc="You'll sign and submit on the next step."
        />
      </Panel>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Collapsible review sections (right side of Review screen)
// ─────────────────────────────────────────────────────────────────────────
function ReviewSection({ title, onEdit, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={'rs ' + (open ? 'open' : '')}>
      <button type="button" className="rs-head" onClick={() => setOpen((o) => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="rs-check">
            <Icon name="check" size={12} />
          </span>
          <span className="rs-title">{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onEdit ? (
            <a
              className="fineprint"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              Edit
            </a>
          ) : null}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
        </div>
      </button>
      {open ? <div className="rs-body">{children}</div> : null}
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className={'kv-v' + (v == null || v === '' ? ' muted' : '')}>
        {v == null || v === '' ? 'Not provided' : v}
      </span>
    </div>
  );
}

function ReviewSections({ data, goTo, fullName, elig }) {
  const primary = data.primaryApplicant;
  const identityVerified = primary.identityVerification?.status === 'success';
  const hh = data.household;
  const allJobs = Object.entries(data.jobs).flatMap(([memberId, list]) => list.map((j) => ({ ...j, memberId })));
  const memberName = (id) => {
    if (id === '0') return [primary.firstName, primary.lastName].filter(Boolean).join(' ') || 'Primary';
    const m = data.householdMembers.find((m) => m.id === id);
    return m ? `${m.firstName} ${m.lastName}`.trim() : id;
  };

  return (
    <Stack gap={10}>
      <ReviewSection title="Household info" onEdit={() => goTo('household-info')}>
        <KV k="County" v={hh.county} />
        <KV k="Applying for" v={hh.applicationFor} />
        <KV k="Existing case" v={hh.existingCase ? `Yes (#${hh.caseNumber || '—'})` : 'No'} />
        <KV k="People applying" v={1 + (data.householdMembers?.length ?? 0)} />
      </ReviewSection>

      <ReviewSection title="Household members" onEdit={() => goTo('members')}>
        <KV k={fullName || 'Primary'} v={`Self · ${primary.dob ? `DOB ${fmtDate(primary.dob)}` : ''}`} />
        {data.householdMembers.map((m) => (
          <KV
            key={m.id}
            k={`${m.firstName} ${m.lastName}`.trim() || 'Member'}
            v={`${(REL_OPTS_V2.find((r) => r.value === m.relationship) || {}).label || '—'} · ${m.dob ? `age ${ageFrom(m.dob)}` : ''}${m.applying ? ' · applying' : ' · not applying'}`}
          />
        ))}
      </ReviewSection>

      <ReviewSection title="Personal information" onEdit={() => goTo('personal')}>
        {identityVerified ? (
          <div className="kv">
            <span className="kv-k">Identity</span>
            <span className="kv-v">
              <span className="verified-chip">
                <Icon name="check" size={11} aria-hidden="true" /> Identity verified by CLEAR
              </span>
            </span>
          </div>
        ) : null}
        <KV k="Name" v={fullName} />
        <KV k="DOB" v={fmtDate(primary.dob)} />
        <KV
          k="SSN"
          v={
            primary.noSSN
              ? 'Not provided'
              : primary.identityVerification?.ssnLast4
                ? 'Confirmed by CLEAR (last 4: ' + primary.identityVerification.ssnLast4 + ')'
                : primary.ssn
                  ? 'On file (last 4: ' + primary.ssn.slice(-4) + ')'
                  : ''
          }
        />
        <KV
          k="Address"
          v={
            primary.homeless
              ? 'No fixed address'
              : `${primary.streetAddress}${primary.aptUnit ? ' #' + primary.aptUnit : ''}, ${primary.city}, ${primary.state} ${primary.zip}`
          }
        />
        <KV k="Phone" v={primary.phone} />
        <KV k="Email" v={primary.email} />
      </ReviewSection>

      <ReviewSection title="Demographics" onEdit={() => goTo('demographics')}>
        <KV k="Sex" v={primary.sex} />
        <KV k="Race" v={(data.demographics.race || []).join(', ')} />
        <KV k="Ethnicity" v={data.demographics.ethnicity} />
        <KV
          k="Pregnant"
          v={data.demographics.pregnant === true ? 'Yes' : data.demographics.pregnant === false ? 'No' : ''}
        />
        <KV k="Disability" v={data.demographics.disability === true ? 'Yes' : 'No'} />
        <KV k="Veteran" v={data.demographics.veteran === true ? 'Yes' : 'No'} />
        <KV
          k="Citizenship"
          v={Object.entries(data.citizenship)
            .map(([id, c]) => `${memberName(id)}: ${c.status || '—'}`)
            .join('; ')}
        />
      </ReviewSection>

      <ReviewSection title="Employment" onEdit={() => goTo('jobs')}>
        {allJobs.length === 0 ? (
          <KV k="—" v="No jobs" />
        ) : (
          allJobs.map((j) => (
            <KV
              key={j.id}
              k={`${j.employer || j.businessName || 'Job'} (${memberName(j.memberId)})`}
              v={`${fmt$(j.monthlyIncome)}/mo`}
            />
          ))
        )}
      </ReviewSection>

      <ReviewSection title="Other income" onEdit={() => goTo('income-info')}>
        {(data.otherIncome || []).length === 0 ? (
          <KV k="—" v="No other income" />
        ) : (
          data.otherIncome.map((i) => (
            <KV
              key={i.id}
              k={(INCOME_TOGGLES.find((t) => t.value === i.type) || {}).label || i.type}
              v={`${i.amount ? '$' + i.amount : '—'} ${i.frequency}`}
            />
          ))
        )}
      </ReviewSection>

      <ReviewSection title="Health coverage" onEdit={() => goTo('insurance')}>
        {Object.entries(data.healthInsurance).map(([id, h]) => (
          <KV
            key={id}
            k={memberName(id)}
            v={
              h.skipped
                ? 'Skipped (not applying)'
                : h.hasInsurance === 'yes'
                  ? `Has coverage · ${h.companyName || '—'}`
                  : h.hasInsurance === 'lost'
                    ? `Lost · ${fmtDate(h.coverageEndDate)}`
                    : h.hasInsurance === 'no'
                      ? 'No coverage'
                      : '—'
            }
          />
        ))}
        <KV
          k="Employer-offered"
          v={data.employerCoverage.offered === true ? 'Yes' : data.employerCoverage.offered === false ? 'No' : '—'}
        />
      </ReviewSection>

      <ReviewSection title="Coverage timing" onEdit={() => goTo('retroactive')}>
        <KV k="Retroactive coverage requested" v={data.retroactive.requestCoverage === true ? 'Yes' : 'No'} />
        <KV k="Months" v={(data.retroactive.months || []).join(', ')} />
      </ReviewSection>

      <ReviewSection title="Authorized representative" onEdit={() => goTo('auth-rep')}>
        <KV k="Designated" v={data.authorizedRep.hasRep === true ? 'Yes' : 'No'} />
        {data.authorizedRep.hasRep === true ? (
          <Fragment>
            <KV k="Name" v={data.authorizedRep.name} />
            <KV k="Phone" v={data.authorizedRep.phone} />
            <KV k="Email" v={data.authorizedRep.email} />
          </Fragment>
        ) : null}
      </ReviewSection>

      <ReviewSection title="Communication preferences" onEdit={() => goTo('preferences')}>
        <KV
          k="Notice channels"
          v={
            (data.preferences.noticeChannels || []).length > 0
              ? (data.preferences.noticeChannels || [])
                  .map((c) => ({ sms: 'SMS', portal: 'Portal', postal: 'Postal mail', email: 'Email' })[c] || c)
                  .join(', ')
              : '—'
          }
        />
        <KV k="Written language" v={data.preferences.writtenLanguage} />
        <KV k="Spoken language" v={data.preferences.spokenLanguage} />
        <KV k="Best time to call" v={data.preferences.bestTimeToContact} />
      </ReviewSection>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 24 · Sign — 11 attestations + conditional Estate Recovery
// ─────────────────────────────────────────────────────────────────────────
const ATTESTATIONS = [
  'I authorize State-X HHS to verify information through electronic data sources (Federal Hub, IRS, SSA, DMV).',
  "The information I've provided is true and complete to the best of my knowledge.",
  'I will report changes (income, household, address) within 10 days.',
  'I understand that providing false information may result in loss of benefits, fines, or criminal prosecution.',
  'I authorize State-X HHS to contact employers, banks, and other sources to verify information.',
  'I may be asked to provide additional documents to support my application.',
  'If approved, my benefits begin from the date this application is filed.',
  'I accept the terms and conditions of State-X Medicaid.',
  'I assign to the the State my rights to medical support and payments for medical care from any third party.',
  'I authorize State-X HHS to share my health information with my providers and Medicaid managed care plan, consistent with HIPAA privacy rules.',
  'I understand that if I am approved for Medicaid, I may be enrolled in a managed care plan and will receive instructions on choosing my plan.',
];

function StepSignV2({ ctx }) {
  const { data, setData } = ctx;
  const primary = data.primaryApplicant;
  const age = ageFrom(primary.dob);
  // Estate recovery applies to age 55+ if disabled or receiving SSI. SSI moved
  // from demographics to otherIncome in ENG-1698 — check the income list for
  // the primary applicant's SSI entry.
  const primaryReceivesSSI = (data.otherIncome || []).some(
    (e: any) => (e?.type ?? e?.kind ?? '').toLowerCase() === INCOME_TYPE_SSI && e?.recipient === PRIMARY_APPLICANT_ID,
  );
  const showEstateRecovery = age !== null && age >= 55 && (data.demographics.disability === true || primaryReceivesSSI);

  const [signature, setSignature] = useState(data._signature || '');
  const [agreed, setAgreed] = useState(!!data._agreedRights);

  useEffect(() => {
    setData((prev) => ({ ...prev, _signature: signature, _agreedRights: agreed }));
  }, [signature, agreed]); // eslint-disable-line react-hooks/exhaustive-deps -- local UI state sync; setData is a stable callback but including it would re-run the effect on every render

  // ENG-1596: submit the case to medicaid-ee-service when the user clicks Continue.
  // On success, stash the returned caseNumber/caseId on ctx.data so StepConfirmationV2
  // can render the real values.
  const submitCase = useSubmitCase();
  useStepSubmit(
    useCallback(async () => {
      const { success, errors, caseId, caseNumber } = await submitCase.execute(data);
      if (!success) {
        // Log the code (signal); show a static fallback to the user. Don't
        // forward server messages because the upstream catch in
        // useSubmitCase already replaced them, and a future backend error
        // could re-introduce dynamic content otherwise. Per standards/
        // coding-standards.md § Error handling in mutations.
        if (errors[0]?.code) {
          console.error('[StepSignV2] submit failed', { code: errors[0].code });
        }
        return { ok: false, error: 'Unable to submit. Please try again.' };
      }
      if (caseId || caseNumber) {
        setData((prev) => ({ ...prev, _caseId: caseId ?? null, _caseNumber: caseNumber ?? null }));
      }
      return { ok: true };
    }, [submitCase, data, setData]),
  );

  const fullName = [primary.firstName, primary.middleName, primary.lastName, primary.suffix]
    .filter(Boolean)
    .join(' ')
    .trim();
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Stack gap={24}>
      <Panel title="Rights &amp; Responsibilities" subtitle="Please read carefully before signing.">
        <div className="rights-scroll">
          {showEstateRecovery ? (
            <div className="rights-block accent">
              <div className="rights-block-title">
                <Icon name="info" size={14} /> Estate Recovery Notice
              </div>
              <p>
                Under federal and state law, the state may recover certain Medicaid costs from the estate of a member
                age 55 or older after their death. Recovery is limited to medical assistance paid on the member's behalf
                and may include nursing facility services, home and community-based services, and related hospital and
                prescription drug services. Recovery is delayed if there is a surviving spouse, a child under 21, or a
                child of any age who is blind or has a disability. You may request a hardship waiver.
              </p>
            </div>
          ) : null}

          <ol className="rights-list">
            {ATTESTATIONS.map((a, i) => (
              <li key={i}>
                <span className="rights-num">{i + 1}.</span> {a}
              </li>
            ))}
          </ol>

          <div className="rights-block warn">
            <div className="rights-block-title">
              <Icon name="alert" size={14} /> Fraud penalty warning
            </div>
            <p>
              Anyone who knowingly makes a false or misleading statement to obtain Medicaid benefits commits a federal
              offense and may be subject to prosecution under 18 U.S.C. § 1001, civil penalties, fines up to $250,000,
              imprisonment up to five years, and permanent disqualification from the program.
            </p>
          </div>
        </div>

        <Stack gap={12} style={{ marginTop: 16 }}>
          <ChoiceCard
            kind="checkbox"
            name="agreedRights"
            value="ok"
            current={agreed ? ['ok'] : []}
            onChange={(arr) => setAgreed(arr.includes('ok'))}
            title="I have read and agree to the rights and responsibilities above."
          />

          <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'end' }}>
            <Field label={`Type your full legal name${fullName ? `: ${fullName}` : ''}`} required>
              <TextInput
                value={signature}
                onChange={setSignature}
                placeholder={fullName || 'Your full legal name'}
                disabled={!agreed}
              />
            </Field>
            <Field label="Date">
              <div
                className="input"
                style={{ display: 'flex', alignItems: 'center', color: 'var(--civic-text-secondary)' }}
              >
                {today}
              </div>
            </Field>
          </div>

          <div className="signature-preview">
            <div className="fineprint" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Signed
            </div>
            <div className={'signature-glyph' + (signature.length >= 2 && agreed ? ' on' : '')}>{signature || '—'}</div>
          </div>
        </Stack>
      </Panel>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 25 · Confirmation
// ─────────────────────────────────────────────────────────────────────────
function StepConfirmationV2({ ctx }) {
  const { data } = ctx;
  const navigate = useNavigate();
  const elig = data.eligibility || computeEligibility(data);
  const primary = data.primaryApplicant;

  // Persist comm prefs for the dashboard (read by dashboard.tsx via SESSION_KEYS.COMM_PREFS)
  // eslint-disable-next-line no-restricted-syntax -- fire-and-forget side effect on mount: no mutation callback, no Apollo query, not user-interaction-driven; persisting wizard state to sessionStorage so the sibling /dashboard route can display it without prop-drilling across a router boundary
  useEffect(() => {
    const { noticeChannels, writtenLanguage, spokenLanguage, renewalReminders } = data.preferences;
    sessionStorage.setItem(
      SESSION_KEYS.COMM_PREFS,
      JSON.stringify({ channels: noticeChannels || [], writtenLanguage, spokenLanguage, renewalReminders }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only write; data.preferences is stable at confirmation

  // Application ID: prefer the real caseNumber returned by createMedicaidEeCase
  // (set by StepSignV2 via useSubmitCase). Fall back to a synthesised id for the
  // guest path / dry-run demos where no backend case was created.
  const now = useMemo(() => new Date(), []);
  const applicationId = useMemo(() => {
    if (data._caseNumber) return data._caseNumber;
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    return `SX-${y}-${mm}${dd}-${rand}`;
  }, [now, data._caseNumber]);
  const today = useMemo(
    () => now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    [now],
  );

  const qualifies = elig.outcomes.filter((o) => o.qualifies);
  const magiDenied = elig.outcomes.filter((o) => !o.qualifies && o.pathwayPct !== 0);
  const abdPending = elig.outcomes.filter((o) => !o.qualifies && o.pathwayPct === 0);
  const isAbdOnly = qualifies.length === 0 && magiDenied.length === 0 && abdPending.length > 0;
  const abdMembersList = abdMembers(data);

  const banner =
    qualifies.length === elig.outcomes.length && elig.outcomes.length > 0
      ? 'all'
      : qualifies.length > 0
        ? 'partial'
        : isAbdOnly
          ? 'pending'
          : 'none';

  const heroTitle =
    banner === 'all'
      ? 'Application submitted'
      : banner === 'partial'
        ? 'Application submitted — review in progress'
        : banner === 'pending'
          ? 'Your application is pending review'
          : 'Based on your information, you may qualify for Marketplace coverage';

  const heroSub =
    banner === 'all'
      ? "Your application has been received. You'll receive a written notice once your eligibility has been determined."
      : banner === 'partial'
        ? `Your application has been received. ${qualifies.length} of ${elig.outcomes.length} household members may qualify for State-X Medicaid — a caseworker will complete the review.`
        : banner === 'pending'
          ? 'Your household may qualify for Medicaid coverage. A caseworker will complete your eligibility review.'
          : 'State-X HHS has sent your information to healthcare.gov where you may qualify for subsidized coverage.';

  return (
    <div className="confirm-shell step-fade-in">
      <div className="confirm-card">
        <Stack gap={28}>
          <div className={'confirm-hero ' + banner}>
            <div className="confirm-hero-ic">
              <Icon name={banner === 'all' ? 'check' : banner === 'partial' ? 'info' : 'info'} size={28} />
            </div>
            <div>
              <h1>{heroTitle}</h1>
              <p>{heroSub}</p>
            </div>
          </div>

          {/* ── Coverage card (one row per approved member) — hidden in the
               submitted/all state so the receipt makes no coverage claim ─── */}
          {banner !== 'all' && qualifies.length > 0 ? (
            <Panel title="Your State-X Medicaid coverage">
              <Stack gap={10}>
                {qualifies.map((o) => (
                  <div key={o.memberId} className="coverage-row">
                    <Avatar name={o.memberName} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="coverage-name">{o.memberName}</div>
                      <div className="coverage-pathway">{o.pathway}</div>
                    </div>
                    <div className="coverage-meta">
                      <span className="hhm-badge ok">
                        <Icon name="check" size={11} /> Effective {today}
                      </span>
                    </div>
                  </div>
                ))}
              </Stack>
            </Panel>
          ) : null}

          {/* ── Application details ────────────────────────────────────── */}
          <Panel title="Application details">
            <Stack gap={14}>
              <div className="spec-list">
                <div className="row">
                  <span className="k">Application ID</span>
                  <span className="v mono">{applicationId}</span>
                </div>
                <div className="row">
                  <span className="k">Application submitted</span>
                  <span className="v">{today}</span>
                </div>
                <div className="row">
                  <span className="k">Status</span>
                  <span className="v">Under review</span>
                </div>
                <div className="row">
                  <span className="k">Primary applicant</span>
                  <span className="v">{[primary.firstName, primary.lastName].filter(Boolean).join(' ') || '—'}</span>
                </div>
                {primary.identityVerification?.status === 'success' ? (
                  <div className="row">
                    <span className="k">Identity</span>
                    <span className="v">
                      <span className="verified-chip">
                        <Icon name="check" size={11} aria-hidden="true" /> Your identity was verified by CLEAR
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>

              {banner !== 'all' && elig.disregardApplied ? (
                <div className="fineprint disregard-footnote">
                  Your household qualified thanks to a small federal allowance for families just over the income limit.{' '}
                  <a>Learn more →</a>
                </div>
              ) : null}
            </Stack>
          </Panel>

          {/* ── Referral (MAGI-denied only) ────────────────────────────── */}
          {magiDenied.length > 0 ? (
            <Alert
              kind="info"
              title={`${magiDenied.length} ${magiDenied.length === 1 ? 'person' : 'people'} referred to the Marketplace`}
            >
              {magiDenied.map((o) => o.memberName).join(', ')} {magiDenied.length === 1 ? "doesn't" : "don't"} meet the
              Medicaid income threshold. Their information has been sent to <strong>healthcare.gov</strong> where they
              can shop subsidized plans.
            </Alert>
          ) : null}

          {/* ── What happens next ──────────────────────────────────────── */}
          {abdMembersList.length > 0 ? (
            <Panel title="What happens next">
              <Stack gap={12}>
                <Alert kind="info" title="Caseworker review required">
                  {abdMembersList.length === 1
                    ? `${abdMembersList[0].name}'s application requires a caseworker review.`
                    : `${abdMembersList.length} household members require a caseworker review.`}
                </Alert>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
                  <li>
                    A caseworker will contact you within <strong>90 days</strong> to review the information you
                    provided.
                  </li>
                  <li>
                    You may be asked to provide additional documentation — your caseworker will explain exactly what's
                    needed.
                  </li>
                  <li>
                    Once the review is complete, you'll receive a written notice with your final eligibility decision.
                  </li>
                  {elig?.outcomes?.some((o) => o.qualifies) ? (
                    <li>
                      Other household members who qualify for Medicaid will be enrolled immediately — their coverage is
                      not delayed by this review.
                    </li>
                  ) : null}
                </ol>
              </Stack>
            </Panel>
          ) : (
            <Panel title="What happens next">
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
                <li>
                  A caseworker will review your application within <strong>45 days</strong>.
                </li>
                <li>
                  You may be asked to provide additional documentation — your caseworker will explain exactly what's
                  needed.
                </li>
                <li>Once the review is complete, you'll receive a written notice with your eligibility decision.</li>
              </ol>
            </Panel>
          )}

          {/* ── CTAs ──────────────────────────────────────────────────── */}
          <div className="confirm-ctas">
            <Button
              variant="primary"
              onClick={() => {
                navigate('/dashboard');
              }}
            >
              View dashboard <Icon name="arrowRight" size={14} />
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Icon name="printer" size={14} /> Print this page
            </Button>
          </div>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="confirm-footer">
            Questions? Call <strong>1-800-338-8366</strong> or visit <a>statehhs.gov/medicaid</a>.
          </div>
        </Stack>
      </div>
    </div>
  );
}

Object.assign(window, {
  StepReviewV2,
  StepSignV2,
  StepConfirmationV2,
  ATTESTATIONS,
  ReviewSection,
  ReviewSections,
  KV,
  NonMagiHandoffCard,
});

export {
  StepReviewV2,
  ReviewSection,
  KV,
  ReviewSections,
  StepSignV2,
  StepConfirmationV2,
  ATTESTATIONS,
  NonMagiHandoffCard,
};
