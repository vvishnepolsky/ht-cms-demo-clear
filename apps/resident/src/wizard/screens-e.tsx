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
import {
  login as identityLogin,
  register as identityRegister,
  enroll as identityEnroll,
  IdentityClientError,
} from "../lib/identity-client";
import { setResident } from "../lib/auth-store";
import { useUpdatePerson } from "../hooks/useUpdatePerson";
import { useStepSubmit } from "./submit-hooks";
import { SSNInput } from "./SSNInput";
import { formatPhone, stripPhone } from "../lib/phone";
import { client, CUSTOMER_ID } from "../lib/apollo";
import { LIST_MY_MEDICAID_EE_CASES_QUERY } from "../lib/operations";
import { SESSION_KEYS } from "../lib/session-keys";
import { AddressAutofill } from "@mapbox/search-js-react";
import { MAPBOX_TOKEN, US_AUTOFILL_OPTIONS } from "../lib/address-autofill";
import { i18n, setStoredLanguage, useTranslation } from "@ht/i18n";
import { persistForm } from "./context";
import { ClearVerifyButton } from "./ClearVerifyButton";
import { VerifiedControl } from "./VerifiedChip";
import {
  applyVerificationToPrimary,
  clearPendingVerification,
  isFieldVerified,
  pollVerification,
  startClearVerification,
  takeReturnLegVerificationId,
  unverifyField,
} from "./clear-verification";

/* =========================================================================
   Screens E — v2 screens matching the consolidated 25-screen spec.
   These supersede the earlier per-section screens. Each component is
   exported to `window` at the end of the file.
   ========================================================================= */

// ─────────────────────────────────────────────────────────────────────────
// Language picker dropdown for the top of the Welcome screen.
// ─────────────────────────────────────────────────────────────────────────
const ACTIVE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

function LanguagePicker() {
  const [currentLang, setCurrentLang] = useState(
    i18n.language?.startsWith("es") ? "es" : "en",
  );
  const [open, setOpen] = useState(false);
  const currentLabel =
    ACTIVE_LANGUAGES.find((l) => l.code === currentLang)?.label ?? "English";

  function handleSelect(code: string) {
    setCurrentLang(code);
    setStoredLanguage(code);
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="lang-picker">
      <button
        type="button"
        className="lang-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="map" size={14} />
        <span>{currentLabel}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <div className="lang-menu" onMouseLeave={() => setOpen(false)}>
          {ACTIVE_LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              className={"lang-opt" + (code === currentLang ? " on" : "")}
              onClick={() => handleSelect(code)}
            >
              {label}
              {code === currentLang ? <Icon name="check" size={12} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 · Welcome (v2 — adds language picker)
// ─────────────────────────────────────────────────────────────────────────
function StepWelcomeV2({ goNext, goTo, ctx }) {
  const { loadSample } = ctx;
  const { t } = useTranslation("welcome");
  return (
    <div className="welcome-stage step-fade-in">
      <div className="welcome-lang">
        <LanguagePicker />
      </div>

      <div className="welcome-hero">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            {t("welcome.screen.eyebrow")}
          </div>
          <h1>{t("welcome.screen.title")}</h1>
          <p style={{ marginTop: 16 }}>{t("welcome.screen.desc")}</p>
        </div>

        <div className="welcome-tiles">
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="users" size={18} />
            </div>
            <div className="ttl">{t("welcome.screen.tile1Title")}</div>
            <div className="sub">{t("welcome.screen.tile1Desc")}</div>
          </div>
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="lock" size={18} />
            </div>
            <div className="ttl">{t("welcome.screen.tile2Title")}</div>
            <div className="sub">{t("welcome.screen.tile2Desc")}</div>
          </div>
          <div className="welcome-tile">
            <div className="ic">
              <Icon name="save" size={18} />
            </div>
            <div className="ttl">{t("welcome.screen.tile3Title")}</div>
            <div className="sub">{t("welcome.screen.tile3Desc")}</div>
          </div>
        </div>

        <Alert kind="neutral" title={t("welcome.screen.alertTitle")}>
          {t("welcome.screen.alertDesc")}
        </Alert>

        <Stack gap={12}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Button variant="primary" size="lg" onClick={goNext}>
              {t("welcome.screen.getStarted")}{" "}
              <Icon name="arrowRight" size={16} />
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                alert("In a real app this would open the case-lookup flow.")
              }
            >
              {t("welcome.screen.continueExisting")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                loadSample();
                goTo("review");
              }}
              title="Fill the form with a sample household"
            >
              <Icon name="sparkles" size={14} /> {t("welcome.screen.seeSample")}
            </Button>
          </div>
          <div className="fineprint">{t("welcome.screen.fineprint")}</div>
        </Stack>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 · Login (lightweight, advances on Sign in regardless)
// ─────────────────────────────────────────────────────────────────────────
function StepLoginV2({ ctx, goNext, goBack }) {
  const { setPath } = ctx;
  const [mode, setMode] = useState("register"); // 'register' | 'signin' — ENG-1690: create account is primary CTA
  const [email, setEmail] = useState(ctx.data.primaryApplicant.email || "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState(
    ctx.data.primaryApplicant.firstName || "",
  );
  const [lastName, setLastName] = useState(
    ctx.data.primaryApplicant.lastName || "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State-X tenant id — `CUSTOMER_ID` carries the demo default so a build
  // without a .env (the single-service prod bundle) can still register.
  const customerId = CUSTOMER_ID;

  const handleSignIn = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const result = await identityLogin(email, password);
      // If the user has no engagement (first sign-in after registration, or previous
      // enrollment failed), enroll them now so updatePerson and other tenant-scoped
      // operations work. 409 means already enrolled — safe to ignore.
      if (result.session.engagementId === "none") {
        try {
          await identityEnroll(result.payload.sub, "medicaid_ee");
        } catch (enrollErr) {
          if (!(
            enrollErr instanceof IdentityClientError && enrollErr.status === 409
          )) {
            throw enrollErr;
          }
        }
      }
      setResident({
        id: result.payload.sub,
        email: result.session.email ?? email,
        firstName: result.payload.firstName,
        lastName: result.payload.lastName,
        customerId: result.payload.customerId,
        personId: result.session.personId,
      });
      // Returning members who already have a case land on their dashboard
      // (e.g. Diane Caldwell's ex parte renewal); new applicants continue
      // into the application wizard below.
      try {
        const personId = result.session.personId;
        if (personId) {
          const { data } = await client.query({
            query: LIST_MY_MEDICAID_EE_CASES_QUERY,
            variables: { applicantPersonId: personId },
            fetchPolicy: "network-only",
          });
          const existingCaseId = data?.medicaidEeCases?.data?.[0]?.id;
          if (existingCaseId) {
            // Dev-only demo scope: the cms-demo resident app may persist a
            // (non-PHI) case id to sessionStorage. The review-suppressions
            // sessionStorage acceptance is otherwise limited to first/last name
            // in Missouri production — do not carry this pattern into a
            // production resident app without an ADR decision.
            sessionStorage.setItem(SESSION_KEYS.CASE_ID, existingCaseId);
            window.location.assign("/dashboard");
            return;
          }
        }
      } catch (lookupErr) {
        // Non-fatal — fall through to the wizard if the lookup fails. Log only
        // the error name, matching the sibling handlers below — never the raw
        // error object (can carry response bodies / request variables).
        console.error("[sign-in] case lookup failed", {
          name: lookupErr instanceof Error ? lookupErr.name : typeof lookupErr,
        });
      }
      setPath("primaryApplicant", "email", email);
      setPath("primaryApplicant", "firstName", result.payload.firstName);
      setPath("primaryApplicant", "lastName", result.payload.lastName);
      setPath("primaryApplicant", "ssn", "");
      setPath("primaryApplicant", "noSSN", false);
      goNext();
    } catch (err) {
      if (err instanceof IdentityClientError) {
        if (err.code === "too_many_requests")
          setError("Too many attempts. Please try again later.");
        else if (err.code === "account_locked")
          setError("Account temporarily locked. Please try again later.");
        else {
          console.error("[sign-in] unhandled identity-client error", {
            code: err.code,
            status: err.status,
          });
          setError("Sign-in failed. Please try again.");
        }
      } else {
        console.error("[sign-in] unexpected error", {
          name: err instanceof Error ? err.name : typeof err,
        });
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    if (!email || !password || !firstName || !lastName) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError("Password must contain at least one letter.");
      return;
    }
    if (!/\d/.test(password)) {
      setError("Password must contain at least one number.");
      return;
    }
    setLoading(true);
    try {
      await identityRegister({
        email,
        password,
        firstName,
        lastName,
        customerId,
      });
      // After register, log in to mint the session cookies.
      const result = await identityLogin(email, password);
      // Enroll the participant so subsequent tenant-scoped operations (updatePerson,
      // createMedicaidEeCase, etc.) find an Engagement row for this customer.
      // 409 means already enrolled (e.g. re-registration attempt) — safe to ignore.
      try {
        await identityEnroll(result.payload.sub, "medicaid_ee");
      } catch (enrollErr) {
        if (!(
          enrollErr instanceof IdentityClientError && enrollErr.status === 409
        )) {
          throw enrollErr;
        }
      }
      setResident({
        id: result.payload.sub,
        email: result.session.email ?? email,
        firstName: result.payload.firstName,
        lastName: result.payload.lastName,
        customerId: result.payload.customerId,
        personId: result.session.personId,
      });
      setPath("primaryApplicant", "email", email);
      setPath("primaryApplicant", "firstName", firstName);
      setPath("primaryApplicant", "lastName", lastName);
      setPath("primaryApplicant", "ssn", "");
      setPath("primaryApplicant", "noSSN", false);
      goNext();
    } catch (err) {
      if (err instanceof IdentityClientError) {
        if (err.code === "email_taken" || err.code === "duplicate_email") {
          setError(
            "An account with this email already exists. Try signing in instead.",
          );
        } else {
          console.error("[register] unhandled identity-client error", {
            code: err.code,
            status: err.status,
          });
          setError("Could not create account. Please try again.");
        }
      } else {
        console.error("[register] unexpected error", {
          name: err instanceof Error ? err.name : typeof err,
        });
        setError("Could not create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={20}>
      {/* Inline Back into the apply-method picker. The login step hides the
          wizard's bottom bar (see app.tsx), so this is the sole Back
          affordance. goBack walks past the auto-skipped phone/paper steps and
          lands on `apply-method`. (ENG-1745) */}
      {goBack ? (
        <div>
          <Button variant="ghost" onClick={goBack}>
            <Icon name="arrowLeft" size={14} /> Back
          </Button>
        </div>
      ) : null}
      <Panel
        title={
          mode === "signin"
            ? "Sign in to your State-X HHS account"
            : "Create your State-X HHS account"
        }
      >
        <Stack gap={14}>
          {mode === "register" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Field label="First name" required>
                <TextInput
                  value={firstName}
                  onChange={setFirstName}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last name" required>
                <TextInput
                  value={lastName}
                  onChange={setLastName}
                  autoComplete="family-name"
                />
              </Field>
            </div>
          )}
          <Field label="Email" required>
            <TextInput
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
            />
          </Field>
          <Field
            label="Password"
            required
            hint={
              mode === "register" && password ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {[
                    {
                      met: password.length >= 12,
                      label: "At least 12 characters",
                    },
                    {
                      met: /[a-zA-Z]/.test(password),
                      label: "At least one letter (a–z)",
                    },
                    {
                      met: /\d/.test(password),
                      label: "At least one number (0–9)",
                    },
                  ].map(({ met, label }) => (
                    <span
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: met
                          ? "var(--civic-success, #16a34a)"
                          : "var(--civic-text-secondary)",
                      }}
                    >
                      <span style={{ width: 12, textAlign: "center" }}>
                        {met ? "\u2713" : "\u25cb"}
                      </span>
                      {label}
                    </span>
                  ))}
                </div>
              ) : undefined
            }
          >
            <TextInput
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
            />
          </Field>
          {error && <Alert kind="destr">{error}</Alert>}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              className="fineprint"
              onClick={() => {
                setMode(mode === "signin" ? "register" : "signin");
                setError(null);
              }}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
              }}
            >
              {mode === "signin"
                ? "Need an account? Create one"
                : "Already have an account? Sign in"}
            </button>
            <Button
              variant="primary"
              onClick={mode === "signin" ? handleSignIn : handleRegister}
              disabled={loading}
            >
              {loading
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}{" "}
              <Icon name="arrowRight" size={14} />
            </Button>
          </div>
        </Stack>
      </Panel>

      <div className="login-divider">
        <span>or</span>
      </div>

      <div className="login-options">
        <button type="button" className="login-option" onClick={goNext}>
          <div className="login-option-ic">
            <Icon name="sparkles" size={22} />
          </div>
          <div className="login-option-body">
            <div className="login-option-title">Continue as a guest</div>
            <div className="login-option-desc">
              Apply now without an account. Your progress is saved on this
              device only.
            </div>
          </div>
          <div className="login-option-cta">
            <Icon name="arrowRight" size={16} />
          </div>
        </button>
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// County typeahead with search
// ─────────────────────────────────────────────────────────────────────────
function CountyTypeahead({ value, onChange }) {
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(value || ""), [value]);

  const filtered = IOWA_COUNTIES.filter((c) =>
    c.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="typeahead">
      <input
        className="input"
        value={q}
        placeholder="Start typing your county…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 ? (
        <div className="typeahead-menu">
          {filtered.slice(0, 8).map((c) => (
            <button
              type="button"
              key={c}
              className="typeahead-opt"
              onMouseDown={() => {
                onChange(c);
                setQ(c);
                setOpen(false);
              }}
            >
              <Icon name="map" size={12} /> {c} County
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 · HouseholdInfo (consolidated)
// ─────────────────────────────────────────────────────────────────────────
function StepHouseholdInfoV2({ ctx }) {
  const { data, setPath } = ctx;
  const v = data.household;

  return (
    <Stack gap={24}>
      <Panel title="Where you live">
        <Field
          label="County of residence"
          required
          hint="The county you currently live in, not where you receive mail."
        >
          <CountyTypeahead
            value={v.county}
            onChange={(x) => setPath("household", "county", x)}
          />
        </Field>
      </Panel>

      <Panel title="Who is this application for?">
        <RadioGroup
          name="applicationFor"
          value={v.applicationFor}
          onChange={(x) => setPath("household", "applicationFor", x)}
          options={[
            {
              value: "myself",
              title: "Myself only",
              desc: "Coverage just for me.",
            },
            {
              value: "household",
              title: "My entire household",
              desc: "I'll be the primary contact and answer for everyone applying.",
            },
            {
              value: "specific",
              title: "Specific household members",
              desc: "Apply on behalf of one or more people in my home.",
            },
          ]}
        />
      </Panel>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CLEAR verification panel — top of the personal step.
//   idle     → explainer + CLEAR-branded CTA
//   starting → CTA disabled while POST /api/verifications runs
//   polling  → "Confirming your verification with CLEAR…" (return leg)
//   failed   → explainer + CTA (retry) + error alert
//   verified → green "Verified with CLEAR" pill; the CTA never renders again
// ─────────────────────────────────────────────────────────────────────────
function ClearVerifyPanel({ state, verified, error, onVerify }) {
  if (verified) {
    return (
      <Panel title="Verify your identity">
        <div className="verify-panel-body">
          <p>
            Your information below was filled in from your verified ID. Review
            it and complete anything that's missing.
          </p>
          <span className="verified-pill">
            <Icon name="shieldCheck" size={16} aria-hidden="true" /> Verified
            with CLEAR
          </span>
        </div>
      </Panel>
    );
  }
  if (state === "polling") {
    return (
      <section className="verify-panel-status" role="status" aria-busy="true">
        <span className="verify-spinner" aria-hidden="true" />
        <p>Confirming your verification with CLEAR…</p>
      </section>
    );
  }
  return (
    <Panel title="Verify your identity">
      <div className="verify-panel-body">
        <p>Expedite your application with CLEAR identity verification.</p>
        {/* CLEAR brand CTA — the deployed Verify Assist button, verbatim. */}
        <ClearVerifyButton
          disabled={state === "starting"}
          onClick={onVerify}
          label={state === "starting" ? "Opening CLEAR…" : "Verify with CLEAR"}
        />
      </div>
      {state === "failed" ? (
        <p role="alert" className="verify-panel-error">
          {error ||
            "We couldn't complete your verification. You can try again or fill in your information manually."}
        </p>
      ) : null}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 4 · PersonalInfo (consolidated, with SSN show/hide + CLEAR prefill)
// ─────────────────────────────────────────────────────────────────────────
function StepPersonalInfoV2({ ctx }) {
  const { data, setPath, updateFormData } = ctx;
  const v = data.primaryApplicant;
  const iv = v.identityVerification;
  const verified = iv?.status === "success";
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneInvalid =
    phoneTouched && (v.phone ?? "").replace(/\D/g, "").length !== 10;

  // ── CLEAR return leg ────────────────────────────────────────────────────
  // The hash router hands us the `?verified=<id>` from the hosted flow's
  // returnTo (or we fall back to the sessionStorage pending marker). Poll to a
  // terminal status, then apply traits.document to the form.
  const [returnLeg] = useState(() =>
    verified ? null : takeReturnLegVerificationId(),
  );
  const [verifyState, setVerifyState] = useState(
    returnLeg ? "polling" : "idle",
  ); // idle | starting | polling | failed
  const [verifyError, setVerifyError] = useState(null);

  useEffect(() => {
    if (!returnLeg) return;
    const signal = { cancelled: false };
    (async () => {
      try {
        // Coming back via the URL: full ~30s budget. Only the pending marker
        // (user pressed Back into the wizard mid-flow): peek twice, then give
        // up quietly rather than block the step for 30 seconds.
        const verification = await pollVerification(returnLeg.id, {
          signal,
          maxAttempts: returnLeg.source === "url" ? undefined : 2,
        });
        if (signal.cancelled) return;
        if (verification.status === "success") {
          updateFormData("primaryApplicant", (prev) =>
            applyVerificationToPrimary(prev, verification),
          );
          setVerifyState("idle");
        } else if (
          verification.status === "failed" ||
          verification.status === "expired"
        ) {
          setVerifyError(
            verification.status === "expired"
              ? "Your verification session expired before it finished. You can start again."
              : null,
          );
          setVerifyState("failed");
        } else {
          // Still pending after the budget.
          if (returnLeg.source === "url") {
            setVerifyError(
              "We're still waiting on CLEAR. You can try again or fill in your information yourself.",
            );
            setVerifyState("failed");
          } else {
            setVerifyState("idle");
          }
        }
      } catch (err) {
        if (signal.cancelled) return;
        console.error("[StepPersonalInfoV2] verification poll failed", {
          name: err instanceof Error ? err.name : typeof err,
        });
        if (returnLeg.source === "url") setVerifyState("failed");
        else setVerifyState("idle");
      } finally {
        clearPendingVerification();
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [returnLeg]); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only: the return leg runs exactly once

  const handleVerify = async () => {
    setVerifyError(null);
    setVerifyState("starting");
    try {
      // The provider mirrors every change to localStorage already; flush once
      // more synchronously so nothing typed in this render is lost when the
      // browser navigates to the hosted flow.
      await startClearVerification("applicant", () => persistForm(data));
    } catch (err) {
      console.error("[StepPersonalInfoV2] could not start CLEAR verification", {
        name: err instanceof Error ? err.name : typeof err,
        code:
          err && typeof err === "object" && "code" in err
            ? err.code
            : undefined,
      });
      const code =
        err && typeof err === "object" && "code" in err ? err.code : null;
      setVerifyError(
        code === "unauthenticated" || code === "wrong_app"
          ? "Please sign in to verify your identity with CLEAR. Guests can still enter their information below."
          : "We couldn't start identity verification right now. You can try again, or fill in your information below.",
      );
      setVerifyState("failed");
    }
  };

  // ── Field helpers ───────────────────────────────────────────────────────
  const isVerified = (field) => isFieldVerified(v, field);
  // Editing a CLEAR-prefilled field drops it from verifiedFields (chip goes away).
  const set = (field, value) => {
    if (isVerified(field)) {
      updateFormData("primaryApplicant", (prev) =>
        unverifyField({ ...prev, [field]: value }, field),
      );
    } else {
      setPath("primaryApplicant", field, value);
    }
  };
  // Labels stay plain; verified fields get the in-field check via `V`.
  const L = (text, _field, _compact = false) => text;
  const V = (field, node, inset = false) => (
    <VerifiedControl verified={isVerified(field)} inset={inset}>
      {node}
    </VerifiedControl>
  );

  const updatePerson = useUpdatePerson();
  useStepSubmit(
    useCallback(async () => {
      const form = {
        firstName: v.firstName,
        middleName: v.middleName || "",
        lastName: v.lastName,
        suffix: v.suffix || "",
        dob: v.dob,
        // CLEAR only reveals the last 4 — the verified SSN is never sent as digits.
        ssn: v.ssn || "",
        noSSN: !!v.noSSN,
        street: v.streetAddress || "",
        apt: v.aptUnit || "",
        city: v.city || "",
        state: v.state || "",
        zip: v.zip || "",
        mailingStreet: "",
        mailingApt: "",
        mailingCity: "",
        mailingState: "",
        mailingZip: "",
        phone: v.phone || "",
        phoneType: v.phoneType || "mobile",
        email: v.email || "",
      };
      const { success, errors } = await updatePerson.execute(form);
      if (!success) {
        if (errors[0]?.code) {
          console.error("[StepPersonalInfoV2] updatePerson failed", {
            code: errors[0].code,
          });
        }
        return { ok: false, error: "Unable to save. Please try again." };
      }
      return { ok: true };
    }, [updatePerson, v]),
  );

  const ssnFromClear = verified && iv?.ssnLast4;

  return (
    <Stack gap={24}>
      <ClearVerifyPanel
        state={verifyState}
        verified={verified}
        error={verifyError}
        onVerify={handleVerify}
      />

      <Panel title="Name &amp; identity">
        <Stack gap={14}>
          <div className="grid-name">
            <Field label={L("First name", "firstName")} required>
              {V(
                "firstName",
                <>
                  <TextInput
                    value={v.firstName}
                    onChange={(x) => set("firstName", x)}
                    autoComplete="given-name"
                  />
                </>,
                false,
              )}
            </Field>
            <Field label={L("Middle", "middleName")}>
              {V(
                "middleName",
                <>
                  <TextInput
                    value={v.middleName}
                    onChange={(x) => set("middleName", x)}
                  />
                </>,
                false,
              )}
            </Field>
            <Field label={L("Last name", "lastName")} required>
              {V(
                "lastName",
                <>
                  <TextInput
                    value={v.lastName}
                    onChange={(x) => set("lastName", x)}
                    autoComplete="family-name"
                  />
                </>,
                false,
              )}
            </Field>
            <Field label="Suffix">
              <Select
                value={v.suffix}
                onChange={(x) => setPath("primaryApplicant", "suffix", x)}
                options={["", "Jr.", "Sr.", "II", "III", "IV"]}
                placeholder="—"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field
              label={L("Date of birth", "dob")}
              required
              error={v.dob ? validateDob(v.dob) : undefined}
            >
              {V(
                "dob",
                <>
                  <TextInput
                    type="date"
                    value={v.dob}
                    max="9999-12-31"
                    onChange={(x) => {
                      if (!x || (x.split("-")[0]?.length ?? 0) <= 4)
                        set("dob", x);
                    }}
                  />
                </>,
                true,
              )}
            </Field>
            <Field
              label={L("Social Security Number", "ssn")}
              htmlFor="primary-ssn-e"
              required={!v.noSSN && !ssnFromClear}
              hint={
                ssnFromClear
                  ? "Confirmed during identity verification."
                  : "Required for everyone with one. Used only to verify identity and income."
              }
            >
              {V(
                "ssn",
                <>
                  {ssnFromClear ? (
                    <div
                      id="primary-ssn-e"
                      className="input readonly"
                      role="textbox"
                      aria-readonly="true"
                      aria-label={`Social Security Number ending in ${iv.ssnLast4}, confirmed during identity verification`}
                    >
                      {`•••-••-${iv.ssnLast4}`}
                    </div>
                  ) : (
                    <SSNInput
                      id="primary-ssn-e"
                      value={v.ssn}
                      disabled={v.noSSN}
                      onChange={(digits) =>
                        setPath("primaryApplicant", "ssn", digits)
                      }
                    />
                  )}
                </>,
                false,
              )}
            </Field>
          </div>
          {!ssnFromClear ? (
            <ChoiceCard
              kind="checkbox"
              name="noSSN"
              value="noSSN"
              current={v.noSSN ? ["noSSN"] : []}
              onChange={(arr) =>
                setPath("primaryApplicant", "noSSN", arr.includes("noSSN"))
              }
              title="I don't have a Social Security Number"
              desc="You may still qualify for some programs. Your case will be routed for additional verification."
            />
          ) : null}
        </Stack>
      </Panel>

      <Panel title="Home address">
        <Stack gap={12}>
          <ChoiceCard
            kind="checkbox"
            name="homeless"
            value="homeless"
            current={v.homeless ? ["homeless"] : []}
            onChange={(arr) =>
              setPath("primaryApplicant", "homeless", arr.includes("homeless"))
            }
            title="I don't have a fixed address"
            desc="A shelter, motel, or someone else's place is fine — we can use a mailing address instead."
          />
          {!v.homeless ? (
            <Fragment>
              <div
                className="grid-2"
                style={{ gridTemplateColumns: "2fr 1fr" }}
              >
                <Field
                  label={L("Street address", "streetAddress")}
                  required
                  htmlFor="addr-personal"
                >
                  {V(
                    "streetAddress",
                    <>
                      {MAPBOX_TOKEN ? (
                        <AddressAutofill
                          accessToken={MAPBOX_TOKEN}
                          options={US_AUTOFILL_OPTIONS}
                          onRetrieve={(res) => {
                            const props = res.features[0]?.properties;
                            if (!props) return;
                            if (props.address_line1)
                              set("streetAddress", props.address_line1);
                            if (props.address_level2)
                              set("city", props.address_level2);
                            if (props.postcode)
                              set("zip", props.postcode.slice(0, 5));
                            if (props.address_level1) {
                              const raw = props.address_level1.trim();
                              // Mapbox returns "California", "CA", or "US-CA" — normalise to 2-char abbr
                              let abbr = "";
                              if (/^US-[A-Z]{2}$/i.test(raw)) {
                                abbr = raw.slice(3).toUpperCase();
                              } else if (raw.length === 2) {
                                abbr = raw.toUpperCase();
                              } else {
                                abbr = STATE_NAME_TO_ABBR[raw] || "";
                              }
                              if (abbr) set("state", abbr);
                            }
                          }}
                        >
                          <input
                            id="addr-personal"
                            className="input"
                            type="text"
                            name="address-line1"
                            autoComplete="address-line1"
                            placeholder="412 Walnut St"
                            value={v.streetAddress}
                            onChange={(e) =>
                              set("streetAddress", e.target.value)
                            }
                          />
                        </AddressAutofill>
                      ) : (
                        <TextInput
                          id="addr-personal"
                          value={v.streetAddress}
                          onChange={(x) => set("streetAddress", x)}
                          autoComplete="address-line1"
                          placeholder="412 Walnut St"
                        />
                      )}
                    </>,
                    false,
                  )}
                </Field>
                <Field label={L("Apt / unit", "aptUnit")}>
                  {V(
                    "aptUnit",
                    <>
                      <TextInput
                        value={v.aptUnit}
                        onChange={(x) => set("aptUnit", x)}
                      />
                    </>,
                    false,
                  )}
                </Field>
              </div>
              <div className="grid-csz">
                <Field label={L("City", "city")} required>
                  {V(
                    "city",
                    <>
                      <TextInput
                        value={v.city}
                        onChange={(x) => set("city", x)}
                        autoComplete="address-level2"
                      />
                    </>,
                    false,
                  )}
                </Field>
                <Field label={L("State", "state", true)} required>
                  {V(
                    "state",
                    <>
                      <Select
                        value={v.state}
                        onChange={(x) => set("state", x)}
                        options={US_STATES}
                      />
                    </>,
                    true,
                  )}
                </Field>
                <Field label={L("ZIP", "zip", true)} required>
                  {V(
                    "zip",
                    <>
                      <TextInput
                        value={v.zip}
                        onChange={(x) => set("zip", x)}
                        inputMode="numeric"
                        maxLength={5}
                        autoComplete="postal-code"
                        placeholder="55501"
                      />
                    </>,
                    false,
                  )}
                </Field>
              </div>
            </Fragment>
          ) : null}
          {!v.homeless ? (
            <ProofOfResidenceUpload
              files={v.proofOfResidence || []}
              onChange={(next) =>
                setPath("primaryApplicant", "proofOfResidence", next)
              }
            />
          ) : null}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={!!v.mailingAddressSame}
              onChange={(e) =>
                setPath(
                  "primaryApplicant",
                  "mailingAddressSame",
                  e.target.checked,
                )
              }
            />
            <span className="inline-check-box" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
            <span className="inline-check-label">
              My mailing address is the same as my home address
            </span>
          </label>
        </Stack>
      </Panel>

      <Panel title="Contact">
        <Stack gap={12}>
          <div className="grid-2" style={{ gridTemplateColumns: "1fr 200px" }}>
            <Field
              label={L("Phone number", "phone")}
              required
              error={
                phoneInvalid ? (
                  <span id="phone-error">Enter a 10-digit US phone number</span>
                ) : undefined
              }
            >
              {V(
                "phone",
                <TextInput
                  type="tel"
                  inputMode="tel"
                  value={formatPhone(v.phone)}
                  onChange={(x) => set("phone", stripPhone(x))}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                  invalid={phoneInvalid}
                  aria-invalid={phoneInvalid || undefined}
                  aria-describedby={phoneInvalid ? "phone-error" : undefined}
                />,
                false,
              )}
            </Field>
            <Field label="Type">
              <Select
                value={v.phoneType}
                onChange={(x) => setPath("primaryApplicant", "phoneType", x)}
                options={[
                  { value: "mobile", label: "Mobile" },
                  { value: "home", label: "Home" },
                  { value: "work", label: "Work" },
                ]}
              />
            </Field>
          </div>
          <Field label="Email" hint="We send case status notices here.">
            <TextInput
              type="email"
              value={v.email}
              onChange={(x) => setPath("primaryApplicant", "email", x)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
        </Stack>
      </Panel>
    </Stack>
  );
}

// Mapbox Address Autofill returns full state names for some results — map to
// the 2-letter codes the State select uses.
const STATE_NAME_TO_ABBR = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
  "State-X": "SX",
};

// ─────────────────────────────────────────────────────────────────────────
// Proof-of-residence upload — used inside the Home address panel.
// Prototype-only: no real upload. Stores [{name, size, type}] in state.
// ─────────────────────────────────────────────────────────────────────────
function FileUpload({
  files,
  onChange,
  onRawFiles,
  title = "Proof of residence",
  subtitle = "Upload a lease, utility bill, or mortgage statement to verify your address.",
  badge = "Optional · speeds up approval",
  hint = "PDF, JPG, or PNG · up to 10 MB each",
}) {
  const inputRef = React.useRef(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(list) {
    const incoming = Array.from(list || []).map((f) => ({
      id: "f" + Math.floor(Math.random() * 1e9),
      name: f.name,
      size: f.size,
      type: f.type,
      _rawFile: f,
    }));
    onChange([...(files || []), ...incoming]);
    if (onRawFiles)
      onRawFiles(incoming.map(({ id, _rawFile }) => ({ id, file: _rawFile })));
  }

  function remove(id) {
    onChange((files || []).filter((f) => f.id !== id));
  }

  function fmtSize(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  const hasFiles = (files || []).length > 0;

  return (
    <div className="proof-upload">
      <div className="proof-upload-head">
        <div className="proof-upload-title">{title}</div>
        {badge ? <span className="tag">{badge}</span> : null}
      </div>
      {subtitle ? <div className="proof-upload-sub">{subtitle}</div> : null}

      <div
        className={
          "dropzone" +
          (dragging ? " dragging" : "") +
          (hasFiles ? " compact" : "")
        }
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="dropzone-ic">
          <Icon name="upload" size={20} />
        </div>
        <div className="dropzone-body">
          <div className="dropzone-title">
            {dragging
              ? "Drop to upload"
              : "Drag & drop or click to choose a file"}
          </div>
          <div className="dropzone-sub">{hint}</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {hasFiles ? (
        <div className="file-list">
          {files.map((f) => (
            <div key={f.id} className="file-chip">
              <div className="file-chip-ic">
                <Icon name="file" size={16} />
              </div>
              <div className="file-chip-body">
                <div className="file-chip-name">{f.name}</div>
                <div className="file-chip-meta">{fmtSize(f.size)}</div>
              </div>
              <button
                type="button"
                className="file-chip-remove"
                aria-label={`Remove ${f.name}`}
                onClick={() => remove(f.id)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Back-compat alias — older code references this name.
const ProofOfResidenceUpload = FileUpload;

Object.assign(window, {
  LanguagePicker,
  CountyTypeahead,
  FileUpload,
  ProofOfResidenceUpload,
  StepWelcomeV2,
  StepLoginV2,
  StepHouseholdInfoV2,
  StepPersonalInfoV2,
});

export {
  LanguagePicker,
  ACTIVE_LANGUAGES as LANGUAGES,
  StepWelcomeV2,
  StepLoginV2,
  CountyTypeahead,
  StepHouseholdInfoV2,
  StepPersonalInfoV2,
  FileUpload,
  ProofOfResidenceUpload,
};
