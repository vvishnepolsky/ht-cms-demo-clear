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
} from "react";
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
} from "./ui";
import {
  useFormData,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
  FormDataContext,
} from "./context";
import {
  computeEligibility,
  FPL_2026,
  PATHWAYS,
  lookupFPL,
  ageFrom,
  toMonthly,
} from "./eligibility";
import { VerifiedControl, VerifiedRequirement } from "./VerifiedChip";
import { FileUpload } from "./screens-e";
import { useWireHousehold } from "../hooks/useWireHousehold";
import { useStepSubmit } from "./submit-hooks";
import { SSNInput } from "./SSNInput";

/* =========================================================================
   Screens F — Demographics (with per-member loops), WorkRequirements
   (per-applicant), HouseholdMembers (modal sheet).
   ========================================================================= */

// ─────────────────────────────────────────────────────────────────────────
// Reusable per-member section header
// ─────────────────────────────────────────────────────────────────────────
function MemberSectionHead({ name, relationship, age, badge }) {
  return (
    <div className="member-head">
      <Avatar name={name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="member-head-name">{name || "Member"}</div>
        <div className="member-head-meta">
          {relationship ? `${relationship}` : ""}
          {age !== null && age !== undefined ? ` · age ${age}` : ""}
        </div>
      </div>
      {badge ? <span className="tag">{badge}</span> : null}
    </div>
  );
}

// Compute the list of applying people in the order spec wants:
// primary applicant first (id "0"), then applying householdMembers.
function applyingPeople(data) {
  const primary = data.primaryApplicant;
  const out = [
    {
      id: "0",
      name:
        [primary.firstName, primary.lastName].filter(Boolean).join(" ") ||
        "Primary applicant",
      dob: primary.dob,
      sex: primary.sex,
      relationship: "Self",
      age: ageFrom(primary.dob),
    },
  ];
  for (const m of data.householdMembers || []) {
    if (!m.applying) continue;
    out.push({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim() || "Member",
      dob: m.dob,
      sex: m.sex,
      relationship:
        (WIZARD_RELATIONSHIPS.find((r) => r.value === m.relationship) || {})
          .label || "—",
      age: ageFrom(m.dob),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: ensure citizenship entries exist for every applying member
// ─────────────────────────────────────────────────────────────────────────
function useEnsurePerMemberRecords(ctx) {
  const { data, setData } = ctx;
  const people = applyingPeople(data);
  useEffect(() => {
    setData((prev) => {
      const cz = { ...prev.citizenship };
      let dirty = false;
      for (const p of people) {
        if (!cz[p.id]) {
          cz[p.id] = {
            status: "",
            documentType: "",
            alienNumber: "",
            dateOfEntry: "",
            countryOfBirth: "United States",
            hasSponsor: null,
            sponsorName: "",
            sponsorAddress: "",
            sponsorIncome: "",
            fiveYearResident: null,
            tribalMember: null,
            tribeName: "",
          };
          dirty = true;
        }
      }
      return dirty ? { ...prev, citizenship: cz } : prev;
    });
    // eslint-disable-next-line
  }, [people.map((p) => p.id).join("|")]);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 5 · Demographics (consolidated with per-member loops)
// ─────────────────────────────────────────────────────────────────────────
function StepDemographicsV2({ ctx }) {
  const { data, setPath, setData } = ctx;
  useEnsurePerMemberRecords(ctx);
  const v = data.demographics;
  const primary = data.primaryApplicant;
  const people = applyingPeople(data);

  // Identity (primary applicant)
  const RACE_OPTS = [
    { value: "white", label: "White" },
    { value: "black", label: "Black or African American" },
    { value: "ai_an", label: "American Indian / Alaska Native" },
    { value: "asian", label: "Asian" },
    { value: "nh_pi", label: "Native Hawaiian / Pacific Islander" },
    { value: "other", label: "Some other race" },
    { value: "decline", label: "Prefer not to say" },
  ];

  const setCz = (memberId, key, val) =>
    setData((prev) => ({
      ...prev,
      citizenship: {
        ...prev.citizenship,
        [memberId]: { ...(prev.citizenship[memberId] || {}), [key]: val },
      },
    }));

  // ─── Identity (primary only) ────────────────────────────────────────────
  const sexVerified =
    !!primary.identityVerification?.verifiedFields?.includes("sex") &&
    !!primary.sex;
  const IdentitySection = (
    <Panel title="Identity">
      <Stack gap={14}>
        <Field
          label="Sex assigned at birth"
          required
          hint={
            sexVerified ? "Confirmed during identity verification." : undefined
          }
        >
          <VerifiedControl verified={sexVerified}>
            <RadioGroup
              name="sex"
              value={primary.sex}
              onChange={(x) => {
                setPath("primaryApplicant", "sex", x);
                if (x !== "female") {
                  setPath("demographics", "pregnant", null);
                  setPath("demographics", "dueDate", "");
                  setPath("demographics", "expectedBabies", 1);
                }
              }}
              cols={2}
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
            />
          </VerifiedControl>
        </Field>
        <Field
          label="Race"
          hint="Optional — pick any that apply. This won't affect your eligibility."
        >
          <div className="chip-group">
            {RACE_OPTS.map((o) => {
              const on = v.race.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={"chip" + (on ? " on" : "")}
                  onClick={() => {
                    const next = on
                      ? v.race.filter((r) => r !== o.value)
                      : [...v.race, o.value];
                    setPath("demographics", "race", next);
                  }}
                >
                  {on ? <Icon name="check" size={12} /> : null} {o.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Are you of Hispanic, Latino, or Spanish origin?">
          <RadioGroup
            name="eth"
            value={v.ethnicity}
            onChange={(x) => setPath("demographics", "ethnicity", x)}
            cols={3}
            options={[
              { value: "hispanic", label: "Yes" },
              { value: "not_hispanic", label: "No" },
              { value: "decline", label: "Prefer not to say" },
            ]}
          />
        </Field>

        {data.primaryApplicant.identityVerification?.status === "success" ? (
          // Identity was verified with a government ID through CLEAR — the
          // proof-of-identity upload is already satisfied.
          <VerifiedRequirement
            title="Proof of identity"
            detail="Your identity was verified with a government ID through CLEAR. No upload needed."
          />
        ) : (
          <FileUpload
            files={data.primaryApplicant.proofOfIdentity || []}
            onChange={(next) =>
              setPath("primaryApplicant", "proofOfIdentity", next)
            }
            title="Proof of identity"
            subtitle="Upload a driver's license, state ID, passport, or birth certificate to verify your identity."
            badge="Optional · speeds up approval"
          />
        )}
      </Stack>
    </Panel>
  );

  // ─── Citizenship per-member ─────────────────────────────────────────────
  const CitizenshipSection = (
    <Panel
      title="Citizenship &amp; immigration status"
      subtitle="We need this for everyone applying. Your status is confidential — State-X HHS does not share immigration information with enforcement."
    >
      <Stack gap={18}>
        {people.map((p, idx) => {
          const c = data.citizenship[p.id] || {};
          return (
            <div key={p.id} className="member-block">
              <MemberSectionHead
                name={p.name}
                relationship={p.relationship}
                age={p.age}
              />
              <Stack gap={12}>
                <RadioGroup
                  name={`cit-${p.id}`}
                  value={c.status}
                  onChange={(x) => setCz(p.id, "status", x)}
                  options={[
                    {
                      value: "us_citizen",
                      title: "U.S. Citizen",
                      desc: "Born in the U.S., born to a U.S. citizen, or naturalized.",
                    },
                    {
                      value: "lpr",
                      title: "Lawfully present non-citizen",
                      desc: "Green card holder, refugee, asylee, parolee, etc.",
                    },
                    {
                      value: "not_citizen",
                      title: "Not a U.S. citizen",
                      desc: "May still qualify for emergency Medicaid only.",
                    },
                  ]}
                />

                {c.status === "lpr" ? (
                  <Stack gap={12}>
                    <div className="grid-2">
                      <Field label="Document type">
                        <Select
                          value={c.documentType}
                          onChange={(x) => setCz(p.id, "documentType", x)}
                          options={[
                            { value: "i551", label: "I-551 (Green Card)" },
                            { value: "i94", label: "I-94 / I-94A" },
                            {
                              value: "ead",
                              label: "Employment Authorization (I-766)",
                            },
                            {
                              value: "passport_stamp",
                              label: "Passport with I-551 stamp",
                            },
                            { value: "other", label: "Other" },
                          ]}
                          placeholder="—"
                        />
                      </Field>
                      <Field label="USCIS / Alien number">
                        <TextInput
                          value={c.alienNumber}
                          onChange={(x) => setCz(p.id, "alienNumber", x)}
                          placeholder="A012345678"
                        />
                      </Field>
                    </div>
                    <div className="grid-2">
                      <Field label="Date of entry to the U.S.">
                        <TextInput
                          type="date"
                          value={c.dateOfEntry}
                          onChange={(x) => setCz(p.id, "dateOfEntry", x)}
                        />
                      </Field>
                      <Field label="Country of birth">
                        <TextInput
                          value={c.countryOfBirth}
                          onChange={(x) => setCz(p.id, "countryOfBirth", x)}
                        />
                      </Field>
                    </div>
                    <QuestionRow
                      q="Lawful permanent resident for at least 5 years?"
                      value={c.fiveYearResident}
                      onChange={(x) => setCz(p.id, "fiveYearResident", x)}
                    />
                    <QuestionRow
                      q="Do you have an immigration sponsor?"
                      value={c.hasSponsor}
                      onChange={(x) => setCz(p.id, "hasSponsor", x)}
                    />
                    {c.hasSponsor === true ? (
                      <Stack gap={10}>
                        <Field label="Sponsor's name">
                          <TextInput
                            value={c.sponsorName}
                            onChange={(x) => setCz(p.id, "sponsorName", x)}
                          />
                        </Field>
                        <div className="grid-2">
                          <Field label="Sponsor's address">
                            <TextInput
                              value={c.sponsorAddress}
                              onChange={(x) => setCz(p.id, "sponsorAddress", x)}
                            />
                          </Field>
                          <Field label="Sponsor's monthly income">
                            <TextInput
                              value={c.sponsorIncome}
                              onChange={(x) => setCz(p.id, "sponsorIncome", x)}
                              prefix="$"
                              inputMode="numeric"
                            />
                          </Field>
                        </div>
                      </Stack>
                    ) : null}
                  </Stack>
                ) : null}

                {c.status === "not_citizen" ? (
                  <Alert
                    kind="info"
                    title="You may qualify for Emergency Medicaid"
                  >
                    Emergency Medicaid covers urgent medical care regardless of
                    immigration status. A caseworker will follow up on what's
                    available.
                  </Alert>
                ) : null}

                <QuestionRow
                  q="Member of a federally recognized tribe?"
                  value={c.tribalMember}
                  onChange={(x) => {
                    setCz(p.id, "tribalMember", x);
                    if (x !== true) setCz(p.id, "tribeName", "");
                  }}
                />
                {c.tribalMember === true ? (
                  <Field
                    label="Which federally recognized tribe are you affiliated with?"
                    htmlFor={`tribeName-${p.id}`}
                    required
                  >
                    <TextInput
                      id={`tribeName-${p.id}`}
                      value={c.tribeName}
                      onChange={(x) => setCz(p.id, "tribeName", x)}
                      placeholder="e.g. Cherokee Nation"
                    />
                  </Field>
                ) : null}
              </Stack>
              {idx < people.length - 1 ? (
                <div className="divider-strong" />
              ) : null}
            </div>
          );
        })}
      </Stack>
    </Panel>
  );

  // ─── Pregnancy (primary only) ───────────────────────────────────────────
  const PregnancySection = (
    <Panel title="Pregnancy">
      <Stack gap={12}>
        <QuestionRow
          q="Are you currently pregnant?"
          value={v.pregnant}
          onChange={(x) => setPath("demographics", "pregnant", x)}
        />
        {v.pregnant === true ? (
          <Fragment>
            <div className="grid-2">
              <Field label="Expected due date">
                <TextInput
                  type="date"
                  value={v.dueDate}
                  onChange={(x) => setPath("demographics", "dueDate", x)}
                />
              </Field>
              <Field label="Number of babies expected">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={String(v.expectedBabies)}
                  onChange={(x) =>
                    setPath(
                      "demographics",
                      "expectedBabies",
                      Math.max(1, Number(x) || 1),
                    )
                  }
                />
              </Field>
            </div>
            <Alert kind="info">
              Pregnancy increases your household size for Medicaid. If you're
              expecting twins or more, each baby counts toward your household.
            </Alert>
          </Fragment>
        ) : null}
      </Stack>
    </Panel>
  );

  // ─── Disability (primary only) ──────────────────────────────────────────
  // SSI / SSDI moved to Income section (ENG-1698) — they are income-type
  // benefits, not demographics. SSDI specifically triggers Non-MAGI routing
  // and is now captured via otherIncome.
  const DisabilitySection = (
    <Panel title="Disability">
      <Stack gap={2}>
        <QuestionRow
          q="Do you have a disability that limits your ability to work?"
          value={v.disability}
          onChange={(x) => setPath("demographics", "disability", x)}
        />
      </Stack>
    </Panel>
  );

  const AdditionalStatusSection = (
    <Panel title="Additional status">
      <Stack gap={2}>
        <QuestionRow
          q="Were you in state foster care and aged out at 18 or older?"
          hint="Former foster youth qualify for Medicaid until age 26 regardless of income."
          value={v.formerFosterYouth}
          onChange={(x) => setPath("demographics", "formerFosterYouth", x)}
        />
        <QuestionRow
          q="Are you a US veteran or active duty military?"
          value={v.veteran}
          onChange={(x) => setPath("demographics", "veteran", x)}
        />
      </Stack>
    </Panel>
  );

  return (
    <Stack gap={20}>
      {IdentitySection}
      {CitizenshipSection}
      {primary.sex === "female" ? PregnancySection : null}
      {DisabilitySection}
      {AdditionalStatusSection}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 6 · WorkRequirements (per-applicant cards, 19–64 only)
// ─────────────────────────────────────────────────────────────────────────
const EXEMPTION_OPTS = [
  { value: "65plus", label: "Age 65 or older" },
  { value: "ssdi_ssi", label: "Receiving SSDI or SSI" },
  { value: "med_frail", label: "Medically frail" },
  { value: "pregnant", label: "Pregnant or recently gave birth" },
  { value: "caregiver", label: "Caregiver of a young child" },
  { value: "sud_treatment", label: "In substance-use disorder treatment" },
  { value: "foster_youth", label: "Former foster youth" },
  { value: "veteran", label: "Veteran" },
  { value: "tribal", label: "Member of a federally recognized tribe" },
  { value: "dv_survivor", label: "Domestic violence survivor" },
  { value: "none", label: "None of the above" },
];

function StepWorkRequirementsV2({ ctx }) {
  const { data, setData } = ctx;
  const people = applyingPeople(data).filter(
    (p) => p.age !== null && p.age >= 19 && p.age < 65,
  );

  const set = (id, patch) =>
    setData((prev) => ({
      ...prev,
      workRequirements: {
        ...prev.workRequirements,
        [id]: {
          employedOrInActivity: null,
          activityDescription: "",
          hoursPerWeek: 0,
          exemptions: [],
          ...(prev.workRequirements[id] || {}),
          ...patch,
        },
      },
    }));

  return (
    <Stack gap={20}>
      <Alert kind="info">
        For most adults aged 19–64, State-X Medicaid requires either work,
        school, or an exemption. Tell us about each applying adult's situation.
      </Alert>

      {people.map((p) => {
        const w = data.workRequirements[p.id] || {};
        const monthlyHours = Number(w.hoursPerWeek || 0) * 4.33;
        const meetsThreshold = monthlyHours >= 80;
        return (
          <Panel key={p.id}>
            <Stack gap={14}>
              <MemberSectionHead
                name={p.name}
                relationship={p.relationship}
                age={p.age}
              />

              <QuestionRow
                q="Are you currently employed, in school, or in a qualifying activity?"
                value={w.employedOrInActivity}
                onChange={(x) => set(p.id, { employedOrInActivity: x })}
              />

              {w.employedOrInActivity === true ? (
                <Stack gap={10}>
                  <Field label="Briefly describe the activity">
                    <TextInput
                      value={w.activityDescription}
                      onChange={(x) => set(p.id, { activityDescription: x })}
                      placeholder="e.g. Cashier at Hy-Vee · Full-time student at DMACC · Caring for an infant"
                    />
                  </Field>
                  <Field label="Average hours per week">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={String(w.hoursPerWeek || "")}
                      onChange={(x) =>
                        set(p.id, { hoursPerWeek: Number(x) || 0 })
                      }
                    />
                  </Field>
                  {w.hoursPerWeek > 0 ? (
                    <div
                      className={"req-pill " + (meetsThreshold ? "ok" : "warn")}
                    >
                      <Icon
                        name={meetsThreshold ? "check" : "alert"}
                        size={14}
                      />
                      {meetsThreshold ? (
                        <span>
                          Meets the 80 hr/month requirement (
                          {Math.round(monthlyHours)} hrs/mo)
                        </span>
                      ) : (
                        <span>
                          Below the 80 hr/month requirement — needs{" "}
                          {Math.round(80 - monthlyHours)} more hrs/mo or an
                          exemption
                        </span>
                      )}
                    </div>
                  ) : null}
                </Stack>
              ) : null}

              {w.employedOrInActivity === false ? (
                <Stack gap={10}>
                  <Field
                    label="Do any of these apply to you?"
                    hint="Any one of these exempts you from work expectations."
                  >
                    <CheckboxGroup
                      name={`exempt-${p.id}`}
                      value={w.exemptions || []}
                      onChange={(x) => set(p.id, { exemptions: x })}
                      options={EXEMPTION_OPTS}
                      cols={2}
                    />
                  </Field>
                  {(w.exemptions || []).includes("none") ? (
                    <Alert kind="warning">
                      A caseworker will contact you to discuss your options.
                    </Alert>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          </Panel>
        );
      })}

      <div
        className="fineprint"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <Icon name="info" size={12} /> Exemption rules pending state policy
        confirmation.
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 7 · HouseholdMembers with modal sheet
// ─────────────────────────────────────────────────────────────────────────
const REL_OPTS_V2 = [
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "stepchild", label: "Stepchild" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "grandchild", label: "Grandchild" },
  { value: "grandparent", label: "Grandparent" },
  { value: "other_relative", label: "Other relative" },
  { value: "roommate", label: "Roommate" },
  { value: "other", label: "Other" },
];

// ── useFocusTrap — focus management for modal dialogs ──────────────────
// Traps Tab / Shift-Tab inside the dialog while it's open, returns focus
// to whatever element opened it on close, and treats Escape as a close
// signal. Pure a11y; no behavior change to the caller's state.
function useFocusTrap(ref, isOpen, onClose) {
  // eslint-disable-next-line no-restricted-syntax -- named focus-trap hook; encapsulates imperative focus management with no declarative alternative
  useEffect(() => {
    if (!isOpen || !ref.current) return undefined;
    const opener = document.activeElement;
    const root = ref.current;
    const focusables = () =>
      root.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    const first = focusables()[0];
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(focusables());
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [isOpen, ref, onClose]);
}

function MemberSheet({ open, onClose, initial, onSave }) {
  const [draft, setDraft] = useState(initial || {});
  const sheetRef = useRef(null);
  const titleId = React.useId();
  useFocusTrap(sheetRef, open, onClose);
  useEffect(() => {
    setDraft(
      initial
        ? { ...initial, ssn: (initial.ssn || "").replace(/\D/g, "") }
        : {
            id: "m" + Math.floor(Math.random() * 1e6),
            firstName: "",
            middleInitial: "",
            lastName: "",
            relationship: "",
            dob: "",
            sex: "",
            ssn: "",
            applying: true,
            hasDisability: false,
            pregnant: null,
            dueDate: "",
            expectedBabies: 1,
          },
    );
  }, [initial, open]);

  if (!open) return null;

  const age = ageFrom(draft.dob);
  const canBePregnant = draft.sex === "female";

  const valid =
    draft.firstName &&
    draft.lastName &&
    draft.dob &&
    !validateDob(draft.dob) &&
    draft.relationship;

  function save(closeAfter) {
    onSave(draft, closeAfter);
    if (closeAfter) onClose();
    else {
      setDraft({
        id: "m" + Math.floor(Math.random() * 1e6),
        firstName: "",
        middleInitial: "",
        lastName: "",
        relationship: "",
        dob: "",
        sex: "",
        ssn: "",
        applying: true,
        hasDisability: false,
        pregnant: null,
        dueDate: "",
        expectedBabies: 1,
      });
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3 id={titleId}>
            {initial ? "Edit household member" : "Add household member"}
          </h3>
          <button
            type="button"
            className="btn btn--ghost size-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size={14} aria-hidden={true} />
          </button>
        </div>
        <div className="sheet-body">
          <Stack gap={14}>
            <div className="grid-2">
              <Field label="Relationship" required>
                <Select
                  value={draft.relationship}
                  onChange={(x) => setDraft({ ...draft, relationship: x })}
                  options={REL_OPTS_V2}
                  placeholder="—"
                />
              </Field>
              <Field label="Sex">
                <Select
                  value={draft.sex}
                  onChange={(x) =>
                    setDraft({
                      ...draft,
                      sex: x,
                      ...(x !== "female" && {
                        pregnant: null,
                        dueDate: "",
                        expectedBabies: 1,
                      }),
                    })
                  }
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                  placeholder="—"
                />
              </Field>
            </div>

            <div className="grid-name">
              <Field label="First name" required>
                <TextInput
                  value={draft.firstName}
                  onChange={(x) => setDraft({ ...draft, firstName: x })}
                />
              </Field>
              <Field label="MI">
                <TextInput
                  value={draft.middleInitial}
                  maxLength={1}
                  onChange={(x) => setDraft({ ...draft, middleInitial: x })}
                />
              </Field>
              <Field label="Last name" required>
                <TextInput
                  value={draft.lastName}
                  onChange={(x) => setDraft({ ...draft, lastName: x })}
                />
              </Field>
            </div>
            <div className="grid-2">
              <Field
                label="Date of birth"
                required
                error={draft.dob ? validateDob(draft.dob) : undefined}
              >
                <TextInput
                  type="date"
                  value={draft.dob}
                  onChange={(x) => setDraft({ ...draft, dob: x })}
                />
              </Field>
              <Field
                label="SSN"
                htmlFor="sheet-ssn"
                hint="Optional. If they have one."
              >
                <SSNInput
                  id="sheet-ssn"
                  value={draft.ssn}
                  onChange={(digits) => setDraft({ ...draft, ssn: digits })}
                />
              </Field>
            </div>

            {age !== null ? (
              <div className="fineprint">{age} years old</div>
            ) : null}

            <Panel title="Coverage" className="panel--inset">
              <Stack gap={4}>
                <QuestionRow
                  q="Is this person applying for health coverage?"
                  value={draft.applying}
                  onChange={(x) => setDraft({ ...draft, applying: x })}
                />
                <QuestionRow
                  q="Does this person have a disability or long-term care need?"
                  value={draft.hasDisability}
                  onChange={(x) => setDraft({ ...draft, hasDisability: x })}
                />
                {canBePregnant ? (
                  <QuestionRow
                    q="Currently pregnant?"
                    value={draft.pregnant}
                    onChange={(x) => setDraft({ ...draft, pregnant: x })}
                  />
                ) : null}
                {canBePregnant && draft.pregnant === true ? (
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    <Field label="Expected due date">
                      <TextInput
                        type="date"
                        value={draft.dueDate}
                        onChange={(x) => setDraft({ ...draft, dueDate: x })}
                      />
                    </Field>
                    <Field label="Number of babies">
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        value={String(draft.expectedBabies || 1)}
                        onChange={(x) =>
                          setDraft({
                            ...draft,
                            expectedBabies: Math.max(1, Number(x) || 1),
                          })
                        }
                      />
                    </Field>
                  </div>
                ) : null}
              </Stack>
            </Panel>
          </Stack>
        </div>
        <div className="sheet-foot">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!valid}
            onClick={() => save(false)}
          >
            Save &amp; add another
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => save(true)}
          >
            Save &amp; done
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepHouseholdMembersV2({ ctx }) {
  const { data, updateFormData } = ctx;
  const members = data.householdMembers;
  const primary = data.primaryApplicant;
  const taxFiling = data.taxFiling;

  const setTaxFiling = (patch) =>
    updateFormData("taxFiling", { ...taxFiling, ...patch });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Stable callback prevents useFocusTrap from tearing down its keydown
  // listener on every parent render while the sheet is open.
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
  }, []);

  const wireHousehold = useWireHousehold();
  useStepSubmit(
    useCallback(async () => {
      // ENG-1842: catch duplicate SSNs client-side before hitting the API.
      // Normalize to digits-only and require 9 digits to avoid false positives
      // on partially-entered values.
      const allSsns = [
        primary?.ssn ? primary.ssn.replace(/\D/g, "") : "",
        ...members.map((m) => (m.ssn ? m.ssn.replace(/\D/g, "") : "")),
      ].filter((s) => s.length === 9);
      if (allSsns.length !== new Set(allSsns).size) {
        return {
          ok: false,
          error:
            "Two or more people in your household have the same SSN. Please check each member and correct any duplicates.",
        };
      }

      const formMembers = members.map((m) => ({
        firstName: m.firstName || "",
        middleInitial: m.middleInitial || "",
        lastName: m.lastName || "",
        dob: m.dob || "",
        ssn: m.ssn || "",
        relationship: m.relationship || "",
      }));
      const { success, errors } = await wireHousehold.execute(formMembers);
      if (!success) {
        // Log the error code for signal; show a static message. See screens-h.tsx
        // for the canonical pattern. Per standards/coding-standards.md § Error
        // handling in mutations.
        if (errors[0]?.code) {
          console.error("[StepHouseholdMembersV2] wireHousehold failed", {
            code: errors[0].code,
          });
        }
        return {
          ok: false,
          error: "Unable to save your household. Please try again.",
        };
      }
      return { ok: true };
    }, [wireHousehold, members, primary]),
  );

  const addOrUpdate = (draft, _closeAfter) => {
    const exists = members.find((m) => m.id === draft.id);
    if (exists) {
      updateFormData(
        "householdMembers",
        members.map((m) => (m.id === draft.id ? draft : m)),
      );
    } else {
      updateFormData("householdMembers", [...members, draft]);
    }
    setEditing(null);
  };
  const remove = (id) => {
    updateFormData(
      "householdMembers",
      members.filter((m) => m.id !== id),
    );
    setTaxFiling({
      headOfHouseholdId:
        taxFiling.headOfHouseholdId === id ? "0" : taxFiling.headOfHouseholdId,
      filingJointlyWithId:
        taxFiling.filingJointlyWithId === id
          ? ""
          : taxFiling.filingJointlyWithId,
      taxDependentIds: taxFiling.taxDependentIds.filter((dep) => dep !== id),
    });
  };

  const total = 1 + members.length;
  const applyingCount = 1 + members.filter((m) => m.applying).length;

  function MemberCard({ name, sub, badges, pinned, onEdit, onRemove }) {
    return (
      <div className={"hhm-card" + (pinned ? " pinned" : "")}>
        <Avatar name={name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hhm-name">{name}</div>
          <div className="hhm-sub">{sub}</div>
          <div className="hhm-badges">{badges}</div>
        </div>
        <div className="hhm-actions">
          {onEdit ? (
            <button
              type="button"
              className="btn btn--ghost size-sm"
              onClick={onEdit}
            >
              <Icon name="edit" size={14} /> Edit
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="btn btn--ghost size-sm"
              onClick={onRemove}
              style={{ color: "var(--civic-destructive-text)" }}
            >
              <Icon name="trash" size={14} /> Remove
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function Badges({
    applying,
    disability,
    pregnant,
    filingJointly,
    taxDependent,
  }) {
    return (
      <span className="hhm-badge-row" style={{ display: "contents" }}>
        <span className={"hhm-badge " + (applying ? "ok" : "muted")}>
          {applying ? "Applying" : "Not applying"}
        </span>
        {disability ? (
          <span className="hhm-badge warn">Disability / LTC</span>
        ) : null}
        {pregnant ? <span className="hhm-badge accent">Pregnant</span> : null}
        {filingJointly ? (
          <span className="hhm-badge info">Filing jointly</span>
        ) : null}
        {taxDependent ? (
          <span className="hhm-badge neutral">Tax dependent</span>
        ) : null}
      </span>
    );
  }

  return (
    <Stack gap={20}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="tag">
          {total} member{total === 1 ? "" : "s"} · {applyingCount} applying
        </span>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Icon name="plus" size={14} /> Add household member
        </Button>
      </div>

      <Stack gap={12}>
        <MemberCard
          pinned
          name={
            [primary.firstName, primary.lastName].filter(Boolean).join(" ") ||
            "Primary applicant"
          }
          sub={`Self · ${primary.dob ? `age ${ageFrom(primary.dob)} · DOB ${fmtDate(primary.dob)}` : "DOB not set"}`}
          badges={
            <Badges
              applying={true}
              disability={data.demographics.disability === true}
              pregnant={data.demographics.pregnant === true}
              filingJointly={false}
              taxDependent={false}
            />
          }
        />

        {members.map((m) => (
          <MemberCard
            key={m.id}
            name={`${m.firstName} ${m.lastName}`.trim() || "Member"}
            sub={`${(REL_OPTS_V2.find((r) => r.value === m.relationship) || {}).label || "—"} · ${m.dob ? `age ${ageFrom(m.dob)} · DOB ${fmtDate(m.dob)}` : "DOB not set"}`}
            badges={
              <Badges
                applying={m.applying}
                disability={m.hasDisability}
                pregnant={m.pregnant === true}
                filingJointly={taxFiling.filingJointlyWithId === m.id}
                taxDependent={taxFiling.taxDependentIds.includes(m.id)}
              />
            }
            onEdit={() => {
              setEditing(m);
              setSheetOpen(true);
            }}
            onRemove={() => remove(m.id)}
          />
        ))}
      </Stack>

      {members.length === 0 ? (
        <Alert kind="neutral">
          You live alone? That's fine — Continue. Or add anyone who shares your
          home, even if they aren't applying.
        </Alert>
      ) : null}

      <Panel
        title="Your tax household"
        subtitle="Medicaid uses your federal tax household to determine income limits."
      >
        <Stack gap={14}>
          <Field label="Will you (the primary applicant) file a federal tax return this year?">
            <RadioGroup
              name="willFile"
              value={taxFiling.willFile}
              onChange={(x) =>
                setTaxFiling({
                  willFile: x,
                  ...(x !== "yes"
                    ? {
                        headOfHouseholdId: "0",
                        filingJointlyWithId: "",
                        taxDependentIds: [],
                      }
                    : {}),
                })
              }
              cols={3}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "not_sure", label: "Not sure" },
              ]}
            />
          </Field>

          {taxFiling.willFile === "yes" ? (
            <Stack gap={12}>
              <div className="grid-2">
                <Field label="Head of household">
                  <Select
                    value={taxFiling.headOfHouseholdId}
                    onChange={(x) => setTaxFiling({ headOfHouseholdId: x })}
                    options={[
                      {
                        value: "0",
                        label: `${[primary.firstName, primary.lastName].filter(Boolean).join(" ") || "Primary applicant"} (you)`,
                      },
                      ...members
                        .filter((m) => m.applying)
                        .map((m) => ({
                          value: m.id,
                          label:
                            `${m.firstName} ${m.lastName}`.trim() || "Member",
                        })),
                    ]}
                    placeholder="—"
                  />
                </Field>
                <Field label="Filing jointly with">
                  <Select
                    value={taxFiling.filingJointlyWithId}
                    onChange={(x) => setTaxFiling({ filingJointlyWithId: x })}
                    options={[
                      { value: "", label: "No one" },
                      ...members
                        .filter((m) => m.applying)
                        .map((m) => ({
                          value: m.id,
                          label:
                            `${m.firstName} ${m.lastName}`.trim() || "Member",
                        })),
                    ]}
                    placeholder="—"
                  />
                </Field>
              </div>
              <Field label="Tax dependents">
                {members.filter((m) => m.applying).length === 0 ? (
                  <span className="fineprint">
                    Add household members above to designate dependents.
                  </span>
                ) : (
                  <div className="chip-group">
                    {(() => {
                      const eligible = members.filter(
                        (m) =>
                          m.applying &&
                          m.id !== taxFiling.headOfHouseholdId &&
                          m.id !== taxFiling.filingJointlyWithId,
                      );
                      if (eligible.length === 0)
                        return (
                          <span className="fineprint">
                            All household members already have tax-filing roles
                            assigned.
                          </span>
                        );
                      return eligible.map((m) => {
                        const on = taxFiling.taxDependentIds.includes(m.id);
                        const name =
                          `${m.firstName} ${m.lastName}`.trim() || "Member";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={"chip" + (on ? " on" : "")}
                            onClick={() => {
                              const next = on
                                ? taxFiling.taxDependentIds.filter(
                                    (id) => id !== m.id,
                                  )
                                : [...taxFiling.taxDependentIds, m.id];
                              setTaxFiling({ taxDependentIds: next });
                            }}
                          >
                            {on ? <Icon name="check" size={12} /> : null} {name}
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </Field>
            </Stack>
          ) : null}
        </Stack>
      </Panel>

      <MemberSheet
        open={sheetOpen}
        initial={editing}
        onClose={closeSheet}
        onSave={addOrUpdate}
      />
    </Stack>
  );
}

// ─── DOBInput — three separate MM / DD / YYYY inputs ────────────────────
// Easier to use than <input type="date"> on desktop: bigger targets, no
// fiddly pickers, auto-advance between segments. Stores the ISO string
// (YYYY-MM-DD) in the parent's state, empty if any part is missing.
function DOBInput({ value, onChange }) {
  // Parse ISO into local segments
  const parts = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const [m, setM] = useState(parts ? parts[2] : "");
  const [d, setD] = useState(parts ? parts[3] : "");
  const [y, setY] = useState(parts ? parts[1] : "");

  const dayRef = React.useRef(null);
  const yearRef = React.useRef(null);

  // Re-sync from parent (e.g. when the modal opens with seeded data)
  useEffect(() => {
    const p = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    setM(p ? p[2] : "");
    setD(p ? p[3] : "");
    setY(p ? p[1] : "");
  }, [value]);

  function emit(nm, nd, ny) {
    if (nm.length >= 1 && nd.length >= 1 && ny.length === 4) {
      onChange(`${ny}-${nm.padStart(2, "0")}-${nd.padStart(2, "0")}`);
    } else {
      onChange("");
    }
  }

  function onM(e) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    setM(v);
    emit(v, d, y);
    if (v.length === 2) dayRef.current?.focus();
  }
  function onD(e) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    setD(v);
    emit(m, v, y);
    if (v.length === 2) yearRef.current?.focus();
  }
  function onY(e) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setY(v);
    emit(m, d, v);
  }

  return (
    <div className="dob-input" role="group" aria-label="Date of birth">
      <div className="dob-segment">
        <label htmlFor="dob-m" className="dob-segment-label">
          Month
        </label>
        <input
          id="dob-m"
          className="input dob-mm"
          value={m}
          onChange={onM}
          inputMode="numeric"
          maxLength={2}
          placeholder="MM"
        />
      </div>
      <span className="dob-slash" aria-hidden="true">
        /
      </span>
      <div className="dob-segment">
        <label htmlFor="dob-d" className="dob-segment-label">
          Day
        </label>
        <input
          id="dob-d"
          ref={dayRef}
          className="input dob-dd"
          value={d}
          onChange={onD}
          inputMode="numeric"
          maxLength={2}
          placeholder="DD"
        />
      </div>
      <span className="dob-slash" aria-hidden="true">
        /
      </span>
      <div className="dob-segment">
        <label htmlFor="dob-y" className="dob-segment-label">
          Year
        </label>
        <input
          id="dob-y"
          ref={yearRef}
          className="input dob-yyyy"
          value={y}
          onChange={onY}
          inputMode="numeric"
          maxLength={4}
          placeholder="YYYY"
        />
      </div>
    </div>
  );
}

Object.assign(window, {
  MemberSectionHead,
  applyingPeople,
  useEnsurePerMemberRecords,
  StepDemographicsV2,
  StepWorkRequirementsV2,
  StepHouseholdMembersV2,
  StepTaxDependentsV2,
  DOBInput,
  MemberSheet,
  REL_OPTS_V2,
  EXEMPTION_OPTS,
});

// ─────────────────────────────────────────────────────────────────────────
// Tax dependents — runs AFTER HouseholdMembers so the picker has data.
// For each applying person who said:
//   • willFile=yes + claimsDependents=yes → "Who will [name] claim?"
//   • willFile=no/unsure + claimedByOther=yes → "Who will claim [name]?"
// Skip the step entirely if nothing needs picking.
// ─────────────────────────────────────────────────────────────────────────
// NOTE: permanently skipped (skip: () => true in STEPS); body still reads the old
// per-member schema (taxFiling[memberId]) which no longer matches the flat household
// shape. Preserved for reference — do not route without updating to the new schema.
function StepTaxDependentsV2({ ctx }) {
  const { data, setData } = ctx;
  const people = applyingPeople(data);

  const setTx = (memberId, key, val) =>
    setData((prev) => ({
      ...prev,
      taxFiling: {
        ...prev.taxFiling,
        [memberId]: { ...(prev.taxFiling[memberId] || {}), [key]: val },
      },
    }));

  const filers = people.filter((p) => {
    const t = data.taxFiling[p.id] || {};
    return (
      (t.willFile === "yes" && t.claimsDependents === true) ||
      ((t.willFile === "no" || t.willFile === "unsure") &&
        t.claimedByOther === true)
    );
  });

  if (filers.length === 0) {
    return (
      <Alert kind="neutral" title="No one to pick">
        Based on your tax-filing answers, there's nothing to claim or be claimed
        for. You can revisit this on the Demographics step if your situation
        changed.
      </Alert>
    );
  }

  return (
    <Stack gap={20}>
      <Alert kind="info">
        Your tax household determines your income limits for Medicaid. Pick the
        people you'll claim — or who'll claim you — on this year's federal
        return.
      </Alert>

      {filers.map((p) => {
        const t = data.taxFiling[p.id] || {};
        const others = people
          .filter((q) => q.id !== p.id)
          .map((q) => ({ value: q.id, label: q.name }));

        return (
          <Panel key={p.id}>
            <Stack gap={14}>
              <MemberSectionHead
                name={p.name}
                relationship={p.relationship}
                age={p.age}
              />

              {t.willFile === "yes" && t.claimsDependents === true ? (
                <Field
                  label={`Who will ${p.id === "0" ? "you" : p.name.split(" ")[0]} claim as a dependent?`}
                  hint="Select everyone you'll list on your return."
                >
                  {others.length === 0 ? (
                    <Alert kind="neutral">
                      No other household members yet. Go back and add them on
                      the previous step.
                    </Alert>
                  ) : (
                    <Stack gap={8}>
                      {others.map((o) => (
                        <ChoiceCard
                          key={o.value}
                          kind="checkbox"
                          name={`dep-${p.id}`}
                          value={o.value}
                          current={t.claimedDependents || []}
                          onChange={(arr) =>
                            setTx(p.id, "claimedDependents", arr)
                          }
                          title={o.label}
                        />
                      ))}
                    </Stack>
                  )}
                </Field>
              ) : null}

              {(t.willFile === "no" || t.willFile === "unsure") &&
              t.claimedByOther === true ? (
                <Field
                  label={`Who will claim ${p.id === "0" ? "you" : p.name.split(" ")[0]} as a dependent?`}
                >
                  {others.length === 0 ? (
                    <Alert kind="neutral">
                      No other household members yet. Go back and add them on
                      the previous step.
                    </Alert>
                  ) : (
                    <Select
                      value={t.claimedBy}
                      onChange={(x) => setTx(p.id, "claimedBy", x)}
                      options={others}
                      placeholder="Select household member"
                    />
                  )}
                </Field>
              ) : null}
            </Stack>
          </Panel>
        );
      })}
    </Stack>
  );
}

export {
  MemberSectionHead,
  applyingPeople,
  useEnsurePerMemberRecords,
  StepDemographicsV2,
  StepWorkRequirementsV2,
  MemberSheet,
  StepHouseholdMembersV2,
  DOBInput,
  StepTaxDependentsV2,
  REL_OPTS_V2,
  EXEMPTION_OPTS,
};
