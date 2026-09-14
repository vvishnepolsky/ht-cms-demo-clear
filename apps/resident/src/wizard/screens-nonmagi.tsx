// @ts-nocheck
import React from 'react';
import { Field, TextInput, Select, CheckboxGroup, Alert, Stack, Panel, Avatar, QuestionRow } from './ui';
import { ageFrom } from './eligibility';
import { abdMembers, reasonLabel } from './abd';
import { PRIMARY_APPLICANT_ID } from './wizard-constants';

/* =========================================================================
   Screens — Non-MAGI / ABD alternate flow
   Two wizard steps that run between `discrepancy` and `health-intro` when
   any household member is Aged, Blind, or Disabled (see `abd.ts`).

   Both steps iterate over `abdMembers(data)` and render one section per
   ABD-flagged person. They use only the primitives already in `ui.tsx` —
   no new UI components.
   ========================================================================= */

// ── Reusable per-member section header (mirrors screens-f.tsx) ──────────
function NonMagiMemberHead({ name, age, reasons }) {
  return (
    <div className="member-head">
      <Avatar name={name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="member-head-name">{name || 'Member'}</div>
        <div className="member-head-meta">
          {age !== null && age !== undefined ? `age ${age}` : ''}
          {reasons && reasons.length > 0 ? ` · ${reasons.map(reasonLabel).join(' · ')}` : ''}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper — set a per-person value under `nonMagiResources` / `nonMagiMedicareLtc`.
// Patterns the same shape as `workRequirements` in screens-f.tsx so we
// merge old + new state and don't drop fields between renders.
// ─────────────────────────────────────────────────────────────────────────
function makePersonSetter(setData, section, defaults) {
  return (personId, patch) =>
    setData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [personId]: {
          ...defaults,
          ...((prev[section] || {})[personId] || {}),
          ...patch,
        },
      },
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// Step · Non-MAGI / ABD — Resources & assets
// ─────────────────────────────────────────────────────────────────────────
const RESOURCE_DEFAULTS = {
  hasChecking: null,
  checkingAmount: '',
  hasSavings: null,
  savingsAmount: '',
  hasCash: null,
  cashAmount: '',
  hasCdBonds: null,
  cdBondsAmount: '',
  hasRetirement: null,
  retirementAmount: '',
  hasOtherRealEstate: null,
  otherRealEstateValue: '',
  hasExtraVehicles: null,
  extraVehiclesValue: '',
  hasLifeInsurance: null,
  lifeInsuranceValue: '',
  hasBurialPlot: null,
  burialPlotValue: '',
  hasTrusts: null,
  trustsValue: '',
  hasTransfers60mo: null,
  transfers60moValue: '',
};

function ResourceRow({ q, hint, has, amount, prefix = '$', onChangeHas, onChangeAmount }) {
  return (
    <Stack gap={8}>
      <QuestionRow q={q} hint={hint} value={has} onChange={onChangeHas} />
      {has === true ? (
        <Field label="Approximate current value">
          <TextInput value={amount} onChange={onChangeAmount} prefix={prefix} inputMode="decimal" placeholder="0.00" />
        </Field>
      ) : null}
    </Stack>
  );
}

function StepNonMagiResources({ ctx }) {
  const { data, setData } = ctx;
  const members = abdMembers(data);
  const setRes = makePersonSetter(setData, 'nonMagiResources', RESOURCE_DEFAULTS);

  if (members.length === 0) {
    // Safety net — `skip` predicate in app.tsx should have routed past this
    // step already. Render a neutral message rather than an empty page in
    // case state changes mid-session.
    return (
      <Alert kind="neutral" title="No additional steps needed">
        Based on your household, this section isn't needed. Continue to keep going.
      </Alert>
    );
  }

  return (
    <Stack gap={20}>
      <Alert kind="info" title="Why we're asking">
        Medicaid pathways for older adults and people with disabilities have a resource limit — generally{' '}
        <strong>$2,000</strong> for an individual and <strong>$3,000</strong> for a couple. Counted resources include
        bank accounts, investments, extra vehicles, and other property. We don't count your home, one vehicle, or
        ordinary household goods.
      </Alert>

      {members.map((p) => {
        const r = (data.nonMagiResources || {})[p.id] || RESOURCE_DEFAULTS;
        const personData =
          p.id === PRIMARY_APPLICANT_ID
            ? data.primaryApplicant
            : (data.householdMembers || []).find((m) => m.id === p.id) || {};
        const age = ageFrom(personData.dob);
        return (
          <Panel key={p.id}>
            <Stack gap={14}>
              <NonMagiMemberHead name={p.name} age={age} reasons={p.reasons} />

              <ResourceRow
                q="Checking account(s)?"
                has={r.hasChecking}
                amount={r.checkingAmount}
                onChangeHas={(x) => setRes(p.id, { hasChecking: x, ...(x !== true && { checkingAmount: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { checkingAmount: x })}
              />
              <ResourceRow
                q="Savings account(s)?"
                has={r.hasSavings}
                amount={r.savingsAmount}
                onChangeHas={(x) => setRes(p.id, { hasSavings: x, ...(x !== true && { savingsAmount: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { savingsAmount: x })}
              />
              <ResourceRow
                q="Cash on hand?"
                has={r.hasCash}
                amount={r.cashAmount}
                onChangeHas={(x) => setRes(p.id, { hasCash: x, ...(x !== true && { cashAmount: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { cashAmount: x })}
              />
              <ResourceRow
                q="Certificates of deposit or savings bonds?"
                has={r.hasCdBonds}
                amount={r.cdBondsAmount}
                onChangeHas={(x) => setRes(p.id, { hasCdBonds: x, ...(x !== true && { cdBondsAmount: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { cdBondsAmount: x })}
              />
              <ResourceRow
                q="Retirement accounts (IRA, 401(k), pension)?"
                has={r.hasRetirement}
                amount={r.retirementAmount}
                onChangeHas={(x) => setRes(p.id, { hasRetirement: x, ...(x !== true && { retirementAmount: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { retirementAmount: x })}
              />
              <ResourceRow
                q="Real estate other than your primary home?"
                has={r.hasOtherRealEstate}
                amount={r.otherRealEstateValue}
                onChangeHas={(x) =>
                  setRes(p.id, { hasOtherRealEstate: x, ...(x !== true && { otherRealEstateValue: '' }) })
                }
                onChangeAmount={(x) => setRes(p.id, { otherRealEstateValue: x })}
              />
              <ResourceRow
                q="Vehicles beyond one primary car?"
                hint="Your primary vehicle is exempt; additional cars/trucks count toward the resource limit."
                has={r.hasExtraVehicles}
                amount={r.extraVehiclesValue}
                onChangeHas={(x) =>
                  setRes(p.id, { hasExtraVehicles: x, ...(x !== true && { extraVehiclesValue: '' }) })
                }
                onChangeAmount={(x) => setRes(p.id, { extraVehiclesValue: x })}
              />
              <ResourceRow
                q="Life insurance with cash value?"
                has={r.hasLifeInsurance}
                amount={r.lifeInsuranceValue}
                onChangeHas={(x) =>
                  setRes(p.id, { hasLifeInsurance: x, ...(x !== true && { lifeInsuranceValue: '' }) })
                }
                onChangeAmount={(x) => setRes(p.id, { lifeInsuranceValue: x })}
              />
              <ResourceRow
                q="Burial plot or prepaid burial arrangement?"
                has={r.hasBurialPlot}
                amount={r.burialPlotValue}
                onChangeHas={(x) => setRes(p.id, { hasBurialPlot: x, ...(x !== true && { burialPlotValue: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { burialPlotValue: x })}
              />
              <ResourceRow
                q="Trusts you own or benefit from?"
                has={r.hasTrusts}
                amount={r.trustsValue}
                onChangeHas={(x) => setRes(p.id, { hasTrusts: x, ...(x !== true && { trustsValue: '' }) })}
                onChangeAmount={(x) => setRes(p.id, { trustsValue: x })}
              />
              <ResourceRow
                q="Transferred or gifted property in the past 60 months?"
                hint="Sales below fair-market value or gifts may affect Medicaid eligibility (the 'look-back' rule)."
                has={r.hasTransfers60mo}
                amount={r.transfers60moValue}
                onChangeHas={(x) =>
                  setRes(p.id, { hasTransfers60mo: x, ...(x !== true && { transfers60moValue: '' }) })
                }
                onChangeAmount={(x) => setRes(p.id, { transfers60moValue: x })}
              />
            </Stack>
          </Panel>
        );
      })}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step · Non-MAGI / ABD — Medicare & Long-term care
// ─────────────────────────────────────────────────────────────────────────
const MEDICARE_LTC_DEFAULTS = {
  hasMedicare: null,
  partA: false,
  partB: false,
  partC: false,
  partD: false,
  medicareNumber: '',
  receivingLtc: null,
  ltcSetting: '',
  ltcFacility: '',
  ltcStartDate: '',
  ltcEndDate: '',
};

const LTC_SETTINGS = [
  { value: 'nf', label: 'Nursing facility' },
  { value: 'al', label: 'Assisted living' },
  { value: 'hcbs', label: 'Home and community-based services (HCBS)' },
  { value: 'icf_iid', label: 'ICF/IID (Intermediate Care Facility for Individuals with Intellectual Disabilities)' },
];

const MEDICARE_PART_OPTS = [
  { value: 'partA', label: 'Part A (Hospital)' },
  { value: 'partB', label: 'Part B (Medical)' },
  { value: 'partC', label: 'Part C (Medicare Advantage)' },
  { value: 'partD', label: 'Part D (Prescriptions)' },
];

function StepNonMagiMedicareLtc({ ctx }) {
  const { data, setData } = ctx;
  const members = abdMembers(data);
  const setMl = makePersonSetter(setData, 'nonMagiMedicareLtc', MEDICARE_LTC_DEFAULTS);

  if (members.length === 0) {
    return (
      <Alert kind="neutral" title="No additional steps needed">
        Based on your household, this section isn't needed. Continue to keep going.
      </Alert>
    );
  }

  return (
    <Stack gap={20}>
      <Alert kind="info" title="Why we're asking">
        Medicare and long-term care affect which Medicaid program covers you, and how the two interact (Medicaid can pay
        Medicare premiums, cost-sharing, or long-term care). A caseworker will follow up if the answers here need more
        detail.
      </Alert>

      {members.map((p) => {
        const m = (data.nonMagiMedicareLtc || {})[p.id] || MEDICARE_LTC_DEFAULTS;
        const personData =
          p.id === PRIMARY_APPLICANT_ID
            ? data.primaryApplicant
            : (data.householdMembers || []).find((mm) => mm.id === p.id) || {};
        const age = ageFrom(personData.dob);
        const partsValue = MEDICARE_PART_OPTS.filter((opt) => m[opt.value] === true).map((opt) => opt.value);

        return (
          <Panel key={p.id}>
            <Stack gap={14}>
              <NonMagiMemberHead name={p.name} age={age} reasons={p.reasons} />

              {/* ─── Medicare ─────────────────────────────────────────── */}
              <QuestionRow
                q="Currently enrolled in Medicare?"
                value={m.hasMedicare}
                onChange={(x) =>
                  setMl(p.id, {
                    hasMedicare: x,
                    ...(x !== true && {
                      partA: false,
                      partB: false,
                      partC: false,
                      partD: false,
                      medicareNumber: '',
                    }),
                  })
                }
              />
              {m.hasMedicare === true ? (
                <Stack gap={12}>
                  {/* fieldset/legend wraps CheckboxGroup so screen readers
                      announce the group label ("Which parts?") along with each
                      individual checkbox. A plain <label> can't legally target
                      multiple inputs — fieldset/legend is the WCAG-correct
                      grouping pattern (1.3.1, 4.1.2). */}
                  <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                    <legend className="field-label" style={{ padding: '0px 0px 12px', fontSize: '16px' }}>
                      Which parts?
                    </legend>
                    <CheckboxGroup
                      name={`mc-parts-${p.id}`}
                      value={partsValue}
                      onChange={(arr) =>
                        setMl(p.id, {
                          partA: arr.includes('partA'),
                          partB: arr.includes('partB'),
                          partC: arr.includes('partC'),
                          partD: arr.includes('partD'),
                        })
                      }
                      options={MEDICARE_PART_OPTS}
                      cols={2}
                    />
                  </fieldset>
                  <Field label="Medicare number" hint="On the red, white, and blue Medicare card. Optional.">
                    <TextInput
                      value={m.medicareNumber}
                      onChange={(x) => setMl(p.id, { medicareNumber: x })}
                      placeholder="1EG4-TE5-MK72"
                    />
                  </Field>
                </Stack>
              ) : null}

              {/* ─── Long-term care ───────────────────────────────────── */}
              <QuestionRow
                q="Currently receiving long-term care services?"
                value={m.receivingLtc}
                onChange={(x) =>
                  setMl(p.id, {
                    receivingLtc: x,
                    ...(x !== true && {
                      ltcSetting: '',
                      ltcFacility: '',
                      ltcStartDate: '',
                      ltcEndDate: '',
                    }),
                  })
                }
              />
              {m.receivingLtc === true ? (
                <Stack gap={12}>
                  <Field label="Care setting">
                    <Select
                      value={m.ltcSetting}
                      onChange={(x) => setMl(p.id, { ltcSetting: x })}
                      options={LTC_SETTINGS}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Facility or provider name">
                    <TextInput
                      value={m.ltcFacility}
                      onChange={(x) => setMl(p.id, { ltcFacility: x })}
                      placeholder="e.g. Mercy Care Center"
                    />
                  </Field>
                  <div className="grid-2">
                    <Field label="Start date">
                      <TextInput
                        type="date"
                        value={m.ltcStartDate}
                        onChange={(x) => setMl(p.id, { ltcStartDate: x })}
                      />
                    </Field>
                    <Field label="End date (if known)">
                      <TextInput type="date" value={m.ltcEndDate} onChange={(x) => setMl(p.id, { ltcEndDate: x })} />
                    </Field>
                  </div>
                </Stack>
              ) : null}
            </Stack>
          </Panel>
        );
      })}
    </Stack>
  );
}

Object.assign(window, {
  StepNonMagiResources,
  StepNonMagiMedicareLtc,
});

export { StepNonMagiResources, StepNonMagiMedicareLtc };
