import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { NextFunction, Request, Response } from "express";
import { config, CUSTOMER_ID } from "./config.js";
import { db, now } from "./db.js";
import { ensurePersonForUser } from "./ee/persons.js";
import { httpError } from "./http-error.js";

export type Role = "resident" | "caseworker" | "admin";

/** Which SPA is calling — picks the cookie jar and the allowed roles. */
export type AppKey = "cms-demo-resident" | "cms-demo-admin";
export const APP_KEYS: readonly AppKey[] = ["cms-demo-resident", "cms-demo-admin"];

export interface User {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  role: Role;
  email: string;
  password_hash: string;
  password_salt: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
  };
}

export function isStaff(user: Pick<User, "role">): boolean {
  return user.role === "admin" || user.role === "caseworker";
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, row: UserRow): boolean {
  const { hash } = hashPassword(password, row.password_salt);
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.password_hash, "hex"));
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as UserRow | undefined;
}

export function findUserById(id: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createUser(args: {
  role: Role;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): User {
  const { hash, salt } = hashPassword(args.password);
  const row: UserRow = {
    id: `user_${nanoid(12)}`,
    role: args.role,
    email: args.email.toLowerCase(),
    password_hash: hash,
    password_salt: salt,
    first_name: args.firstName,
    last_name: args.lastName,
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO users (id, role, email, password_hash, password_salt, first_name, last_name, created_at)
     VALUES (@id, @role, @email, @password_hash, @password_salt, @first_name, @last_name, @created_at)`,
  ).run(row);
  const user = toUser(row);
  // identity-service parity: every account is also a Person (personId === user id).
  ensurePersonForUser(user);
  return user;
}

// --- sessions -----------------------------------------------------------------

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export function createSession(userId: string): Session {
  const token = nanoid(32);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    token,
    userId,
    createdAt,
    expiresAt,
  );
  return { token, userId, createdAt, expiresAt };
}

export function extendSession(token: string): Session | null {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const row = db
    .prepare(
      `UPDATE sessions SET expires_at = ? WHERE token = ? AND expires_at > ?
       RETURNING token, user_id, created_at, expires_at`,
    )
    .get(expiresAt, token, now()) as
    | { token: string; user_id: string; created_at: string; expires_at: string }
    | undefined;
  return row ? { token: row.token, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at } : null;
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function userForToken(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

// --- request → app / cookie / token -------------------------------------------

export function cookieName(app: AppKey): string {
  return `${app}_session`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Which app is calling. `x-app` is authoritative; without it we fall back to
 * the Referer/Origin (admin console at /admin or :5180, resident at / or :5181)
 * so the identity REST calls — whose ported client sends no custom header —
 * still land in the right cookie jar.
 */
export function appFromRequest(req: Request): AppKey | null {
  const header = req.headers["x-app"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && (APP_KEYS as readonly string[]).includes(raw)) return raw as AppKey;
  const ref = (req.headers.referer ?? req.headers.origin) as string | undefined;
  if (!ref) return null;
  try {
    const url = new URL(ref);
    if (url.pathname.startsWith("/admin") || url.port === "5180") return "cms-demo-admin";
    if (url.pathname.startsWith("/verify") || url.port === "5187") return null;
    // Everything else on a known origin is the resident portal (deploy root).
    return "cms-demo-resident";
  } catch {
    /* ignore */
  }
  return null;
}

export function appForRole(role: Role): AppKey {
  return role === "resident" ? "cms-demo-resident" : "cms-demo-admin";
}

export function roleAllowedInApp(role: Role, app: AppKey): boolean {
  return app === "cms-demo-resident" ? role === "resident" : role !== "resident";
}

/** Resolve the session token for this request: Bearer first, then the app cookie(s). */
export function tokenFromRequest(req: Request, app: AppKey | null): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const t = header.slice("Bearer ".length).trim();
    if (t) return t;
  }
  const cookies = parseCookies(req.headers.cookie);
  const order: AppKey[] = app ? [app] : ["cms-demo-resident", "cms-demo-admin"];
  for (const a of order) {
    const t = cookies[cookieName(a)];
    if (t && userForToken(t)) return t;
  }
  return null;
}

export function setSessionCookie(res: Response, app: AppKey, token: string): void {
  res.cookie(cookieName(app), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, app: AppKey): void {
  res.clearCookie(cookieName(app), { httpOnly: true, sameSite: "lax", secure: config.isProduction, path: "/" });
}

// --- middleware -----------------------------------------------------------------

export interface AuthLocals {
  user?: User;
  app: AppKey | null;
  token: string | null;
}

export function getUser(res: Response): User {
  const user = res.locals.user as User | undefined;
  if (!user) httpError(401, "unauthenticated", "Sign in required.");
  return user;
}

export function attachUser(req: Request, res: Response, next: NextFunction): void {
  const app = appFromRequest(req);
  const token = tokenFromRequest(req, app);
  res.locals.app = app;
  res.locals.token = token;
  if (token) {
    const user = userForToken(token);
    if (user) {
      // x-app role enforcement: a staff cookie presented to the resident app
      // (or vice versa) is rejected rather than silently accepted.
      if (app && !roleAllowedInApp(user.role, app)) {
        httpError(403, "wrong_app", "This account cannot be used with this app.");
      }
      res.locals.user = user;
    }
  }
  next();
}

export function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  getUser(res);
  next();
}

export function requireResident(_req: Request, res: Response, next: NextFunction): void {
  const user = getUser(res);
  if (user.role !== "resident") httpError(403, "forbidden", "Resident access only.");
  next();
}

export function requireStaff(_req: Request, res: Response, next: NextFunction): void {
  const user = getUser(res);
  if (!isStaff(user)) httpError(403, "forbidden", "Staff access only.");
  next();
}

// --- identity-service shaped payloads -------------------------------------------

export const STAFF_PERMISSIONS = [
  "cases:read",
  "cases:write",
  "audit_logs:read",
  "verify_assist:read",
  "verify_assist_flags:write",
];
export const RESIDENT_PERMISSIONS = ["my_cases:read"];

export function engagementIdFor(userId: string): string {
  return `eng_${userId}`;
}

export function tokenPayload(user: User) {
  const staff = isStaff(user);
  return {
    sub: user.id,
    customerId: CUSTOMER_ID,
    engagementId: engagementIdFor(user.id),
    programs: staff ? [] : ["MEDICAID"],
    policyId: `pol_${user.id}`,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: [user.role],
    permissions: staff ? STAFF_PERMISSIONS : RESIDENT_PERMISSIONS,
  };
}

export function sessionPayload(user: User, session: Session) {
  return {
    sessionId: session.token,
    personId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    customerId: CUSTOMER_ID,
    engagementId: engagementIdFor(user.id),
    programs: isStaff(user) ? [] : ["MEDICAID"],
    issuedAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: "active",
  };
}

// Idempotent staff seeds so `npm run dev` alone yields a usable admin console.
export const STAFF_SEEDS: Array<{ email: string; role: Role; firstName: string; lastName: string }> = [
  { email: "admin@state-x.gov", role: "admin", firstName: "David", lastName: "Chen" },
  { email: "caseworker@state-x.gov", role: "caseworker", firstName: "Maria", lastName: "Lopez" },
];
export const SEED_PASSWORD = "password1234";

export function ensureStaffSeeds(): string[] {
  const created: string[] = [];
  for (const seed of STAFF_SEEDS) {
    const existing = findUserByEmail(seed.email);
    if (!existing) {
      createUser({ ...seed, password: SEED_PASSWORD });
      created.push(seed.email);
    } else {
      ensurePersonForUser(toUser(existing));
    }
  }
  return created;
}
