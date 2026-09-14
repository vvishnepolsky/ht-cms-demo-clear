/**
 * DocumentsTab — drawer Documents panel.
 *
 * Storyboard parity: /Downloads/CMS Demo Storyboard/src/components/CaseDetailsDrawer.jsx
 * (the `{tab === "documents" && (...)}` block at L242).
 *
 * Layer 3 of ENG-1708. Lists the documents on a case, filterable by
 * type bucket (All / Income / Identity / Medical / RFI / Other), with
 * click-to-preview into a DocumentViewer modal. Empty state when the
 * case has no docs.
 *
 * Replaces two storyboard globals — `window.CASE_DOCUMENTS` and
 * `window.DocumentViewer` — with module-scoped equivalents:
 * `documentsForCase()` from `data/documents.ts` and the local
 * `DocumentViewer` component in the same drawer/ subdir.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { AlertCircle, CheckCircle2, Clock, Download, FileText } from 'lucide-react';
import { documentsForCase, type CaseDocument, type DocumentStatus } from '../../../../data/documents';
import { GET_ELIGIBILITY_NOTICE_QUERY, type EligibilityNoticeErrorCode } from '../../../../lib/ee-operations';
import { DocumentViewer } from '../DocumentViewer';
import type { DrawerTabProps } from '../types';

interface FilterBucket {
  id: string;
  label: string;
  match: (doc: CaseDocument) => boolean;
}

/**
 * Filter buckets shown above the document grid. Order matters — first
 * match wins for any composite badge logic downstream, and "All" always
 * sits leftmost. Buckets with zero matches collapse (except "All", which
 * always renders to anchor the row).
 *
 * Storyboard parity: src/components/CaseDetailsDrawer.jsx :: `docBuckets`.
 * The storyboard's match predicates operate on `tags[]` / `kind` strings;
 * here they operate on the typed `type` + `tags` fields of CaseDocument.
 */
const FILTER_BUCKETS: FilterBucket[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'income', label: 'Income', match: (d) => d.type === 'income' && !d.tags?.includes('rfi') },
  { id: 'identity', label: 'Identity', match: (d) => d.type === 'identity' },
  {
    id: 'medical',
    label: 'Medical',
    match: (d) =>
      d.type === 'medical' || d.tags?.includes('disability') === true || d.tags?.includes('pregnancy') === true,
  },
  { id: 'rfi', label: 'RFI', match: (d) => d.tags?.includes('rfi') === true },
  {
    id: 'other',
    label: 'Other',
    match: (d) =>
      d.type !== 'income' &&
      d.type !== 'identity' &&
      d.type !== 'medical' &&
      !d.tags?.includes('rfi') &&
      !d.tags?.includes('disability') &&
      !d.tags?.includes('pregnancy'),
  },
];

interface PillSpec {
  bg: string;
  fg: string;
  border: string;
  icon: typeof CheckCircle2;
  label: string;
}

/**
 * Civic-token status pills mirroring the modal's STATUS_PILL map.
 * Kept in this file (rather than imported from DocumentViewer) so the
 * tab can render without pulling the modal into the initial bundle.
 */
const STATUS_PILL: Record<DocumentStatus, PillSpec> = {
  verified: {
    bg: 'var(--civic-success-bg, var(--civic-jade-3, #e6f6ee))',
    fg: 'var(--civic-success-text)',
    border: 'var(--civic-jade-6, transparent)',
    icon: CheckCircle2,
    label: 'Verified',
  },
  pending: {
    bg: 'var(--civic-warning-bg)',
    fg: 'var(--civic-warning-text)',
    border: 'var(--civic-amber-6, transparent)',
    icon: Clock,
    label: 'Pending review',
  },
  rejected: {
    bg: 'var(--civic-destructive-bg, var(--civic-tomato-3, #fff0ee))',
    fg: 'var(--civic-destructive-text)',
    border: 'var(--civic-tomato-6, transparent)',
    icon: AlertCircle,
    label: 'Rejected',
  },
};

const ALL_BUCKET_ID = 'all';

const NOTICE_TITLE = 'Notice of Eligibility Determination';

const NOTICE_ERROR_MESSAGES: Record<EligibilityNoticeErrorCode, string> = {
  NOT_FOUND: 'No eligibility notice has been generated for this case.',
  STORAGE_FAILED: 'The notice could not be retrieved. Please try again later.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
};

/**
 * Maps a domain error code or network error flag to a display message.
 * Exported for unit testing — all branching lives here, not in JSX.
 */
export function resolveNoticeErrorMessage(firstErrorCode: string | undefined, hasNetworkError: boolean): string | null {
  if (firstErrorCode) {
    return NOTICE_ERROR_MESSAGES[firstErrorCode as EligibilityNoticeErrorCode] ?? NOTICE_ERROR_MESSAGES.INTERNAL_ERROR;
  }
  if (hasNetworkError) {
    return NOTICE_ERROR_MESSAGES.INTERNAL_ERROR;
  }
  return null;
}

function EligibilityNoticeSection({ caseId }: { caseId: string }) {
  const { data, loading, error } = useQuery(GET_ELIGIBILITY_NOTICE_QUERY, {
    variables: { caseId },
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-and-network',
  });

  const notice = data?.eligibilityNotice;
  const firstError = notice?.errors?.[0];
  const pdfUrl = notice?.noticeUrl ?? null;
  const showPdf = !loading && pdfUrl !== null;
  // S-3: network error with no domain error maps to INTERNAL_ERROR, not pending-case copy.
  const errorMessage = showPdf ? null : resolveNoticeErrorMessage(firstError?.code, !!error && !firstError);
  const showError = !loading && !showPdf && errorMessage !== null;
  // S-2: explicit empty state for a resolved response with no URL and no errors.
  const showEmpty = !loading && !showPdf && !showError && !!notice;
  // NOT_FOUND means the case hasn't been approved yet; other codes mean the notice
  // exists but couldn't be retrieved — use a different heading to avoid misleading caseworkers.
  const errorHeadline = firstError?.code === 'NOT_FOUND' ? 'No notice generated yet' : 'Notice unavailable';

  return (
    <section aria-label="Eligibility Notice" className="mb-6">
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-3"
        style={{ color: 'var(--civic-text-secondary)' }}
      >
        Eligibility Notice
      </h3>

      {/* S-1: persistent live region always in DOM so announcements fire on content swap */}
      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <div
            className="border rounded-md p-6 flex items-center gap-3"
            style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin shrink-0"
              style={{ borderColor: 'var(--civic-accent-solid)', borderTopColor: 'transparent' }}
              aria-hidden="true"
            />
            <span className="text-sm" style={{ color: 'var(--civic-text-secondary)' }}>
              Loading notice…
            </span>
          </div>
        )}

        {showError && (
          <div
            className="border rounded-md p-6 text-center"
            style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
          >
            <FileText
              aria-hidden="true"
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: 'var(--civic-text-placeholder)' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--civic-text-primary)' }}>
              {errorHeadline}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--civic-text-secondary)' }}>
              {errorMessage}
            </p>
          </div>
        )}

        {showEmpty && (
          <div
            className="border rounded-md p-6 text-center"
            style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
          >
            <FileText
              aria-hidden="true"
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: 'var(--civic-text-placeholder)' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--civic-text-primary)' }}>
              No notice generated yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--civic-text-secondary)' }}>
              The eligibility notice will appear here once the case is approved and processed.
            </p>
          </div>
        )}

        {showPdf && (
          <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--civic-border-subtle)' }}>
            <iframe
              src={pdfUrl!}
              title={NOTICE_TITLE}
              className="w-full block"
              style={{ height: '480px', border: 'none' }}
              aria-label={`${NOTICE_TITLE} PDF viewer`}
            />
            <div
              className="flex items-center justify-between px-4 py-2.5 border-t"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
              }}
            >
              <span className="text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
                {NOTICE_TITLE}
              </span>
              {/* S-4: `download` is silently ignored on cross-origin URLs; open in new tab instead */}
              <a
                href={pdfUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors"
                style={{
                  color: 'var(--civic-accent-solid)',
                  borderColor: 'var(--civic-accent-solid)',
                  backgroundColor: 'transparent',
                }}
                aria-label={`Open ${NOTICE_TITLE} PDF`}
              >
                <Download aria-hidden="true" className="w-3.5 h-3.5" />
                Open PDF
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function DocumentsTab({ caseRow }: DrawerTabProps) {
  const docs = useMemo(() => documentsForCase(caseRow.id), [caseRow.id]);
  const [filterId, setFilterId] = useState<string>(ALL_BUCKET_ID);
  const [viewing, setViewing] = useState<CaseDocument | null>(null);

  const activeBucket = FILTER_BUCKETS.find((b) => b.id === filterId) ?? FILTER_BUCKETS[0]!;
  const filteredDocs = useMemo(() => docs.filter(activeBucket.match), [docs, activeBucket]);

  return (
    <div>
      {/* ENG-1726: Eligibility notice viewer — queries via Apollo on mount */}
      <EligibilityNoticeSection caseId={caseRow.id} />

      {/* Divider between notice and applicant documents */}
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-3"
        style={{ color: 'var(--civic-text-secondary)' }}
      >
        Applicant Documents
      </h3>

      {docs.length === 0 && (
        <div
          className="border rounded-md p-12 text-center"
          style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
        >
          <FileText
            aria-hidden="true"
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'var(--civic-text-placeholder)' }}
          />
          <p className="text-sm font-medium" style={{ color: 'var(--civic-text-primary)' }}>
            No documents on file yet
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--civic-text-secondary)' }}>
            Documents uploaded by the applicant or attached by a caseworker will appear here.
          </p>
        </div>
      )}

      {docs.length > 0 && (
        <>
          {/* Filter row */}
          <div role="group" aria-label="Filter documents by type" className="flex items-center gap-1.5 mb-4 flex-wrap">
            {FILTER_BUCKETS.map((bucket) => {
              const count = bucket.id === ALL_BUCKET_ID ? docs.length : docs.filter(bucket.match).length;
              if (count === 0 && bucket.id !== ALL_BUCKET_ID) return null;
              const isActive = filterId === bucket.id;
              return (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => setFilterId(bucket.id)}
                  aria-pressed={isActive}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                  style={
                    isActive
                      ? {
                          backgroundColor: 'var(--civic-accent-solid)',
                          color: 'var(--civic-accent-contrast, #ffffff)',
                          borderColor: 'transparent',
                        }
                      : {
                          backgroundColor: 'var(--civic-bg-card)',
                          borderColor: 'var(--civic-border-subtle)',
                          color: 'var(--civic-text-secondary)',
                        }
                  }
                >
                  {bucket.label} <span className="opacity-70 ml-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Document grid */}
          {filteredDocs.length === 0 ? (
            <div
              className="border rounded-md p-8 text-center text-xs"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-secondary)',
              }}
            >
              No documents match this filter.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
              {filteredDocs.map((doc) => {
                const pill = STATUS_PILL[doc.status];
                const PillIcon = pill.icon;
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(doc)}
                      aria-label={`Open document ${doc.name}`}
                      className="w-full text-left border rounded-md p-4 flex gap-3 transition-colors"
                      style={{
                        backgroundColor: 'var(--civic-bg-card)',
                        borderColor: 'var(--civic-border-subtle)',
                        color: 'var(--civic-text-primary)',
                      }}
                    >
                      <div
                        className="w-10 h-12 border rounded-md flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--civic-bg-app)',
                          borderColor: 'var(--civic-border-subtle)',
                        }}
                      >
                        <FileText
                          aria-hidden="true"
                          className="w-5 h-5"
                          style={{ color: 'var(--civic-text-secondary)' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium text-[13px] truncate"
                          style={{ color: 'var(--civic-text-primary)' }}
                        >
                          {doc.name}
                        </div>
                        <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--civic-text-secondary)' }}>
                          {doc.relatedTo ?? doc.summary ?? doc.uploadedBy}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                            style={{ backgroundColor: pill.bg, color: pill.fg, borderColor: pill.border }}
                          >
                            <PillIcon aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
                            {pill.label}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--civic-text-placeholder)' }}>
                            {doc.ext.toUpperCase()} · {doc.size}
                          </span>
                        </div>
                        <div className="text-[10px] mt-1.5" style={{ color: 'var(--civic-text-placeholder)' }}>
                          {doc.uploadedAt} · {doc.uploadedBy}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Viewer modal — `doc=null` closes; the Dialog primitive handles
          ESC, backdrop dismiss, and focus. */}
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
