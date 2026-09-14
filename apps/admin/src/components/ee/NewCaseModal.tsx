/**
 * NewCaseModal -- Modal for creating a new E&E case with document upload.
 *
 * 3-step upload flow:
 *   1. createDocument (ELIGIBILITY_DOCUMENT, PHI, HIPAA_6_YEAR, MEDICAID_EE)
 *   2. PUT file to S3 via pre-signed URL
 *   3. confirmDocumentUpload (checksumSha256 skipped for V0)
 *   4. createMedicaidEeCase with the documentId
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button } from '../ui';
import {
  CREATE_DOCUMENT_MUTATION,
  CONFIRM_DOCUMENT_UPLOAD_MUTATION,
  CREATE_EE_CASE_MUTATION,
  LIST_HOUSEHOLDS_QUERY,
  LIST_EE_CASES_QUERY,
} from '../../lib/ee-operations';
import { useAdmin } from '../../lib/auth-store';

/**
 * Server-issued payload error codes mapped to static user-facing labels.
 * Per standards/security.md "Map code to static labels" — do not forward
 * `errors[0].message` from a GraphQL payload directly into the UI. The
 * fallback `_` entry covers codes we haven't enumerated yet.
 */
const ERROR_LABELS: Record<string, string> = {
  // createDocument
  UNSUPPORTED_FILE_TYPE: 'Unsupported file type. Please upload a PDF or image.',
  FILE_TOO_LARGE: 'File exceeds the size limit.',
  RATE_LIMIT_EXCEEDED: 'Too many uploads in a short time. Please wait and try again.',
  // confirmDocumentUpload
  CHECKSUM_MISMATCH: 'Upload integrity check failed. Please try again.',
  DOCUMENT_NOT_FOUND: 'The uploaded document was not found. Please re-upload.',
  // createMedicaidEeCase
  HOUSEHOLD_NOT_FOUND: 'The selected household could not be found. Please refresh and try again.',
  DUPLICATE_CASE: 'A case already exists for this household.',
  VALIDATION_ERROR: 'The request was invalid. Please check the form and try again.',
};

function errorLabel(code: string | undefined, fallback: string): string {
  if (code && ERROR_LABELS[code]) return ERROR_LABELS[code];
  return fallback;
}

const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff'];
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function mimeToFileType(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'IMAGE';
  return 'OTHER';
}

type UploadStep = 'idle' | 'creating-document' | 'uploading-s3' | 'confirming' | 'creating-case' | 'done' | 'error';

interface NewCaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCaseModal({ open, onOpenChange }: NewCaseModalProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState<UploadStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const admin = useAdmin();
  const customerId = admin?.customerId ?? '';

  const { data: householdsData, loading: householdsLoading } = useQuery(LIST_HOUSEHOLDS_QUERY, {
    variables: { customerId, pagination: { page: 1, limit: 50 } },
    skip: !customerId || !open,
  });

  const households = householdsData?.householdList?.data ?? [];

  // The design hides the household picker — always default to the first household.
  // Derived directly from query data; no state needed (no user selection path exists).
  const effectiveHouseholdId = households[0]?.id ?? '';

  const [createDocument] = useMutation(CREATE_DOCUMENT_MUTATION);
  const [confirmUpload] = useMutation(CONFIRM_DOCUMENT_UPLOAD_MUTATION);
  const [createCase] = useMutation(CREATE_EE_CASE_MUTATION, {
    refetchQueries: [LIST_EE_CASES_QUERY],
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setFile(null);
      setStep('idle');
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  }

  function validateFile(f: File): string | null {
    if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
      return `Unsupported file type: ${f.type || 'unknown'}. Accepted: PDF, JPEG, PNG, GIF, WebP, TIFF.`;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum: 25 MB.`;
    }
    if (f.size === 0) {
      return 'File is empty.';
    }
    return null;
  }

  function handleFileSelect(f: File) {
    const validationError = validateFile(f);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setFile(f);
    setErrorMessage(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length) setDragActive(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const validationError = validateFile(f);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
      setFile(f);
      setErrorMessage(null);
    }
  }, []);

  function removeFile() {
    setFile(null);
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (!file || !effectiveHouseholdId) return;

    setErrorMessage(null);

    try {
      setStep('creating-document');
      const createDocResult = await createDocument({
        variables: {
          input: {
            fileName: file.name,
            mimeType: file.type,
            fileType: mimeToFileType(file.type),
            documentPurpose: 'ELIGIBILITY_DOCUMENT',
            sensitivityLevel: 'PHI',
            retentionPolicy: 'HIPAA_6_YEAR',
            sizeBytes: file.size,
            program: 'MEDICAID_EE',
          },
        },
      });

      const docPayload = createDocResult.data?.createDocument;
      if (!docPayload || docPayload.errors.length > 0) {
        const code = docPayload?.errors[0]?.code;
        if (code) console.error('[NewCaseModal] createDocument payload error', { code });
        throw new Error(errorLabel(code, 'Failed to create document record.'));
      }

      const { documentId, uploadUrl } = docPayload;
      if (!documentId || !uploadUrl) {
        throw new Error('Missing document ID or upload URL from server.');
      }

      setStep('uploading-s3');
      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed (HTTP ${s3Response.status}). Please try again.`);
      }

      setStep('confirming');
      const confirmResult = await confirmUpload({
        variables: {
          input: {
            documentId,
            sizeBytes: file.size,
            // TODO(ENG-1678): compute real SHA-256 via crypto.subtle.digest on
            // the file ArrayBuffer and hex-encode the result. Zeroed-out hash
            // is a V0 demo shortcut — must be addressed before this app
            // handles real enrollee PHI data (HIPAA §164.312(c)(1) integrity).
            // The resident app's useDocumentUpload.ts:112 has the reference
            // implementation; lift to a shared util when fixing.
            checksumSha256: '0'.repeat(64),
          },
        },
      });

      const confirmPayload = confirmResult.data?.confirmDocumentUpload;
      if (!confirmPayload || confirmPayload.errors.length > 0) {
        const code = confirmPayload?.errors[0]?.code;
        if (code) console.error('[NewCaseModal] confirmDocumentUpload payload error', { code });
        throw new Error(errorLabel(code, 'Failed to confirm document upload.'));
      }

      setStep('creating-case');
      const caseResult = await createCase({
        variables: {
          input: {
            householdId: effectiveHouseholdId,
            documentId,
          },
        },
      });

      const casePayload = caseResult.data?.createMedicaidEeCase;
      if (!casePayload || casePayload.errors.length > 0) {
        const code = casePayload?.errors[0]?.code;
        if (code) console.error('[NewCaseModal] createMedicaidEeCase payload error', { code });
        throw new Error(errorLabel(code, 'Failed to create case.'));
      }

      const newCaseId = casePayload.case?.id;
      setStep('done');
      toast.success('Case created successfully');
      handleOpenChange(false);

      if (newCaseId) {
        navigate(`/ee/cases/${newCaseId}`);
      }
    } catch (err) {
      // The thrown errors above carry static, labelled messages (see
      // errorLabel + ERROR_LABELS). Surface those directly. For unexpected
      // throws (e.g. a non-Error thrown), use a static fallback.
      console.error('[NewCaseModal] upload flow error', { name: err instanceof Error ? err.name : typeof err });
      setStep('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    }
  }

  const isSubmitting = step !== 'idle' && step !== 'done' && step !== 'error';
  const canSubmit = !!file && !!effectiveHouseholdId && !isSubmitting;

  const stepLabels: Record<UploadStep, string> = {
    idle: '',
    'creating-document': 'Creating document record...',
    'uploading-s3': 'Uploading file...',
    confirming: 'Confirming upload...',
    'creating-case': 'Creating case...',
    done: 'Complete',
    error: 'Failed',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="p-0 gap-0"
        style={{ maxWidth: '42rem', width: 'calc(100% - 2rem)', padding: 0, gap: 0 }}
      >
        <DialogHeader
          className="px-6 py-4 border-b border-border space-y-0"
          style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
        >
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <DialogTitle className="!text-base !font-semibold">New Case — Document Upload</DialogTitle>
          <DialogDescription className="sr-only">
            Upload a State Medicaid application form, paystub, or ID document to start a new eligibility case.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-6" style={{ marginTop: 0 }}>
          {/* Dropzone */}
          {!file ? (
            <div
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              role="region"
              aria-label="Upload eligibility document"
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
                dragActive ? 'bg-primary/5 border-primary' : 'border-muted-foreground/25 bg-muted/20'
              }`}
            >
              {/* Upload icon in circle (matches storyboard's bg-card disc) */}
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full mb-4"
                style={{ backgroundColor: 'var(--civic-bg-card)' }}
                aria-hidden="true"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">
                {dragActive ? 'Drop file here' : 'Drag and drop application here'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">PDF, JPG, or PNG</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2 rounded-lg border text-sm font-medium bg-white hover:bg-muted/30 transition-colors"
                style={{
                  color: 'var(--civic-accent-solid)',
                  borderColor: 'var(--civic-accent-solid)',
                }}
              >
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleInputChange}
                className="hidden"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.size >= 1_000_000
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : `${(file.size / 1024).toFixed(0)} KB`}
                </p>
              </div>
              {!isSubmitting && (
                <button
                  onClick={removeFile}
                  className="rounded-sm p-1 hover:bg-muted transition-colors"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center mt-4">
            Supported: State Medicaid application forms, paystubs, ID documents
          </p>

          {/* Household loading / error state — kept inline so the backend mutation has a household. */}
          {!householdsLoading && !customerId && (
            <p className="text-xs text-destructive mt-2 text-center">
              Unable to load households. Please sign in again.
            </p>
          )}
          {!householdsLoading && customerId && households.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              No households found. Create a household first.
            </p>
          )}

          {/* Progress indicator */}
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stepLabels[step]}
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive mt-4">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border" style={{ marginTop: 0 }}>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                Parse Application <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
