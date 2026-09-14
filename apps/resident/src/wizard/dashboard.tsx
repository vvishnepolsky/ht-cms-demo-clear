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
import { useQuery } from '@apollo/client/react';
import { Icon, Button, Avatar } from './ui';
import {
  GET_MEDICAID_EE_CASE_QUERY,
  LIST_MY_MEDICAID_EE_CASES_QUERY,
  GET_ELIGIBILITY_NOTICE_QUERY,
} from '../lib/operations';
import { SESSION_KEYS } from '../lib/session-keys';
import { client } from '../lib/apollo';
import { useResident } from '../lib/auth-store';
import { RenewalNoticeModal } from './RenewalNoticeModal';
import { describeResolution } from './clear-verification';
import {
  MCO_PLACEHOLDER,
  INBOX_MESSAGES,
  buildRecertMessage,
  isInRecertificationWindow,
  daysUntilRecert,
  CASE_STATUS,
  fmtSize,
  fmtDateLong,
  deriveCoverageDates,
  greetingName,
  getGreeting,
  getApplicationStatusMessage,
} from './dashboard-data';

/* =========================================================================
   Resident dashboard — landing page after a Medicaid application.
   Three primary widgets: status, inbox, documents.
   ========================================================================= */

// Member identity, seed inbox/documents, and the date/greeting/derivation helpers
// live in ./dashboard-data (pure, unit-tested) — imported above.

// ─────────────────────────────────────────────────────────────────────────
// Top bar — matches the wizard's chrome
// ─────────────────────────────────────────────────────────────────────────
function TopBar() {
  const resident = useResident();
  const fullName =
    resident?.firstName && resident?.lastName
      ? `${resident.firstName} ${resident.lastName}`
      : resident?.firstName || 'Member';

  return (
    <div className="topbar dash-topbar">
      <a className="wordmark" href="/">
        <span className="mark">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
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
      <nav className="dash-nav">
        {/* Current page — non-interactive (was an <a> with no href, ENG-1883). */}
        <span className="dash-nav-item active" aria-current="page">
          Dashboard
        </span>
      </nav>
      <div className="dash-account">
        <Avatar name={fullName} size={32} />
        <span className="dash-account-name">{resident?.firstName || 'Member'}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Status hero — driven by real case status when a caseId is in sessionStorage
// ─────────────────────────────────────────────────────────────────────────
function useCaseStatus() {
  const resident = useResident();
  const storedCaseId = sessionStorage.getItem(SESSION_KEYS.CASE_ID);

  // When the resident reaches the dashboard without submitting an application
  // in this session (e.g. they logged in directly to view a renewal notice),
  // there is no CASE_ID in sessionStorage. Resolve their case by their
  // identity personId and cache it, so the rest of the page behaves exactly
  // like the post-submit path. medicaidEeCases is tenant-scoped, so this only
  // ever returns the logged-in resident's own customer's cases.
  const { data: lookup } = useQuery(LIST_MY_MEDICAID_EE_CASES_QUERY, {
    variables: { applicantPersonId: resident?.personId ?? '' },
    skip: !!storedCaseId || !resident?.personId,
    fetchPolicy: 'network-only',
    client,
  });

  // caseId is derived directly from the lookup result below — no useQuery
  // onCompleted (removed in Apollo Client 4). The sign-in redirect
  // (screens-e.tsx) already writes CASE_ID to sessionStorage before routing
  // here; on a direct /dashboard load this lookup resolves the case fresh.
  const caseId = storedCaseId ?? lookup?.medicaidEeCases?.data?.[0]?.id ?? null;

  const { data, loading } = useQuery(GET_MEDICAID_EE_CASE_QUERY, {
    variables: { id: caseId ?? '' },
    skip: !caseId,
    fetchPolicy: 'network-only',
    client,
  });
  return { caseId, eeCaseStatus: data?.medicaidEeCase ?? null, loading };
}

function StatusHero() {
  const { caseId, eeCaseStatus, loading } = useCaseStatus();
  const resident = useResident();
  const [noticeOpen, setNoticeOpen] = useState(false);

  const status = eeCaseStatus?.status ?? null;
  const rfi = eeCaseStatus?.rfiDetails ?? null;
  // CLEAR / Verify Assist: identity verification linked to the case (resident
  // view — no payer/member ids, those are staff-only).
  const identity = eeCaseStatus?.identityVerification ?? null;
  const identityVerified = identity?.status === 'success';
  const duplicateEnrollment = !!identity?.determination?.duplicate_enrollment;
  const resolutionText = describeResolution(identity?.resolution);
  const { coverageStart } = deriveCoverageDates(eeCaseStatus);
  const coverageStartLabel = fmtDateLong(coverageStart);
  const applicantName =
    resident?.firstName && resident?.lastName ? `${resident.firstName} ${resident.lastName}` : 'Member';
  const updatedAt = eeCaseStatus?.updatedAt
    ? new Date(eeCaseStatus.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Today';
  const submittedAt = eeCaseStatus?.createdAt
    ? new Date(eeCaseStatus.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Yesterday';

  // Derive track steps from real status. Falls back to approved seed when
  // there is no caseId (guest/demo path without a submitted case).
  let heading = 'Your application is being processed';
  let body = <p>We're reviewing your information. You'll hear from us within 3–5 business days.</p>;
  let steps;

  if (!caseId || (!loading && !eeCaseStatus)) {
    // No case loaded — show "under review" so the fallback never misleadingly
    // shows "Approved" steps before real data arrives (ENG-1993).
    heading = 'Your application is under review';
    body = <p>We're reviewing your information. You'll hear from us within 3–5 business days.</p>;
    steps = [
      { label: 'Submitted', done: true, at: submittedAt },
      { label: 'Under Review', done: false, current: true, at: 'In progress' },
      { label: 'Decision', done: false, at: 'Pending' },
      { label: 'Member IDs', done: false, at: 'If approved' },
    ];
  } else if (status === CASE_STATUS.APPROVED) {
    heading = "You're covered — welcome to State-X Medicaid";
    body = (
      <p>
        Your household has been approved for coverage through <strong>{MCO_PLACEHOLDER}</strong>. Member ID cards are on
        the way.
      </p>
    );
    steps = [
      { label: 'Submitted', done: true, at: submittedAt },
      { label: 'Verified', done: true, at: updatedAt },
      { label: 'Approved', done: true, at: updatedAt },
      { label: 'Member IDs', done: false, at: '5 business days' },
    ];
  } else if (status === CASE_STATUS.DENIED) {
    heading = 'Your application was not approved';
    body = (
      <p>
        Unfortunately your application did not meet eligibility requirements at this time. Check your inbox for a notice
        letter explaining the reason and your appeal rights.
      </p>
    );
    steps = [
      { label: 'Submitted', done: true, at: submittedAt },
      { label: 'Reviewed', done: true, at: updatedAt },
      { label: 'Decision', done: true, at: updatedAt },
    ];
  } else if (rfi) {
    // Caseworker issued an RFI — show "Action needed", never show Approved
    heading = 'Action needed — more information requested';
    body = (
      <div>
        <p>Your caseworker needs additional information to complete your eligibility review.</p>
        {rfi.noteToApplicant && <p style={{ marginTop: 8 }}>{rfi.noteToApplicant}</p>}
        {rfi.itemsRequested?.length > 0 && (
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            {rfi.itemsRequested.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
        {rfi.deadline && (
          <p style={{ marginTop: 8 }}>
            <strong>Respond by:</strong>{' '}
            {new Date(rfi.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={() => setNoticeOpen(true)}>
            View renewal notice <Icon name="arrowRight" size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
    steps = [
      { label: 'Submitted', done: true, at: submittedAt },
      { label: 'Under Review', done: true, at: updatedAt },
      { label: 'Action Needed', done: false, current: true, at: 'Response required' },
      { label: 'Decision', done: false, at: 'Pending' },
    ];
  } else {
    // IN_REVIEW or PENDING_VERIFICATION
    heading = 'Your application is under review';
    body = <p>We're reviewing your information. You'll hear from us within 3–5 business days.</p>;
    steps = [
      { label: 'Submitted', done: true, at: submittedAt },
      { label: 'Under Review', done: false, current: true, at: 'In progress' },
      { label: 'Decision', done: false, at: 'Pending' },
      { label: 'Member IDs', done: false, at: 'If approved' },
    ];
  }

  return (
    <>
      <div className="status-hero">
        <div className="status-hero-row">
          <div className="status-icon">
            <Icon
              name={
                status === CASE_STATUS.APPROVED
                  ? 'shieldCheck'
                  : status === CASE_STATUS.DENIED
                    ? 'alert'
                    : rfi
                      ? 'alert'
                      : 'chartUp'
              }
              size={26}
              aria-hidden="true"
            />
          </div>
          <div className="status-body">
            <div className="status-eyebrow">Application status</div>
            <h2>{heading}</h2>
            {body}
            {identityVerified ? (
              <div className="status-chip-row">
                <span className="verified-pill" style={{ height: 32, fontSize: 13, padding: '0 14px' }}>
                  <Icon name="shieldCheck" size={14} aria-hidden="true" /> Identity verified by CLEAR
                </span>
              </div>
            ) : null}
          </div>
          <div className="status-meta">
            {coverageStartLabel ? (
              <div className="status-meta-row">
                <span className="muted">Coverage starts</span>
                <span>{coverageStartLabel}</span>
              </div>
            ) : null}
            <div className="status-meta-row">
              <span className="muted">Last updated</span>
              <span>{updatedAt}</span>
            </div>
          </div>
        </div>

        {duplicateEnrollment ? (
          <div className="coverage-notice" role="note">
            <Icon name="info" size={22} aria-hidden="true" />
            <div>
              <h3>
                Coverage we found: active Medicaid in {identity?.determination?.payer_state_name || 'another state'}
              </h3>
              {resolutionText ? (
                <div className="kv-row">
                  <span className="k">Your response</span>
                  <span>{resolutionText}</span>
                </div>
              ) : null}
              <p style={{ marginTop: 8 }}>A caseworker will review this before a decision is made.</p>
            </div>
          </div>
        ) : null}

        <div className="status-track">
          {steps.map((s, i, arr) => {
            const isCurrent = s.current || (!s.done && i === arr.findIndex((x) => !x.done));
            return (
              <div key={s.label} className={'track-step ' + (s.done ? 'done' : isCurrent ? 'current' : 'pending')}>
                <div className="track-bubble">
                  {s.done ? <Icon name="check" size={12} aria-hidden="true" /> : <div className="track-dot" />}
                </div>
                <div className="track-label">{s.label}</div>
                <div className="track-at">{s.at}</div>
              </div>
            );
          })}
        </div>
      </div>
      <RenewalNoticeModal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        applicantName={applicantName}
        // Demo placeholder: the RFI/renewal-notice path only renders for the
        // seeded ex parte case (Diane). mcNumber is not projected by
        // GET_MEDICAID_EE_CASE_QUERY and lives in the intakeData blob — not
        // worth over-fetching PHI to populate a demo-only field.
        mcNumber="MC334567891"
        deadline={rfi?.deadline ?? null}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inbox — messages from State-X HHS
// ─────────────────────────────────────────────────────────────────────────
function Inbox() {
  // ENG-1991: recert message shown only when APPROVED and within 90-day window. Apollo deduplicates — no extra network call.
  // ENG-1993: first message reflects real case status via getApplicationStatusMessage.
  const { eeCaseStatus } = useCaseStatus();
  const status = eeCaseStatus?.status ?? null;
  const applicationMsg = getApplicationStatusMessage(status);
  const { recertDue } = deriveCoverageDates(eeCaseStatus);
  const showRecert = status === CASE_STATUS.APPROVED && isInRecertificationWindow(recertDue);
  const recertMsg = showRecert ? buildRecertMessage(recertDue) : null;
  const messages = recertMsg ? [applicationMsg, recertMsg] : [applicationMsg];

  const [openId, setOpenId] = useState(applicationMsg.id);
  const unread = messages.filter((m) => m.unread).length;

  return (
    <div className="dash-card inbox-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <Icon name="mail" size={18} aria-hidden="true" />
          <span>Inbox</span>
          {unread > 0 ? <span className="unread-badge">{unread}</span> : null}
        </div>
        {/* ENG-1883: was an <a> with no href. No inbox list view exists yet
            (tracked in ENG-1969) — render a disabled button, not a dead link. */}
        <button
          type="button"
          className="dash-card-action"
          disabled
          title="Coming soon"
          style={{ background: 'none', border: 0, cursor: 'not-allowed', opacity: 0.55 }}
        >
          View all
        </button>
      </div>

      <div className="inbox-list">
        {messages.map((m) => (
          <div key={m.id} className={'inbox-item' + (m.unread ? ' unread' : '') + (openId === m.id ? ' open' : '')}>
            <button type="button" className="inbox-item-head" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
              <div className={'inbox-item-ic ' + m.iconKind}>
                <Icon name={m.icon} size={16} filled={true} aria-hidden="true" />
              </div>
              <div className="inbox-item-body">
                <div className="inbox-item-title">
                  {m.unread ? <span className="inbox-dot" /> : null}
                  {m.title}
                </div>
                <div className="inbox-item-meta">{m.received}</div>
                <div className="inbox-item-preview">{m.preview}</div>
              </div>
              <Icon name={openId === m.id ? 'chevronUp' : 'chevronDown'} size={14} aria-hidden="true" />
            </button>

            {openId === m.id ? (
              <div className="inbox-item-detail">
                {m.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {m.action ? (
                  <div className="inbox-item-actions">
                    {/* ENG-1883: demo-seed message actions have no backend yet
                        (real inbox + actions tracked in ENG-1969) — disabled, not dead. */}
                    <Button variant={m.action.primary ? 'primary' : 'outline'} disabled title="Coming soon">
                      {m.action.label} <Icon name="arrowRight" size={14} aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Documents — uploads + letters from State-X HHS
// ─────────────────────────────────────────────────────────────────────────
function EligibilityPdfModal({ open, onClose, noticeUrl, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Eligibility Notice"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        className="bg-white w-full max-w-3xl rounded-lg shadow-xl flex flex-col"
        style={{ height: '85vh' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ flexShrink: 0 }}>
          <span className="text-sm font-medium text-slate-700">Eligibility Notice</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => window.print()} className="btn btn--ghost size-sm">
              <Icon name="printer" size={14} aria-hidden="true" />
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              autoFocus
              className="text-slate-500 hover:text-slate-900"
            >
              <Icon name="x" size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-slate-500 text-sm">Loading notice…</span>
            </div>
          ) : noticeUrl ? (
            <iframe src={noticeUrl} title="Eligibility Notice" style={{ height: '100%', width: '100%', border: 0 }} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-slate-500 text-sm">Notice not yet available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Documents() {
  const [docs, setDocs] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const inputRef = React.useRef(null);

  // Resolve caseId so we can fetch the real eligibility notice from the backend.
  // Apollo deduplicates these queries — StatusHero calls the same hooks, so they
  // share cache entries and won't produce duplicate network requests.
  const { caseId } = useCaseStatus();
  const { data: noticeData, loading: noticeLoading } = useQuery(GET_ELIGIBILITY_NOTICE_QUERY, {
    variables: { caseId: caseId ?? '' },
    skip: !caseId,
    fetchPolicy: 'cache-and-network',
    client,
  });
  const noticeUrl = noticeData?.eligibilityNotice?.noticeUrl ?? null;

  function addFiles(list) {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const incoming = Array.from(list || []).map((f) => ({
      id: 'd' + Math.floor(Math.random() * 1e9),
      name: f.name,
      size: f.size,
      type: f.type,
      kind: 'uploaded',
      uploadedOn: today,
    }));
    setDocs([...incoming, ...docs]);
  }

  function remove(id) {
    setDocs(docs.filter((d) => d.id !== id));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  // Approval letter only appears when the backend has generated and returned a URL.
  const approvalLetterDoc = noticeUrl
    ? {
        id: 'd-notice',
        name: 'Approval letter.pdf',
        size: 0,
        type: 'application/pdf',
        kind: 'from-state',
        uploadedOn: 'Available',
      }
    : null;
  const fromState = [...(approvalLetterDoc ? [approvalLetterDoc] : []), ...docs.filter((d) => d.kind === 'from-state')];
  const uploaded = docs.filter((d) => d.kind === 'uploaded');
  const totalCount = fromState.length + uploaded.length;

  return (
    <div className="dash-card documents-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <Icon name="file" size={18} aria-hidden="true" />
          <span>Documents</span>
        </div>
        <span className="muted dash-card-meta">{totalCount} files</span>
      </div>

      <div className="doc-dropzone-wrap">
        <div
          className={'doc-dropzone' + (dragging ? ' dragging' : '')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="doc-dropzone-ic">
            <Icon name="upload" size={18} aria-hidden="true" />
          </div>
          <div className="doc-dropzone-body">
            <div className="doc-dropzone-title">Upload a document</div>
            <div className="doc-dropzone-sub">Pay stubs, ID, address proof, anything State-X HHS asks for</div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {fromState.length > 0 ? (
        <div className="doc-section">
          <div className="doc-section-head">From State-X HHS</div>
          <div className="doc-list">
            {fromState.map((d) => (
              <DocRow key={d.id} doc={d} onView={d.id === 'd-notice' ? () => setApprovalOpen(true) : undefined} />
            ))}
          </div>
        </div>
      ) : null}

      {uploaded.length > 0 ? (
        <div className="doc-section">
          <div className="doc-section-head">Uploaded by you</div>
          <div className="doc-list">
            {uploaded.map((d) => (
              <DocRow key={d.id} doc={d} onRemove={() => remove(d.id)} />
            ))}
          </div>
        </div>
      ) : null}
      <EligibilityPdfModal
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        noticeUrl={noticeUrl}
        loading={noticeLoading}
      />
    </div>
  );
}

function DocRow({ doc, onRemove, onView }) {
  return (
    <div className="doc-row">
      <div className={'doc-row-ic ' + (doc.kind === 'from-state' ? 'state' : 'user')}>
        <Icon name="file" size={16} aria-hidden="true" />
      </div>
      <div className="doc-row-body">
        <div className="doc-row-name">{doc.name}</div>
        <div className="doc-row-meta">
          {fmtSize(doc.size)} · {doc.uploadedOn}
        </div>
      </div>
      <div className="doc-row-actions">
        <button
          type="button"
          className="btn btn--ghost size-sm"
          title={onView ? 'View' : 'Download'}
          aria-label={onView ? `View ${doc.name}` : `Download ${doc.name}`}
          onClick={onView}
        >
          <Icon name={onView ? 'eye' : 'download'} size={14} aria-hidden="true" />
        </button>
        {onRemove ? (
          <button
            type="button"
            className="btn btn--ghost size-sm"
            onClick={onRemove}
            style={{ color: 'var(--iowa-red)' }}
            title="Remove"
            aria-label={`Remove ${doc.name}`}
          >
            <Icon name="trash" size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Quick actions card
// ─────────────────────────────────────────────────────────────────────────
function QuickActions() {
  // ENG-1883: recert-due comes from the case's determination expirationDate.
  // ENG-1991: show recertify only when APPROVED and within 90-day window.
  // ENG-1990: show Switch/Find-doctor only when APPROVED.
  const { eeCaseStatus } = useCaseStatus();
  const status = eeCaseStatus?.status ?? null;
  const approved = status === 'APPROVED';
  const { recertDue } = deriveCoverageDates(eeCaseStatus);
  const inRecertWindow = status === 'APPROVED' && isInRecertificationWindow(recertDue);
  const recertLabel = inRecertWindow ? fmtDateLong(recertDue) : null;
  const recertDays = inRecertWindow ? daysUntilRecert(recertDue) : null;

  // All actions are disabled (no backend destination yet — ENG-1968/future).
  // "Soon" labels removed (ENG-1990 — confusing, cluttered layout).
  // "Recertify coverage" omitted unless APPROVED + within 90-day window (ENG-1991).
  // "Switch managed-care plan" + "Find a doctor" omitted unless APPROVED (ENG-1990).
  const items = [
    ...(inRecertWindow
      ? [
          {
            ic: 'calendar',
            title: 'Recertify coverage',
            sub:
              recertDays === 0
                ? `Due today — ${recertLabel}`
                : `Due in ${recertDays} day${recertDays === 1 ? '' : 's'} — ${recertLabel}`,
            hot: true,
          },
        ]
      : []),
    { ic: 'user', title: 'Update household', sub: 'Births, marriages, address changes' },
    ...(approved
      ? [
          { ic: 'shieldCheck', title: 'Switch managed-care plan', sub: '90 days from coverage start' },
          { ic: 'phone', title: 'Find a doctor', sub: 'In your managed-care network' },
        ]
      : []),
  ];
  return (
    <div className="dash-card quick-actions-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <Icon name="sparkles" size={18} aria-hidden="true" />
          <span>Quick actions</span>
        </div>
      </div>
      <div className="quick-actions">
        {items.map((it) => (
          <button key={it.title} type="button" className={'qa-item' + (it.hot ? ' hot' : '')} disabled>
            <div className="qa-ic">
              <Icon name={it.ic} size={18} aria-hidden="true" />
            </div>
            <div className="qa-body">
              <div className="qa-title">{it.title}</div>
              <div className="qa-sub">{it.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// How we'll contact you — populated from wizard sessionStorage
// ─────────────────────────────────────────────────────────────────────────
const CHANNEL_LABELS = { sms: 'SMS', portal: 'Portal inbox', postal: 'Postal mail', email: 'Email' };
const CHANNEL_ICONS = { sms: 'phone', portal: 'shieldCheck', postal: 'mail', email: 'mail' };

function CommunicationPrefs() {
  const raw = sessionStorage.getItem(SESSION_KEYS.COMM_PREFS);
  const prefs = raw
    ? JSON.parse(raw)
    : { channels: ['email'], writtenLanguage: 'English', spokenLanguage: 'English', renewalReminders: true };
  const channels: string[] = prefs.channels ?? (Array.isArray(prefs) ? prefs : ['email']);
  const writtenLanguage = prefs.writtenLanguage ?? 'English';
  const spokenLanguage = prefs.spokenLanguage ?? 'English';
  const renewalReminders = prefs.renewalReminders ?? true;

  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <Icon name="mail" size={18} aria-hidden="true" />
          <span>How we'll contact you</span>
        </div>
        <a className="dash-card-action" href="#/preferences">
          Edit
        </a>
      </div>

      {/* Selected channels as pills */}
      <div style={{ padding: '14px 22px 12px' }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Chosen during your application
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {channels.length > 0 ? (
            channels.map((ch) => (
              <span
                key={ch}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  borderRadius: 20,
                  border: '1px solid var(--civic-border)',
                  fontSize: 13,
                  background: 'var(--civic-bg-card)',
                }}
              >
                <Icon name={CHANNEL_ICONS[ch] ?? 'mail'} size={12} aria-hidden="true" />
                {CHANNEL_LABELS[ch] ?? ch}
              </span>
            ))
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              No channels selected
            </span>
          )}
        </div>
      </div>

      {/* Language + reminders */}
      <div className="spec-list" style={{ borderTop: '1px solid var(--civic-border)', padding: '10px 22px 14px' }}>
        <div className="row">
          <span className="k">Written language</span>
          <span className="v">{writtenLanguage}</span>
        </div>
        <div className="row">
          <span className="k">Spoken language</span>
          <span className="v">{spokenLanguage}</span>
        </div>
        <div className="row">
          <span className="k">Renewal reminders</span>
          <span className="v">
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: renewalReminders ? 'var(--civic-success-bg, #dcfce7)' : 'var(--civic-bg-muted)',
                color: renewalReminders ? 'var(--civic-success-text, #166534)' : 'var(--civic-text-muted)',
              }}
            >
              {renewalReminders ? 'On' : 'Off'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────
function Dashboard() {
  const resident = useResident();
  const firstName = greetingName(resident);

  return (
    <div className="dash-shell">
      <TopBar />

      <main className="dash-main">
        <div className="dash-greeting">
          <h1>
            {getGreeting()}, {firstName}.
          </h1>
          <p className="muted">Here's the latest on your State-X Medicaid coverage.</p>
        </div>

        <StatusHero />

        <div className="dash-grid">
          <div className="dash-col-main">
            <Inbox />
            <Documents />
          </div>
          <div className="dash-col-side">
            <QuickActions />
            <CommunicationPrefs />
            <div className="dash-help-card">
              <Icon name="phone" size={20} aria-hidden="true" />
              <div>
                <div className="dash-help-title">Need help?</div>
                <div className="dash-help-sub">Call 1-800-338-8366 · Mon–Fri 8a–5p</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// (CDN-era ReactDOM mount removed — mounted via src/main.tsx at the /dashboard route)

export { Dashboard };
export default Dashboard;
