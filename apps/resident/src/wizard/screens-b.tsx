import { PAY_FREQUENCY, computeMonthlyIncome } from './income-calc';
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
import type { FormDataContextValue, WizardFormData, HouseholdMember, OtherIncome } from './form-data.types';

// Every screen receives the FormDataContext as `ctx`.
interface ScreenProps {
  ctx: FormDataContextValue;
}

// StepTaxFiling/StepTaxDependents below are older, unrouted screens that still read
// the pre-ENG-1697 per-member tax schema (`taxFiling['0']`), which no longer exists
// on the flat TaxFiling model. Model that legacy shape so they type-check without
// changing their (already inert) runtime behavior.
type LegacyTaxFilingMap = Record<string, LegacyTaxFilingEntry | undefined>;
interface LegacyTaxFilingEntry {
  willFile?: string;
  filingJointly?: boolean | null;
  claimsDependents?: boolean | null;
  claimedDependents?: string[];
}

// workRequirements is an open Record<string, unknown> on the model; this screen
// reads a per-person entry with these fields. Name that entry shape.
interface WorkRequirementsEntry {
  employedOrInActivity?: boolean | null;
  activityDescription?: string;
  hoursPerWeek?: number;
  exemptions?: string[];
}

/* =========================================================================
   Screens B — Citizenship, tax filing, work requirements, household,
                jobs, other income, projected income
   Steps 11 – 18
   ========================================================================= */

// ── Step 11 · Citizenship & immigration ─────────────────────────────────
function StepCitizenship({ ctx }: ScreenProps) {
  const { data, setData } = ctx;
  const c = data.citizenship?.['0'];
  const set = (key: string, val: unknown) =>
    setData((prev) => ({
      ...prev,
      citizenship: { ...prev.citizenship, '0': { ...prev.citizenship?.['0'], [key]: val } },
    }));
  if (!c) return null;

  return (
    <Fragment>
      <Field label="What is your citizenship or immigration status?" required>
        <RadioGroup
          name="citizenship"
          value={c.status}
          onChange={(x) => set('status', x)}
          options={[
            { value: 'us_citizen', title: 'US citizen', desc: 'Born in the US, born to a US citizen, or naturalized.' },
            { value: 'us_national', title: 'US national', desc: 'Born in American Samoa or Swains Island.' },
            {
              value: 'lpr',
              title: 'Lawful permanent resident (green card)',
              desc: 'May qualify after a five-year waiting period unless exempt.',
            },
            {
              value: 'qualified_other',
              title: 'Other qualified non-citizen',
              desc: 'Refugee, asylee, parolee, Cuban/Haitian entrant, trafficking victim, etc.',
            },
            {
              value: 'not_qualified',
              title: 'Non-qualified or undocumented',
              desc: 'May still qualify for emergency Medicaid only.',
            },
          ]}
        />
      </Field>

      {c.status === 'lpr' || c.status === 'qualified_other' ? (
        <Panel title="Immigration details">
          <Stack gap={16}>
            <div className="grid-2">
              <Field label="Document type" htmlFor="docType">
                <Select
                  id="docType"
                  value={c.documentType}
                  onChange={(x) => set('documentType', x)}
                  options={[
                    { value: 'i551', label: 'I-551 (Green Card)' },
                    { value: 'i94', label: 'I-94 / I-94A' },
                    { value: 'ead', label: 'Employment Authorization (I-766)' },
                    { value: 'passport_stamp', label: 'Foreign passport with I-551 stamp' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="Select document"
                />
              </Field>
              <Field label="Alien / USCIS number" htmlFor="alien" hint="Starts with A, 8–9 digits.">
                <TextInput
                  id="alien"
                  value={c.alienNumber}
                  onChange={(x) => set('alienNumber', x)}
                  placeholder="A012345678"
                />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Date of entry to the US" htmlFor="entry">
                <TextInput id="entry" type="date" value={c.dateOfEntry} onChange={(x) => set('dateOfEntry', x)} />
              </Field>
              <Field label="Country of birth" htmlFor="cob">
                <TextInput id="cob" value={c.countryOfBirth} onChange={(x) => set('countryOfBirth', x)} />
              </Field>
            </div>

            {c.status === 'lpr' ? (
              <QuestionRow
                q="Have you been a lawful permanent resident for at least 5 years?"
                value={c.fiveYearResident}
                onChange={(x) => set('fiveYearResident', x)}
                hint="Required for most adults applying for Medicaid; some children and pregnant women are exempt."
              />
            ) : null}

            <QuestionRow
              q="Do you have an immigration sponsor?"
              value={c.hasSponsor}
              onChange={(x) => set('hasSponsor', x)}
            />
            {c.hasSponsor === true ? (
              <Stack gap={12}>
                <Field label="Sponsor's name" htmlFor="spn">
                  <TextInput id="spn" value={c.sponsorName} onChange={(x) => set('sponsorName', x)} />
                </Field>
                <Field label="Sponsor's address" htmlFor="spa">
                  <TextInput id="spa" value={c.sponsorAddress} onChange={(x) => set('sponsorAddress', x)} />
                </Field>
                <Field label="Sponsor's monthly income (estimate)" htmlFor="spi">
                  <TextInput
                    id="spi"
                    inputMode="numeric"
                    value={c.sponsorIncome}
                    onChange={(x) => set('sponsorIncome', x)}
                    placeholder="$"
                  />
                </Field>
              </Stack>
            ) : null}
          </Stack>
        </Panel>
      ) : null}

      <QuestionRow
        q="Are you a member of a federally recognized tribe?"
        hint="Tribal members get special protections in Medicaid, including waived cost-sharing."
        value={c.tribalMember}
        onChange={(x) => set('tribalMember', x)}
      />
    </Fragment>
  );
}

// ── Step 12 · Tax filing ────────────────────────────────────────────────
function StepTaxFiling({ ctx }: ScreenProps) {
  const { data, setData } = ctx;
  // NOTE: reads old per-member schema; taxFiling is now a flat household object (see ENG-1697)
  // reason: this unrouted legacy screen indexes taxFiling by person id; view it
  // through the legacy map type. At runtime taxFiling['0'] is undefined on the flat
  // model, so `t` is {} exactly as before.
  const legacyTaxFiling = data.taxFiling as unknown as LegacyTaxFilingMap | undefined;
  const t: LegacyTaxFilingEntry = legacyTaxFiling?.['0'] || {};
  const set = (key: string, val: unknown) =>
    setData((prev) => {
      const prevLegacy = prev.taxFiling as unknown as LegacyTaxFilingMap | undefined;
      return {
        ...prev,
        taxFiling: { ...prev.taxFiling, '0': { ...prevLegacy?.['0'], [key]: val } } as WizardFormData['taxFiling'],
      };
    });

  return (
    <Fragment>
      <Field label="Will you file a federal income tax return for the current tax year?" required>
        <RadioGroup
          name="willFile"
          value={t.willFile}
          onChange={(x) => set('willFile', x)}
          cols={3}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'unsure', label: 'Not sure' },
          ]}
        />
      </Field>

      {t.willFile === 'yes' ? (
        <Stack gap={16}>
          <Panel title="Tax filing details">
            <Stack gap={4}>
              <QuestionRow
                q="Will you file jointly with a spouse?"
                value={t.filingJointly}
                onChange={(x) => set('filingJointly', x)}
              />
              <QuestionRow
                q="Will you claim any dependents?"
                value={t.claimsDependents}
                onChange={(x) => set('claimsDependents', x)}
                hint="A dependent is someone you'll list on your tax return — typically a child or other relative you support."
              />
            </Stack>
          </Panel>

          <Alert kind="info" title="Why this matters">
            State-X Medicaid uses your tax household (you, your spouse if filing jointly, and your dependents) to
            determine income limits. We'll let you list specific dependents after you add your household members.
          </Alert>
        </Stack>
      ) : null}

      {t.willFile === 'no' ? (
        <Alert kind="neutral" title="That's OK">
          Many people who qualify for Medicaid aren't required to file taxes. We'll use your household composition and
          income instead.
        </Alert>
      ) : null}
    </Fragment>
  );
}

// ── Step 13 · Work requirements ─────────────────────────────────────────
function StepWorkRequirements({ ctx }: ScreenProps) {
  const { data, setData } = ctx;
  const age = ageFrom(data.primaryApplicant?.dob);
  const inScope = age !== null && age >= 19 && age < 65;
  const w: WorkRequirementsEntry = (data.workRequirements?.['0'] as WorkRequirementsEntry | undefined) || {
    employedOrInActivity: null,
    activityDescription: '',
    hoursPerWeek: 0,
    exemptions: [],
  };

  const set = (key: string, val: unknown) =>
    setData((prev) => ({
      ...prev,
      workRequirements: {
        ...prev.workRequirements,
        '0': { ...((prev.workRequirements?.['0'] as WorkRequirementsEntry | undefined) || w), [key]: val },
      },
    }));

  if (!inScope) {
    return (
      <Alert kind="neutral" title="No work requirements apply to you">
        the state's Healthy Behavior incentives apply to adults 19–64 enrolled in the State Health and Wellness Plan.
        Based on your date of birth, this section doesn't apply.
      </Alert>
    );
  }

  return (
    <Fragment>
      <Alert kind="info" title="Healthy Behaviors — adults 19 to 64">
        The state expects most adults to be working, in school, in job training, or caring for a young child or a person
        with a disability. Tell us which applies — exemptions are also fine.
      </Alert>

      <QuestionRow
        q="Are you currently employed or in a qualifying activity?"
        value={w.employedOrInActivity}
        onChange={(x) => set('employedOrInActivity', x)}
      />

      {w.employedOrInActivity === true ? (
        <Stack gap={12}>
          <Field label="Briefly describe the activity" htmlFor="actDesc">
            <TextInput
              id="actDesc"
              value={w.activityDescription}
              onChange={(x) => set('activityDescription', x)}
              placeholder="e.g. Cashier at Hy-Vee · Full-time student at DMACC · Caring for an infant"
            />
          </Field>
          <Field label="Average hours per week" htmlFor="hpw">
            <TextInput
              id="hpw"
              type="number"
              inputMode="numeric"
              value={String(w.hoursPerWeek || '')}
              onChange={(x) => set('hoursPerWeek', Number(x) || 0)}
            />
          </Field>
        </Stack>
      ) : null}

      {w.employedOrInActivity === false ? (
        <Field
          label="Do any of these apply to you?"
          hint="Select all that apply. Any one of these exempts you from work expectations."
        >
          <CheckboxGroup
            name="exemptions"
            value={w.exemptions}
            onChange={(x) => set('exemptions', x)}
            options={[
              { value: 'disabled', label: 'I have a disability that prevents work' },
              { value: 'caregiver', label: 'Caring for a child under age 6 or a person with a disability' },
              { value: 'pregnant', label: 'Pregnant or recently gave birth' },
              { value: 'fulltime_student', label: 'Full-time student' },
              { value: 'tanf', label: 'Already meeting TANF work requirements' },
              { value: 'medical', label: 'Medically certified as unable to work' },
              { value: 'tribal', label: 'Member of a federally recognized tribe' },
              { value: 'none', label: 'None of these apply' },
            ]}
          />
        </Field>
      ) : null}
    </Fragment>
  );
}

// ── Step 14 · Household members ─────────────────────────────────────────
function StepHouseholdMembers({ ctx }: ScreenProps) {
  const { data, updateFormData } = ctx;
  const members = data.householdMembers ?? [];
  const addMember = () => {
    const id = 'm' + Math.floor(Math.random() * 100000);
    updateFormData('householdMembers', [
      ...members,
      {
        id,
        firstName: '',
        middleInitial: '',
        lastName: '',
        dob: '',
        relationship: 'child',
        sex: '',
        ssn: '',
        applying: true,
        hasDisability: false,
        pregnant: null,
        dueDate: '',
        expectedBabies: 1,
      },
    ]);
  };

  const update = (id: string | undefined, patch: Partial<HouseholdMember>) =>
    updateFormData(
      'householdMembers',
      members.map((m: HouseholdMember) => (m.id === id ? { ...m, ...patch } : m)),
    );
  const remove = (id: string | undefined) =>
    updateFormData(
      'householdMembers',
      members.filter((m: HouseholdMember) => m.id !== id),
    );

  return (
    <Fragment>
      <Alert kind="info" title="Who else lives with you?">
        List everyone living in your home — even those not applying for coverage. This tells us your household size,
        which affects your income limits. Don't list roommates you don't share finances with.
      </Alert>

      {members.length === 0 ? (
        <Panel className="empty" subtitle="No household members added yet. If you live alone, you can continue.">
          <button className="add-link" type="button" onClick={addMember}>
            <Icon name="plus" size={16} /> Add a person to your household
          </button>
        </Panel>
      ) : (
        <Stack gap={16}>
          {members.map((m, idx) => (
            <Panel
              key={m.id}
              title={`Member ${idx + 1}` + (m.firstName ? `: ${m.firstName} ${m.lastName}` : '')}
              action={
                <button
                  type="button"
                  className="btn btn--ghost size-sm"
                  onClick={() => remove(m.id)}
                  style={{ color: 'var(--civic-destructive-text)' }}
                >
                  <Icon name="trash" size={14} /> Remove
                </button>
              }
            >
              <Stack gap={14}>
                <div className="grid-2">
                  <Field label="Relationship to you" required>
                    <Select
                      value={m.relationship}
                      onChange={(x) => update(m.id, { relationship: x })}
                      options={WIZARD_RELATIONSHIPS}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Sex" htmlFor={`sx-${m.id}`}>
                    <Select
                      id={`sx-${m.id}`}
                      value={m.sex}
                      onChange={(x) => update(m.id, { sex: x })}
                      options={[
                        { value: 'female', label: 'F' },
                        { value: 'male', label: 'M' },
                        { value: 'x', label: 'X' },
                      ]}
                      placeholder="—"
                    />
                  </Field>
                </div>
                <div className="grid-name">
                  <Field label="First name" required htmlFor={`fn-${m.id}`}>
                    <TextInput id={`fn-${m.id}`} value={m.firstName} onChange={(x) => update(m.id, { firstName: x })} />
                  </Field>
                  <Field label="MI" htmlFor={`mi-${m.id}`}>
                    <TextInput
                      id={`mi-${m.id}`}
                      value={m.middleInitial}
                      maxLength={1}
                      onChange={(x) => update(m.id, { middleInitial: x })}
                    />
                  </Field>
                  <Field label="Last name" required htmlFor={`ln-${m.id}`}>
                    <TextInput id={`ln-${m.id}`} value={m.lastName} onChange={(x) => update(m.id, { lastName: x })} />
                  </Field>
                </div>
                <div className="grid-2">
                  <Field
                    label="Date of birth"
                    required
                    htmlFor={`dob-${m.id}`}
                    error={m.dob ? validateDob(m.dob) : undefined}
                  >
                    <TextInput
                      id={`dob-${m.id}`}
                      type="date"
                      value={m.dob}
                      onChange={(x) => update(m.id, { dob: x })}
                    />
                  </Field>
                  <Field label="SSN" htmlFor={`ssn-${m.id}`} hint="If they have one.">
                    <SSNInput
                      id={`ssn-${m.id}`}
                      value={m.ssn ?? ''}
                      onChange={(digits) => update(m.id, { ssn: digits })}
                    />
                  </Field>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid var(--civic-border-default)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Apply for coverage for this person?</div>
                    <div className="fineprint">
                      If no, we still use them for household size but won't ask coverage questions.
                    </div>
                  </div>
                  <YesNo
                    value={m.applying}
                    onChange={(x) => update(m.id, { applying: x === 'unsure' ? undefined : x })}
                  />
                </div>
              </Stack>
            </Panel>
          ))}

          <button className="add-link" type="button" onClick={addMember}>
            <Icon name="plus" size={16} /> Add another household member
          </button>
        </Stack>
      )}
    </Fragment>
  );
}

// ── Step 15 · Tax dependents (assign dependents to filers) ──────────────
function StepTaxDependents({ ctx }: ScreenProps) {
  const { data, setData } = ctx;
  const primary = data.primaryApplicant;
  // NOTE: reads old per-member schema; taxFiling is now a flat household object (see ENG-1697)
  // reason: unrouted legacy screen indexes taxFiling by person id; the flat model
  // is not index-keyable, so view it through the legacy map type. taxFiling['0'] is
  // undefined at runtime on the flat model, so `t` stays {} exactly as before.
  const legacyTaxFiling = data.taxFiling as unknown as LegacyTaxFilingMap | undefined;
  const t: LegacyTaxFilingEntry = legacyTaxFiling?.['0'] || {};
  const members = data.householdMembers ?? [];

  const setDeps = (deps: string | string[]) =>
    setData((prev) => {
      const prevLegacy = prev.taxFiling as unknown as LegacyTaxFilingMap | undefined;
      return {
        ...prev,
        taxFiling: {
          ...prev.taxFiling,
          '0': { ...prevLegacy?.['0'], claimedDependents: Array.isArray(deps) ? deps : [deps] },
        } as WizardFormData['taxFiling'],
      };
    });

  if (t.willFile !== 'yes' || t.claimsDependents !== true) {
    return (
      <Alert kind="neutral" title="Nothing to do here">
        You indicated you won't be claiming any dependents. Skip ahead to income.
      </Alert>
    );
  }

  return (
    <Fragment>
      <Field
        label={`Who will ${primary?.firstName || 'you'} claim as a dependent?`}
        hint="Select everyone you'll list on this year's tax return. They count toward your tax household for Medicaid."
      >
        {members.length === 0 ? (
          <Alert kind="neutral">No other household members to choose from. Go back to add some.</Alert>
        ) : (
          <Stack gap={10}>
            {members.map((m) => (
              <ChoiceCard
                key={m.id}
                kind="checkbox"
                name="dep"
                value={m.id ?? ''}
                current={t.claimedDependents}
                onChange={setDeps}
                title={`${m.firstName || 'Member'} ${m.lastName}`}
                desc={`${WIZARD_RELATIONSHIPS.find((r) => r.value === m.relationship)?.label || '—'} · ${m.dob ? `DOB ${fmtDate(m.dob)}` : 'DOB not set'}`}
              />
            ))}
          </Stack>
        )}
      </Field>
    </Fragment>
  );
}

// ── Step 17 · Other income ──────────────────────────────────────────────
const OTHER_INCOME_TYPES = [
  { value: 'social_security', label: 'Social Security' },
  { value: 'ssi', label: 'Supplemental Security Income (SSI)' },
  { value: 'unemployment', label: 'Unemployment' },
  { value: 'child_support', label: 'Child support received' },
  { value: 'alimony', label: 'Alimony received' },
  { value: 'pension', label: 'Pension or retirement' },
  { value: 'rental', label: 'Rental income' },
  { value: 'interest', label: 'Interest or dividends' },
  { value: 'tribal', label: 'Tribal income' },
  { value: 'other', label: 'Other' },
];

const FREQ_OPTS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Yearly' },
  { value: 'one_time', label: 'One time' },
];

function StepOtherIncome({ ctx }: ScreenProps) {
  const { data, updateFormData } = ctx;
  const items = data.otherIncome ?? [];

  const recipients = [
    {
      value: '0',
      label:
        [data.primaryApplicant?.firstName, data.primaryApplicant?.lastName].filter(Boolean).join(' ') ||
        'Primary applicant',
    },
    ...(data.householdMembers ?? []).map((m) => ({
      value: m.id ?? '',
      label: `${m.firstName} ${m.lastName}`.trim() || 'Member',
    })),
  ];

  const add = () =>
    updateFormData('otherIncome', [
      ...items,
      {
        id: 'o' + Math.floor(Math.random() * 1e6),
        type: 'social_security',
        recipient: '0',
        amount: '',
        frequency: 'monthly',
      },
    ]);
  const update = (id: string | undefined, patch: Partial<OtherIncome>) =>
    updateFormData(
      'otherIncome',
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const remove = (id: string | undefined) =>
    updateFormData(
      'otherIncome',
      items.filter((i) => i.id !== id),
    );

  return (
    <Fragment>
      {items.length === 0 ? (
        <Panel
          className="empty"
          subtitle="No other income recorded. Add anything not from a job — Social Security, unemployment, child support, pensions, interest, rental, etc."
        >
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add other income
          </button>
        </Panel>
      ) : (
        <Stack gap={14}>
          {items.map((i, idx) => (
            <Panel
              key={i.id}
              title={`Income source ${idx + 1}`}
              action={
                <button
                  type="button"
                  className="btn btn--ghost size-sm"
                  onClick={() => remove(i.id)}
                  style={{ color: 'var(--civic-destructive-text)' }}
                >
                  <Icon name="trash" size={14} /> Remove
                </button>
              }
            >
              <div className="grid-2">
                <Field label="Type">
                  <Select value={i.type} onChange={(x) => update(i.id, { type: x })} options={OTHER_INCOME_TYPES} />
                </Field>
                <Field label="Recipient">
                  <Select value={i.recipient} onChange={(x) => update(i.id, { recipient: x })} options={recipients} />
                </Field>
              </div>
              <div className="grid-2" style={{ marginTop: 14 }}>
                <Field label="Amount">
                  <TextInput
                    inputMode="decimal"
                    value={i.amount}
                    onChange={(x) => update(i.id, { amount: x })}
                    prefix="$"
                  />
                </Field>
                <Field label="How often?">
                  <Select value={i.frequency} onChange={(x) => update(i.id, { frequency: x })} options={FREQ_OPTS} />
                </Field>
              </div>
            </Panel>
          ))}
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add another income source
          </button>
        </Stack>
      )}
    </Fragment>
  );
}

// ── Step 18 · Projected income ──────────────────────────────────────────
function StepProjected({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const p = data.projectedIncome;
  const change = p?.expectedChange;

  return (
    <Fragment>
      <Field label="Do you expect your household's income to change in the next 12 months?" required>
        <RadioGroup
          name="change"
          value={change}
          onChange={(x) => setPath('projectedIncome', 'expectedChange', x)}
          options={[
            { value: 'same', title: 'About the same', desc: "We'll use your current income for the year." },
            { value: 'up', title: 'Going up', desc: 'A raise, new job, or returning to work.' },
            { value: 'down', title: 'Going down', desc: 'Reduced hours, job loss, retirement, etc.' },
            { value: 'unsure', title: "I'm not sure", desc: "We'll use your current income and revisit at renewal." },
          ]}
        />
      </Field>

      {change === 'up' || change === 'down' ? (
        <Panel title="When will it change?">
          <Stack gap={14}>
            <Field label="Expected change date">
              <TextInput
                type="date"
                value={p?.changeDate}
                onChange={(x) => setPath('projectedIncome', 'changeDate', x)}
              />
            </Field>
            <Field label="Reason (select all that apply)">
              <CheckboxGroup
                name="reasons"
                value={p?.changeReason}
                onChange={(x) => setPath('projectedIncome', 'changeReason', x)}
                options={[
                  { value: 'new_job', label: 'New job or higher pay' },
                  { value: 'job_loss', label: 'Job loss or reduced hours' },
                  { value: 'school', label: 'Returning to school' },
                  { value: 'leave', label: 'Parental or medical leave' },
                  { value: 'retirement', label: 'Retirement' },
                  { value: 'other', label: 'Other (describe)' },
                ]}
                cols={2}
              />
            </Field>
            {p?.changeReason?.includes('other') ? (
              <Field label="Tell us more">
                <Textarea
                  value={p?.changeReasonOther}
                  onChange={(x) => setPath('projectedIncome', 'changeReasonOther', x)}
                />
              </Field>
            ) : null}
          </Stack>
        </Panel>
      ) : null}

      <Field
        label="Adjusted Gross Income (AGI) from your most recent tax return"
        htmlFor="agi"
        hint="Line 11 of your 1040. We use this to verify your reported income — leave blank if you didn't file."
      >
        <TextInput
          id="agi"
          inputMode="numeric"
          value={p?.lastTaxReturnAGI}
          onChange={(x) => setPath('projectedIncome', 'lastTaxReturnAGI', x)}
          prefix="$"
          placeholder="74400"
        />
      </Field>
    </Fragment>
  );
}

Object.assign(window, {
  StepCitizenship,
  StepTaxFiling,
  StepWorkRequirements,
  StepHouseholdMembers,
  StepTaxDependents,
  StepOtherIncome,
  StepProjected,
  OTHER_INCOME_TYPES,
  FREQ_OPTS,
});

export {
  StepCitizenship,
  StepTaxFiling,
  StepWorkRequirements,
  StepHouseholdMembers,
  StepTaxDependents,
  StepOtherIncome,
  StepProjected,
  FREQ_OPTS,
  OTHER_INCOME_TYPES,
};
