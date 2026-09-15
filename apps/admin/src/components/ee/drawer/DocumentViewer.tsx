/**
 * DocumentViewer — single-document modal opened from the drawer's
 * Documents tab. Renders the document's `previewText` on a paper-on-slate
 * surface, mirroring the storyboard's DocumentViewer.jsx paper treatment
 * but built on the app's `Dialog` primitive (which handles ESC, backdrop
 * dismissal, and focus management for us — we deliberately do NOT reach
 * for the drawer's `useFocusTrapAndRestore`, which is for the drawer
 * shell only).
 *
 * Storyboard parity:
 *   /Downloads/CMS Demo Storyboard/src/components/DocumentViewer.jsx.
 *
 * The storyboard's DocumentViewer expects rich `render` blocks
 * (letterhead / form / id-card / ledger) and reads from a global
 * `window.CASE_DOCUMENTS`. In this port we replace both: render blocks
 * collapse into the existing monospace `previewText` field on
 * `CaseDocument`, and the doc is passed in by prop (no module globals).
 *
 * Status pills use Civic CSS variables, matching the rest of the drawer
 * chrome. The paper surface intentionally keeps raw slate/Tailwind
 * classes — same split as components/ee/DocumentViewer.tsx: chrome is
 * Civic, paper evokes a scanned document.
 */

import { Download, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import type { CaseDocument, DocumentStatus } from '../../../data/documents';

export interface DocumentViewerProps {
  /** Document to render — when null/undefined the modal is closed. */
  doc: CaseDocument | null;
  /** Called when the user dismisses the modal (X / ESC / backdrop). */
  onClose: () => void;
}

interface PillSpec {
  bg: string;
  fg: string;
  border: string;
  label: string;
}

/**
 * Civic-token style map for each document status shown in the modal
 * header. Mirrors DocumentsTab's STATUS_PILL for visual sync; kept
 * separate to avoid importing the tab into the modal bundle.
 */
const STATUS_PILL: Record<DocumentStatus, PillSpec> = {
  verified: {
    bg: 'var(--civic-success-bg, var(--civic-jade-3, #e6f6ee))',
    fg: 'var(--civic-success-text)',
    border: 'var(--civic-jade-6, transparent)',
    label: 'Verified',
  },
  pending: {
    bg: 'var(--civic-warning-bg)',
    fg: 'var(--civic-warning-text)',
    border: 'var(--civic-amber-6, transparent)',
    label: 'Pending review',
  },
  rejected: {
    bg: 'var(--civic-destructive-bg, var(--civic-tomato-3, #fff0ee))',
    fg: 'var(--civic-destructive-text)',
    border: 'var(--civic-tomato-6, transparent)',
    label: 'Rejected',
  },
};

export function DocumentViewer({ doc, onClose }: DocumentViewerProps) {
  // Base UI's Dialog controls open state via `open` + `onOpenChange`;
  // a null `doc` is the closed state.
  const open = doc !== null;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) onClose();
  }

  if (!doc) return null;

  const pill = STATUS_PILL[doc.status];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(960px,calc(100vw-2rem))] max-h-[92vh] flex flex-col rounded-md border overflow-hidden"
        style={{
          backgroundColor: 'var(--civic-bg-card)',
          borderColor: 'var(--civic-border-subtle)',
          color: 'var(--civic-text-primary)',
        }}
        showCloseButton={false}
      >
        <DialogHeader
          className="px-5 py-4 border-b flex items-start gap-4"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
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
              strokeWidth={1.75}
            />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="font-semibold text-sm truncate" style={{ color: 'var(--civic-text-primary)' }}>
              {doc.name}
            </DialogTitle>
            <DialogDescription
              className="flex items-center gap-2 mt-1.5 flex-wrap text-xs"
              style={{ color: 'var(--civic-text-secondary)' }}
            >
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                style={{ backgroundColor: pill.bg, color: pill.fg, borderColor: pill.border }}
              >
                {pill.label}
              </span>
              <span>
                {doc.ext.toUpperCase()} · {doc.size}
                {doc.pages > 1 && ` · ${doc.pages} pages`}
              </span>
              {doc.relatedTo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{doc.relatedTo}</span>
                </>
              )}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 h-8 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                style={{
                  borderColor: 'var(--civic-border-subtle)',
                  color: 'var(--civic-text-primary)',
                  backgroundColor: 'var(--civic-bg-card)',
                }}
                data-slot="document-open-link"
              >
                <Download aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2} />
                Open original
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Mock rows have no bytes behind them.
                  window.alert('This sample document has no file to download.');
                }}
                className="px-2.5 h-8 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                style={{
                  borderColor: 'var(--civic-border-subtle)',
                  color: 'var(--civic-text-primary)',
                  backgroundColor: 'var(--civic-bg-card)',
                }}
              >
                <Download aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2} />
                Download
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Sub-meta strip */}
        <div
          className="px-5 py-2 border-b text-xs flex items-center gap-4 flex-wrap"
          style={{
            backgroundColor: 'var(--civic-bg-app)',
            borderColor: 'var(--civic-border-subtle)',
            color: 'var(--civic-text-secondary)',
          }}
        >
          <span>
            <span className="font-medium" style={{ color: 'var(--civic-text-primary)' }}>
              Uploaded by:
            </span>{' '}
            {doc.uploadedBy}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-medium" style={{ color: 'var(--civic-text-primary)' }}>
              When:
            </span>{' '}
            {doc.uploadedAt}
          </span>
        </div>

        {/* Paper viewport — intentional raw slate palette, mirrors the
            existing components/ee/DocumentViewer.tsx split (chrome=Civic,
            paper=slate). Keep this surface in sync with that file. */}
        <div className="flex-1 overflow-auto bg-slate-100 p-6">
          {doc.url ? (
            // Real file: images inline, PDFs in an iframe, anything else as a download link.
            <div
              className="mx-auto max-w-[900px] bg-white shadow-sm rounded-sm border border-slate-200 min-h-[480px] flex items-center justify-center"
              data-slot="document-preview"
            >
              {doc.mimeType?.startsWith('image/') ? (
                <img src={doc.url} alt={doc.name} className="max-w-full max-h-[70vh] object-contain" />
              ) : doc.mimeType === 'application/pdf' ? (
                <iframe src={doc.url} title={doc.name} className="w-full" style={{ height: '70vh', border: 'none' }} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-600">
                  <FileText aria-hidden="true" className="w-10 h-10 mb-3 text-slate-400" strokeWidth={1.5} />
                  <div className="text-sm font-medium text-slate-700">{doc.name}</div>
                  <div className="text-xs mt-1">{doc.mimeType ?? doc.ext.toUpperCase()} · {doc.size}</div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="mt-4 text-xs font-semibold underline">
                    Download to review
                  </a>
                </div>
              )}
            </div>
          ) : (
          <div className="mx-auto max-w-[720px] bg-white shadow-sm rounded-sm p-8 min-h-[480px] border border-slate-200">
            {doc.summary && (
              <div className="text-xs text-slate-600 italic mb-4 pb-3 border-b border-slate-200">{doc.summary}</div>
            )}
            {doc.previewText ? (
              <pre className="font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-[1.55]">
                {doc.previewText}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-600">
                <FileText aria-hidden="true" className="w-10 h-10 mb-3 text-slate-400" strokeWidth={1.5} />
                <div className="text-sm font-medium text-slate-700">{doc.name}</div>
                <div className="text-xs mt-1">
                  {doc.ext.toUpperCase()} · {doc.size} · {doc.pages} page{doc.pages === 1 ? '' : 's'}
                </div>
                <div className="mt-4 max-w-sm text-xs">
                  Preview not available for this document. The original file is attached to the case and can be
                  downloaded for review.
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between"
          style={{
            backgroundColor: 'var(--civic-bg-app)',
            borderColor: 'var(--civic-border-subtle)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
            {doc.url ? 'Original file on record — streamed from the case document store' : 'Document preview — paper representation of the file on record'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-8 rounded-md border text-xs font-medium transition-colors"
            style={{
              borderColor: 'var(--civic-border-subtle)',
              color: 'var(--civic-text-primary)',
              backgroundColor: 'var(--civic-bg-card)',
            }}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
