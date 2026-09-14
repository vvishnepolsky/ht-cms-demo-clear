import { nanoid } from "nanoid";
import { audit } from "./audit.js";
import type { User } from "./auth.js";
import { db, fromJson, now, toJson } from "./db.js";
import { medicaidAudit } from "./ee/audit.js";
import { syncOutOfStateCaseFlag } from "./ee/cases.js";
import { getFlagRow, getVerificationRow, toFlag, type Flag, type FlagNote, type FlagRow } from "./verifications.js";

/**
 * Flag workflow shared by the Verify Assist REST route (`PATCH /api/admin/flags/:id`)
 * and the GraphQL `updateVerifyAssistFlag` mutation.
 */

export class FlagError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

const FLAG_TRANSITIONS: Record<string, string[]> = {
  open: ["in_review", "resolved", "dismissed"],
  in_review: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

export interface FlagUpdateInput {
  status?: unknown;
  assignee?: unknown;
  dispositionReason?: unknown;
  note?: unknown;
}

export function updateFlag(flagId: string, input: FlagUpdateInput, actor: User): Flag {
  const row = getFlagRow(flagId);
  if (!row) throw new FlagError(404, "NOT_FOUND", "Flag not found.", "flagId");

  const { status, assignee, dispositionReason, note } = input;
  const changes: Record<string, string | boolean | null> = {};

  let nextStatus = row.status;
  if (status !== undefined && status !== null) {
    if (typeof status !== "string" || !(status in FLAG_TRANSITIONS)) {
      throw new FlagError(400, "VALIDATION_ERROR", "Unknown flag status.", "status");
    }
    if (status !== row.status) {
      if (!FLAG_TRANSITIONS[row.status].includes(status)) {
        throw new FlagError(
          400,
          "INVALID_STATUS_TRANSITION",
          `Cannot move a ${row.status} flag to ${status}.`,
          "status",
        );
      }
      nextStatus = status as FlagRow["status"];
      changes.status = status;
    }
  }

  let nextDisposition = row.disposition_reason;
  if (dispositionReason !== undefined && dispositionReason !== null) {
    if (typeof dispositionReason !== "string" || !dispositionReason.trim()) {
      throw new FlagError(400, "VALIDATION_ERROR", "Disposition reason must be a non-empty string.", "dispositionReason");
    }
    nextDisposition = dispositionReason.trim();
    changes.dispositionReason = nextDisposition;
  }
  if ((nextStatus === "resolved" || nextStatus === "dismissed") && !nextDisposition) {
    throw new FlagError(
      400,
      "VALIDATION_ERROR",
      "Resolving or dismissing a flag requires a disposition reason.",
      "dispositionReason",
    );
  }

  let nextAssignee = row.assignee;
  if (assignee !== undefined) {
    if (assignee !== null && typeof assignee !== "string") {
      throw new FlagError(400, "VALIDATION_ERROR", "Assignee must be a string or null.", "assignee");
    }
    nextAssignee = assignee;
    changes.assignee = assignee;
  }

  const notes = fromJson<FlagNote[]>(row.notes) ?? [];
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || !note.trim()) {
      throw new FlagError(400, "VALIDATION_ERROR", "Note must be a non-empty string.", "note");
    }
    notes.push({ id: `note_${nanoid(8)}`, author: actor.email, body: note.trim(), createdAt: now() });
    changes.note = true;
  }

  db.prepare(
    `UPDATE flags SET status = ?, assignee = ?, disposition_reason = ?, notes = ?, updated_at = ? WHERE id = ?`,
  ).run(nextStatus, nextAssignee, nextDisposition, toJson(notes), now(), row.id);
  audit(actor.email, actor.role, "flag.updated", row.verification_id, { flagId: row.id, ...changes });

  // Mirror onto the E&E case timeline when the verification is linked to a case.
  const verification = getVerificationRow(row.verification_id);
  if (verification?.case_id) {
    medicaidAudit({
      eventType: "RECORD_UPDATE",
      action: "VERIFY_ASSIST_FLAG_UPDATED",
      resourceType: "MedicaidEeCase",
      resourceId: verification.case_id,
      actorId: actor.id,
      metadata: {
        actorType: "CASEWORKER",
        flagId: row.id,
        flagType: row.type,
        fromStatus: row.status,
        toStatus: nextStatus,
        assignee: nextAssignee ?? undefined,
        noteAdded: changes.note === true,
      },
    });
    // Resolved/dismissed → drop the OOS-MCD chip + flagReason from the case
    // (the Case Assist narrative cache is keyed on status + recommendation ids,
    // so it regenerates on the next read). Reopening puts them back.
    if (changes.status !== undefined) {
      const open = nextStatus === "open" || nextStatus === "in_review";
      syncOutOfStateCaseFlag(verification.case_id, open, nextStatus, actor);
    }
  }

  return toFlag(getFlagRow(row.id)!);
}
