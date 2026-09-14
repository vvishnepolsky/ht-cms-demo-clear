import { config } from "../config.js";
import type { ClearSession, SessionStatus, VerificationImages } from "./types.js";

// Real CLEAR Verified API calls (Standard Integration). Only used when
// MOCK_CLEAR=false; the mock path never touches the network.
const CLEAR_BASE = "https://verified.clearme.com";

export interface ClearCreateResult {
  clearSessionId: string;
  token: string;
}

// Standard Integration call #1 — create a verification session.
export async function clearCreateSession(redirectUrl: string): Promise<ClearCreateResult> {
  const res = await fetch(`${CLEAR_BASE}/v1/verification_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.clearApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project_id: config.clearProjectId, redirect_url: redirectUrl }),
  });
  if (!res.ok) {
    throw new Error(`CLEAR create session failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, any>;
  const s = data.verification_session ?? data;
  return { clearSessionId: s.id, token: s.token };
}

export function clearHostedUrl(token: string): string {
  return `${CLEAR_BASE}/verify?token=${token}`;
}

// Standard Integration call #2 — poll the session for terminal status + traits.
export async function clearGetSession(clearSessionId: string): Promise<ClearSession | null> {
  const res = await fetch(`${CLEAR_BASE}/v1/verification_sessions/${clearSessionId}`, {
    headers: { Authorization: `Bearer ${config.clearApiKey}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`CLEAR get session failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, any>;
  const s = data.verification_session ?? data;
  return {
    id: s.id,
    status: normalizeStatus(s.status),
    checks: s.checks ?? [],
    traits: s.traits ?? null,
    images: extractImages(s),
  };
}

/**
 * Pass through whatever imagery CLEAR's session response carries. The Standard
 * Integration API redacts image bytes ("REDACTED") unless the project has
 * image entitlement; face_scan_preview is an opaque reference either way.
 */
function extractImages(s: Record<string, any>): VerificationImages | null {
  const doc = s.traits?.document ?? {};
  const usable = (v: unknown): string | null =>
    typeof v === "string" && v && v !== "REDACTED" ? v : null;
  const ref = usable(s.traits?.face_scan_preview ?? s.face_scan_preview ?? doc.face_scan_preview);
  const images: VerificationImages = {
    selfie: usable(s.selfie ?? s.traits?.selfie),
    // Real payloads carry these as traits siblings (traits.document_front),
    // not inside traits.document.
    document_front: usable(s.traits?.document_front ?? doc.document_front ?? s.document_front),
    document_back: usable(s.traits?.document_back ?? doc.document_back ?? s.document_back),
    face_scan_preview_ref: ref,
    source: "clear",
  };
  const hasAnything = images.selfie || images.document_front || images.document_back || images.face_scan_preview_ref;
  return hasAnything ? images : null;
}

function normalizeStatus(raw: string): SessionStatus {
  const v = (raw ?? "").toLowerCase();
  if (["success", "completed", "complete", "verified"].includes(v)) return "success";
  if (["failed", "failure", "rejected"].includes(v)) return "failed";
  if (["expired"].includes(v)) return "expired";
  if (["in_progress", "processing", "pending"].includes(v)) return "in_progress";
  return "awaiting_user";
}
