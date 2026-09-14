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
import { AddressAutofill } from '@mapbox/search-js-react';
import { MAPBOX_TOKEN, US_AUTOFILL_OPTIONS } from '../lib/address-autofill';
import type { FormDataContextValue } from './form-data.types';

// The autofill retrieve-response type lives in @mapbox/search-js-core, which is a
// transitive (not direct) dependency, so derive it from the component's own
// onRetrieve prop instead of importing the package directly.
type AutofillRetrieveResponse = Parameters<NonNullable<React.ComponentProps<typeof AddressAutofill>['onRetrieve']>>[0];

// Every screen receives the FormDataContext as `ctx`; the welcome screen also
// uses the wizard's navigation callbacks.
interface ScreenProps {
  ctx: FormDataContextValue;
  goNext: () => void;
  goBack: () => void;
  goTo: (id: string) => void;
}

// RadioGroup (ui.tsx) types its value/options as string-keyed. A few screens use
// boolean-keyed radios; these aliases name the prop types for the documented casts.
type RadioValue = React.ComponentProps<typeof RadioGroup>['value'];
type RadioOptions = React.ComponentProps<typeof RadioGroup>['options'];
// QuestionRow's accepted value (boolean | 'unsure' | null); ui.tsx doesn't export it.
type YesNoValue = React.ComponentProps<typeof QuestionRow>['value'];

/* =========================================================================
   Screens A — Welcome + household basics + primary applicant identity
   Steps 1 – 10
   ========================================================================= */

// ── Step 1 · Welcome ────────────────────────────────────────────────────
function StepWelcome({ goNext, goTo, ctx }: ScreenProps) {
  const { loadSample } = ctx;
  return (
    <div className="welcome-stage step-fade-in">
      <div className="welcome-hero">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            State-X Medicaid · Apply for health coverage
          </div>
          <h1>Apply for State-X Medicaid in about 20 minutes.</h1>
          <p style={{ marginTop: 16 }}>
            Tell us about your household, your income, and the coverage you have today. We will check what programs you
            may qualify for and walk you through the next steps. Nothing is final until you submit.
          </p>
        </div>

        <div className="welcome-tiles">
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="users" size={18} />
            </div>
            <div className="ttl">Who's covered</div>
            <div className="sub">Children, adults, parents, and pregnant residents on a single application.</div>
          </div>
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="lock" size={18} />
            </div>
            <div className="ttl">Private &amp; secure</div>
            <div className="sub">Your information is encrypted and shared only with State-X HHS.</div>
          </div>
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="save" size={18} />
            </div>
            <div className="ttl">Saves as you go</div>
            <div className="sub">Step away and pick up where you left off. Auto-saved to your device.</div>
          </div>
        </div>

        <Alert kind="neutral" title="What to gather before you start">
          Date of birth and Social Security Number for everyone applying · most recent pay stubs or a recent tax return
          · current health insurance details if anyone in your household has coverage.
        </Alert>

        <Stack gap={12}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Button variant="primary" size="lg" onClick={goNext}>
              Begin application <Icon name="arrowRight" size={16} />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                loadSample();
                goTo('review');
              }}
              title="Fill the form with a sample household"
            >
              <Icon name="sparkles" size={14} /> See a sample completed
            </Button>
          </div>
          <div className="fineprint">
            By continuing, you agree that the information you provide is true and complete to the best of your
            knowledge. Knowingly providing false information may be a federal offense.
          </div>
        </Stack>
      </div>
    </div>
  );
}

// ── Step 2 · County ─────────────────────────────────────────────────────
function StepCounty({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.household;
  if (!v) return null;
  return (
    <Fragment>
      <Field
        label="Your county of residence"
        required
        htmlFor="county"
        hint="The county where you currently live, not where you receive mail."
      >
        <Select
          id="county"
          value={v.county}
          onChange={(x) => setPath('household', 'county', x)}
          options={IOWA_COUNTIES}
          placeholder="Select a county"
        />
      </Field>

      <Panel
        title="Why we ask"
        subtitle="State-X Medicaid is administered at the county level. Your county determines which DHS office handles your case and which managed-care plans serve your area."
      >
        <Stack gap={10}>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 15,
              color: 'var(--civic-text-secondary)',
            }}
          >
            <Icon name="map" size={16} /> Polk, Linn, Scott, Black Hawk, and Johnson counties have walk-in service
            centers.
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 15,
              color: 'var(--civic-text-secondary)',
            }}
          >
            <Icon name="phone" size={16} /> Every county is also served by phone at 1-800-338-8366.
          </div>
        </Stack>
      </Panel>
    </Fragment>
  );
}

// ── Step 3 · Who is applying ────────────────────────────────────────────
function StepApplyingFor({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.household;
  if (!v) return null;
  return (
    <Fragment>
      <RadioGroup
        name="applicationFor"
        value={v.applicationFor}
        onChange={(x) => setPath('household', 'applicationFor', x)}
        options={[
          { value: 'myself', title: 'Just myself', desc: 'You are applying for coverage for yourself only.' },
          {
            value: 'household',
            title: 'Myself and members of my household',
            desc: 'You will be the primary contact and answer for everyone applying.',
          },
          {
            value: 'specific',
            title: 'Someone else in my household',
            desc: 'Apply on behalf of another adult or for a child. You can list multiple people.',
          },
        ]}
      />
      <Alert kind="info">
        You can add or remove people you are applying for later. Listing someone here doesn't commit them yet.
      </Alert>
    </Fragment>
  );
}

// ── Step 4 · Existing case ──────────────────────────────────────────────
function StepExistingCase({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.household;
  if (!v) return null;
  return (
    <Fragment>
      <Field label="Do you have an existing case or coverage with State-X HHS?" required>
        {/* reason: this is a boolean-keyed radio. RadioGroup's ChoiceOption.value
            and value prop are typed `string` in ui.tsx (off-scope), but at runtime
            it compares/keys by identity, so the stored boolean round-trips through
            onChange and `existingCase === true` below. Cast value+options to the
            component's prop types rather than stringify (which would change the
            stored type and break the `=== true` checks). */}
        <RadioGroup
          name="existingCase"
          value={v.existingCase as unknown as RadioValue}
          onChange={(x) => setPath('household', 'existingCase', x)}
          options={
            [
              { value: false, title: 'No, this is my first time applying', desc: 'We will create a new case for you.' },
              {
                value: true,
                title: 'Yes, I have a case number',
                desc: "Linking helps us pull existing information so you don't repeat yourself.",
              },
            ] as unknown as RadioOptions
          }
        />
      </Field>

      {v.existingCase === true ? (
        <Panel title="Link your existing case">
          <div className="grid-2">
            <Field label="Case number" htmlFor="caseNumber" hint="Found on any letter from State-X HHS — eight digits.">
              <TextInput
                id="caseNumber"
                value={v.caseNumber}
                onChange={(x) => setPath('household', 'caseNumber', x)}
                placeholder="e.g. 30418272"
                inputMode="numeric"
                maxLength={8}
              />
            </Field>
            <Field label="Last name on file" htmlFor="caseLast">
              <TextInput
                id="caseLast"
                value={data.primaryApplicant?.lastName}
                onChange={(x) => ctx.setPath('primaryApplicant', 'lastName', x)}
                placeholder="Family name"
                autoComplete="family-name"
              />
            </Field>
          </div>
        </Panel>
      ) : null}
    </Fragment>
  );
}

// ── Step 5 · Name & DOB ─────────────────────────────────────────────────
function StepPrimaryName({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.primaryApplicant;
  if (!v) return null;
  return (
    <Fragment>
      <div className="grid-name">
        <Field label="First name" required htmlFor="fn">
          <TextInput
            id="fn"
            value={v.firstName}
            onChange={(x) => setPath('primaryApplicant', 'firstName', x)}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Middle name" htmlFor="mn">
          <TextInput
            id="mn"
            value={v.middleName}
            onChange={(x) => setPath('primaryApplicant', 'middleName', x)}
            autoComplete="additional-name"
          />
        </Field>
        <Field label="Last name" required htmlFor="ln">
          <TextInput
            id="ln"
            value={v.lastName}
            onChange={(x) => setPath('primaryApplicant', 'lastName', x)}
            autoComplete="family-name"
          />
        </Field>
        <Field label="Suffix" htmlFor="sfx">
          <Select
            id="sfx"
            value={v.suffix}
            onChange={(x) => setPath('primaryApplicant', 'suffix', x)}
            options={['', 'Jr.', 'Sr.', 'II', 'III', 'IV']}
            placeholder="—"
          />
        </Field>
      </div>

      <Field
        label="Date of birth"
        required
        htmlFor="dob"
        hint="Use the date on your birth certificate, even if you go by a different birthday."
        error={v.dob ? validateDob(v.dob) : undefined}
      >
        <TextInput id="dob" type="date" value={v.dob} onChange={(x) => setPath('primaryApplicant', 'dob', x)} />
      </Field>

      <Alert kind="neutral" title="Your name as it appears on legal documents">
        Use the name on your Social Security card, driver's license, or passport. If you go by a different name
        day-to-day, you can add it later under preferences.
      </Alert>
    </Fragment>
  );
}

// ── Step 6 · SSN & sex ──────────────────────────────────────────────────
function StepPrimarySSN({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.primaryApplicant;
  if (!v) return null;
  return (
    <Fragment>
      <Field
        label="Social Security Number"
        required={!v.noSSN}
        htmlFor="ssn"
        hint="Federal law requires an SSN for everyone who has one and is applying for coverage. We use it only to verify your identity and income."
      >
        <SSNInput
          id="ssn"
          value={v.ssn ?? ''}
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
        desc="That's okay. You may still qualify for some programs. We'll route your case for additional verification."
      />

      <div className="divider" />

      <Field label="Sex" required hint="What is recorded on your birth certificate or current legal documents.">
        <RadioGroup
          name="sex"
          value={v.sex}
          onChange={(x) => setPath('primaryApplicant', 'sex', x)}
          cols={2}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'x', label: 'X (non-binary)' },
            { value: 'decline', label: 'Prefer not to say' },
          ]}
        />
      </Field>
    </Fragment>
  );
}

// ── Step 7 · Address ────────────────────────────────────────────────────
function StepPrimaryAddress({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.primaryApplicant;

  const handleAutofillRetrieve = useCallback(
    (res: AutofillRetrieveResponse) => {
      const feature = res.features[0];
      if (!feature) return;
      const props = feature.properties;
      if (props.address_line1) setPath('primaryApplicant', 'streetAddress', props.address_line1);
      if (props.address_level2) setPath('primaryApplicant', 'city', props.address_level2);
      if (props.postcode) setPath('primaryApplicant', 'zip', props.postcode.slice(0, 5));
      // address_level1 comes back as full name or 2-char abbr — look up the abbr from US_STATES.
      // US_STATES mixes bare-string abbreviations with one { value, label } object
      // (the CMS demo state); normalize each entry to its value/label before comparing.
      if (props.address_level1) {
        const raw = props.address_level1.trim();
        const match = US_STATES.find((s) => {
          const sValue = typeof s === 'string' ? s : s.value;
          const sLabel = typeof s === 'string' ? s : s.label;
          return sValue === raw.toUpperCase() || sLabel.toLowerCase() === raw.toLowerCase();
        });
        if (match) setPath('primaryApplicant', 'state', typeof match === 'string' ? match : match.value);
      }
    },
    [setPath],
  );

  if (!v) return null;

  return (
    <Fragment>
      <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Field label="Street address" required htmlFor="addr">
          {MAPBOX_TOKEN ? (
            <AddressAutofill
              accessToken={MAPBOX_TOKEN}
              options={US_AUTOFILL_OPTIONS}
              onRetrieve={handleAutofillRetrieve}
            >
              <input
                id="addr"
                className="input"
                type="text"
                autoComplete="address-line1"
                placeholder="412 Walnut St"
                value={v.streetAddress}
                onChange={(e) => setPath('primaryApplicant', 'streetAddress', e.target.value)}
              />
            </AddressAutofill>
          ) : (
            <TextInput
              id="addr"
              value={v.streetAddress}
              onChange={(x) => setPath('primaryApplicant', 'streetAddress', x)}
              autoComplete="address-line1"
              placeholder="412 Walnut St"
            />
          )}
        </Field>
        <Field label="Apt / unit" htmlFor="apt">
          <TextInput
            id="apt"
            value={v.aptUnit}
            onChange={(x) => setPath('primaryApplicant', 'aptUnit', x)}
            autoComplete="address-line2"
            placeholder="3B"
          />
        </Field>
      </div>

      <div className="grid-csz">
        <Field label="City" required htmlFor="city">
          <TextInput
            id="city"
            value={v.city}
            onChange={(x) => setPath('primaryApplicant', 'city', x)}
            autoComplete="address-level2"
          />
        </Field>
        <Field label="State" required htmlFor="state">
          <Select
            id="state"
            value={v.state}
            onChange={(x) => setPath('primaryApplicant', 'state', x)}
            options={US_STATES}
          />
        </Field>
        <Field label="ZIP code" required htmlFor="zip">
          <TextInput
            id="zip"
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
        desc="A shelter, motel, or someone else's place is fine. We can use a mailing address instead."
      />

      <ChoiceCard
        kind="checkbox"
        name="mailingSame"
        value="same"
        current={v.mailingAddressSame ? ['same'] : []}
        onChange={(arr) => setPath('primaryApplicant', 'mailingAddressSame', arr.includes('same'))}
        title="My mailing address is the same"
        desc="Letters from State-X HHS will be sent here."
      />
    </Fragment>
  );
}

// ── Step 8 · Contact info ───────────────────────────────────────────────
function StepPrimaryContact({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.primaryApplicant;
  if (!v) return null;
  return (
    <Fragment>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 200px' }}>
        <Field label="Phone number" required htmlFor="phone">
          <TextInput
            id="phone"
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

      <Field
        label="Email address"
        required={false}
        htmlFor="email"
        hint="We send case status notices here. We will never share it."
      >
        <TextInput
          id="email"
          type="email"
          value={v.email}
          onChange={(x) => setPath('primaryApplicant', 'email', x)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      {v.phoneType === 'mobile' ? (
        <ChoiceCard
          kind="checkbox"
          name="texts"
          value="texts"
          current={v.textReminders ? ['texts'] : []}
          onChange={(arr) => setPath('primaryApplicant', 'textReminders', arr.includes('texts'))}
          title="Send me text reminders"
          desc="Renewal dates, missing documents, and appointment reminders. Reply STOP to opt out. Standard message rates may apply."
        />
      ) : null}
    </Fragment>
  );
}

// ── Step 9 · Race / Ethnicity ───────────────────────────────────────────
function StepDemoRace({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  const v = data.demographics;
  if (!v) return null;
  const RACE_OPTS = [
    { value: 'white', label: 'White' },
    { value: 'black', label: 'Black or African American' },
    { value: 'ai_an', label: 'American Indian or Alaska Native' },
    { value: 'asian', label: 'Asian' },
    { value: 'nh_pi', label: 'Native Hawaiian or Pacific Islander' },
    { value: 'other', label: 'Some other race' },
    { value: 'decline', label: 'Prefer not to say' },
  ];
  return (
    <Fragment>
      <Field
        label="Which best describes your race?"
        hint="Select all that apply. State-X HHS uses this to report on equitable access. It does not affect your eligibility."
      >
        <CheckboxGroup
          name="race"
          value={v.race}
          onChange={(x) => setPath('demographics', 'race', x)}
          options={RACE_OPTS}
          cols={2}
        />
      </Field>

      <div className="divider" />

      <Field label="Are you of Hispanic, Latino, or Spanish origin?">
        <RadioGroup
          name="ethnicity"
          value={v.ethnicity}
          onChange={(x) => setPath('demographics', 'ethnicity', x)}
          cols={2}
          options={[
            { value: 'hispanic', label: 'Yes, Hispanic or Latino' },
            { value: 'not_hispanic', label: 'No, not Hispanic or Latino' },
            { value: 'decline', label: 'Prefer not to say' },
          ]}
        />
      </Field>
    </Fragment>
  );
}

// ── Step 10 · Pregnancy / Disability / Veteran / Foster ─────────────────
function StepDemoHealth({ ctx }: ScreenProps) {
  const { data, setPath } = ctx;
  // This older, unrouted screen also reads/writes a `receivesSSI` flag that isn't
  // part of the Demographics model (intake derives SSI from otherIncome instead).
  // Surface it as an optional extra so the dead control still type-checks.
  const v = data.demographics as (typeof data.demographics & { receivesSSI?: boolean | null }) | undefined;
  if (!v) return null;
  return (
    <Fragment>
      <Panel
        title="A few more questions about you"
        subtitle="Each opens a separate Medicaid pathway. Answer honestly — you can change anything before you submit."
      >
        <QuestionRow
          q="Are you pregnant?"
          hint="Including a confirmed pregnancy in the last 60 days."
          value={v.pregnant}
          onChange={(x) => setPath('demographics', 'pregnant', x)}
        />
        {v.pregnant === true ? (
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Field label="Expected due date" htmlFor="due">
              <TextInput
                id="due"
                type="date"
                value={v.dueDate}
                onChange={(x) => setPath('demographics', 'dueDate', x)}
              />
            </Field>
            <Field
              label="Number of babies expected"
              htmlFor="babies"
              hint="Twins, triplets, etc. — affects your household size."
            >
              <TextInput
                id="babies"
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
          hint="A physical or mental condition that limits major life activities."
          // reason: Demographics.disability is boolean|string|null (the builder also
          // accepts 'yes'); QuestionRow expects YesNoValue. A non-yes/no string just
          // renders neither pill selected at runtime, so narrowing to YesNoValue here
          // preserves behavior without changing the stored value.
          value={v.disability as YesNoValue}
          onChange={(x) => setPath('demographics', 'disability', x)}
        />

        <QuestionRow
          q="Do you receive Supplemental Security Income (SSI)?"
          value={v.receivesSSI}
          // reason: receivesSSI is an orphan flag not in the Demographics model (see
          // above); cast the key so this legacy control keeps writing it unchanged.
          onChange={(x) => setPath('demographics', 'receivesSSI' as keyof NonNullable<typeof data.demographics>, x)}
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
      </Panel>
    </Fragment>
  );
}

Object.assign(window, {
  StepWelcome,
  StepCounty,
  StepApplyingFor,
  StepExistingCase,
  StepPrimaryName,
  StepPrimarySSN,
  StepPrimaryAddress,
  StepPrimaryContact,
  StepDemoRace,
  StepDemoHealth,
});

export {
  StepWelcome,
  StepCounty,
  StepApplyingFor,
  StepExistingCase,
  StepPrimaryName,
  StepPrimarySSN,
  StepPrimaryAddress,
  StepPrimaryContact,
  StepDemoRace,
  StepDemoHealth,
};
