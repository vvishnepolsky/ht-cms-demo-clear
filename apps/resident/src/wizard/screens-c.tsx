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
import {
  useFormData,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
  FormDataContext,
} from './context';
import { computeEligibility, FPL_2026, PATHWAYS, lookupFPL, ageFrom, toMonthly } from './eligibility';
import { formatPhone, stripPhone } from '../lib/phone';
import type {
  FormDataContextValue,
  WizardFormData,
  HealthInsuranceEntry,
  Job,
  EmployerCoverage,
  Retroactive,
  AuthorizedRep,
  Preferences,
} from './form-data.types';

/* =========================================================================
   Screens C — Insurance, retroactive, authorized rep, preferences,
                review, confirmation
   Steps 19 – 25
   ========================================================================= */

// Every screen receives the FormDataContext as `ctx`.
interface ScreenProps {
  ctx: FormDataContextValue;
}

// ── Step 19 · Health insurance status (per applying member) ─────────────
function StepInsurance({ ctx }: ScreenProps) {
  const { data, setData } = ctx;

  const applyingMembers = [
    {
      id: '0',
      name:
        [data.primaryApplicant?.firstName, data.primaryApplicant?.lastName].filter(Boolean).join(' ') ||
        'Primary applicant',
    },
    ...(data.householdMembers ?? [])
      .filter((m) => m.applying)
      .map((m) => ({ id: m.id ?? '', name: `${m.firstName} ${m.lastName}`.trim() || 'Member' })),
  ];

  function setMember(id: string, patch: Partial<HealthInsuranceEntry>) {
    setData((prev) => ({
      ...prev,
      healthInsurance: {
        ...prev.healthInsurance,
        [id]: {
          ...(prev.healthInsurance?.[id] || {
            hasInsurance: '',
            insuranceType: '',
            companyName: '',
            policyNumber: '',
            coverageEndDate: '',
            lossReason: '',
            skipped: false,
          }),
          ...patch,
        },
      },
    }));
  }

  return (
    <Fragment>
      <Alert kind="info" title="Tell us about each person's current coverage">
        We ask about other coverage because Medicaid is the payer of last resort — meaning it pays after any private
        insurance.
      </Alert>

      {applyingMembers.map((m) => {
        const h = data.healthInsurance?.[m.id] || { hasInsurance: '' };
        return (
          <Panel key={m.id} title={m.name}>
            <Field label="Does this person have health insurance now?">
              <RadioGroup
                name={`ins-${m.id}`}
                value={h.hasInsurance}
                onChange={(x) => setMember(m.id, { hasInsurance: Array.isArray(x) ? x[0] : x })}
                cols={3}
                options={[
                  { value: 'yes', label: 'Yes, currently' },
                  { value: 'lost', label: 'Recently lost' },
                  { value: 'no', label: 'No coverage' },
                ]}
              />
            </Field>

            {h.hasInsurance === 'yes' ? (
              <Stack gap={14} style={{ marginTop: 16 }}>
                <Field label="Type of coverage">
                  <Select
                    value={h.insuranceType}
                    onChange={(x) => setMember(m.id, { insuranceType: x })}
                    options={[
                      { value: 'employer', label: 'Through an employer (job-based)' },
                      { value: 'marketplace', label: 'Marketplace / healthcare.gov plan' },
                      { value: 'medicare', label: 'Medicare' },
                      { value: 'tricare', label: 'TRICARE / military' },
                      { value: 'private', label: 'Direct-purchase / private plan' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </Field>
                <div className="grid-2">
                  <Field label="Insurance company">
                    <TextInput
                      value={h.companyName}
                      onChange={(x) => setMember(m.id, { companyName: x })}
                      placeholder="e.g. Wellmark Blue Cross"
                    />
                  </Field>
                  <Field label="Policy or member number">
                    <TextInput value={h.policyNumber} onChange={(x) => setMember(m.id, { policyNumber: x })} />
                  </Field>
                </div>
              </Stack>
            ) : null}

            {h.hasInsurance === 'lost' ? (
              <Stack gap={14} style={{ marginTop: 16 }}>
                <div className="grid-2">
                  <Field label="When did coverage end?">
                    <TextInput
                      type="date"
                      value={h.coverageEndDate}
                      onChange={(x) => setMember(m.id, { coverageEndDate: x })}
                    />
                  </Field>
                  <Field label="Why did it end?">
                    <Select
                      value={h.lossReason}
                      onChange={(x) => setMember(m.id, { lossReason: x })}
                      options={[
                        { value: 'lost_job', label: 'Lost a job' },
                        { value: 'premium', label: "Couldn't afford premium" },
                        { value: 'moved', label: 'Moved out of plan area' },
                        { value: 'aged_off', label: "Aged off a parent's plan" },
                        { value: 'divorce', label: 'Divorce / separation' },
                        { value: 'medicaid_renewal', label: 'Lost Medicaid at renewal' },
                        { value: 'other', label: 'Other' },
                      ]}
                    />
                  </Field>
                </div>
                <Alert kind="warning" title="You may qualify for a Special Enrollment Period">
                  Losing coverage gives you 60 days to enroll without waiting for open enrollment.
                </Alert>
              </Stack>
            ) : null}
          </Panel>
        );
      })}
    </Fragment>
  );
}

// ── Step 20 · Employer-offered coverage ─────────────────────────────────
function StepEmployerCoverage({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const e = data.employerCoverage;
  const set = (key: keyof EmployerCoverage, val: unknown) => setPath('employerCoverage', key, val);
  const applyingMembers = [
    {
      value: '0',
      label:
        [data.primaryApplicant?.firstName, data.primaryApplicant?.lastName].filter(Boolean).join(' ') ||
        'Primary applicant',
    },
    ...(data.householdMembers ?? [])
      .filter((m) => m.applying)
      .map((m) => ({ value: m.id ?? '', label: `${m.firstName} ${m.lastName}`.trim() || 'Member' })),
  ];

  return (
    <Fragment>
      <Alert kind="info">
        Even if no one in your household has employer coverage right now, an employer may have offered it. This affects
        what plans you can buy on the Marketplace.
      </Alert>

      <QuestionRow
        q="Is anyone in your household currently offered job-based health coverage?"
        value={e?.offered}
        onChange={(x) => set('offered', x)}
      />

      {e?.offered === true ? (
        <Panel title="About the offer">
          <Stack gap={14}>
            <div className="grid-2">
              <Field label="Which household member?">
                <Select value={e?.memberId} onChange={(x) => set('memberId', x)} options={applyingMembers} />
              </Field>
              <Field label="Employer name">
                <TextInput value={e?.employerName} onChange={(x) => set('employerName', x)} />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Date coverage becomes available">
                <TextInput type="date" value={e?.availableDate} onChange={(x) => set('availableDate', x)} />
              </Field>
              <Field label="Plan year start">
                <TextInput type="date" value={e?.planYearStart} onChange={(x) => set('planYearStart', x)} />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Employee-only premium (monthly)" hint="What you would pay just for yourself.">
                <TextInput
                  inputMode="numeric"
                  value={e?.employeePremium}
                  onChange={(x) => set('employeePremium', x)}
                  prefix="$"
                />
              </Field>
              <Field label="Family premium (monthly)" hint="For you and dependents.">
                <TextInput
                  inputMode="numeric"
                  value={e?.familyPremium}
                  onChange={(x) => set('familyPremium', x)}
                  prefix="$"
                />
              </Field>
            </div>

            <Field label="Who does the plan cover?">
              <CheckboxGroup
                name="covers"
                value={e?.coversWhat}
                onChange={(x) => set('coversWhat', x)}
                options={[
                  { value: 'self', label: 'Employee only' },
                  { value: 'spouse', label: 'Spouse' },
                  { value: 'kids', label: 'Children / dependents' },
                ]}
                cols={3}
              />
            </Field>

            <Field label="Current enrollment status">
              <RadioGroup
                name="enroll"
                value={e?.enrollmentStatus}
                onChange={(x) => set('enrollmentStatus', x)}
                options={[
                  { value: 'enrolled', title: 'Enrolled now', desc: 'Covered under this plan today.' },
                  {
                    value: 'offered_not_enrolled',
                    title: 'Offered but not enrolled',
                    desc: 'Eligible but waived enrollment.',
                  },
                  { value: 'waiting_period', title: 'In a waiting period', desc: 'Will be eligible on a future date.' },
                ]}
              />
            </Field>

            <Field
              label="Does this plan meet minimum value standards?"
              hint="Minimum value means the plan pays at least 60% of total covered medical costs. Check the Summary of Benefits or ask HR."
            >
              <RadioGroup
                name="mv"
                value={e?.meetsMinimumValue}
                onChange={(x) => set('meetsMinimumValue', x)}
                cols={3}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                  { value: 'unsure', label: 'Not sure' },
                ]}
              />
            </Field>

            <QuestionRow
              q="Is COBRA continuation coverage available?"
              hint="COBRA lets you keep employer coverage for up to 36 months after losing your job, at full cost."
              value={e?.cobraAvailable}
              onChange={(x) => set('cobraAvailable', x)}
              withUnsure
            />
          </Stack>
        </Panel>
      ) : null}
    </Fragment>
  );
}

// ── Step 21 · Retroactive coverage ──────────────────────────────────────
function StepRetroactive({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const r = data.retroactive;
  const set = (key: keyof Retroactive, val: unknown) => setPath('retroactive', key, val);

  const today = new Date();
  const months = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { value: key, label };
  });

  return (
    <Fragment>
      <Alert kind="info" title="Retroactive Medicaid (up to 3 months back)">
        If you had unpaid medical bills in any of the last 3 months and you would have qualified for Medicaid then, we
        may be able to cover those bills too.
      </Alert>

      <QuestionRow
        q="Did anyone applying have unpaid medical bills in the last 3 months?"
        value={r?.hasBills}
        onChange={(x) => set('hasBills', x)}
      />

      {r?.hasBills === true ? (
        <Stack gap={14}>
          <Field label="Which months?" hint="Select all months that had unpaid medical bills.">
            <CheckboxGroup
              name="months"
              value={r?.months}
              onChange={(x) => set('months', x)}
              options={months}
              cols={3}
            />
          </Field>
          <QuestionRow
            q="Would you like State-X Medicaid to cover those bills if you're approved?"
            value={r?.requestCoverage}
            onChange={(x) => set('requestCoverage', x)}
          />
        </Stack>
      ) : null}
    </Fragment>
  );
}

// ── Step 22 · Authorized representative ─────────────────────────────────
function StepAuthorizedRep({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const a = data.authorizedRep;
  const set = (key: keyof AuthorizedRep, val: unknown) => setPath('authorizedRep', key, val);

  return (
    <Fragment>
      <Alert kind="info" title="What is an authorized representative?">
        Someone you trust who can act on your behalf — answer questions from State-X HHS, receive copies of notices, and
        report changes. You can change or remove them anytime.
      </Alert>

      <Field label="Do you want to designate an authorized representative?">
        <RadioGroup
          name="hasRep"
          // reason: hasRep is stored as a real boolean (read as `=== true` in screens-h
          // and app.tsx validate); this RadioGroup is intentionally driven by boolean
          // option values, which the string-typed ChoiceOption.value cannot express.
          // Cast preserves the boolean runtime contract without touching the shared ui type.
          value={a?.hasRep as unknown as string}
          onChange={(x) => set('hasRep', x)}
          options={
            [
              { value: false, title: "No, I'll handle everything myself", desc: "We'll only contact you." },
              { value: true, title: 'Yes, designate someone', desc: "We'll send them copies of important notices." },
            ] as unknown as { value: string; title: string; desc: string }[]
          }
        />
      </Field>

      {a?.hasRep === true ? (
        <Panel title="Authorized representative details">
          <Stack gap={14}>
            <div className="grid-2">
              <Field label="Full name" required>
                <TextInput value={a?.name} onChange={(x) => set('name', x)} />
              </Field>
              <Field label="Relationship to you">
                <Select
                  value={a?.relationship}
                  onChange={(x) => set('relationship', x)}
                  options={[
                    { value: 'family', label: 'Family member' },
                    { value: 'attorney', label: 'Attorney' },
                    { value: 'navigator', label: 'Certified application navigator' },
                    { value: 'caseworker', label: 'Social worker / caseworker' },
                    { value: 'friend', label: 'Friend / neighbor' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="—"
                />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Phone">
                <TextInput
                  type="tel"
                  inputMode="tel"
                  value={formatPhone(a?.phone)}
                  onChange={(x) => set('phone', stripPhone(x))}
                />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={a?.email} onChange={(x) => set('email', x)} />
              </Field>
            </div>
            <Field label="Address">
              <TextInput value={a?.address} onChange={(x) => set('address', x)} />
            </Field>
            <Field label="What can they do for you?">
              <CheckboxGroup
                name="scope"
                value={a?.scope}
                onChange={(x) => set('scope', x)}
                options={[
                  { value: 'receive_notices', label: 'Receive copies of my notices' },
                  { value: 'answer_questions', label: 'Answer questions from State-X HHS' },
                  { value: 'report_changes', label: 'Report changes on my behalf' },
                  { value: 'appeal', label: 'File an appeal on my behalf' },
                ]}
                cols={2}
              />
            </Field>
          </Stack>
        </Panel>
      ) : null}
    </Fragment>
  );
}

// ── Step 23 · Communication preferences ─────────────────────────────────
function StepPreferences({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const p = data.preferences;
  const set = (key: keyof Preferences, val: unknown) => setPath('preferences', key, val);

  return (
    <Fragment>
      <Panel title="How should we contact you?">
        <Stack gap={14}>
          <Field label="How would you like to receive case notices? Select all that apply.">
            <CheckboxGroup
              name="ch"
              value={p?.noticeChannels || []}
              onChange={(x) => set('noticeChannels', x)}
              cols={2}
              options={[
                { value: 'sms', label: 'SMS (text message)' },
                { value: 'portal', label: 'Portal (online)' },
                { value: 'postal', label: 'Postal mail' },
                { value: 'email', label: 'Email' },
              ]}
            />
          </Field>
          <Field label="Best time to reach you by phone">
            <RadioGroup
              name="time"
              value={p?.bestTimeToContact}
              onChange={(x) => set('bestTimeToContact', x)}
              cols={3}
              options={[
                { value: 'morning', label: 'Morning' },
                { value: 'afternoon', label: 'Afternoon' },
                { value: 'evening', label: 'Evening' },
                { value: 'anytime', label: 'Anytime' },
                { value: 'weekends', label: 'Weekends only' },
              ]}
            />
          </Field>
          <QuestionRow
            q="OK to leave a voicemail?"
            value={p?.okToLeaveVoicemail}
            onChange={(x) => set('okToLeaveVoicemail', x)}
          />
        </Stack>
      </Panel>

      <Panel title="Language preferences">
        <div className="grid-2">
          <Field label="Written language">
            <Select
              value={p?.writtenLanguage}
              onChange={(x) => set('writtenLanguage', x)}
              options={['English', 'Spanish', 'Vietnamese', 'Bosnian', 'Burmese', 'Swahili', 'Arabic', 'Other']}
            />
          </Field>
          <Field label="Spoken language">
            <Select
              value={p?.spokenLanguage}
              onChange={(x) => set('spokenLanguage', x)}
              options={['English', 'Spanish', 'Vietnamese', 'Bosnian', 'Burmese', 'Swahili', 'Arabic', 'ASL', 'Other']}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Accessibility — anything we should know?"
        subtitle="State-X HHS provides free assistance for vision, hearing, mobility, cognitive, and language needs."
      >
        <CheckboxGroup
          name="acc"
          value={p?.accessibilityNeeds}
          onChange={(x) => set('accessibilityNeeds', x)}
          options={[
            { value: 'large_print', label: 'Large print materials' },
            { value: 'braille', label: 'Braille materials' },
            { value: 'interpreter', label: 'Interpreter (language)' },
            { value: 'asl', label: 'ASL interpreter' },
            { value: 'audio', label: 'Audio version of notices' },
            { value: 'in_person', label: 'In-person caseworker visit' },
          ]}
          cols={2}
        />
      </Panel>

      <QuestionRow
        q="Send me renewal reminders 60 days before my renewal date"
        value={p?.renewalReminders}
        onChange={(x) => set('renewalReminders', x)}
      />
    </Fragment>
  );
}

// ── Step 24 · Review ────────────────────────────────────────────────────
interface ReviewRow {
  k: React.ReactNode;
  v: React.ReactNode;
}
interface ReviewTileProps {
  title: React.ReactNode;
  onEdit?: () => void;
  rows: ReviewRow[];
}
function ReviewTile({ title, onEdit, rows }: ReviewTileProps) {
  return (
    <div className="review-tile">
      <div className="head">
        <h4>{title}</h4>
        {onEdit ? <a onClick={onEdit}>Edit</a> : null}
      </div>
      <dl>
        {rows.map((r, i) => (
          <Fragment key={i}>
            <dt>{r.k}</dt>
            <dd className={r.v == null || r.v === '' ? 'muted' : ''}>
              {r.v == null || r.v === '' ? 'Not provided' : r.v}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

interface ReviewProps extends ScreenProps {
  goTo: (id: string) => void;
}
function StepReview({ ctx, goTo }: ReviewProps) {
  const { data, setData } = ctx;
  // reason: internal underscore-prefixed attestation flags are not on WizardFormData.
  const attest = data as WizardFormData & { _attestTrue?: boolean; _attestRenew?: boolean };
  const elig = useMemo(() => computeEligibility(data), [data]);
  useEffect(() => {
    setData((prev) => ({ ...prev, eligibility: elig }));
  }, [elig]); // eslint-disable-line

  const primary = data.primaryApplicant;
  const fullName = [primary?.firstName, primary?.middleName, primary?.lastName, primary?.suffix]
    .filter(Boolean)
    .join(' ');
  const hh = data.household;
  const allJobs = Object.entries(data.jobs ?? {}).flatMap(([memberId, list]) => list.map((j) => ({ ...j, memberId })));
  const totalMonthly = elig.monthlyIncome;

  const banner =
    elig.initialDetermination === 'qualifies'
      ? 'qualify'
      : elig.initialDetermination === 'exceeds_within_5pct'
        ? 'qualify'
        : elig.initialDetermination === 'partial'
          ? 'maybe'
          : 'exceed';

  const headline =
    elig.initialDetermination === 'qualifies'
      ? "Based on what you've entered, your household appears to qualify for State-X Medicaid."
      : elig.initialDetermination === 'exceeds_within_5pct'
        ? 'You qualify after applying the federal 5% income disregard.'
        : elig.initialDetermination === 'partial'
          ? "Some members of your household qualify. We'll route others to the Health Insurance Marketplace."
          : 'Your income appears to be above the Medicaid threshold. You may still qualify for help through the Marketplace.';

  return (
    <Fragment>
      <div className={'outcome-banner ' + banner}>
        <div className="ic">
          <Icon name={banner === 'qualify' ? 'check' : banner === 'maybe' ? 'info' : 'info'} size={22} />
        </div>
        <div>
          <h2>{headline}</h2>
          <p>
            This determination is preliminary. Submit your application for a final decision from State-X HHS within 45
            days.
          </p>
        </div>
      </div>

      <Panel title="Eligibility math" subtitle="How we calculated this.">
        <div className="spec-list">
          <div className="row">
            <span className="k">Total monthly income (all sources)</span>
            <span className="v">{fmt$(totalMonthly)}</span>
          </div>
          <div className="row">
            <span className="k">Annualized household income</span>
            <span className="v">{fmt$(elig.annualIncome)}</span>
          </div>
          <div className="row">
            <span className="k">Household size</span>
            <span className="v">{elig.householdSize}</span>
          </div>
          <div className="row">
            <span className="k">100% of Federal Poverty Level (2026)</span>
            <span className="v">{fmt$(elig.fpl100)}</span>
          </div>
          <div className="row total">
            <span className="k">Your income as a % of FPL</span>
            <span className="v">{elig.fplPercent}%</span>
          </div>
          {elig.disregardApplied ? (
            <Fragment>
              <div className="row">
                <span className="k">5% FPL disregard applied (42 CFR §435.603(d)(4))</span>
                <span className="v">−{fmt$(elig.disregardAmount)}</span>
              </div>
              <div className="row">
                <span className="k">Countable income after disregard</span>
                <span className="v">
                  {fmt$(elig.countableIncome)} ({elig.countableFplPercent}% FPL)
                </span>
              </div>
            </Fragment>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Each person's pathway"
        subtitle="State-X Medicaid has different income limits depending on age, parental status, and pregnancy."
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
                    .map((s: string) => s[0]?.toUpperCase())
                    .join('') || '?'}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{o.memberName}</div>
                  <div className="pathway">
                    {o.pathway} · limit {o.pathwayPct}% FPL · age {o.age ?? '—'}
                    {o.withDisregard ? ' · disregard applied' : ''}
                  </div>
                </div>
              </div>
              <span className={'status-pill ' + (o.qualifies ? 'ok' : 'no')}>
                {o.qualifies ? (
                  <Fragment>
                    <Icon name="check" size={12} /> Qualifies
                  </Fragment>
                ) : (
                  <Fragment>
                    <Icon name="info" size={12} /> Over income
                  </Fragment>
                )}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="review-grid">
        <ReviewTile
          title="Household"
          onEdit={() => goTo('county')}
          rows={[
            { k: 'County', v: hh?.county },
            {
              k: 'Applying',
              v:
                hh?.applicationFor === 'myself'
                  ? 'Just yourself'
                  : hh?.applicationFor === 'household'
                    ? 'You + household'
                    : hh?.applicationFor === 'specific'
                      ? 'Specific people'
                      : '',
            },
            { k: 'Existing case', v: hh?.existingCase ? `Yes (#${hh?.caseNumber || '—'})` : 'No' },
          ]}
        />
        <ReviewTile
          title="Primary applicant"
          onEdit={() => goTo('name')}
          rows={[
            { k: 'Name', v: fullName },
            { k: 'DOB', v: fmtDate(primary?.dob) },
            { k: 'Sex', v: primary?.sex ? primary.sex[0].toUpperCase() + primary.sex.slice(1) : '' },
            { k: 'Phone', v: primary?.phone },
            { k: 'Email', v: primary?.email },
          ]}
        />
        <ReviewTile
          title="Address"
          onEdit={() => goTo('address')}
          rows={[
            { k: 'Street', v: (primary?.streetAddress ?? '') + (primary?.aptUnit ? ` #${primary.aptUnit}` : '') },
            { k: 'City', v: primary?.city },
            { k: 'State', v: primary?.state },
            { k: 'ZIP', v: primary?.zip },
          ]}
        />
        <ReviewTile
          title="Household members"
          onEdit={() => goTo('members')}
          rows={
            (data.householdMembers ?? []).length === 0
              ? [{ k: '—', v: 'No additional members' }]
              : (data.householdMembers ?? []).map((m) => ({
                  k: `${m.firstName} ${m.lastName}`.trim() || 'Member',
                  v: `${WIZARD_RELATIONSHIPS.find((r) => r.value === m.relationship)?.label || ''} · ${m.dob ? `${ageFrom(m.dob)} yrs` : ''}${m.applying ? ' · applying' : ' · not applying'}`,
                }))
          }
        />
        <ReviewTile
          title="Employment"
          onEdit={() => goTo('jobs')}
          rows={
            allJobs.length === 0
              ? [{ k: '—', v: 'No jobs entered' }]
              : allJobs.map((j) => ({
                  k: j.employer || j.businessName || 'Job',
                  v: `${fmt$(j.monthlyIncome ?? 0)} / mo`,
                }))
          }
        />
        <ReviewTile
          title="Health insurance"
          onEdit={() => goTo('insurance')}
          rows={Object.entries(data.healthInsurance ?? {}).map(([id, h]) => {
            const member = id === '0' ? primary : (data.householdMembers ?? []).find((m) => m.id === id);
            const name = member ? `${member.firstName || ''} ${member.lastName || ''}`.trim() : id;
            return {
              k: name || 'Member',
              v:
                h.hasInsurance === 'yes'
                  ? `Has coverage · ${h.companyName || '—'}`
                  : h.hasInsurance === 'lost'
                    ? `Lost coverage · ${fmtDate(h.coverageEndDate)}`
                    : h.hasInsurance === 'no'
                      ? 'No coverage'
                      : '—',
            };
          })}
        />
      </div>

      <Panel
        title="Attest and submit"
        subtitle="By submitting, you confirm everything above is true to the best of your knowledge."
      >
        <Stack gap={12}>
          <ChoiceCard
            kind="checkbox"
            name="attestTrue"
            value="true"
            // reason: _attestTrue/_attestRenew are leading-underscore internal wizard
            // attestation flags (like _bankConnected) not modelled on the shared
            // WizardFormData type; read them through a narrow local view.
            current={attest._attestTrue ? ['true'] : []}
            onChange={(arr) =>
              setData((prev) => ({ ...prev, _attestTrue: (Array.isArray(arr) ? arr : [arr]).includes('true') }))
            }
            title="I declare under penalty of perjury that the information I provided is true and correct."
            desc="Knowingly providing false information may result in criminal penalties under federal law (18 U.S.C. § 1001)."
          />
          <ChoiceCard
            kind="checkbox"
            name="attestRenew"
            value="true"
            current={attest._attestRenew ? ['true'] : []}
            onChange={(arr) =>
              setData((prev) => ({ ...prev, _attestRenew: (Array.isArray(arr) ? arr : [arr]).includes('true') }))
            }
            title="I understand I must report changes within 10 days."
            desc="Changes in income, address, household, or other coverage."
          />
        </Stack>
      </Panel>
    </Fragment>
  );
}

// ── Step 25 · Confirmation ──────────────────────────────────────────────
function StepConfirmation({ ctx }: ScreenProps) {
  const { data } = ctx;
  // reason: data.eligibility is the open EligibilityPreview record (Record<string,unknown>);
  // when present it holds the same shape computeEligibility produces, so view it through
  // the computed return type to read .outcomes/.annualIncome without per-field casts.
  const elig = (data.eligibility as ReturnType<typeof computeEligibility> | null) || computeEligibility(data);
  const primary = data.primaryApplicant;
  const fullName = [primary?.firstName, primary?.lastName].filter(Boolean).join(' ');
  const applicationId = useMemo(() => 'IA-MED-' + String(Math.floor(Math.random() * 9_000_000) + 1_000_000), []);
  const submittedAt = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    [],
  );

  const qualifies = elig.outcomes.filter((o) => o.qualifies);
  const denied = elig.outcomes.filter((o) => !o.qualifies);

  return (
    <div className="confirm-shell step-fade-in">
      <div className="confirm-card">
        <Stack gap={28}>
          <Stack gap={12}>
            <div className="eyebrow">Application submitted</div>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.025em' }}>
              You're all set, {primary?.firstName || 'applicant'}.
            </h1>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>
              We received your State-X Medicaid application on {submittedAt}. A caseworker will review and reach you
              within 45 days at <strong>{primary?.phone || primary?.email || 'the contact you provided'}</strong>.
            </p>
          </Stack>

          <div
            style={{
              background: 'var(--civic-bg-subtle)',
              padding: 16,
              borderRadius: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              fontSize: 15,
              border: '1px solid var(--civic-border-default)',
            }}
          >
            <div>
              <div className="muted">Application ID</div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--civic-font-mono)', marginTop: 4 }}>
                {applicationId}
              </div>
            </div>
            <div>
              <div className="muted">Submitted</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{submittedAt}</div>
            </div>
          </div>

          {qualifies.length > 0 ? (
            <div className="outcome-banner qualify" style={{ padding: 24 }}>
              <div className="ic">
                <Icon name="check" size={20} />
              </div>
              <div style={{ width: '100%' }}>
                <h2>
                  {qualifies.length === elig.outcomes.length
                    ? 'Everyone qualifies'
                    : `${qualifies.length} of ${elig.outcomes.length} household members qualify`}
                </h2>
                <p style={{ marginBottom: 14 }}>
                  Based on your income of {fmt$(elig.annualIncome)} ({elig.fplPercent}% FPL)
                  {elig.disregardApplied ? ' and the federal 5% income disregard' : ''}.
                </p>
                <div className="outcome-list" style={{ background: 'white', borderRadius: 8, padding: '0 16px' }}>
                  {qualifies.map((o) => (
                    <div key={o.memberId} className="outcome-row">
                      <div className="who">
                        <Avatar name={o.memberName} size={32} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--civic-text-primary)' }}>
                            {o.memberName}
                          </div>
                          <div className="pathway">{o.pathway}</div>
                        </div>
                      </div>
                      <span className="status-pill ok">
                        <Icon name="check" size={12} /> Approved
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {denied.length > 0 ? (
            <Alert
              kind="info"
              title={`${denied.length} ${denied.length === 1 ? 'person' : 'people'} not eligible for Medicaid this time`}
            >
              {denied.map((o) => o.memberName).join(', ')} {denied.length === 1 ? "doesn't" : "don't"} meet the income
              threshold for {denied[0].pathway}. They can shop subsidized plans on the Health Insurance Marketplace —
              your information has been sent there too.
            </Alert>
          ) : null}

          <Panel title="What happens next">
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
              <li>
                We mail your case packet within 5 business days. It includes your member IDs and your assigned
                managed-care organization.
              </li>
              <li>
                Your coverage with <strong>{elig.mco}</strong> begins on the first of next month. You can switch MCOs
                within 90 days, no questions asked.
              </li>
              <li>
                You may be asked to verify income, identity, or immigration status. We'll send you a list of what we
                need — usually pay stubs or a tax return.
              </li>
              <li>
                Renewal happens once a year. We'll remind you 60 days before, and most of the form is pre-filled from
                this application.
              </li>
            </ol>
          </Panel>

          <Stack gap={10}>
            <div className="panel-title" style={{ marginBottom: 0 }}>
              Save your application
            </div>
            <div className="fineprint">
              Keep a copy for your records. You can request another copy anytime by calling 1-800-338-8366.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" onClick={() => window.print()}>
                <Icon name="printer" size={14} /> Print summary
              </Button>
              <Button variant="outline" onClick={() => alert('In a real app this would download a PDF.')}>
                <Icon name="download" size={14} /> Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => alert(`Confirmation also sent to ${primary?.email || 'your email on file'}.`)}
              >
                <Icon name="mail" size={14} /> Email me a copy
              </Button>
            </div>
          </Stack>

          <Alert kind="neutral" title="Need help?">
            Call <strong>1-800-338-8366</strong> Mon–Fri 8am–5pm Central · TTY 1-800-735-2942 · Or visit your{' '}
            <a>local State-X HHS office</a>.
          </Alert>
        </Stack>
      </div>
    </div>
  );
}

Object.assign(window, {
  StepInsurance,
  StepEmployerCoverage,
  StepRetroactive,
  StepAuthorizedRep,
  StepPreferences,
  StepReview,
  StepConfirmation,
  ReviewTile,
});

export {
  StepInsurance,
  StepEmployerCoverage,
  StepRetroactive,
  StepAuthorizedRep,
  StepPreferences,
  ReviewTile,
  StepReview,
  StepConfirmation,
};
