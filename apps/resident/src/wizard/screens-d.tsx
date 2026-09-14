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
  validateDob,
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
import { SSNInput } from './SSNInput';
import { formatPhone, stripPhone } from '../lib/phone';

/* =========================================================================
   Screens D — New screens + combined screens for the 25-step flow
   ========================================================================= */

// ── Step 2 · Login ──────────────────────────────────────────────────────
function StepLogin({ ctx, goNext }) {
  const { setPath } = ctx;
  const [mode, setMode] = useState('guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Stack gap={24}>
      <Alert kind="neutral" title="You can apply with or without a SignIn account">
        With an account, you can save your progress across devices, link existing State-X HHS cases, and reuse this
        information for SNAP, WIC, and other programs.
      </Alert>

      <RadioGroup
        name="loginMode"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: 'signin',
            title: 'Sign in to my State-X HHS account',
            desc: 'You already have an account from a prior application or program.',
          },
          {
            value: 'signup',
            title: 'Create an State-X HHS account',
            desc: "Recommended if you'll apply for multiple programs or check your case online.",
          },
          {
            value: 'guest',
            title: 'Continue as a guest',
            desc: 'Apply now, create an account later. Your progress is saved on this device only.',
          },
        ]}
      />

      {mode === 'signin' ? (
        <Panel title="Sign in">
          <Stack gap={14}>
            <Field label="Email or username" required>
              <TextInput
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" required>
              <TextInput value={password} onChange={setPassword} type="password" autoComplete="current-password" />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a className="fineprint">Forgot password?</a>
              <Button
                variant="primary"
                onClick={() => {
                  setPath('primaryApplicant', 'email', email);
                  goNext();
                }}
              >
                Sign in <Icon name="arrowRight" size={14} />
              </Button>
            </div>
          </Stack>
        </Panel>
      ) : null}

      {mode === 'signup' ? (
        <Panel title="Create your account">
          <Stack gap={14}>
            <Field label="Email" required hint="We'll send a verification link.">
              <TextInput
                value={email}
                onChange={(x) => {
                  setEmail(x);
                  setPath('primaryApplicant', 'email', x);
                }}
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field label="Create a password" required hint="At least 12 characters, with one number and one symbol.">
              <TextInput value={password} onChange={setPassword} type="password" autoComplete="new-password" />
            </Field>
            <ChoiceCard
              kind="checkbox"
              name="terms"
              value="ok"
              current={[]}
              onChange={() => {}}
              title="I agree to the State-X HHS terms and Privacy Notice"
            />
          </Stack>
        </Panel>
      ) : null}

      {mode === 'guest' ? (
        <Alert kind="info">
          You'll be able to create an account at the end of your application — your information will carry over.
        </Alert>
      ) : null}
    </Stack>
  );
}

// ── Step 3 · HouseholdInfo (combined) ───────────────────────────────────
function StepHouseholdInfo({ ctx }) {
  const { data, setPath } = ctx;
  const v = data.household;
  return (
    <Stack gap={24}>
      <Panel title="Where you live">
        <Field label="County" required hint="The county you live in, not where you receive mail.">
          <Select
            value={v.county}
            onChange={(x) => setPath('household', 'county', x)}
            options={IOWA_COUNTIES}
            placeholder="Select a county"
          />
        </Field>
      </Panel>

      <Panel title="Who is this application for?">
        <RadioGroup
          name="applicationFor"
          value={v.applicationFor}
          onChange={(x) => setPath('household', 'applicationFor', x)}
          options={[
            { value: 'myself', title: 'Just myself', desc: 'Coverage for yourself only.' },
            {
              value: 'household',
              title: 'Myself and members of my household',
              desc: "You'll be the primary contact for everyone applying.",
            },
            {
              value: 'specific',
              title: 'Someone else in my household',
              desc: 'Apply on behalf of another adult or for a child.',
            },
          ]}
        />
      </Panel>

      <Panel title="Have you applied to State-X HHS before?">
        <Stack gap={14}>
          <RadioGroup
            name="existingCase"
            value={v.existingCase}
            onChange={(x) => setPath('household', 'existingCase', x)}
            cols={2}
            options={[
              { value: false, title: 'No, first time' },
              { value: true, title: 'Yes, I have a case number' },
            ]}
          />
          {v.existingCase === true ? (
            <Field label="Case number" hint="On any State-X HHS letter — eight digits.">
              <TextInput
                value={v.caseNumber}
                onChange={(x) => setPath('household', 'caseNumber', x)}
                placeholder="30418272"
                inputMode="numeric"
                maxLength={8}
              />
            </Field>
          ) : null}
        </Stack>
      </Panel>
    </Stack>
  );
}

// ── Step 4 · PersonalInfo (combined) ────────────────────────────────────
function StepPersonalInfo({ ctx }) {
  const { data, setPath } = ctx;
  const v = data.primaryApplicant;
  return (
    <Stack gap={24}>
      <Panel title="Your legal name and birth">
        <Stack gap={14}>
          <div className="grid-name">
            <Field label="First name" required>
              <TextInput
                value={v.firstName}
                onChange={(x) => setPath('primaryApplicant', 'firstName', x)}
                autoComplete="given-name"
              />
            </Field>
            <Field label="Middle">
              <TextInput value={v.middleName} onChange={(x) => setPath('primaryApplicant', 'middleName', x)} />
            </Field>
            <Field label="Last name" required>
              <TextInput
                value={v.lastName}
                onChange={(x) => setPath('primaryApplicant', 'lastName', x)}
                autoComplete="family-name"
              />
            </Field>
            <Field label="Suffix">
              <Select
                value={v.suffix}
                onChange={(x) => setPath('primaryApplicant', 'suffix', x)}
                options={['', 'Jr.', 'Sr.', 'II', 'III', 'IV']}
                placeholder="—"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Date of birth" required error={v.dob ? validateDob(v.dob) : undefined}>
              <TextInput type="date" value={v.dob} onChange={(x) => setPath('primaryApplicant', 'dob', x)} />
            </Field>
            <Field label="Sex" required>
              <Select
                value={v.sex}
                onChange={(x) => setPath('primaryApplicant', 'sex', x)}
                options={[
                  { value: 'female', label: 'Female' },
                  { value: 'male', label: 'Male' },
                  { value: 'x', label: 'X (non-binary)' },
                  { value: 'decline', label: 'Prefer not to say' },
                ]}
                placeholder="Select"
              />
            </Field>
          </div>
        </Stack>
      </Panel>

      <Panel title="Social Security Number">
        <Stack gap={12}>
          <Field
            label="SSN"
            htmlFor="primary-ssn-d"
            required={!v.noSSN}
            hint="Federal law requires an SSN for everyone who has one and is applying. We use it only to verify identity and income."
          >
            <SSNInput
              id="primary-ssn-d"
              value={v.ssn}
              disabled={v.noSSN}
              onChange={(digits) => setPath('primaryApplicant', 'ssn', digits)}
            />
          </Field>
          <ChoiceCard
            kind="checkbox"
            name="noSSN"
            value="noSSN"
            current={v.noSSN ? ['noSSN'] : []}
            onChange={(arr) => setPath('primaryApplicant', 'noSSN', arr.includes('noSSN'))}
            title="I don't have a Social Security Number"
            desc="You may still qualify for some programs. Your case will be routed for additional verification."
          />
        </Stack>
      </Panel>

      <Panel title="Where you currently live">
        <Stack gap={12}>
          <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <Field label="Street address" required>
              <TextInput
                value={v.streetAddress}
                onChange={(x) => setPath('primaryApplicant', 'streetAddress', x)}
                autoComplete="address-line1"
                placeholder="412 Walnut St"
              />
            </Field>
            <Field label="Apt / unit">
              <TextInput value={v.aptUnit} onChange={(x) => setPath('primaryApplicant', 'aptUnit', x)} />
            </Field>
          </div>
          <div className="grid-csz">
            <Field label="City" required>
              <TextInput
                value={v.city}
                onChange={(x) => setPath('primaryApplicant', 'city', x)}
                autoComplete="address-level2"
              />
            </Field>
            <Field label="State" required>
              <Select value={v.state} onChange={(x) => setPath('primaryApplicant', 'state', x)} options={US_STATES} />
            </Field>
            <Field label="ZIP" required>
              <TextInput
                value={v.zip}
                onChange={(x) => setPath('primaryApplicant', 'zip', x)}
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
                placeholder="50309"
              />
            </Field>
          </div>
          <ChoiceCard
            kind="checkbox"
            name="homeless"
            value="homeless"
            current={v.homeless ? ['homeless'] : []}
            onChange={(arr) => setPath('primaryApplicant', 'homeless', arr.includes('homeless'))}
            title="I don't have a permanent home address"
            desc="A shelter, motel, or someone else's place is fine — we can use a mailing address instead."
          />
        </Stack>
      </Panel>

      <Panel title="How we can reach you">
        <Stack gap={12}>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 200px' }}>
            <Field label="Phone number" required>
              <TextInput
                type="tel"
                inputMode="tel"
                value={formatPhone(v.phone)}
                onChange={(x) => setPath('primaryApplicant', 'phone', stripPhone(x))}
                placeholder="(515) 555-0142"
                autoComplete="tel"
              />
            </Field>
            <Field label="Type">
              <Select
                value={v.phoneType}
                onChange={(x) => setPath('primaryApplicant', 'phoneType', x)}
                options={[
                  { value: 'mobile', label: 'Mobile' },
                  { value: 'home', label: 'Home' },
                  { value: 'work', label: 'Work' },
                ]}
              />
            </Field>
          </div>
          <Field label="Email" hint="We send case status notices here.">
            <TextInput
              type="email"
              value={v.email}
              onChange={(x) => setPath('primaryApplicant', 'email', x)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
        </Stack>
      </Panel>
    </Stack>
  );
}

// ── Step 5 · Demographics (combined: race, health-questions, citizenship, tax filing) ──
function StepDemographicsAll({ ctx }) {
  const { data, setPath, setData } = ctx;
  const v = data.demographics;
  const c = data.citizenship['0'];
  // NOTE: reads old per-member schema; taxFiling is now a flat household object (see ENG-1697)
  const t = data.taxFiling['0'] || {};

  const setC = (key, val) =>
    setData((prev) => ({
      ...prev,
      citizenship: { ...prev.citizenship, '0': { ...prev.citizenship['0'], [key]: val } },
    }));
  const setT = (key, val) =>
    setData((prev) => ({
      ...prev,
      taxFiling: { ...prev.taxFiling, '0': { ...prev.taxFiling['0'], [key]: val } },
    }));

  return (
    <Stack gap={24}>
      <Panel
        title="A few questions about your health and history"
        subtitle="Each opens a separate Medicaid pathway. Answer honestly — you can change anything before you submit."
      >
        <Stack gap={0}>
          <QuestionRow
            q="Are you pregnant?"
            hint="Including a confirmed pregnancy in the last 60 days."
            value={v.pregnant}
            onChange={(x) => setPath('demographics', 'pregnant', x)}
          />
          {v.pregnant === true ? (
            <div className="grid-2" style={{ marginTop: 12, marginBottom: 8 }}>
              <Field label="Expected due date">
                <TextInput type="date" value={v.dueDate} onChange={(x) => setPath('demographics', 'dueDate', x)} />
              </Field>
              <Field label="Number of babies expected" hint="Twins or triplets affect your household size.">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={String(v.expectedBabies)}
                  onChange={(x) => setPath('demographics', 'expectedBabies', Math.max(1, Number(x) || 1))}
                />
              </Field>
            </div>
          ) : null}

          <QuestionRow
            q="Do you have a disability?"
            value={v.disability}
            onChange={(x) => setPath('demographics', 'disability', x)}
          />
          <QuestionRow
            q="Do you receive Supplemental Security Income (SSI)?"
            value={v.receivesSSI}
            onChange={(x) => setPath('demographics', 'receivesSSI', x)}
          />
          <QuestionRow
            q="Are you a US military veteran?"
            value={v.veteran}
            onChange={(x) => setPath('demographics', 'veteran', x)}
          />
          <QuestionRow
            q="Were you in foster care at age 18 or older?"
            hint="Former foster youth qualify for Medicaid until age 26 regardless of income."
            value={v.formerFosterYouth}
            onChange={(x) => setPath('demographics', 'formerFosterYouth', x)}
          />
        </Stack>
      </Panel>

      <Panel
        title="Citizenship and immigration status"
        subtitle="Your status is confidential. State-X HHS does not share immigration information with enforcement."
      >
        <Stack gap={14}>
          <RadioGroup
            name="cit"
            value={c.status}
            onChange={(x) => setC('status', x)}
            options={[
              {
                value: 'us_citizen',
                title: 'US citizen',
                desc: 'Born in the US, born to a US citizen, or naturalized.',
              },
              { value: 'us_national', title: 'US national', desc: 'Born in American Samoa or Swains Island.' },
              { value: 'lpr', title: 'Lawful permanent resident (green card)' },
              {
                value: 'qualified_other',
                title: 'Other qualified non-citizen',
                desc: 'Refugee, asylee, parolee, Cuban/Haitian entrant, etc.',
              },
              {
                value: 'not_qualified',
                title: 'Non-qualified or undocumented',
                desc: 'May still qualify for emergency Medicaid.',
              },
            ]}
          />
          {c.status === 'lpr' || c.status === 'qualified_other' ? (
            <div className="grid-2">
              <Field label="Document type">
                <Select
                  value={c.documentType}
                  onChange={(x) => setC('documentType', x)}
                  options={[
                    { value: 'i551', label: 'I-551 (Green Card)' },
                    { value: 'i94', label: 'I-94' },
                    { value: 'ead', label: 'Employment Authorization (I-766)' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="—"
                />
              </Field>
              <Field label="Alien / USCIS number">
                <TextInput value={c.alienNumber} onChange={(x) => setC('alienNumber', x)} placeholder="A012345678" />
              </Field>
            </div>
          ) : null}
        </Stack>
      </Panel>

      <Panel title="Tax filing" subtitle="State-X Medicaid uses your federal tax household to determine income limits.">
        <Stack gap={14}>
          <Field label="Will you file a federal income tax return this year?" required>
            <RadioGroup
              name="willFile"
              value={t.willFile}
              onChange={(x) => setT('willFile', x)}
              cols={3}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'unsure', label: 'Not sure' },
              ]}
            />
          </Field>
          {t.willFile === 'yes' ? (
            <Stack gap={0}>
              <QuestionRow
                q="Will you file jointly with a spouse?"
                value={t.filingJointly}
                onChange={(x) => setT('filingJointly', x)}
              />
              <QuestionRow
                q="Will you claim any dependents?"
                value={t.claimsDependents}
                onChange={(x) => setT('claimsDependents', x)}
                hint="A dependent is someone you list on your return — typically a child or supported relative."
              />
            </Stack>
          ) : null}
        </Stack>
      </Panel>

      <Panel title="Race and ethnicity" subtitle="Optional, but it helps State-X HHS measure equitable access.">
        <Stack gap={16}>
          <Field label="Which best describes your race? Select all that apply.">
            <CheckboxGroup
              name="race"
              value={v.race}
              onChange={(x) => setPath('demographics', 'race', x)}
              options={[
                { value: 'white', label: 'White' },
                { value: 'black', label: 'Black or African American' },
                { value: 'ai_an', label: 'American Indian / Alaska Native' },
                { value: 'asian', label: 'Asian' },
                { value: 'nh_pi', label: 'Native Hawaiian / Pacific Islander' },
                { value: 'other', label: 'Some other race' },
                { value: 'decline', label: 'Prefer not to say' },
              ]}
              cols={2}
            />
          </Field>
          <Field label="Are you of Hispanic, Latino, or Spanish origin?">
            <RadioGroup
              name="eth"
              value={v.ethnicity}
              onChange={(x) => setPath('demographics', 'ethnicity', x)}
              cols={3}
              options={[
                { value: 'hispanic', label: 'Yes' },
                { value: 'not_hispanic', label: 'No' },
                { value: 'decline', label: 'Prefer not to say' },
              ]}
            />
          </Field>
        </Stack>
      </Panel>
    </Stack>
  );
}

// ── Step 8 · EmploymentIntro ────────────────────────────────────────────
function StepEmploymentIntro({ ctx, goNext }) {
  return (
    <Stack gap={24}>
      <Panel>
        <Stack gap={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'var(--civic-accent-bg)',
                color: 'var(--civic-accent-text)',
                display: 'grid',
                placeContent: 'center',
              }}
            >
              <Icon name="briefcase" size={28} />
            </div>
            <div>
              <h2 style={{ marginBottom: 4 }}>Let's talk about employment</h2>
              <p className="muted">We need a clear picture of every wage earner in your household.</p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--civic-border-default)', paddingTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              {[
                {
                  ic: 'users',
                  t: 'Every working adult',
                  d: 'Include everyone in your household who earns a wage, even part-time or gig work.',
                },
                {
                  ic: 'briefcase',
                  t: 'Every active job',
                  d: 'If someone works two jobs, list both. We need them separately to verify pay stubs.',
                },
                {
                  ic: 'calendar',
                  t: 'Recent job history',
                  d: "We'll ask about jobs you've left in the past 3 months, in case you qualify retroactively.",
                },
              ].map((b, i) => (
                <div key={i}>
                  <div style={{ color: 'var(--civic-accent-text)', marginBottom: 8 }}>
                    <Icon name={b.ic} size={20} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{b.t}</div>
                  <div className="fineprint">{b.d}</div>
                </div>
              ))}
            </div>
          </div>
        </Stack>
      </Panel>

      <Alert kind="neutral" title="What you'll need">
        Recent pay stubs (last 30 days) · employer addresses and phone numbers · for self-employed: a rough estimate of
        monthly revenue and business expenses.
      </Alert>
    </Stack>
  );
}

// ── Step 9 · Argyle Connect (optional automated payroll connect) ────────
function StepArgyleConnect({ ctx, goNext }) {
  const { data } = ctx;
  const [connecting, setConnecting] = useState(null);

  function fakeConnect() {
    setConnecting('connecting');
    setTimeout(() => setConnecting('done'), 1800);
  }

  return (
    <Stack gap={24}>
      <Panel>
        <Stack gap={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div className="tag" style={{ marginBottom: 8 }}>
                Optional · saves time
              </div>
              <h2 style={{ marginBottom: 8 }}>Connect your payroll automatically</h2>
              <p className="muted" style={{ fontSize: 14 }}>
                Sign in to your employer's payroll provider (ADP, Gusto, Workday, etc.) and we'll pull your last 90 days
                of pay stubs. Skip this and you'll enter your wages by hand on the next screen.
              </p>
            </div>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 16,
                background: 'var(--civic-success-bg)',
                color: 'var(--civic-success-text)',
                display: 'grid',
                placeContent: 'center',
              }}
            >
              <Icon name="shieldCheck" size={48} />
            </div>
          </div>

          {connecting === null ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {['ADP', 'Paychex', 'Gusto', 'Workday', 'Rippling', 'Square Payroll', 'Bamboo HR', 'Other'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={fakeConnect}
                  className="job-card"
                  style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: '1px solid var(--civic-border-component)',
                    background: 'var(--civic-bg-card)',
                    fontFamily: 'inherit',
                    fontSize: 15,
                    fontWeight: 500,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : connecting === 'connecting' ? (
            <Alert kind="info" title="Connecting securely…">
              We're pulling your last 90 days of pay stubs from your payroll provider. This usually takes 10–30 seconds.
            </Alert>
          ) : (
            <Alert kind="success" title="3 months of pay history connected">
              We found 6 pay stubs from Hy-Vee Stores totaling $7,698 over the last 90 days. We've filled in your job
              details — you can review and edit on the next screen.
            </Alert>
          )}

          <div className="fineprint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={12} />
            Read-only access · bank-grade encryption · disconnect anytime
          </div>
        </Stack>
      </Panel>

      <div style={{ textAlign: 'center' }}>
        <Button variant="ghost" onClick={goNext}>
          Skip and enter manually <Icon name="arrowRight" size={14} />
        </Button>
      </div>
    </Stack>
  );
}

// ── Step 11 · JobHistory (jobs ended in the past 3 months) ──────────────
function StepJobHistory({ ctx }) {
  const { data, setData } = ctx;
  // Use a flat history list (kept in form._jobHistory for the prototype)
  const history = data._jobHistory || [];
  const setHist = (next) => setData((prev) => ({ ...prev, _jobHistory: next }));

  const add = () =>
    setHist([
      ...history,
      {
        id: 'h' + Math.floor(Math.random() * 1e6),
        employer: '',
        endDate: '',
        reason: '',
      },
    ]);
  const update = (id, patch) => setHist(history.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const remove = (id) => setHist(history.filter((h) => h.id !== id));

  return (
    <Stack gap={24}>
      <Alert kind="info" title="Jobs that ended in the past 3 months">
        Past income still counts for the months it was earned. If you'd want Medicaid to cover medical bills from those
        months, list jobs you've recently left.
      </Alert>

      {history.length === 0 ? (
        <Panel subtitle="No past jobs listed. Add one if you've left a job recently — or skip ahead.">
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add a past job
          </button>
        </Panel>
      ) : (
        <Stack gap={14}>
          {history.map((h, idx) => (
            <Panel
              key={h.id}
              title={`Past job ${idx + 1}`}
              action={
                <button
                  type="button"
                  className="btn btn--ghost size-sm"
                  onClick={() => remove(h.id)}
                  style={{ color: 'var(--civic-destructive-text)' }}
                >
                  <Icon name="trash" size={14} /> Remove
                </button>
              }
            >
              <div className="grid-2">
                <Field label="Employer">
                  <TextInput value={h.employer} onChange={(x) => update(h.id, { employer: x })} />
                </Field>
                <Field label="Date ended">
                  <TextInput type="date" value={h.endDate} onChange={(x) => update(h.id, { endDate: x })} />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Reason job ended">
                  <Select
                    value={h.reason}
                    onChange={(x) => update(h.id, { reason: x })}
                    options={[
                      { value: 'laid_off', label: 'Laid off / position eliminated' },
                      { value: 'quit', label: 'Resigned' },
                      { value: 'fired', label: 'Terminated' },
                      { value: 'moved', label: 'Moved away' },
                      { value: 'seasonal', label: 'Seasonal job ended' },
                      { value: 'other', label: 'Other' },
                    ]}
                    placeholder="—"
                  />
                </Field>
              </div>
            </Panel>
          ))}
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add another past job
          </button>
        </Stack>
      )}
    </Stack>
  );
}

// ── Step 12 · JobSummary ────────────────────────────────────────────────
function StepJobSummary({ ctx }) {
  const { data } = ctx;
  const allJobs = Object.entries(data.jobs).flatMap(([id, list]) => list.map((j) => ({ ...j, memberId: id })));
  const totalMonthly = allJobs.reduce((s, j) => s + (Number(j.monthlyIncome) || 0), 0);
  const totalAnnual = totalMonthly * 12;

  const memberName = (id) => {
    if (id === '0')
      return [data.primaryApplicant.firstName, data.primaryApplicant.lastName].filter(Boolean).join(' ') || 'Primary';
    const m = data.householdMembers.find((m) => m.id === id);
    return m ? `${m.firstName} ${m.lastName}`.trim() : id;
  };

  return (
    <Stack gap={24}>
      <Panel title="Your household's wages — at a glance">
        <Stack gap={14}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: 18, background: 'var(--civic-bg-subtle)', borderRadius: 12 }}>
              <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total monthly wages
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
                {fmt$(totalMonthly)}
              </div>
              <div className="fineprint">
                Across {allJobs.length} job{allJobs.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ padding: 18, background: 'var(--civic-bg-subtle)', borderRadius: 12 }}>
              <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Annualized
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
                {fmt$(totalAnnual)}
              </div>
              <div className="fineprint">From wages only — other income added later</div>
            </div>
          </div>

          {allJobs.length === 0 ? (
            <Alert kind="neutral">
              No jobs entered yet. Go back to add at least one if anyone in your household works.
            </Alert>
          ) : (
            <div
              style={{
                background: 'var(--civic-bg-card)',
                border: '1px solid var(--civic-border-default)',
                borderRadius: 12,
              }}
            >
              {allJobs.map((j, i) => (
                <div
                  key={j.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 120px',
                    gap: 16,
                    padding: '14px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--civic-border-default)',
                    alignItems: 'center',
                    fontSize: 15,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--civic-text-primary)' }}>
                      {j.employer || j.businessName || '—'}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {memberName(j.memberId)} {j.selfEmployed ? '· Self-employed' : ''}
                    </div>
                  </div>
                  <div className="muted">
                    {j.selfEmployed
                      ? `${fmt$(j.grossRevenue || 0)} rev · ${fmt$(j.businessExpenses || 0)} exp`
                      : `${j.payRate ? '$' + j.payRate : '—'} · ${j.hoursPerWeek || '—'} hrs/wk`}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt$(j.monthlyIncome)}/mo
                  </div>
                </div>
              ))}
            </div>
          )}
        </Stack>
      </Panel>

      <Alert kind="info">
        These numbers will feed directly into your eligibility math. If anything looks off, go back and fix it now.
      </Alert>
    </Stack>
  );
}

// ── Step 13 · IncomeIntro ───────────────────────────────────────────────
function StepIncomeIntro() {
  return (
    <Stack gap={24}>
      <Panel>
        <Stack gap={16}>
          <h2>Now: income other than wages</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Wages from jobs are the most common source, but Medicaid also counts other regular money you receive —
            Social Security, unemployment, child support, pensions, rental income. We'll ask about each in turn.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            {[
              {
                t: 'Counted',
                items: [
                  'Wages & salaries',
                  'Self-employment',
                  'Social Security',
                  'Unemployment',
                  'Tribal income',
                  'Pensions',
                  'Rental income',
                  'Interest & dividends',
                ],
              },
              {
                t: 'Not counted',
                items: [
                  'SSI',
                  'Veterans benefits',
                  "Workers' comp",
                  'Child support paid',
                  'Gifts',
                  'Most one-time payments',
                ],
              },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  gridColumn: i === 0 ? '1 / 3' : '3 / 5',
                  padding: 14,
                  background: 'var(--civic-bg-subtle)',
                  borderRadius: 12,
                  border: '1px solid var(--civic-border-default)',
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: i === 0 ? 'var(--civic-success-text)' : 'var(--civic-text-secondary)',
                  }}
                >
                  <Icon name={i === 0 ? 'check' : 'x'} size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {c.t}
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: 'var(--civic-text-secondary)',
                  }}
                >
                  {c.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Stack>
      </Panel>
    </Stack>
  );
}

// ── Step 16 · IncomeDiscrepancy ─────────────────────────────────────────
function StepIncomeDiscrepancy({ ctx }) {
  const { data } = ctx;
  const allJobs = Object.values(data.jobs).flat();
  const monthlyEmp = allJobs.reduce((s, j) => s + (Number(j.monthlyIncome) || 0), 0);
  const annualReported =
    monthlyEmp * 12 + (data.otherIncome || []).reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0) * 12;
  const agi = Number(data.projectedIncome.lastTaxReturnAGI || 0);

  const diff = agi ? annualReported - agi : 0;
  const pctDiff = agi ? Math.abs(diff) / agi : 0;
  const significant = agi && pctDiff > 0.25;

  if (!agi) {
    return (
      <Alert kind="info" title="No tax return to compare against">
        You didn't enter an AGI from your last tax return, so there's nothing to reconcile. We'll verify your reported
        income against payroll records when we process your application.
      </Alert>
    );
  }

  if (!significant) {
    return (
      <Stack gap={24}>
        <div className="outcome-banner qualify">
          <div className="ic">
            <Icon name="check" size={22} />
          </div>
          <div>
            <h2>Your numbers add up</h2>
            <p>
              The income you reported ({fmt$(annualReported)}/yr) is within 25% of your last tax return AGI ({fmt$(agi)}
              /yr). No reconciliation needed.
            </p>
          </div>
        </div>
        <Panel title="What we compared">
          <div className="spec-list">
            <div className="row">
              <span className="k">Reported annual income (this app)</span>
              <span className="v">{fmt$(annualReported)}</span>
            </div>
            <div className="row">
              <span className="k">Most recent tax return AGI</span>
              <span className="v">{fmt$(agi)}</span>
            </div>
            <div className="row">
              <span className="k">Difference</span>
              <span className="v">
                {fmt$(Math.abs(diff))} ({Math.round(pctDiff * 100)}%)
              </span>
            </div>
          </div>
        </Panel>
      </Stack>
    );
  }

  return (
    <Stack gap={24}>
      <Alert kind="warning" title="Your reported income looks different from your tax return">
        You reported {fmt$(annualReported)} for this year, but your last tax return shows AGI of {fmt$(agi)}. That's a
        difference of {fmt$(Math.abs(diff))} ({Math.round(pctDiff * 100)}%). Differences over 25% need a written
        explanation.
      </Alert>

      <Panel title="Choose what to do">
        <RadioGroup
          name="discrepancy"
          value=""
          onChange={() => {}}
          options={[
            {
              value: 'different_year',
              title: 'My situation changed since last year',
              desc: 'New job, lost a job, retired, started a business, etc.',
            },
            {
              value: 'errors',
              title: 'I made an error on this app',
              desc: 'Go back and correct your reported income.',
            },
            {
              value: 'tax_error',
              title: 'My tax return has an error',
              desc: "We'll route your case for caseworker review.",
            },
            {
              value: 'explain',
              title: 'Provide a written explanation',
              desc: 'Tell us why the numbers differ. A caseworker will review.',
            },
          ]}
        />
      </Panel>

      <Field label="Optional: tell us more">
        <Textarea placeholder="e.g. I retired in March and my income dropped from $74,000/yr to about $22,000/yr from Social Security." />
      </Field>
    </Stack>
  );
}

// ── Step 17 · HealthIntro ───────────────────────────────────────────────
function StepHealthIntro() {
  return (
    <Stack gap={24}>
      <Panel>
        <Stack gap={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'var(--civic-accent-bg)',
                color: 'var(--civic-accent-text)',
                display: 'grid',
                placeContent: 'center',
              }}
            >
              <Icon name="heart" size={28} />
            </div>
            <div>
              <h2 style={{ marginBottom: 4 }}>Your current health coverage</h2>
              <p className="muted">
                Medicaid is "payer of last resort" — meaning it pays after any other coverage. So we ask about other
                coverage even if you think yours is ending.
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--civic-border-default)', paddingTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              {[
                { t: 'Insurance you have now', d: 'Plans through a job, the Marketplace, Medicare, or TRICARE.' },
                {
                  t: 'Insurance offered by an employer',
                  d: 'Even if no one is enrolled, an offer affects what plans you can buy on the Marketplace.',
                },
                {
                  t: 'Past unpaid medical bills',
                  d: 'Medicaid can sometimes pay bills from up to 3 months before you applied.',
                },
              ].map((b, i) => (
                <div key={i}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{b.t}</div>
                  <div className="fineprint">{b.d}</div>
                </div>
              ))}
            </div>
          </div>
        </Stack>
      </Panel>
    </Stack>
  );
}

// ── Step 24 · Sign ──────────────────────────────────────────────────────
function StepSign({ ctx }) {
  const { data, setData } = ctx;
  const primary = data.primaryApplicant;
  const [signature, setSignature] = useState(data._signature || '');

  useEffect(() => {
    setData((prev) => ({ ...prev, _signature: signature }));
  }, [signature]); // eslint-disable-line

  const fullName = [primary.firstName, primary.lastName].filter(Boolean).join(' ').trim();
  const matches = signature.trim().toLowerCase() === fullName.toLowerCase() && fullName.length > 0;

  return (
    <Stack gap={24}>
      <Panel title="Your signature">
        <Stack gap={14}>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Type your full legal name below. By doing so, you certify under penalty of perjury that everything you've
            entered is true and complete to the best of your knowledge.
          </p>
          <Field label={`Type your name as it appears on your application${fullName ? `: ${fullName}` : ''}`} required>
            <TextInput value={signature} onChange={setSignature} placeholder={fullName || 'Your full legal name'} />
          </Field>
          {signature && !matches ? (
            <Alert kind="warning">Your signature must match your name above exactly.</Alert>
          ) : null}

          <div
            style={{
              marginTop: 10,
              padding: 24,
              background: 'var(--civic-bg-subtle)',
              border: '1px dashed var(--civic-border-default)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div>
              <div className="fineprint" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Signed
              </div>
              <div
                style={{
                  fontFamily: 'var(--civic-font-mono)',
                  fontSize: 28,
                  marginTop: 6,
                  color: matches ? 'var(--civic-text-primary)' : 'var(--civic-text-placeholder)',
                  fontStyle: 'italic',
                  letterSpacing: '0.02em',
                }}
              >
                {signature || '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fineprint" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Date
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 6 }}>
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      <Panel title="What you're certifying">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
          <li>The information I provided is true and complete to the best of my knowledge.</li>
          <li>
            I understand that knowingly providing false information may result in criminal penalties under federal law
            (18 U.S.C. § 1001).
          </li>
          <li>I will report changes to income, household, address, or other coverage within 10 days.</li>
          <li>
            I authorize State-X HHS to verify my information with the IRS, the Social Security Administration, and other
            state agencies.
          </li>
          <li>I understand that Medicaid is the payer of last resort — any other coverage I have will pay first.</li>
        </ol>
      </Panel>
    </Stack>
  );
}

Object.assign(window, {
  StepLogin,
  StepHouseholdInfo,
  StepPersonalInfo,
  StepDemographicsAll,
  StepEmploymentIntro,
  StepArgyleConnect,
  StepJobHistory,
  StepJobSummary,
  StepIncomeIntro,
  StepIncomeDiscrepancy,
  StepHealthIntro,
  StepSign,
});

export {
  StepLogin,
  StepHouseholdInfo,
  StepPersonalInfo,
  StepDemographicsAll,
  StepEmploymentIntro,
  StepArgyleConnect,
  StepJobHistory,
  StepJobSummary,
  StepIncomeIntro,
  StepIncomeDiscrepancy,
  StepHealthIntro,
  StepSign,
};
