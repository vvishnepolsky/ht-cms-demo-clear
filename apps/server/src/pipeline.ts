import { nanoid } from "nanoid";
import { audit } from "./audit.js";
import { config } from "./config.js";
import { db, now, toJson } from "./db.js";
import { enrichSession } from "./clear/demo-identity.js";
import { setPersonSsnLast4IfEmpty } from "./ee/persons.js";
import { normalizeClearTraits } from "./clear/normalize.js";
import { determine } from "./clear/rules.js";
import type { ClearSession } from "./clear/types.js";
import type { VerificationRow } from "./verifications.js";

// Shared completion pipeline — runs when the mock hosted flow completes or when
// a real-mode poll observes a terminal CLEAR status. Real runs keep CLEAR's
// actual traits/checks (normalized to the internal shape); the demo-identity
// overlay applies only in mock mode (no CLEAR behind it) or when
// DEMO_ENRICHMENT=true opts the sandbox into the deterministic storyline.
// Applicant/household → coverage rules + out-of-state flag.
export function completeVerification(
  row: VerificationRow,
  clearSession?: Pick<ClearSession, "checks" | "traits" | "images">,
): void {
  if (row.status === "success") return; // idempotent

  const session: ClearSession = {
    id: row.id,
    status: "success",
    checks: clearSession?.checks ?? [],
    traits: normalizeClearTraits(clearSession?.traits as Record<string, unknown> | null),
  };
  const images = clearSession?.images ?? null;
  const useDemoIdentity = config.mockClear || config.demoEnrichment;
  const completedAt = now();

  const enriched = useDemoIdentity ? enrichSession(session, row.role) : session;
  const coverage = enriched.traits?.health_insurance ?? null;
  const determination = determine(coverage);
  const doc = enriched.traits?.document;
  const subjectName = doc ? `${doc.first_name} ${doc.last_name}` : null;

  db.prepare(
    `UPDATE verifications
     SET status = 'success', completed_at = ?, subject_name = ?, checks = ?, traits = ?, determination = ?,
         images = COALESCE(?, images)
     WHERE id = ?`,
  ).run(
    completedAt,
    subjectName,
    toJson(enriched.checks),
    toJson(enriched.traits),
    toJson(determination),
    images ? toJson(images) : null,
    row.id,
  );
  audit("clear-pipeline", "system", "verification.completed", row.id, {
    role: row.role,
    result: determination.result,
  });

  const runId = `run_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO runs (id, verification_id, seq, type, status, determination, coverage, created_at)
     VALUES (?, ?, 1, 'initial', 'success', ?, ?, ?)`,
  ).run(runId, row.id, toJson(determination), toJson(coverage), completedAt);
  audit("clear-pipeline", "system", "run.recorded", row.id, { runId, seq: 1, type: "initial" });

  if (determination.duplicate_enrollment) {
    createFlagIfNoneOpen(row.id, row.external_ref, determination, "clear-pipeline", "system");
  }

  // The applicant's own verification carries their SSN (demo identity or real
  // CLEAR trait). Fill the person row's last-4 when it is still empty so the
  // caseworker sees it even before a case exists. Household-role verifications
  // describe someone else and never touch the primary's row.
  if (row.role === "applicant" && setPersonSsnLast4IfEmpty(row.user_id, enriched.traits?.ssn9?.slice(-4) ?? null)) {
    audit("clear-pipeline", "system", "person.ssn_last4_from_clear", row.user_id, { verificationId: row.id });
  }
}

// Single-open-flag-per-verification insert (monitoring runs / repeat
// completions must not flood the queue). Returns null if one is already open.
export function openFlag(
  verificationId: string,
  externalRef: string | null,
  type: string,
  details: Record<string, unknown>,
  actor: string,
  actorRole: string,
): { id: string } | null {
  const existing = db
    .prepare(`SELECT id FROM flags WHERE verification_id = ? AND status IN ('open','in_review') LIMIT 1`)
    .get(verificationId) as { id: string } | undefined;
  if (existing) return null;

  const flagId = `flag_${nanoid(10)}`;
  const at = now();
  db.prepare(
    `INSERT INTO flags (id, verification_id, external_ref, type, status, details, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, '[]', ?, ?)`,
  ).run(flagId, verificationId, externalRef, type, toJson(details), at, at);
  audit(actor, actorRole, "flag.created", verificationId, { flagId, type });
  return { id: flagId };
}

// Coverage flag (out-of-state Medicaid) — thin wrapper over openFlag, keeping the
// determination-shaped call site the applicant pipeline and admin rerun use.
export function createFlagIfNoneOpen(
  verificationId: string,
  externalRef: string | null,
  determination: ReturnType<typeof determine>,
  actor: string,
  actorRole: string,
): { id: string } | null {
  return openFlag(
    verificationId,
    externalRef,
    "out_of_state_medicaid",
    {
      coverage: determination.coverage,
      payer_state: determination.payer_state,
      payer_state_name: determination.payer_state_name,
    },
    actor,
    actorRole,
  );
}
