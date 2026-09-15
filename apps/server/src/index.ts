import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { attachUser, ensureStaffSeeds, getUser, isStaff } from "./auth.js";
import { backfillOutOfStateCaseFlags } from "./ee/cases.js";
import { narrativeMode } from "./case-assist/narrative.js";
import { config, PKG_ROOT } from "./config.js";
import { determinationsForCase, getCaseRow } from "./ee/cases.js";
import { markUploadReceived } from "./ee/documents.js";
import { buildNoticePdf } from "./ee/notice.js";
import { getPerson } from "./ee/persons.js";
import { graphqlHandler } from "./graphql/index.js";
import { HttpError } from "./http-error.js";
import { adminRoutes } from "./routes/admin-routes.js";
import { authRoutes } from "./routes/auth-routes.js";
import { flowRoutes } from "./routes/flow-routes.js";
import { residentRoutes } from "./routes/resident-routes.js";

const app = express();
app.disable("x-powered-by");
// 12mb: the mock CLEAR capture step posts webcam selfie/ID stills inline.
app.use(express.json({ limit: "12mb" }));
app.use(attachUser);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    mode: config.mockClear ? "mock" : "sandbox",
    clearConfigured: config.clearConfigured,
    caseAssistNarrative: narrativeMode(),
  });
});

app.use(authRoutes);
app.use(residentRoutes);
app.use(flowRoutes);
app.use(adminRoutes);

// GraphQL (Apollo Router shaped). /api/graphql is an alias for clients that
// point their identity GraphQL client at this server.
app.post("/graphql", graphqlHandler);
app.post("/api/graphql", graphqlHandler);
app.get("/graphql", (_req: Request, res: Response) => {
  res.status(405).json({ errors: [{ message: "Use POST /graphql" }] });
});

// document-service data sink: accepts the presigned-style PUT and discards the bytes.
app.put("/api/uploads/:documentId", express.raw({ type: () => true, limit: "60mb" }), (req: Request, res: Response) => {
  const size = Buffer.isBuffer(req.body) ? req.body.length : Number(req.headers["content-length"] ?? 0);
  const ok = markUploadReceived(String(req.params.documentId), size);
  if (!ok) {
    res.status(404).json({ error: { code: "not_found", message: "Unknown document." } });
    return;
  }
  res.status(200).end();
});

// Eligibility notice PDF (owner or staff).
app.get("/api/cases/:id/notice.pdf", (req: Request, res: Response) => {
  const user = getUser(res);
  const row = getCaseRow(String(req.params.id));
  if (!row || (!isStaff(user) && row.applicant_person_id !== user.id)) {
    res.status(404).json({ error: { code: "not_found", message: "Case not found." } });
    return;
  }
  if (row.status !== "APPROVED" && row.status !== "DENIED") {
    res.status(404).json({ error: { code: "not_found", message: "No notice has been generated for this case." } });
    return;
  }
  const person = getPerson(row.applicant_person_id);
  const intake = row.intake_data ? (JSON.parse(row.intake_data) as Record<string, unknown>) : {};
  const applicantName =
    (typeof intake.applicantName === "string" && intake.applicantName) ||
    [person?.firstName, person?.lastName].filter(Boolean).join(" ") ||
    "Applicant";
  const dets = determinationsForCase(row.id);
  const primary = dets.find((d) => d.person_id === row.applicant_person_id) ?? dets[0];
  const approved = row.status === "APPROVED";
  const fmt = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "—");
  const pdf = buildNoticePdf([
    { text: "State-X Department of Health & Human Services", size: 14, bold: true },
    { text: "Medicaid Eligibility Notice", size: 18, bold: true, gap: 24 },
    { text: `Date: ${new Date().toISOString().slice(0, 10)}`, gap: 20 },
    { text: `Case number: ${row.case_number ?? row.id}` },
    { text: `Applicant: ${applicantName}` },
    { text: `Program: ${(typeof intake.requestedProgram === "string" && intake.requestedProgram) || "State Medicaid"}`, gap: 20 },
    { text: `Decision: ${approved ? "APPROVED" : "DENIED"}`, size: 13, bold: true, gap: 22 },
    ...(approved
      ? [
          { text: `Coverage group: ${primary?.coverage_group ?? "Medicaid"}` },
          { text: `Coverage effective: ${fmt(primary?.effective_date)}` },
          { text: `Certification period ends: ${fmt(primary?.expiration_date)}` },
          { text: "Your Medicaid card and managed care enrollment information will arrive separately.", gap: 22 },
        ]
      : [
          { text: `Reason: ${row.status_reason ?? primary?.denial_reason ?? "Eligibility requirements not met."}` },
          { text: "You have the right to appeal this decision within 90 days of the date of this notice.", gap: 22 },
        ]),
    { text: "Questions? Call 1-800-555-0199 (TTY 711) or visit your State-X resident portal.", gap: 20 },
  ]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="notice-${row.case_number ?? row.id}.pdf"`);
  res.send(pdf);
});

// Single-service deploy: serve each built SPA under its path prefix with an
// SPA fallback so client-side routes resolve. /api and /graphql stay out of
// the fallback so unmatched API calls still get the JSON 404 below.
if (config.serveStatic) {
  const repoRoot = resolve(PKG_ROOT, "..", "..");
  const mounts = [
    { prefix: "/admin", dir: "apps/admin/dist" },
    { prefix: "/verify", dir: "apps/verify/dist" },
    { prefix: "/", dir: "apps/resident/dist" },
  ];
  for (const m of mounts) {
    const dir = resolve(repoRoot, m.dir);
    if (!existsSync(dir)) {
      console.warn(`[static] ${m.dir} not built — skipping mount at ${m.prefix}`);
      continue;
    }
    app.use(m.prefix, express.static(dir));
    app.use(m.prefix, (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/graphql")) return next();
      res.sendFile(resolve(dir, "index.html"));
    });
  }
}

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: "not_found", message: "No such endpoint." } });
});

function isIdentityPath(path: string): boolean {
  return path.startsWith("/api/auth") || path.startsWith("/api/enrollment");
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    if (isIdentityPath(req.path)) {
      res.status(err.status).json({ error: err.code, message: err.message, field: err.field });
    } else {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    return;
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    // body-parser / malformed JSON etc.
    res.status(status).json({ error: { code: "bad_request", message: (err as Error).message ?? "Bad request." } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Something went wrong." } });
});

const seeded = ensureStaffSeeds();
const backfilled = backfillOutOfStateCaseFlags();
if (backfilled) console.log(`Backfilled out-of-state flag state on ${backfilled} case(s)`);
if (seeded.length) console.log(`Seeded staff users: ${seeded.join(", ")}`);

app.listen(config.port, () => {
  console.log(
    `State-X E&E demo server on http://localhost:${config.port} (CLEAR: ${config.mockClear ? "mock" : "sandbox"}, Case Assist narrative: ${narrativeMode()})`,
  );
});
