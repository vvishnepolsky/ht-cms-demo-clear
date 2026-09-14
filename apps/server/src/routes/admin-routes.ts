import { curateChecks } from "../clear/check-curation.js";
import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { audit, auditForSubject, recentAudit } from "../audit.js";
import { getUser, requireStaff } from "../auth.js";
import { determine } from "../clear/rules.js";
import type { SessionTraits } from "../clear/types.js";
import { db, fromJson, now, toJson } from "../db.js";
import { FlagError, updateFlag } from "../flags.js";
import { httpError } from "../http-error.js";
import { createFlagIfNoneOpen } from "../pipeline.js";
import {
  flagsForVerification,
  getVerificationRow,
  runsForVerification,
  toFlag,
  toRun,
  toVerification,
  type FlagRow,
  type RunRow,
  type VerificationRow,
} from "../verifications.js";

export const adminRoutes = Router();
adminRoutes.use("/api/admin", requireStaff);

adminRoutes.get("/api/admin/stats", (_req: Request, res: Response) => {
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  res.json({
    verifications: count(`SELECT COUNT(*) n FROM verifications`),
    completed: count(`SELECT COUNT(*) n FROM verifications WHERE status = 'success'`),
    openFlags: count(`SELECT COUNT(*) n FROM flags WHERE status IN ('open','in_review')`),
    applications: count(`SELECT COUNT(*) n FROM medicaid_ee_cases`),
  });
});

interface ListRow extends VerificationRow {
  flag_count: number;
  last_run_at: string | null;
}

adminRoutes.get("/api/admin/verifications", (req: Request, res: Response) => {
  const user = getUser(res);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  let rows = db
    .prepare(
      `SELECT v.*,
         (SELECT COUNT(*) FROM flags f WHERE f.verification_id = v.id
            AND f.status IN ('open', 'in_review')) AS flag_count,
         (SELECT MAX(r.created_at) FROM runs r WHERE r.verification_id = v.id) AS last_run_at
       FROM verifications v
       ORDER BY v.created_at DESC`,
    )
    .all() as ListRow[];

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = search.toLowerCase();
    const isLast4 = /^\d{4}$/.test(search);
    rows = rows.filter((r) => {
      if (r.subject_name?.toLowerCase().includes(q)) return true;
      if (r.external_ref?.toLowerCase().includes(q)) return true;
      if (isLast4) {
        const ssn9 = fromJson<SessionTraits>(r.traits)?.ssn9;
        if (ssn9?.endsWith(search)) return true;
      }
      return false;
    });
    audit(user.email, user.role, "admin.searched", "verifications", { search });
  }

  res.json({
    verifications: rows.map((r) => {
      const v = toVerification(r);
      return {
        id: v.id,
        externalRef: v.externalRef,
        caseId: v.caseId,
        subjectName: v.subjectName,
        role: v.role,
        status: v.status,
        flagCount: r.flag_count,
        lastRunAt: r.last_run_at,
        createdAt: v.createdAt,
      };
    }),
  });
});

adminRoutes.get("/api/admin/verifications/:id", (req: Request, res: Response) => {
  const user = getUser(res);
  const row = getVerificationRow(String(req.params.id));
  if (!row) httpError(404, "not_found", "Verification not found.");
  audit(user.email, user.role, "admin.viewed_verification", row.id, {});
  res.json({
    verification: toVerification(row),
    // Staff keep CLEAR's raw list; the curated identity view rides alongside.
    curatedChecks: curateChecks(toVerification(row).checks),
    clearSessionId: row.clear_session_id,
    // Biometric imagery is staff-only: only on this detail read.
    images: fromJson(row.images),
    runs: runsForVerification(row.id).map(toRun),
    flags: flagsForVerification(row.id).map(toFlag),
    audit: auditForSubject(row.id, 50),
  });
});

adminRoutes.post("/api/admin/verifications/:id/rerun", (req: Request, res: Response) => {
  const user = getUser(res);
  const row = getVerificationRow(String(req.params.id));
  if (!row) httpError(404, "not_found", "Verification not found.");
  if (row.status !== "success") {
    httpError(409, "not_completed", "Only completed verifications can be re-checked.");
  }

  // Demo monitoring run: re-evaluates the rules against the stored coverage.
  const coverage = fromJson<SessionTraits>(row.traits)?.health_insurance ?? null;
  const determination = determine(coverage);
  const seqRow = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM runs WHERE verification_id = ?`)
    .get(row.id) as { maxSeq: number };
  const runId = `run_${nanoid(10)}`;
  const at = now();
  db.prepare(
    `INSERT INTO runs (id, verification_id, seq, type, status, determination, coverage, created_at)
     VALUES (?, ?, ?, 'monitoring', 'success', ?, ?, ?)`,
  ).run(runId, row.id, seqRow.maxSeq + 1, toJson(determination), toJson(coverage), at);
  audit(user.email, user.role, "run.recorded", row.id, { runId, seq: seqRow.maxSeq + 1, type: "monitoring" });

  let flag: ReturnType<typeof toFlag> | null = null;
  if (determination.duplicate_enrollment) {
    const created = createFlagIfNoneOpen(row.id, row.external_ref, determination, user.email, user.role);
    if (created) {
      const flagRow = db.prepare(`SELECT * FROM flags WHERE id = ?`).get(created.id) as FlagRow;
      flag = toFlag(flagRow);
    }
  }

  const runRow = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow;
  res.status(201).json({ run: toRun(runRow), flag });
});

adminRoutes.get("/api/admin/flags", (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  let rows = db
    .prepare(
      `SELECT f.*, v.subject_name, v.case_id FROM flags f
       JOIN verifications v ON v.id = f.verification_id
       ORDER BY f.created_at DESC`,
    )
    .all() as Array<FlagRow & { subject_name: string | null; case_id: string | null }>;
  if (status) rows = rows.filter((r) => r.status === status);
  res.json({ flags: rows.map((r) => ({ ...toFlag(r), subjectName: r.subject_name, caseId: r.case_id })) });
});

adminRoutes.patch("/api/admin/flags/:id", (req: Request, res: Response) => {
  const user = getUser(res);
  try {
    const flag = updateFlag(String(req.params.id), (req.body ?? {}) as Record<string, unknown>, user);
    res.json({ flag });
  } catch (err) {
    if (err instanceof FlagError) httpError(err.status, err.code.toLowerCase(), err.message, err.field);
    throw err;
  }
});

adminRoutes.get("/api/admin/audit", (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  res.json({ entries: recentAudit(limit) });
});
