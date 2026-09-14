import { Router, type Request, type Response } from "express";
import { audit } from "../audit.js";
import {
  appForRole,
  appFromRequest,
  clearSessionCookie,
  createSession,
  createUser,
  deleteSession,
  engagementIdFor,
  extendSession,
  findUserByEmail,
  getUser,
  roleAllowedInApp,
  SESSION_TTL_MS,
  sessionPayload,
  setSessionCookie,
  tokenPayload,
  toUser,
  verifyPassword,
  type AppKey,
} from "../auth.js";
import { CUSTOMER_ID } from "../config.js";
import { db, now } from "../db.js";
import { httpError } from "../http-error.js";

/**
 * identity-service shaped REST. Errors: `{ error, message, field }` — see the
 * error handler in index.ts, which switches shape for /api/auth and /api/enrollment.
 */
export const authRoutes = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRoutes.post("/api/auth/register", (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    httpError(400, "validation_error", "A valid email address is required.", "email");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    httpError(400, "validation_error", "Password must be between 8 and 128 characters.", "password");
  }
  if (typeof firstName !== "string" || !firstName.trim()) {
    httpError(400, "validation_error", "First name is required.", "firstName");
  }
  if (typeof lastName !== "string" || !lastName.trim()) {
    httpError(400, "validation_error", "Last name is required.", "lastName");
  }
  if (findUserByEmail(email)) {
    httpError(409, "email_taken", "An account with that email already exists.", "email");
  }
  // Self-registration is resident-only. Staff accounts are seeded.
  const user = createUser({ role: "resident", email, password, firstName: firstName.trim(), lastName: lastName.trim() });
  audit(user.email, user.role, "auth.registered", user.id, {});
  res.status(201).json({ success: true, personId: user.id, identityId: `ident_${user.id}` });
});

authRoutes.post("/api/auth/login", (req: Request, res: Response) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    httpError(400, "invalid_credentials", "Email and password are required.");
  }
  const row = findUserByEmail(email);
  if (!row || !verifyPassword(password, row)) {
    httpError(401, "invalid_credentials", "Incorrect email or password.");
  }
  const requestedApp = appFromRequest(req);
  if (requestedApp && !roleAllowedInApp(row.role, requestedApp)) {
    httpError(
      403,
      "wrong_app",
      requestedApp === "cms-demo-resident"
        ? "This account cannot sign in to the resident portal."
        : "This account cannot sign in to the caseworker console.",
    );
  }
  const app: AppKey = requestedApp ?? appForRole(row.role);
  const user = toUser(row);
  const session = createSession(user.id);
  setSessionCookie(res, app, session.token);
  audit(user.email, user.role, "auth.login", user.id, { app });
  res.json({ success: true, payload: tokenPayload(user), session: sessionPayload(user, session) });
});

authRoutes.post("/api/auth/refresh", (_req: Request, res: Response) => {
  const token = res.locals.token as string | null;
  const user = res.locals.user;
  if (!token || !user) httpError(401, "unauthenticated", "No valid session.");
  const session = extendSession(token);
  if (!session) httpError(401, "unauthenticated", "No valid session.");
  const app = (res.locals.app as AppKey | null) ?? appForRole(user.role);
  setSessionCookie(res, app, session.token);
  res.json({
    success: true,
    payload: tokenPayload(user),
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
    session: { ...sessionPayload(user, session), aal: "AAL1" },
  });
});

authRoutes.post("/api/auth/logout", (_req: Request, res: Response) => {
  const token = res.locals.token as string | null;
  const user = res.locals.user;
  const app = (res.locals.app as AppKey | null) ?? (user ? appForRole(user.role) : null);
  if (token) deleteSession(token);
  if (app) clearSessionCookie(res, app);
  else {
    clearSessionCookie(res, "cms-demo-resident");
    clearSessionCookie(res, "cms-demo-admin");
  }
  if (user) audit(user.email, user.role, "auth.logout", user.id, {});
  res.json({ success: true });
});

authRoutes.get("/api/auth/me", (_req: Request, res: Response) => {
  res.json({ user: getUser(res) });
});

// No-op program enrollment record (the resident register flow calls it).
authRoutes.post("/api/enrollment", (req: Request, res: Response) => {
  const user = getUser(res);
  const { personId, program } = (req.body ?? {}) as Record<string, unknown>;
  const pid = typeof personId === "string" && personId ? personId : user.id;
  const prog = typeof program === "string" && program ? program : "MEDICAID";
  const existing = db
    .prepare(`SELECT id FROM engagements WHERE person_id = ? AND customer_id = ? AND program = ?`)
    .get(pid, CUSTOMER_ID, prog) as { id: string } | undefined;
  const id = existing?.id ?? engagementIdFor(pid);
  if (!existing) {
    db.prepare(
      `INSERT OR IGNORE INTO engagements (id, person_id, customer_id, program, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
    ).run(id, pid, CUSTOMER_ID, prog, now());
  }
  res.json({ success: true, engagement: { engagementId: id, personId: pid, customerId: CUSTOMER_ID, status: "ACTIVE" } });
});
