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
  FormDataContext,
  FormDataProvider,
  useFormData,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
} from './context';
import { computeEligibility, FPL_2026, PATHWAYS, lookupFPL, ageFrom, toMonthly, isApplyingAdult } from './eligibility';
import {
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
} from './screens-a';
import {
  StepCitizenship,
  StepTaxFiling,
  StepWorkRequirements,
  StepHouseholdMembers,
  StepTaxDependents,
  StepOtherIncome,
  StepProjected,
} from './screens-b';
import { StepEmployerCoverage, StepRetroactive, StepAuthorizedRep, StepPreferences } from './screens-c';
import {
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
} from './screens-d';
import { LanguagePicker, StepWelcomeV2, StepLoginV2, StepHouseholdInfoV2, StepPersonalInfoV2 } from './screens-e';
import { validateDob } from './ui';
import { StepDemographicsV2, StepWorkRequirementsV2, StepHouseholdMembersV2, StepTaxDependentsV2 } from './screens-f';
import {
  StepArgyleConnectV2,
  StepIncomeMethodPicker,
  StepJobInfoV2,
  StepJobHistoryV2,
  StepIncomeInfoV2,
  StepIncomeDiscrepancyV2,
  StepInsuranceV2,
  StepVerifyingAnimation,
} from './screens-g';
import { StepReviewV2, StepSignV2, StepConfirmationV2 } from './screens-h';
import { StepNonMagiResources, StepNonMagiMedicareLtc } from './screens-nonmagi';
import { StepApplyMethod, StepPhoneSchedule, StepPaperUpload } from './screens-apply';
import { isAbdHousehold } from './abd';
import { TweaksPanel, TweakSection, TweakToggle, TweakColor, TweakSlider, TweakRadio, useTweaks } from './tweaks-panel';
import { runPendingSubmit } from './submit-hooks';
import { parseWizardHash, setReturnLegVerificationId } from './clear-verification';
import type { WizardFormData, FormDataContextValue, HouseholdMember } from './form-data.types';

// `app.tsx` installs a lightweight tweaks-context accessor on the window so deep
// components can read the current tweak values without prop drilling. Declare the
// shape here so reads/writes of `window.useIowaTweaks` are typed.
declare global {
  interface Window {
    useIowaTweaks?: () => typeof TWEAK_DEFAULTS;
  }
}

// The wizard stores a handful of transient UI-only flags on the form object
// (leading underscore) that aren't part of the persisted WizardFormData model:
// the apply-method fork choice and the review/sign attestation flags. The
// step `skip`/`validate` predicates read them, so model them here. WizardFormData
// is assignable to StepData (every added field is optional).
type StepData = WizardFormData & {
  _applyMethod?: string;
  _confirmReview?: boolean;
  _agreedRights?: boolean;
  _signature?: string;
};

// Props every routed step component receives. Individual screens may read only a
// subset (most take just `ctx`); a component accepting fewer props is assignable.
interface StepComponentProps {
  ctx: FormDataContextValue;
  goNext: () => void;
  goBack: () => void;
  goTo: (id: string) => void;
}

// A single entry in the wizard's STEPS table. `skip`/`validate` read the live
// form data; `validate`'s result is only ever used for truthiness (it may return
// a string/boolean/undefined from a `&&` chain), so it's typed as `unknown`.
interface WizardStep {
  id: string;
  Component: React.ComponentType<StepComponentProps>;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  wide?: boolean;
  hideCounter?: boolean;
  hideEyebrow?: boolean;
  hideBottomBar?: boolean;
  skip?: (data: StepData) => boolean;
  validate: (data: StepData) => unknown;
}

/* =========================================================================
   App root — wires shell + 25-step wizard
   The STEPS array reflects the consolidated spec. Each step uses the V2
   component where one was built; older per-section screens stay defined
   for code reference but are no longer routed.
   ========================================================================= */

const STEPS: WizardStep[] = [
  // 1
  {
    id: 'welcome',
    Component: StepWelcomeV2,
    wide: true,
    hideCounter: true,
    hideEyebrow: true,
    hideBottomBar: true,
    validate: () => true,
  },

  // 2 — Apply-method picker (Online / Phone / Paper). Online continues the
  //     wizard; Phone and Paper fork to terminal endpoint screens. (ENG-1745)
  {
    id: 'apply-method',
    eyebrow: 'Get started',
    title: 'How would you like to apply?',
    subtitle: 'Pick the way that works best for you. All three are free and lead to the same benefits.',
    Component: StepApplyMethod,
    wide: true,
    hideCounter: true,
    hideBottomBar: true,
    validate: () => true,
  },

  // 3 — Phone branch endpoint (terminal). Auto-skips during normal forward
  //     navigation; only reachable when the user picks Phone.
  {
    id: 'phone-schedule',
    eyebrow: 'Apply by phone',
    title: 'Schedule your phone application',
    subtitle: 'A specialist will fill out the application with you. Pick a time that works.',
    Component: StepPhoneSchedule,
    wide: true,
    hideCounter: true,
    hideBottomBar: true,
    skip: (d: StepData) => d._applyMethod !== 'phone',
    validate: () => true,
  },

  // 4 — Paper branch endpoint (terminal). Same skip pattern as phone.
  {
    id: 'paper-upload',
    eyebrow: 'Apply by paper',
    title: 'Upload your paper application',
    subtitle: "Take photos of every page or upload a scan — we'll read it for you.",
    Component: StepPaperUpload,
    wide: true,
    hideCounter: true,
    hideBottomBar: true,
    skip: (d: StepData) => d._applyMethod !== 'paper',
    validate: () => true,
  },

  // 5
  {
    id: 'login',
    eyebrow: 'Get started',
    title: 'Get Started',
    subtitle: 'Create an account, sign in, or continue as a guest. You can apply any of these ways.',
    Component: StepLoginV2,
    // Login owns its own CTAs (create / sign in / guest) and an inline Back
    // link, so it hides the wizard's bottom bar — matches the prototype and
    // gives a single, unambiguous Back affordance into `apply-method`. (ENG-1745)
    hideBottomBar: true,
    validate: () => true,
  },

  // 6
  {
    id: 'household-info',
    eyebrow: 'Household',
    title: 'About your household',
    subtitle: "Where you live and who's applying. We use this to route your case.",
    Component: StepHouseholdInfoV2,
    wide: true,
    validate: (d: StepData) => !!d.household?.county && !!d.household?.applicationFor,
  },

  // 7
  {
    id: 'auth-rep',
    eyebrow: 'Permissions',
    title: 'Authorized representative',
    subtitle: 'Optional — someone who can help with your case.',
    Component: StepAuthorizedRep,
    validate: (d: StepData) => d.authorizedRep?.hasRep !== null,
  },

  // 8
  {
    id: 'personal',
    eyebrow: 'Personal information',
    title: 'Personal information',
    subtitle: 'Verify your identity with CLEAR to fill this in from your ID, or enter it yourself.',
    Component: StepPersonalInfoV2,
    wide: true,
    validate: (d: StepData) => {
      const v = d.primaryApplicant;
      if (!v) return false;
      // CLEAR only reveals the SSN's last 4 to the client — a verified last-4
      // satisfies the SSN requirement in place of the 9 typed digits.
      const hasSSN = v.noSSN || (v.ssn && v.ssn.length >= 9) || !!v.identityVerification?.ssnLast4;
      const hasAddr = v.homeless || (v.streetAddress && v.city && v.state && v.zip);
      return (
        v.firstName &&
        v.lastName &&
        v.dob &&
        !validateDob(v.dob) &&
        hasSSN &&
        hasAddr &&
        v.phone &&
        v.phone.length >= 10
      );
    },
  },

  // 9
  {
    id: 'demographics',
    eyebrow: 'Demographics',
    title: 'Demographics',
    subtitle: 'Race, ethnicity, citizenship, and health questions for your household.',
    Component: StepDemographicsV2,
    wide: true,
    validate: (d: StepData) => !!d.primaryApplicant?.sex && !!d.citizenship?.['0']?.status,
  },

  // 10
  {
    id: 'members',
    eyebrow: 'Household',
    title: 'People in your household',
    subtitle: "Tell us about everyone who lives with you, including how you'll file taxes together.",
    Component: StepHouseholdMembersV2,
    wide: true,
    validate: (d: StepData) =>
      d.householdMembers?.every(
        (m: HouseholdMember) => m.firstName && m.lastName && m.dob && !validateDob(m.dob) && m.relationship,
      ),
  },

  // 11 — auto-skips if no filer needs a dependent picker
  {
    id: 'tax-deps',
    eyebrow: 'Tax dependents',
    title: 'Who will you claim?',
    subtitle: "Pick the household members you'll claim as dependents on this year's tax return.",
    Component: StepTaxDependentsV2,
    wide: true,
    skip: () => true,
    validate: () => true,
  },

  // 12
  {
    id: 'employment-intro',
    eyebrow: 'Employment',
    title: 'Employment & income',
    subtitle: "We'll walk through every job in your household — wages, tips, self-employment.",
    Component: StepEmploymentIntro,
    wide: true,
    validate: () => true,
  },

  // 13
  {
    id: 'argyle',
    eyebrow: 'Employment',
    title: 'Verify your income',
    subtitle: "We'll capture wages for each working adult — connect payroll, upload pay stubs, or enter it by hand.",
    Component: StepIncomeMethodPicker,
    wide: true,
    validate: (d) => {
      const adults = [
        { id: '0', dob: d.primaryApplicant?.dob ?? '' },
        ...(d.householdMembers || []).filter((m) => m.applying).map((m) => ({ id: m.id ?? '', dob: m.dob ?? '' })),
      ].filter(isApplyingAdult);
      return adults.length === 0 || adults.every((p) => (d._incomeConfirmed || []).includes(p.id));
    },
  },

  // 14
  {
    id: 'jobs',
    eyebrow: 'Employment',
    title: 'Tell us about each job',
    subtitle: "Add wages from every job. If multiple adults in your household work, add each person's jobs separately.",
    Component: StepJobInfoV2 as unknown as React.ComponentType<StepComponentProps>,
    wide: true,
    validate: () => true,
  },

  // 15
  {
    id: 'job-history',
    eyebrow: 'Employment',
    title: 'Previous employment',
    subtitle: 'Anyone in your household had a job end in the last 30 days?',
    Component: StepJobHistoryV2 as unknown as React.ComponentType<StepComponentProps>,
    wide: true,
    validate: () => true,
  },

  // 16
  {
    id: 'job-summary',
    eyebrow: 'Employment',
    title: 'Employment summary',
    subtitle: "A quick recap of every job. Edit anything that doesn't look right.",
    Component: StepJobSummary,
    wide: true,
    validate: () => true,
  },

  // 17
  {
    id: 'income-intro',
    eyebrow: 'Income',
    title: 'Other income',
    subtitle: 'Besides employment, we need to know about other money your household receives.',
    Component: StepIncomeIntro,
    wide: true,
    validate: () => true,
  },

  // 18
  {
    id: 'income-info',
    eyebrow: 'Income',
    title: 'Other income details',
    subtitle: 'Flip on every type of income that applies to your household.',
    Component: StepIncomeInfoV2,
    wide: true,
    validate: () => true,
  },

  // 19
  {
    id: 'projected',
    eyebrow: 'Income',
    title: 'Looking ahead',
    subtitle: 'Medicaid uses your expected income for the year. Help us understand if your income will change.',
    Component: StepProjected,
    validate: (d: StepData) => !!d.projectedIncome?.expectedChange,
  },

  // ENG-1744 · Non-MAGI / ABD alternate flow — runs only when any household
  // member is Aged, Blind, or Disabled (see ./abd.ts). MAGI-only households
  // skip straight to `health-intro`.
  {
    id: 'nm-resources',
    eyebrow: 'Resources & assets',
    title: 'Resources and assets',
    wide: true,
    Component: StepNonMagiResources,
    // reason: abd.ts declares a private, narrower WizardData view (requires
    // member `id`, narrows demographics.disability to boolean, types
    // workRequirements entries) that predates the shared WizardFormData model.
    // The live form object satisfies it at runtime; cast to abd's expected param
    // type rather than widen the off-scope abd interface.
    skip: (d: StepData) => !isAbdHousehold(d as Parameters<typeof isAbdHousehold>[0]),
    validate: () => true,
  },
  {
    id: 'nm-medicare-ltc',
    eyebrow: 'Medicare & long-term care',
    title: 'Medicare and long-term care',
    wide: true,
    Component: StepNonMagiMedicareLtc,
    // reason: abd.ts declares a private, narrower WizardData view (requires
    // member `id`, narrows demographics.disability to boolean, types
    // workRequirements entries) that predates the shared WizardFormData model.
    // The live form object satisfies it at runtime; cast to abd's expected param
    // type rather than widen the off-scope abd interface.
    skip: (d: StepData) => !isAbdHousehold(d as Parameters<typeof isAbdHousehold>[0]),
    validate: () => true,
  },

  // 21
  {
    id: 'health-intro',
    eyebrow: 'Health coverage',
    title: 'Health insurance',
    subtitle: "We'll ask about current coverage for each person in your household.",
    Component: StepHealthIntro,
    wide: true,
    validate: () => true,
  },

  // 22
  {
    id: 'insurance',
    eyebrow: 'Health coverage',
    title: 'Current health insurance',
    subtitle: 'Per-person coverage information.',
    Component: StepInsuranceV2,
    wide: true,
    validate: () => true,
  },

  // 23
  {
    id: 'employer-cov',
    eyebrow: 'Health coverage',
    title: 'Employer-offered coverage',
    Component: StepEmployerCoverage,
    // ENG-1938: skip if no household member has any jobs — employer coverage
    // is irrelevant when nobody in the household is employed.
    skip: (d: StepData) => Object.values(d.jobs || {}).flat().length === 0,
    validate: (d: StepData) => d.employerCoverage?.offered !== null,
  },

  // 24
  {
    id: 'retroactive',
    eyebrow: 'Coverage timing',
    title: 'Coverage for past medical bills',
    subtitle: 'Medicaid may cover medical bills from the last 3 months if you would have qualified then.',
    Component: StepRetroactive,
    validate: (d: StepData) => d.retroactive?.hasBills !== null,
  },

  // 25
  {
    id: 'preferences',
    eyebrow: 'Communication',
    title: 'Communication preferences',
    Component: StepPreferences,
    validate: () => true,
  },

  // 26
  {
    id: 'review',
    eyebrow: 'Review',
    title: 'Review your application',
    subtitle: "Double-check everything. You'll sign and submit after we verify your information.",
    Component: StepReviewV2,
    wide: true,
    validate: (d: StepData) => !!d._confirmReview,
  },

  // 27
  {
    id: 'sign',
    eyebrow: 'Sign',
    title: 'Sign your application',
    subtitle: 'Read the rights and responsibilities, then sign.',
    Component: StepSignV2,
    wide: true,
    validate: (d: StepData) => !!d._agreedRights && (d._signature || '').trim().length >= 2,
  },

  // 30
  {
    id: 'confirmation',
    Component: StepConfirmationV2,
    wide: true,
    hideCounter: true,
    hideEyebrow: true,
    hideBottomBar: true,
    validate: () => true,
  },
];

// Memory-router replacement: in-app step state, sync with location hash so
// refresh and deep-links work. Skip-awareness lives in the Wizard where
// ctx.data is in scope; this hook just holds the index.
//
// The hash may carry a query string after the step id — the Verify Assist
// hosted flow returns the browser to `/#/personal?verified=<id>`. Resolve the
// step from the part before `?`, hand the `verified` id to the personal step
// (module-level slot in clear-verification.ts), and let the sync effect below
// rewrite the hash to the bare `#/personal` so a refresh doesn't replay it.
function resolveStepFromHash(hash: string): number {
  const { stepId, params } = parseWizardHash(hash);
  const verified = params.get('verified');
  if (verified) setReturnLegVerificationId(verified);
  const idx = STEPS.findIndex((s) => s.id === stepId);
  return idx >= 0 ? idx : 0;
}

function useStepRouter() {
  const [index, setIndex] = useState(() => resolveStepFromHash(window.location.hash));

  useEffect(() => {
    const newHash = '#/' + STEPS[index].id;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [index]);

  useEffect(() => {
    function onPop() {
      const { stepId } = parseWizardHash(window.location.hash);
      // Only a real step change should re-route; the sync effect above rewrites
      // `#/personal?verified=…` → `#/personal`, which must not re-resolve.
      const i = STEPS.findIndex((s) => s.id === stepId);
      if (i >= 0) setIndex(i);
    }
    window.addEventListener('hashchange', onPop);
    return () => window.removeEventListener('hashchange', onPop);
  }, []);

  return { index, setIndex };
}

// Walk forward (dir=+1) or backward (dir=-1) past any steps whose skip(data)
// returns true. Used by the Wizard for conditional auto-skips.
function nextVisible(STEPS: WizardStep[], from: number, dir: number, data: StepData) {
  let i = from + dir;
  while (i >= 0 && i < STEPS.length) {
    const s = STEPS[i];
    if (!s.skip || !s.skip(data)) return i;
    i += dir;
  }
  return Math.max(0, Math.min(STEPS.length - 1, from + dir));
}

// ── Top bar ─────────────────────────────────────────────────────────────
function TopBar({ onExit }: { onExit: () => void }) {
  return (
    <div className="topbar">
      <a className="wordmark" href="#/welcome">
        <span className="mark">
          {/* Generic state-government mark: capitol building (roof + columns + base) */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9.5l9-5.5 9 5.5" />
            <path d="M5 9.5v8 M19 9.5v8 M9 11v5 M15 11v5 M3 21h18 M3 17.5h18" />
          </svg>
        </span>
        <span className="label-stack">
          <span className="agency">State-X HHS</span>
          <span className="product">Health &amp; Human Services</span>
        </span>
      </a>
      <div className="center">State-X Medicaid Application</div>
      <div className="right">
        <span className="save-indicator">
          <span className="dot" />
          Auto-saving
        </span>
        <a onClick={onExit} style={{ fontSize: 15 }}>
          Save &amp; exit
        </a>
      </div>
    </div>
  );
}

// ── Bottom bar ──────────────────────────────────────────────────────────
interface BottomBarProps {
  // `valid && !submitting` from the call site can be a non-boolean (the step
  // validators return truthy/falsy values), and it's only used via `!canContinue`.
  canContinue?: unknown;
  atStart?: boolean;
  atEnd?: boolean;
  onBack: () => void;
  onNext: () => void;
  label?: React.ReactNode;
  submitLabel?: string;
  wide?: boolean;
}
function BottomBar({
  canContinue,
  atStart,
  atEnd,
  onBack,
  onNext,
  label,
  submitLabel = 'Continue',
  wide,
}: BottomBarProps) {
  return (
    <div className="bottom-bar">
      <div className="inner" style={wide ? { maxWidth: 960 } : undefined}>
        <div className="left">
          {!atStart ? (
            <Button variant="ghost" onClick={onBack}>
              <Icon name="arrowLeft" size={14} /> Back
            </Button>
          ) : (
            <span />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="fineprint">{label}</span>
          <Button variant="primary" onClick={onNext} disabled={!canContinue}>
            {submitLabel}
            <Icon name="arrowRight" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Save & exit dialog (a very small dialog) ────────────────────────────
function SaveExitDialog({ open, onClose, onReset }: { open: boolean; onClose: () => void; onReset: () => void }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--civic-overlay-bg)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--civic-bg-card)',
          borderRadius: 16,
          padding: 28,
          maxWidth: 480,
          width: '100%',
          boxShadow: 'var(--civic-shadow-xl)',
        }}
      >
        <h2 style={{ marginBottom: 8 }}>Save and come back later</h2>
        <p className="muted" style={{ marginBottom: 18 }}>
          Your progress is already saved on this device. To pick up later, return to this site or sign in with your
          account.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
          <Button variant="outline" onClick={onClose}>
            Keep going
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done for now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── The wizard ──────────────────────────────────────────────────────────
function Wizard() {
  const ctx = useFormData();
  const { index, setIndex } = useStepRouter();
  const step = STEPS[index];
  const [dialog, setDialog] = useState(false);

  // Auto-skip resolution: when the user lands on a step whose skip predicate
  // says skip-me-now (e.g. they're under 19 and we don't need work-requirements),
  // bounce forward. We do this in an effect so state updates flush cleanly.
  useEffect(() => {
    if (step.skip && step.skip(ctx.data)) {
      setIndex((i) => nextVisible(STEPS, i, 1, ctx.data));
    }
  }, [index, ctx.data]); // eslint-disable-line

  // Scroll to top on every step change so the user always lands at the
  // section label, not wherever the previous step left them scrolled.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setSubmitError(null);
  }, [index]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goNext = useCallback(async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await runPendingSubmit();
      if (!result.ok) {
        setSubmitError(result.error || 'Unable to save. Please try again.');
        return;
      }
    } finally {
      setSubmitting(false);
    }
    setIndex((i) => nextVisible(STEPS, i, +1, ctx.data));
  }, [ctx.data, setIndex]);

  const goBack = useCallback(() => {
    setIndex((i) => nextVisible(STEPS, i, -1, ctx.data));
  }, [ctx.data, setIndex]);

  const goTo = useCallback(
    (id: string) => {
      const i = STEPS.findIndex((s) => s.id === id);
      if (i >= 0) setIndex(i);
    },
    [setIndex],
  );

  // Count of visible steps (filters out skipped ones) for an honest "Step X of Y".
  const visibleSteps = STEPS.filter((s) => !s.skip || !s.skip(ctx.data));
  const visibleIndex = visibleSteps.findIndex((s) => s.id === step.id);
  const stepNumber = Math.max(1, visibleIndex + 1);
  const total = visibleSteps.length;
  const progress = Math.max(0, Math.min(1, visibleIndex / Math.max(1, total - 1)));

  const valid = step.validate(ctx.data);

  const C = step.Component;

  return (
    <div className="app-shell" data-screen-label={`${String(stepNumber).padStart(2, '0')} ${step.title || step.id}`}>
      <TopBar onExit={() => setDialog(true)} />
      <div className="progress" aria-hidden="true">
        <div className="fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <SaveExitDialog
        open={dialog}
        onClose={() => setDialog(false)}
        onReset={() => {
          ctx.resetForm();
          goTo('welcome');
          setDialog(false);
        }}
      />

      <div className="step-page">
        {step.id === 'welcome' || step.id === 'confirmation' ? (
          // Full-bleed for welcome / confirmation (their components handle their own chrome)
          <div className="step-fade-in" key={step.id}>
            <C ctx={ctx} goNext={goNext} goBack={goBack} goTo={goTo} />
          </div>
        ) : (
          <div className={'step-content step-fade-in' + (step.wide ? ' wide' : '')} key={step.id}>
            <div className="eyebrow-row">
              <span className="eyebrow">{step.eyebrow}</span>
              {!step.hideCounter ? (
                <span className="step-counter">
                  Step {stepNumber} of {total}
                </span>
              ) : null}
            </div>
            <h1 className="step-title">{step.title}</h1>
            {step.subtitle ? <p className="step-subtitle">{step.subtitle}</p> : null}
            <div className="step-body">
              {submitError ? <Alert kind="destr">{submitError}</Alert> : null}
              <C ctx={ctx} goNext={goNext} goBack={goBack} goTo={goTo} />
            </div>
          </div>
        )}
      </div>

      {!step.hideBottomBar ? (
        <BottomBar
          canContinue={valid && !submitting}
          atStart={index === 0}
          atEnd={index === STEPS.length - 1}
          onBack={goBack}
          onNext={goNext}
          label={submitting ? 'Saving…' : !valid ? 'Fill the required fields to continue' : ''}
          submitLabel={step.id === 'sign' ? 'Submit application' : 'Continue'}
          wide={step.wide}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <FormDataProvider>
      <WizardWithTweaks />
    </FormDataProvider>
  );
}

// Tweakable values for the prototype. Editing here updates the source of
// truth on disk through the __edit_mode_set_keys protocol.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  filledInfoIcons: true,
  primaryColor: '#00647E',
  fontScale: 1.0,
  density: 'regular',
}; /*EDITMODE-END*/

// Lightweight tweaks context so deep components (Alert etc.) can read
// the current values without prop drilling.
const TweaksContext = createContext(TWEAK_DEFAULTS);
window.useIowaTweaks = () => useContext(TweaksContext);

function WizardWithTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply tweak values as CSS custom properties on the app shell so
  // styling reacts automatically.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--iowa-primary', t.primaryColor);
    root.style.setProperty('--iowa-primary-dark', shade(t.primaryColor, -0.22));
    root.style.setProperty('--civic-accent-solid', t.primaryColor);
    root.style.setProperty('--civic-accent-solid-hover', shade(t.primaryColor, -0.22));
    root.style.setProperty('--civic-accent-text', t.primaryColor);
    root.style.fontSize = `${Math.round(16 * t.fontScale)}px`;
    document.body.setAttribute('data-density', t.density);
  }, [t.primaryColor, t.fontScale, t.density]);

  return (
    <TweaksContext.Provider value={t}>
      <Wizard />
      <TweaksPanel>
        {/* TweakSection is a header-only divider with no body. tweaks-panel
            (off-scope, @ts-nocheck) infers `children` as required, so an empty
            child is nested explicitly — renders nothing, same as before. */}
        <TweakSection label="Icons">{null}</TweakSection>
        <TweakToggle
          label="Filled info icons"
          value={t.filledInfoIcons}
          onChange={(v: boolean) => setTweak('filledInfoIcons', v)}
        />

        <TweakSection label="Brand color">{null}</TweakSection>
        <TweakColor
          label="Primary"
          value={t.primaryColor}
          options={['#00647E', '#107d98', '#6B8A1A', '#3A5BC7', '#7C3AED']}
          onChange={(v: string) => setTweak('primaryColor', v)}
        />

        <TweakSection label="Type & density">{null}</TweakSection>
        <TweakSlider
          label="Font scale"
          value={t.fontScale}
          min={0.9}
          max={1.2}
          step={0.05}
          onChange={(v: number) => setTweak('fontScale', v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v: string) => setTweak('density', v)}
        />
      </TweaksPanel>
    </TweaksContext.Provider>
  );
}

// Quick hex-shader. amount > 0 lightens, < 0 darkens. Used to derive
// --iowa-primary-dark from the tweakable primary color.
function shade(hex: string, amount: number) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff,
    g = (num >> 8) & 0xff,
    b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + r * amount)));
  g = Math.max(0, Math.min(255, Math.round(g + g * amount)));
  b = Math.max(0, Math.min(255, Math.round(b + b * amount)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// (CDN-era ReactDOM mount removed — we mount via src/main.tsx now)

export { App, Wizard, WizardWithTweaks };
export default App;
