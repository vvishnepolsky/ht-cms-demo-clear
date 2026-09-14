/**
 * WorkspacePage -- E&E Case detail workspace with AdminShell layout.
 *
 * Layout: full-width RFI banner + CaseActionBanner + CaseProgressStepper,
 * then a three-column area: ApplicantSidebar (280px) + scrollable phase
 * content + the Case Assist rail (380px, always visible for active cases).
 * The Verify phase renders the auto-processing pipeline, the CLEAR identity
 * verification card, and the income evidence; approve/deny lives in the
 * bottom ActionBar. Terminal cases swap the active workspace for
 * CompletedCaseDetail.
 *
 * Verify Assist: when the linked CLEAR verification found out-of-state
 * Medicaid coverage and the flag is still open, the banner turns red, the
 * case-list pins the case, and Approve asks for confirmation first.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client/react';
import { CheckCircle2 } from 'lucide-react';
import { AdminShell } from '../components/ui';
import { EeSidebarNav } from '../components/EeSidebarNav';
import { CaseNavBar } from '../components/ee/CaseNavBar';
import { toast } from 'sonner';
import { ActionBar, type ActionBarCta, type ActionBarTone } from '../components/ee/ActionBar';
import { AddNoteModal } from '../components/ee/AddNoteModal';
import { ApplicantSidebar } from '../components/ee/ApplicantSidebar';
import { ReviewDecideModal } from '../components/ee/ReviewDecideModal';
import { AbdIncomeTest } from '../components/ee/AbdIncomeTest';
import { AssetTestSummary } from '../components/ee/AssetTestSummary';
import {
  AutoProcessingPipeline,
  buildVerificationSteps,
  identityVerificationStep,
} from '../components/ee/AutoProcessingPipeline';
import { IdentityVerificationCard } from '../components/ee/IdentityVerificationCard';
import { CaseAssistPanel } from '../components/ee/case-assist';
import { IssueRfiModal, type IssueRfiSubmitPayload } from '../components/ee/IssueRfiModal';
import { ConfirmationModal } from '../components/ui';
import { IncomeSources } from '../components/ee/IncomeSources';
import { IrsWageMatch } from '../components/ee/IrsWageMatch';
import { MagiDeterminePanel } from '../components/ee/MagiDeterminePanel';
import { NonMagiAssetsPanel } from '../components/ee/NonMagiAssetsPanel';
import { NonMagiDeterminePanel } from '../components/ee/NonMagiDeterminePanel';
import { ProgramEnrollmentStatus } from '../components/ee/ProgramEnrollmentStatus';
import { SsaVerificationResults } from '../components/ee/SsaVerificationResults';
import { ExParteVerifyPanel } from '../components/ee/renewal/ExParteVerifyPanel';
import { ExParteEvaluateLocked, ExParteDetermineLocked } from '../components/ee/renewal/RenewalLockedSteps';
import { CompletedCaseDetail } from '../components/ee/CompletedCaseDetail';
import {
  RequestClarificationModal,
  type RequestClarificationSubmitPayload,
} from '../components/ee/RequestClarificationModal';
import { PendingRfiBanner } from '../components/ee/PendingRfiBanner';
import { parseRuleEvaluations } from '../components/ee/MagiRulesEngine';
import { SectionedRuleTrace } from '../components/ee/SectionedRuleTrace';
import { CaseActionBanner } from '../components/ee/CaseActionBanner';
import { CaseProgressStepper, type CasePhase } from '../components/ee/CaseProgressStepper';
import type { DdsFlowState } from '../lib/case-assist-derive';
import { CaseDetailsDrawer } from '../components/ee/drawer/CaseDetailsDrawer';
import type { DrawerCaseRow } from '../components/ee/drawer/types';
import {
  GET_EE_CASE_QUERY,
  LIST_EE_CASES_QUERY,
  APPROVE_EE_CASE_MUTATION,
  DENY_EE_CASE_MUTATION,
  ISSUE_RFI_EE_CASE_MUTATION,
  RESOLVE_RFI_EE_CASE_MUTATION,
  QUEUE_FOR_REVIEW_EE_CASE_MUTATION,
} from '../lib/ee-operations';
import { useAdmin } from '../lib/auth-store';
import { deriveActionNeeded, isNonMagiCase } from '../lib/ee-utils';
import { DASH } from '../lib/utils';
import {
  EE_FLAG_ID_CLEAR,
  hasOpenOutOfStateFlag,
  isIdentityVerified,
  UNKNOWN_APPLICANT,
  WORKFLOW_STATUS_ACTION_NEEDED,
  WORKFLOW_STATUS_AUTO_APPROVED,
} from '../types/ee';

const CASE_NAV_LIMIT = 100;
const STATE_MEDICAID_LABEL = 'State Medicaid';
const LOG_PREFIX = '[WorkspacePage]' as const;

// DDS CTA labels — extracted per C.1 (3+ site threshold). Referenced in
// JSX (CTA rendering) and in WorkspacePage.test.tsx assertions.
// Labels match the CMS demo storyboard (Robert Mitchell Non-MAGI ABD flow):
// "Prepare DDS Referral Packet →" → dashed "⚙ Simulate: DDS Confirms
// Disability" (via `demo: true`) → "Validate" → "Submit Determination →".
export const DDS_REFER_LABEL = 'Prepare DDS Referral Packet →' as const;
export const DDS_CONFIRM_LABEL = 'DDS Confirms Disability' as const;
export const DDS_VALIDATE_LABEL = 'Validate' as const;
export const DDS_SUBMIT_LABEL = 'Submit Determination →' as const;

// ActionBar status lines per DDS state — storyboard's actionBarByState
// ("title — subtitle" composed into the bar's single status string).
const DDS_STATUS_BY_STATE = {
  pending: 'DDS referral required — financial criteria passed · disability pending DDS determination',
  referred: 'DDS referral submitted — awaiting disability determination',
  confirmed: 'All eligibility criteria passed — ready for caseworker validation',
  validated: 'ABD eligible — submit determination to finalize and queue MMIS transmission',
} as const;

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [approved, setApproved] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rfiOpen, setRfiOpen] = useState(false);
  // Items the Case Assist panel wants pre-filled in the RFI. Non-null routes
  // the RFI CTA to IssueRfiModal (item checklist) instead of the storyboard's
  // RequestClarificationModal.
  const [rfiPrefillItems, setRfiPrefillItems] = useState<string[] | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Approve guard: an open Verify Assist (out-of-state Medicaid) flag asks for
  // confirmation before the approve mutation fires. Soft gate — never blocks.
  const [approveGuardOpen, setApproveGuardOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  // DDS workflow state for Non-MAGI ABD cases (ENG-1748). The platform has
  // no PENDING_DDS status yet — the intermediate "referral sent" state lives
  // only in component state. ddsFlowRef tracks that the current approveMutation
  // call was triggered via the DDS confirmation path (not regular approve) so
  // onCompleted can branch without stale-closure issues. It is a ref (not
  // state) because it doesn't need to trigger a re-render; it only needs to
  // be readable at the time onCompleted fires.
  // TODO(ENG-1748): derive from eeCase.status === 'PENDING_DDS' once EE service exposes it
  const [ddsReferralSent, setDdsReferralSent] = useState(false);
  const [ddsConfirmed, setDdsConfirmed] = useState(false);
  // True once the caseworker clicked "Validate" after the (simulated) DDS
  // confirmation — moves the workspace to the Determine phase where the
  // "Submit Determination →" CTA fires the real approve mutation.
  const [ddsValidated, setDdsValidated] = useState(false);
  const [ddsNoticeBannerOpen, setDdsNoticeBannerOpen] = useState(false);
  const ddsFlowRef = useRef(false);
  // activePhase is null until the case loads; we then default to whichever
  // phase the stepper considers "active" for the case status, but let the
  // caseworker click between phases (Verify ↔ Evaluate ↔ Determine) to focus
  // the workspace content. Replaces the previous all-at-once grid layout.
  const [activePhase, setActivePhase] = useState<CasePhase | null>(null);

  const admin = useAdmin();
  const { data, loading, error, refetch } = useQuery(GET_EE_CASE_QUERY, {
    variables: { id: id! },
    skip: !id,
  });

  const [approveMutation, { loading: approving }] = useMutation(APPROVE_EE_CASE_MUTATION, {
    onCompleted: async (result) => {
      if (result.approveMedicaidEeCase.errors.length > 0) {
        // Reset the DDS intent flag on payload error so the CTA stays
        // in the "Confirm DDS Decision" state and the caseworker can retry.
        ddsFlowRef.current = false;
        console.error(LOG_PREFIX, 'Approval payload error:', result.approveMedicaidEeCase.errors[0].code);
        toast.error('Approval failed. Please try again or contact support.');
        return;
      }
      // Wait for the refetch to land BEFORE flipping isTerminal — otherwise
      // CompletedCaseDetail mounts with the stale (pre-approval) eeCase.status
      // and its `isApproved = status === 'APPROVED'` falls into the else
      // branch, briefly rendering the "Case Denied" XCircle banner for an
      // approval. Refetch resolves with the new status, then we flip.
      await refetch();
      setApproved(true);
      setReviewOpen(false);
      // Branch: DDS determination path vs regular MAGI approve path.
      // ddsFlowRef.current is set synchronously before approveMutation is
      // called (in handleSubmitDetermination), so it reliably identifies
      // which code path triggered this onCompleted. ddsConfirmed itself was
      // already set when the caseworker simulated the DDS response.
      if (ddsFlowRef.current) {
        ddsFlowRef.current = false;
        setDdsNoticeBannerOpen(true);
        // TODO(ENG-1748): call buildSessionEntry({ kind: DDS_KIND_CONFIRMED, ... }) once the
        // EE service exposes a DDS event type — activity log entry not written until then.
        // DDS_KIND_CONFIRMED is exported from ActivityLog.tsx.
        toast.success('Determination submitted — ABD category assigned', {
          description: 'Eligibility notice queued — portal inbox + USPS first-class mail.',
        });
      } else {
        toast.success('Case approved', {
          description: 'Audit entry written and assigned to your worker ID.',
        });
      }
    },
    onError: (err) => {
      // Reset the DDS intent flag on network error so the CTA remains
      // actionable for a retry — matches the payload-error reset above.
      ddsFlowRef.current = false;
      // Log error name only — no message, no PHI. Matches the DashboardPage
      // pattern. ApolloError.message concatenates server graphQLErrors which
      // can include service-generated content.
      console.error(LOG_PREFIX, 'Approval error', { name: err.name });
      toast.error('Approval failed. Please try again or contact support.');
    },
  });

  const [issueRfiMutation, { loading: issuingRfi }] = useMutation(ISSUE_RFI_EE_CASE_MUTATION, {
    onCompleted: async (result) => {
      const payload = result.issueMedicaidEeCaseRfi;
      if (payload.errors.length > 0) {
        const code = payload.errors[0].code;
        console.error(LOG_PREFIX, 'RFI payload error:', code);
        if (code === 'RFI_ALREADY_PENDING') {
          toast.error('This case already has a pending RFI.', {
            description: 'Resolve the existing RFI before issuing another.',
          });
        } else if (code === 'INVALID_STATUS_TRANSITION') {
          toast.error('Cannot issue an RFI on a closed case.');
        } else {
          toast.error('Failed to issue RFI. Please try again or contact support.');
        }
        return;
      }
      // Refetch BEFORE closing the modal so the workspace doesn't briefly
      // render without PendingRfiBanner while the network round-trip is in
      // flight (a11y-frontend.md Rule 5 — read view must not flash stale
      // data on async success). Matches the approve/deny ordering.
      await refetch();
      setRfiOpen(false);
      setRfiPrefillItems(null);
      toast.success('RFI issued', {
        description: 'Applicant has been notified. Audit entry written.',
      });
    },
    onError: (err) => {
      console.error(LOG_PREFIX, 'RFI error', { name: err.name });
      toast.error('Failed to issue RFI. Please try again or contact support.');
    },
  });

  const [resolveRfiMutation, { loading: resolvingRfi }] = useMutation(RESOLVE_RFI_EE_CASE_MUTATION, {
    onCompleted: async (result) => {
      const payload = result.resolveMedicaidEeCaseRfi;
      if (payload.errors.length > 0) {
        const code = payload.errors[0].code;
        console.error(LOG_PREFIX, 'Resolve RFI payload error:', code);
        if (code === 'VALIDATION_ERROR') {
          toast.error('No pending RFI to resolve on this case.');
        } else {
          toast.error('Failed to resolve RFI. Please try again or contact support.');
        }
        return;
      }
      // Await refetch before the toast so PendingRfiBanner clears (the
      // banner is conditional on eeCase.rfiDetails). Matches approve/deny.
      await refetch();
      toast.success('RFI resolved', {
        description: 'Case has been moved out of the RFI pending queue.',
      });
    },
    onError: (err) => {
      console.error(LOG_PREFIX, 'Resolve RFI error', { name: err.name });
      toast.error('Failed to resolve RFI. Please try again or contact support.');
    },
  });

  const [queueForReviewMutation, { loading: queuingForReview }] = useMutation(QUEUE_FOR_REVIEW_EE_CASE_MUTATION, {
    onError: (err) => {
      console.error(LOG_PREFIX, 'Queue for review error', { name: err.name });
      toast.error('Failed to queue case for review. Please try again.');
    },
  });

  const [denyMutation, { loading: denying }] = useMutation(DENY_EE_CASE_MUTATION, {
    onCompleted: async (result) => {
      if (result.denyMedicaidEeCase.errors.length > 0) {
        console.error(LOG_PREFIX, 'Denial payload error:', result.denyMedicaidEeCase.errors[0].code);
        toast.error('Denial failed. Please try again or contact support.');
        return;
      }
      // Same refetch-before-flip ordering as approve (see W1 comment above):
      // CompletedCaseDetail reads eeCase.status to choose its banner.
      await refetch();
      setReviewOpen(false);
      toast.success('Case denied', {
        description: 'Audit entry written and assigned to your worker ID.',
      });
    },
    onError: (err) => {
      console.error(LOG_PREFIX, 'Denial error', { name: err.name });
      toast.error('Denial failed. Please try again or contact support.');
    },
  });

  const { data: listData } = useQuery(LIST_EE_CASES_QUERY, {
    variables: { pagination: { page: 1, limit: CASE_NAV_LIMIT } },
  });

  const eeCase = data?.medicaidEeCase ?? null;
  // Filter to the "All Fallout" queue — actionable, non-appeal cases — so
  // prev/next arrows cycle within the same tab the user came from instead
  // of jumping across completed cases and appeals. Matches the predicate
  // used by DashboardPage's All Fallout tab.
  const caseList = (listData?.medicaidEeCases?.data ?? []).filter(
    (c) =>
      c.status !== 'APPROVED' &&
      c.status !== 'DENIED' &&
      c.status !== 'CANCELED' &&
      !(c.caseNumber ?? '').startsWith('APL-'),
  );
  const currentIndex = caseList.findIndex((c) => c.id === id);
  const prevCaseId = currentIndex > 0 ? caseList[currentIndex - 1]?.id : null;
  const nextCaseId = currentIndex >= 0 && currentIndex < caseList.length - 1 ? caseList[currentIndex + 1]?.id : null;

  // eslint-disable-next-line no-restricted-syntax -- reset per-case ephemeral state when the user navigates to a different case via the prev/next caseList nav. Key-based reset would require remounting WorkspacePage at the route level, which the React Router config doesn't currently express; until that's reworked, this effect is the lightest expression.
  useEffect(() => {
    setApproved(false);
    setReviewOpen(false);
    setNoteOpen(false);
    setDrawerOpen(false);
    setRfiOpen(false);
    setRfiPrefillItems(null);
    setApproveGuardOpen(false);
    setActivePhase(null);
    setDdsReferralSent(false);
    setDdsConfirmed(false);
    setDdsValidated(false);
    setDdsNoticeBannerOpen(false);
    ddsFlowRef.current = false;
  }, [id]);

  // eslint-disable-next-line no-restricted-syntax -- one-shot console.error logging tied to the Apollo error value. Named alternatives don't apply: useQuery exposes the error via its return value, not via onError (useQuery's onError fires per refetch, not on the cached error). This effect logs the error code only.
  useEffect(() => {
    if (error) console.error(LOG_PREFIX, 'Failed to load case', { name: error.name });
  }, [error]);

  // The EE lifecycle is PENDING_VERIFICATION → IN_REVIEW → APPROVED | DENIED.
  // A MAGI case reaches Review & Decide straight from PENDING_VERIFICATION (the
  // pipeline auto-processes it), so the decision must queue it for review first
  // — the same hop the Non-MAGI DDS path takes in handleReferToDds. Returns
  // false (after toasting) when the transition failed, so the caller skips the
  // approve/deny mutation instead of tripping INVALID_STATUS_TRANSITION.
  async function ensureInReview(): Promise<boolean> {
    if (!id || eeCase?.status !== 'PENDING_VERIFICATION') return true;
    const result = await queueForReviewMutation({ variables: { input: { id } } });
    const errors = result.data?.queueForReviewMedicaidEeCase?.errors ?? [];
    if (errors.length > 0) {
      console.error(LOG_PREFIX, 'Queue for review payload error:', errors[0].code);
      toast.error('Failed to queue case for review. Please try again.');
      return false;
    }
    return true;
  }

  async function fireApprove() {
    if (!id) return;
    setApproveGuardOpen(false);
    if (!(await ensureInReview())) return;
    void approveMutation({ variables: { input: { id } } });
  }

  // Soft guard: an unresolved Verify Assist flag (out-of-state Medicaid
  // coverage) surfaces a confirmation before approving. The caseworker can
  // still proceed — federal rules require resolving the duplicate enrollment,
  // but the demo never hard-blocks a determination.
  function handleApprove() {
    if (!id) return;
    if (hasOpenOutOfStateFlag(eeCase?.identityVerification)) {
      setReviewOpen(false);
      setApproveGuardOpen(true);
      return;
    }
    void fireApprove();
  }

  async function handleDeny(reason: string) {
    if (!id) return;
    if (!(await ensureInReview())) return;
    void denyMutation({ variables: { input: { id, reason } } });
  }

  function handleIssueRfi(payload: RequestClarificationSubmitPayload | IssueRfiSubmitPayload) {
    if (!id) return;
    void issueRfiMutation({
      variables: {
        input: {
          id,
          itemsRequested: payload.itemsRequested,
          deadline: payload.deadline,
          noteToApplicant: payload.noteToApplicant,
        },
      },
    });
  }

  function handleResolveRfi() {
    if (!id) return;
    void resolveRfiMutation({ variables: { input: { id } } });
  }

  // ── DDS workflow handlers (Non-MAGI ABD only, ENG-1748) ─────────────────
  // No backend mutation for "referral sent" — intermediate state lives in
  // component state until the EE service exposes a PENDING_DDS status.
  async function handleReferToDds() {
    // If the case is still in PENDING_VERIFICATION, move it to IN_REVIEW first
    // so the caseworker can later confirm the DDS decision and approve.
    if (id && eeCase?.status === 'PENDING_VERIFICATION') {
      const result = await queueForReviewMutation({ variables: { input: { id } } });
      const errors = result.data?.queueForReviewMedicaidEeCase?.errors ?? [];
      if (errors.length > 0) {
        console.error(LOG_PREFIX, 'Queue for review payload error:', errors[0].code);
        toast.error('Failed to queue case for review. Please try again.');
        return;
      }
      await refetch();
    }
    setDdsReferralSent(true);
  }

  // Simulating the DDS response is a pure frontend state change — the case
  // stays on the Verify step showing "verification complete" and the CTA
  // becomes "Validate". No mutation fires here (storyboard dds_confirmed
  // state); the real approval moved to handleSubmitDetermination below.
  //
  // ENG-1856: guard against calling this when the case is not yet IN_REVIEW.
  // The CTA is already disabled for non-IN_REVIEW cases (see ddsCta below),
  // but this check defends against any future path that bypasses that guard.
  function handleSimulateDdsResult() {
    if (eeCase?.status !== 'IN_REVIEW') {
      toast.error('Case must be in review before DDS can be confirmed.', {
        description: 'Queue the case for review first, then confirm the DDS determination.',
      });
      return;
    }
    setDdsConfirmed(true);
  }

  // Caseworker validation accepts the DDS result and moves the workspace to
  // the Determine phase (storyboard dds_confirmed → abd_assigned transition).
  // Still no mutation — determination is submitted from the Determine step.
  function handleValidateDds() {
    setDdsValidated(true);
    setActivePhase('determine');
  }

  // Submitting the determination fires approveMutation directly — no
  // ReviewDecideModal gate. For Non-MAGI ABD the outcome is always Approve
  // (ENG-1875: the modal was unnecessary extra confirmation).
  // ddsFlowRef.current is set first so onCompleted runs the DDS-specific path
  // (notice banner, DDS toast) instead of the generic MAGI toast.
  function handleSubmitDetermination() {
    if (eeCase?.status !== 'IN_REVIEW') {
      toast.error('Case must be in review before the determination can be submitted.', {
        description: 'Queue the case for review first, then submit the determination.',
      });
      return;
    }
    // Belt-and-suspenders against double-click before React re-renders the
    // disabled state (the ddsCta button is disabled: approving, but the UI
    // guard and the programmatic guard are independent defenses).
    if (approving) return;
    ddsFlowRef.current = true;
    handleApprove();
  }

  // Derive applicant name from determinations.person (correlated by HEAD member's personId)
  const headMember = eeCase?.household?.members?.find((m) => m.role === 'HEAD') ?? eeCase?.household?.members?.[0];
  const headPersonId = headMember?.person?.personId;
  const applicantPerson = headPersonId
    ? eeCase?.determinations?.find((d) => d.person?.personId === headPersonId)?.person
    : eeCase?.determinations?.[0]?.person;
  // Fall back to intakeData.applicantName when PersonRecord federation can't
  // resolve (resident-submitted cases have no determinations yet, and
  // seeded-case personIds don't exist in identity-service so PersonRecord is
  // null). The wizard's build-intake-data writes applicantName + a rich
  // householdMembers[] block — see apps/cms-demo/resident/src/wizard/build-intake-data.ts.
  const intake = (eeCase?.intakeData ?? {}) as Record<string, unknown>;
  const intakeApplicantName = typeof intake.applicantName === 'string' ? intake.applicantName : null;
  // Last resort: the name CLEAR verified on the applicant's government ID.
  const identityVerification = eeCase?.identityVerification ?? null;
  const clearVerified = isIdentityVerified(identityVerification);
  const applicantName =
    applicantPerson?.firstName && applicantPerson.lastName
      ? `${applicantPerson.firstName} ${applicantPerson.lastName}`
      : intakeApplicantName || identityVerification?.subjectName || UNKNOWN_APPLICANT;
  const oosFlagOpen = hasOpenOutOfStateFlag(identityVerification);
  const intakeApplicant = (intake.applicant ?? {}) as Record<string, unknown>;
  const isNonMagi = isNonMagiCase(intakeApplicant, eeCase?.determinations ?? []);
  // ENG-1983: parse the persisted trace directly — the sectioned (ENG-1669)
  // shape keeps its displayCode filtering AND its section names. The previous
  // adaptBreResult() wrapper flattened the result's internal failedRules
  // bookkeeping (every unmatched rule in the engine — "Non-MAGI Pathway", ABD
  // categories, all coverage groups) into display rows, which then rendered as
  // "verification sources" on the Verify step.
  const parsedRules = parseRuleEvaluations(
    (eeCase?.ruleEvaluations ?? null) as Record<string, unknown>[] | Record<string, unknown> | null,
  );
  // Ex-parte renewal fallout (archetype: Diane M. Caldwell): the system tried an
  // ex-parte renewal, income could not be verified from electronic sources, and a
  // pre-populated renewal form (RFI) was issued. These cases show the ex-parte
  // renewal narrative on all three steps instead of the generic MAGI verify/
  // evaluate/determine surfaces. Gated on caseType + a pending RFI so it catches
  // renewal fallout only, not auto-approved ("no-touch") ex-parte renewals.
  const isExParteRenewal = eeCase?.caseType === 'RENEWAL' && !!eeCase?.rfiDetails;
  // ENG-1874: SSI vs ABD presentation. With no SSI on file, ABD eligibility
  // hinges on a DDS disability determination that hasn't returned yet — so the
  // ABD Category reads as pending (not a passed check) and the SSI Status
  // section is suppressed rather than shown as "missing".
  const receivingSSI = intakeApplicant.receivingSSI === true;
  const abdPending = isNonMagi && !receivingSSI && !ddsConfirmed;
  const isTerminal = !!eeCase && (approved || eeCase.status === 'APPROVED' || eeCase.status === 'DENIED');
  const showActionBar = !loading && !error && !!eeCase && !isTerminal && eeCase.status !== 'CANCELED';
  const showCompletedDetail = !loading && !error && !!eeCase && isTerminal;

  // Derive actionSummary and actionTone from displayMeta for ActionBar
  // TODO(ENG-1858): derive flags and daysRemaining from applicant intake fields when
  // displayMeta is absent, matching DashboardPage derivation logic (parity gap).
  const dm = (intake.displayMeta ?? {}) as Record<string, unknown>;
  // ENG-1994: stored displayMeta.actionNeeded (curated seeded cases) wins; live
  // wizard submissions store none, so fall back to the same state-derived action
  // the dashboard list shows (shared deriveActionNeeded — DDS for Non-MAGI ABD,
  // income only when income verification is actually what's pending).
  // The extra `!== DASH` guard (deliberately stricter than DashboardPage, which
  // displays a stored '—' as-is in its column): the ActionBar renders a one-line
  // summary, so a stored terminal '—' marker should fall through to the derived
  // action rather than render a bare dash next to the tone icon.
  const storedActionNeeded = typeof dm.actionNeeded === 'string' && dm.actionNeeded !== DASH ? dm.actionNeeded : null;
  const derivedActionNeeded = eeCase ? deriveActionNeeded(eeCase.status, intake, eeCase.determinations ?? []) : null;
  const actionSummary = storedActionNeeded ?? (derivedActionNeeded !== DASH ? derivedActionNeeded : null);
  const workflowStatus = typeof dm.workflowStatus === 'string' ? dm.workflowStatus : null;
  const actionTone: 'ready' | 'review' | 'waiting' =
    workflowStatus === WORKFLOW_STATUS_AUTO_APPROVED || eeCase?.status === 'APPROVED'
      ? 'ready'
      : workflowStatus === WORKFLOW_STATUS_ACTION_NEEDED
        ? 'review'
        : 'waiting';

  const caseDisplayId = eeCase?.caseNumber ?? (id ? id.slice(-8).toUpperCase() : '');

  // Default phase per case status — drives both the stepper highlight and
  // which content block renders on the right. The caseworker can override
  // via the stepper, which sets activePhase explicitly.
  const defaultPhase: CasePhase = (() => {
    if (!eeCase) return 'verify';
    // Ex-parte renewal fallout (Diane Caldwell archetype): Evaluate and Determine
    // are both locked panels awaiting the beneficiary's response — the only
    // actionable content (the pre-populated renewal form / RFI) lives on Verify.
    // Land there so the RFI is visible on open instead of behind a stepper click
    // (ENG-1949). The locked Determine/Evaluate cards stay reachable via the stepper.
    if (isExParteRenewal) return 'verify';
    if (eeCase.status === 'PENDING_VERIFICATION') return 'verify';
    if (eeCase.status === 'IN_REVIEW') return isNonMagi ? 'evaluate' : 'determine';
    return 'determine';
  })();
  const currentPhase: CasePhase = activePhase ?? defaultPhase;
  const phaseHeading: Record<CasePhase, { step: number; label: string; subtitle: string }> = {
    verify: {
      step: 1,
      label: 'Verify',
      subtitle: isExParteRenewal
        ? 'Ex-parte verification sources, renewal form delivery, and response monitoring'
        : isNonMagi
          ? 'Asset verification and SSA income sources'
          : 'Income verification, identity checks, and data source reconciliation',
    },
    evaluate: {
      step: 2,
      label: 'Evaluate',
      subtitle: isExParteRenewal
        ? 'Locked — awaiting beneficiary response to pre-populated renewal form'
        : isNonMagi
          ? ''
          : 'Coverage group evaluation, EDBC rule engine, and program matching',
    },
    determine: {
      step: 3,
      label: 'Determine',
      subtitle: isExParteRenewal
        ? 'Locked — awaiting evaluation'
        : 'Caseworker review and final eligibility determination',
    },
  };
  const baseFlags = Array.isArray((intake.displayMeta as Record<string, unknown>)?.['flags'])
    ? ((intake.displayMeta as Record<string, unknown>)['flags'] as string[])
    : [];
  // DDS chips are appended when the referral is in-flight or confirmed so the
  // CaseNavBar badge strip reflects the current ABD workflow state without
  // requiring a backend status transition (PENDING_DDS not yet in the EE
  // service schema). Chips are additive — pre-existing baseFlags are kept.
  // ID-CLEAR is derived client-side from the linked CLEAR verification; the
  // server writes OOS-MCD into displayMeta.flags itself. Dedupe so a stored
  // chip never renders twice.
  // A caseworker decision stamps determinations[].determinedBy; only a case
  // with no such actor was auto-processed, so the no-touch chips are reserved
  // for those (a case approved from Review & Decide must not claim NO-TOUCH).
  const decidedByCaseworker = (eeCase?.determinations ?? []).some((d) => !!d.determinedBy);
  const caseFlags = Array.from(
    new Set([
      // NON-MAGI ABD cases require caseworker DDS confirmation — not auto-processed
      ...(eeCase?.status === 'APPROVED' && !isNonMagi && !decidedByCaseworker
        ? ['Auto-Approved', 'NO-TOUCH', ...(eeCase.caseType === 'RENEWAL' ? ['EX-PARTE'] : [])]
        : []),
      ...(isNonMagi && ddsReferralSent && !ddsConfirmed ? ['DDS Referral Sent'] : []),
      ...(isNonMagi && ddsConfirmed ? ['ABD Eligible'] : []),
      ...baseFlags,
      ...(clearVerified ? [EE_FLAG_ID_CLEAR] : []),
    ]),
  );

  // DDS CTA derivation — extracted from JSX to keep the ActionBar prop
  // readable. Storyboard state chain (Robert Mitchell Non-MAGI ABD flow):
  //   dds_pending   → "Prepare DDS Referral Packet →"          (solid)
  //   dds_referred  → "⚙ Simulate: DDS Confirms Disability"    (dashed demo)
  //   dds_confirmed → "Validate"                                (solid)
  //   abd_assigned  → "Submit Determination →"                  (solid, approves)
  // The terminal `submitted` state is unreachable here: approval flips
  // isTerminal and the ActionBar unmounts in favor of CompletedCaseDetail.
  //
  // ENG-1856: the simulate + submit CTAs require IN_REVIEW status (submit
  // fires approveMutation which the backend rejects with
  // INVALID_STATUS_TRANSITION otherwise). Cases in PENDING_VERIFICATION are
  // auto-queued by the referral step, so only that first CTA stays enabled
  // before IN_REVIEW.
  const ddsBusy = approving || denying || issuingRfi;
  const ddsCta: ActionBarCta = !ddsReferralSent
    ? {
        label: DDS_REFER_LABEL,
        onClick: handleReferToDds,
        disabled: ddsBusy || queuingForReview,
      }
    : !ddsConfirmed
      ? {
          label: DDS_CONFIRM_LABEL,
          onClick: handleSimulateDdsResult,
          disabled: ddsBusy || eeCase?.status !== 'IN_REVIEW',
          // Storyboard parity: the DDS response is a demo-only simulation, so
          // it renders with the dashed "⚙ Simulate:" treatment, not a solid CTA.
          demo: true,
        }
      : !ddsValidated
        ? {
            label: DDS_VALIDATE_LABEL,
            onClick: handleValidateDds,
            disabled: ddsBusy,
          }
        : {
            label: DDS_SUBMIT_LABEL,
            onClick: handleSubmitDetermination,
            disabled: ddsBusy || eeCase?.status !== 'IN_REVIEW',
          };
  // Single source of truth for the DDS state name — consumed by the
  // ActionBar status map below AND the Case Assist banner derivation.
  const ddsFlowState: DdsFlowState = !ddsReferralSent
    ? 'pending'
    : !ddsConfirmed
      ? 'referred'
      : !ddsValidated
        ? 'confirmed'
        : 'validated';
  // ActionBar status + tone tracking the DDS state (storyboard
  // actionBarByState). Non-DDS cases keep the displayMeta-derived summary.
  const ddsStatus = DDS_STATUS_BY_STATE[ddsFlowState];
  const ddsTone: ActionBarTone = !ddsReferralSent ? 'review' : !ddsConfirmed ? 'waiting' : 'ready';
  const ctaProps: ActionBarCta = isNonMagi
    ? ddsCta
    : { label: 'Review & Decide →', onClick: () => setReviewOpen(true), disabled: approving || denying || issuingRfi };
  // An open Verify Assist finding overrides the displayMeta-derived bar copy so
  // the bottom bar and the red banner agree (sibling-surface parity).
  const barStatus = oosFlagOpen
    ? 'Verify Assist: active out-of-state Medicaid coverage — resolve the flag before determination'
    : isNonMagi
      ? ddsStatus
      : actionSummary;
  const barTone: ActionBarTone = oosFlagOpen ? 'review' : isNonMagi ? ddsTone : (actionTone as ActionBarTone);

  return (
    <AdminShell
      bannerBrand={<span>State Eligibility &amp; Enrollment</span>}
      bannerLabel="Caseworker Portal"
      defaultSidebarOpen={false}
      navContent={<EeSidebarNav />}
    >
      {/* Full-height flex column: pinned top group, scrolling middle, pinned
          ActionBar. Mirrors the storyboard's h-screen + flex-col + overflow-
          hidden layout, scoped to admin-shell-content so the chrome above
          stays untouched. Top + bottom are flex-shrink-0; the middle is the
          only thing that scrolls. */}
      <div className="h-full flex flex-col min-h-0">
        {/* ── Pinned top group ─────────────────────────────────────────── */}
        {(eeCase || loading) && (
          <div className="flex-shrink-0 bg-card">
            <CaseNavBar
              applicantName={eeCase ? applicantName : '…'}
              caseDisplayId={caseDisplayId}
              status={eeCase?.status ?? 'IN_REVIEW'}
              flags={caseFlags}
              hasRfi={!!eeCase?.rfiDetails}
              daysRemaining={typeof dm.daysRemaining === 'number' ? dm.daysRemaining : null}
              clearVerified={clearVerified}
              prevCaseId={prevCaseId ?? null}
              nextCaseId={nextCaseId ?? null}
              onBack={() => navigate('/ee/cases')}
              onPrev={() => prevCaseId && navigate(`/ee/cases/${prevCaseId}`)}
              onNext={() => nextCaseId && navigate(`/ee/cases/${nextCaseId}`)}
              onViewDetails={() => setDrawerOpen(true)}
            />
            {eeCase?.rfiDetails && (
              <div className="px-6 pt-4">
                <PendingRfiBanner rfi={eeCase.rfiDetails} resolving={resolvingRfi} onResolve={handleResolveRfi} />
              </div>
            )}
            {eeCase && !isTerminal && (
              <CaseActionBanner
                eeCase={eeCase}
                determinations={eeCase.determinations ?? []}
                ddsFlowState={isNonMagi ? ddsFlowState : undefined}
              />
            )}
            {/* DDS eligibility notice banner — shown in-session after
                handleConfirmDdsDecision fires. Dismissed by ×. Lives here
                (inside the pinned top group, below CaseActionBanner) so it's
                always visible regardless of which phase tab is active. */}
            {ddsNoticeBannerOpen && (
              <div
                role="status"
                aria-live="polite"
                className="mx-6 mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-green-700 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-green-800">Eligibility notice queued</p>
                  <p className="text-xs text-green-800 mt-0.5">
                    Portal inbox + USPS first-class mail · Notice will be delivered within 1 business day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDdsNoticeBannerOpen(false)}
                  aria-label="Dismiss notice banner"
                  className="text-green-700 hover:text-green-900 ml-2"
                >
                  ×
                </button>
              </div>
            )}
            {eeCase && !isTerminal && (
              <CaseProgressStepper
                status={eeCase.status}
                isNonMagi={isNonMagi}
                activePhase={currentPhase}
                onPhaseChange={setActivePhase}
                ddsValidated={ddsValidated}
              />
            )}
          </div>
        )}

        {/* ── Middle row: static sidebar + scrolling content column ─────
            The sidebar is a flex sibling of the scroll container, not a
            child, so it stays pinned in place while the evidence column
            scrolls. Sidebar inherits the full middle-row height via flex
            stretch. */}
        <div className="flex-1 flex min-h-0">
          {!loading && !error && eeCase && !showCompletedDetail && (
            <ApplicantSidebar eeCase={eeCase} applicantName={applicantName} />
          )}

          <div className="flex-1 min-w-0 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-16 px-6">
                <p className="text-muted-foreground">Loading case...</p>
              </div>
            )}

            {error && (
              <div className="m-6 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                Failed to load case details. Please try again or contact support.
              </div>
            )}

            {!loading && !error && !eeCase && (
              <div className="m-6 rounded-md border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
                Case not found.
              </div>
            )}

            {!loading && !error && eeCase && (
              <div className="min-w-0">
                {/* Phase-based content (storyboard parity). Content is
                    constrained to max-w-2xl + centered to match the
                    storyboard's evidence panel; the surrounding column still
                    spans the workspace so the sidebar + bottom action bar
                    keep their full width. */}
                {!isTerminal && (
                  <div className="max-w-2xl mx-auto px-6 py-5 space-y-5">
                    <div>
                      {/* Use a <p> instead of <h2> so the global h2 base rule
                          (font-size: var(--text-xl)) doesn't beat the Tailwind
                          text-base utility. Storyboard renders this at 16px. */}
                      <p className="text-base font-semibold text-foreground">
                        Step {phaseHeading[currentPhase].step}: {phaseHeading[currentPhase].label}
                      </p>
                      {phaseHeading[currentPhase].subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{phaseHeading[currentPhase].subtitle}</p>
                      )}
                    </div>

                    {currentPhase === 'verify' &&
                      (isExParteRenewal ? (
                        <ExParteVerifyPanel />
                      ) : (
                        <div className="space-y-5">
                          {/* Storyboard's WhyPanel / DynamicWhyPanel +
                            IncomePanel / DynamicIncomePanel composition.
                            Both pathways open with the Auto-Processing
                            Pipeline + Income Sources. Then:
                              · Non-MAGI: ABD Income Test (FPL bar) + SSA
                                Verification Results — mirrors the static
                                IncomePanel.
                              · MAGI: IRS Wage Match — mirrors the dynamic
                                IRS comparison block. */}
                          {/* ENG-1983: the pipeline shows data verifications only
                            (identity, citizenship, residency, household, income) for
                            BOTH pathways — eligibility results (pathway routing,
                            coverage groups, ABD checks) live in Evaluate's
                            SectionedRuleTrace. buildVerificationSteps substitutes
                            real verification-section rows from the trace (e.g. a
                            genuine residency denial) into the curated steps. */}
                          <AutoProcessingPipeline
                            pathway={isNonMagi ? 'NON_MAGI' : 'MAGI'}
                            steps={[
                              ...buildVerificationSteps(parsedRules, isNonMagi ? 'NON_MAGI' : 'MAGI'),
                              ...(identityVerificationStep(identityVerification)
                                ? [identityVerificationStep(identityVerification)!]
                                : []),
                            ]}
                          />
                          {/* CLEAR / Verify Assist identity verification linked to the
                            case — checks, document, verified identity, and the
                            out-of-state coverage finding when present. */}
                          {identityVerification && (
                            <IdentityVerificationCard identityVerification={identityVerification} />
                          )}
                          {/* Income Sources is MAGI-only on Verify: Non-MAGI ABD
                            verification rests on the SSA-verified SSDI figure
                            (SSA panel below) — the wage-style income table
                            duplicates it as noise. */}
                          {!isNonMagi && <IncomeSources eeCase={eeCase} />}
                          {isNonMagi ? (
                            <>
                              {/* ENG-1891: the ABD Income Test moved to Evaluate — it is a
                                pass/fail eligibility test, not verification evidence.
                                Verify keeps the SSA verification result + asset
                                verification (the confirmed-data sources). */}
                              <SsaVerificationResults eeCase={eeCase} ddsConfirmed={ddsConfirmed} />
                              {/* ENG-1874: Asset Verification belongs in Step 1 (Verify)
                                for Non-MAGI ABD cases — verification happens up front,
                                not during evaluation. Moved here from the Evaluate step.
                                Its Disability Determination card tracks the DDS state:
                                amber pending → blue packet-prepared → green confirmed. */}
                              <NonMagiAssetsPanel
                                eeCase={eeCase}
                                ddsReferralSent={ddsReferralSent}
                                ddsConfirmed={ddsConfirmed}
                                applicantFirstName={
                                  applicantName !== UNKNOWN_APPLICANT ? applicantName.split(/\s+/)[0] : undefined
                                }
                              />
                            </>
                          ) : (
                            <IrsWageMatch eeCase={eeCase} />
                          )}
                        </div>
                      ))}

                    {currentPhase === 'evaluate' &&
                      (isExParteRenewal ? (
                        <ExParteEvaluateLocked />
                      ) : (
                        <div className="space-y-5">
                          {/* MAGI: DynamicAssetsPanel ("Asset Test Not Required"
                            callout + facts table) + DynamicProgramsPanel
                            (Program Enrollment Status). Storyboard's MAGI
                            Evaluate has nothing else — no standalone rules
                            engine card. Non-MAGI: full Asset Verification +
                            Resource Categories Reviewed + LTC Look-Back stack
                            + Non-MAGI Eligibility Criteria (Program
                            Enrollment lives in Determine for Non-MAGI). */}
                          {/* Non-MAGI Asset Verification now renders in Step 1
                            (Verify) per ENG-1874 — the Evaluate step keeps only
                            the rule trace. MAGI retains its asset/program cards. */}
                          {!isNonMagi && (
                            <>
                              <AssetTestSummary pathway="MAGI" />
                              <ProgramEnrollmentStatus eeCase={eeCase} />
                            </>
                          )}
                          {/* ENG-1891: the ABD Income Test is a pass/fail eligibility
                            test, so it belongs in Evaluate (moved out of the Verify
                            step) for Non-MAGI ABD cases. */}
                          {isNonMagi && <AbdIncomeTest eeCase={eeCase} />}
                          {/* ENG-1670: storyboard-shaped sectioned rule trace.
                            Closes R-001 (outcome badge), R-006 (evaluatedAt),
                            R-007 (empty state), AC-008 (sectioned layout).
                            Visible on the Evaluate step for both pathways —
                            this is where the caseworker drills into why the
                            engine reached its current state.
                            ENG-1874: for non-SSI ABD cases, hide the SSI Status
                            section and render ABD Category as pending. */}
                          <SectionedRuleTrace
                            ruleEvaluations={eeCase.ruleEvaluations ?? null}
                            receivingSSI={isNonMagi ? receivingSSI : undefined}
                            abdPending={abdPending}
                            ddsReferralSent={ddsReferralSent}
                            // Once the caseworker validates, the engine's
                            // "Needs review" outcome is stale — hide the pill.
                            hideOutcomeBadge={ddsValidated}
                          />
                        </div>
                      ))}

                    {currentPhase === 'determine' &&
                      (isExParteRenewal ? (
                        <ExParteDetermineLocked />
                      ) : (
                        <div className="space-y-5">
                          {isNonMagi ? (
                            // Non-MAGI ABD: storyboard's ProgramsPanel + locked
                            // DecidePanel (waiting on DDS) — coverage decision
                            // unlocks once disability is confirmed.
                            <NonMagiDeterminePanel
                              eeCase={eeCase}
                              ddsReferralSent={ddsReferralSent}
                              ddsConfirmed={ddsConfirmed}
                              ddsValidated={ddsValidated}
                            />
                          ) : (
                            // MAGI: storyboard's DynamicDecidePanel — the
                            // locked Determination card with three disabled
                            // radio choices. The actual decision happens via
                            // the bottom CaseActionBar "Review & Decide →" CTA
                            // which opens ReviewDecideModal.
                            <MagiDeterminePanel />
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {/* CompletedCaseDetail renders full-width (no centered column
                    wrapper) — the tab strip spans the content area width and
                    the component itself manages its own max-w-[1100px] centered
                    column internally. ActivityLog is not rendered inline —
                    it is accessible via the Activity tab inside CompletedCaseDetail.
                    (The dedicated auto-enrollment workspace was removed with the
                    demo trim, so auto-enrolled cases render here too.) */}
                {showCompletedDetail && <CompletedCaseDetail eeCase={eeCase} applicantName={applicantName} />}
              </div>
            )}
          </div>

          {/* ── Right rail: Case Assist ───────────────────────────────────
              Sibling of the scroll container so it stays visible whichever
              phase is active (and without scrolling on a 1440px screen);
              it owns its own vertical scroll when the findings run long. */}
          {!loading && !error && eeCase && !showCompletedDetail && (
            <div
              className="w-[380px] shrink-0 border-l border-border bg-card overflow-y-auto"
              data-slot="case-assist-rail"
            >
              <CaseAssistPanel
                className="px-4 py-4"
                eeCase={eeCase}
                caseAssist={eeCase.caseAssist}
                identityVerification={identityVerification}
                actorEmail={admin?.email ?? null}
                onIssueRfi={(items) => {
                  setRfiPrefillItems(items);
                  setRfiOpen(true);
                }}
                onFlagUpdated={() => refetch()}
              />
            </div>
          )}
        </div>
        {/* ── Pinned bottom: ActionBar ─────────────────────────────────── */}
        {showActionBar && (
          <div className="flex-shrink-0">
            <ActionBar
              tone={barTone}
              status={barStatus}
              onAddNote={() => setNoteOpen(true)}
              onClarify={() => setRfiOpen(true)}
              cta={ctaProps}
            />
          </div>
        )}
      </div>

      {showActionBar && (
        <ReviewDecideModal
          open={reviewOpen}
          // Plain setter suffices — ddsFlowRef.current is only set to true inside
          // handleConfirmDdsDecision, which is only reachable when isNonMagi=true.
          // ReviewDecideModal is only rendered when isNonMagi=false (ctaProps picks
          // ddsCta vs MAGI CTA based on isNonMagi). The two paths are mutually
          // exclusive per case, so ddsFlowRef is never true when this modal opens.
          onOpenChange={setReviewOpen}
          caseLabel={`Case ${caseDisplayId}`}
          applicantName={applicantName}
          approving={approving}
          denying={denying}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}

      {showActionBar && (
        <ConfirmationModal
          open={approveGuardOpen}
          onOpenChange={setApproveGuardOpen}
          title="Verify Assist flag still open"
          description={`CLEAR found active out-of-state Medicaid coverage for ${applicantName} and the flag has not been resolved or dismissed. Approving now may create a duplicate enrollment across states. Resolve the flag from the Case Assist panel, or approve anyway.`}
          items={[
            {
              label: 'Payer',
              value:
                identityVerification?.determination?.coverage?.payer_name ??
                `${identityVerification?.determination?.payer_state_name ?? 'Out-of-state'} Medicaid`,
            },
            { label: 'Flag status', value: (identityVerification?.flag?.status ?? 'open').replace(/_/g, ' ') },
          ]}
          variant="destructive"
          primaryAction={{ label: approving ? 'Approving…' : 'Approve anyway', onClick: fireApprove, loading: approving }}
          secondaryAction={{ label: 'Back to case', onClick: () => setApproveGuardOpen(false) }}
        />
      )}

      {showActionBar && (
        <AddNoteModal
          open={noteOpen}
          onOpenChange={setNoteOpen}
          caseLabel={`Case ${caseDisplayId}`}
          applicantName={applicantName}
          onSubmit={(_note) => {
            // Backend persistence not yet wired — confirm via toast so the
            // demo reads end-to-end. When the EE service exposes a note
            // mutation, swap this for the real call + audit-log entry.
            setNoteOpen(false);
            toast.success('Note saved', {
              description: 'Note added to the case audit trail.',
            });
          }}
        />
      )}

      {drawerOpen && eeCase && (
        <CaseDetailsDrawer
          caseRow={
            {
              id: eeCase.id,
              caseNumber: eeCase.caseNumber ?? null,
              applicantName: applicantName,
              status: eeCase.status,
              flagReason: eeCase.flagReason ?? null,
              flags: caseFlags,
            } satisfies DrawerCaseRow
          }
          onClose={() => setDrawerOpen(false)}
        />
      )}
      {eeCase && rfiOpen && rfiPrefillItems && (
        // Case Assist → RFI: the item checklist modal, pre-filled with the
        // document the recommendation asks for (e.g. proof of SC Medicaid
        // disenrollment). Same submit payload as the storyboard modal below.
        <IssueRfiModal
          key={`rfi-prefill-${eeCase.id}`}
          open={rfiOpen}
          onOpenChange={(next) => {
            setRfiOpen(next);
            if (!next) setRfiPrefillItems(null);
          }}
          caseLabel={`Case #${caseDisplayId}`}
          applicantName={applicantName}
          submitting={issuingRfi}
          initialItems={rfiPrefillItems}
          initialNote={`Our identity verification found active Medicaid coverage in another state. Please send a termination letter or confirmation from that state's Medicaid agency showing the date your coverage ended so we can finish your ${STATE_MEDICAID_LABEL} determination.`}
          onSubmit={handleIssueRfi}
        />
      )}
      {eeCase && rfiOpen && !rfiPrefillItems && (
        // Key-based reset: re-mount on every open so the modal's internal
        // form state initialises fresh, without an in-modal useEffect that
        // watches `open`. Closing is handled by conditional render below
        // open=false. Subject + message defaults are derived from the case
        // pathway so Non-MAGI ABD cases pre-populate with DDS context.
        <RequestClarificationModal
          key={`rfi-${eeCase.id}-${rfiOpen}`}
          open={rfiOpen}
          onOpenChange={setRfiOpen}
          caseLabel={`Case #${caseDisplayId}`}
          applicantName={applicantName}
          subject={
            isNonMagi ? 'Information: Disability Determination Status' : 'Information Request: Eligibility Verification'
          }
          message={
            isNonMagi
              ? `Dear ${applicantName},\n\nThis is an update on your State Medicaid application (Case #${caseDisplayId}).\n\nYour application has been routed to the Non-MAGI ABD (Aged, Blind, and Disabled) pathway. Your income and asset information have been verified and meet the program requirements. We are now preparing a referral to Disability Determination Services (DDS) to confirm your disability status, which is the final step required to complete your eligibility determination.\n\nNo action is required from you at this time. Your application is on hold pending AVS results.`
              : `Dear ${applicantName},\n\nThis is an update on your State Medicaid application (Case #${caseDisplayId}). We need additional information to continue your eligibility determination. Please review the requested documents below and submit them via your preferred delivery method.\n\nThank you,\nState Medicaid Eligibility Team`
          }
          submitting={issuingRfi}
          onSubmit={handleIssueRfi}
        />
      )}
    </AdminShell>
  );
}
