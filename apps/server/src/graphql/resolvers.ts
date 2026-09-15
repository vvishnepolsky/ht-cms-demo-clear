import {
  clearSessionCookie,
  createSession,
  createUser,
  deleteSession,
  extendSession,
  findUserByEmail,
  SESSION_TTL_MS,
  setSessionCookie,
  toUser,
  verifyPassword,
  type User,
} from "../auth.js";
import { config, CUSTOMER_ID } from "../config.js";
import { db, fromJson } from "../db.js";
import { ensureCaseAssist, kickOffCaseAssist } from "../case-assist/index.js";
import { checkPassed } from "../case-assist/rules.js";
import { curateChecks, summarizeChecks } from "../clear/check-curation.js";
import type { Determination as CoverageDetermination, SessionTraits, VerificationCheck } from "../clear/types.js";
import { queryMedicaidAudit, type AuditLogFilter } from "../ee/audit.js";
import {
  approveCase,
  argyleBankingConnectUrl,
  argyleCreateUser,
  argylePayrollLinkToken,
  argyleVerifyAssets,
  argyleVerifyIncome,
  cancelCase,
  CaseError,
  createCase,
  denyCase,
  determinationsForCase,
  getCaseRow,
  issueRfi,
  listCases,
  queueForReview,
  resolveRfi,
  toCase,
  toDetermination,
  type CaseFilter,
  type CaseRow,
  type CreateCaseInput,
  type EeCase,
} from "../ee/cases.js";
import {
  confirmDocumentUpload,
  createDocument,
  documentsForCase,
  getDocument,
  toCaseDocument,
  toProofDocument,
  type CreateDocumentInput,
} from "../ee/documents.js";
import {
  addHouseholdMember,
  createHousehold,
  getHousehold,
  householdMembers,
  HouseholdError,
  listHouseholds,
  removeHouseholdMember,
  type Household,
  type HouseholdMemberInput,
} from "../ee/households.js";
import { createPerson, getPerson, toPersonRecord, updatePerson, type PersonInput } from "../ee/persons.js";
import { FlagError, updateFlag } from "../flags.js";
import {
  primaryFlagForVerification,
  toFlag,
  verificationForCase,
  type VerificationRow,
} from "../verifications.js";
import { forbidden, requireStaffUser, requireUser, type GqlContext } from "./context.js";

// --- helpers ---------------------------------------------------------------------------

interface Pagination {
  page?: number | null;
  limit?: number | null;
}

function paginate(p: Pagination | null | undefined, defaultLimit = 20) {
  const page = Math.max(1, Math.floor(p?.page ?? 1));
  const limit = Math.min(200, Math.max(1, Math.floor(p?.limit ?? defaultLimit)));
  return { page, limit };
}

function paginationInfo(page: number, limit: number, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  return { currentPage: page, totalPages, totalCount, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

/** GraphQL view of a case row; the row is kept for lazy field resolvers. */
type CaseView = EeCase & { __row: CaseRow };

function caseView(row: CaseRow): CaseView {
  return { ...toCase(row), __row: row };
}

function householdView(hh: Household) {
  return { id: hh.id, customerId: hh.customerId, createdAt: hh.createdAt, updatedAt: hh.updatedAt };
}

function canSeeCase(user: User, staff: boolean, row: CaseRow): boolean {
  return staff || row.applicant_person_id === user.id;
}

function caseErrors(err: unknown) {
  if (err instanceof CaseError) return [{ code: err.code, message: err.message, field: err.field }];
  throw err;
}

function householdErrors(err: unknown) {
  if (err instanceof HouseholdError) return [{ code: err.code, message: err.message, field: err.field }];
  throw err;
}

function transitionPayload(fn: () => CaseRow) {
  try {
    return { case: caseView(fn()), errors: [] };
  } catch (err) {
    return { case: null, errors: caseErrors(err) };
  }
}

function caseForArgyle(ctx: GqlContext, caseId: string): { user: User; row: CaseRow } {
  const user = requireUser(ctx);
  const row = getCaseRow(caseId);
  if (!row) throw new CaseError("NOT_FOUND", "Case not found", "caseId");
  if (!canSeeCase(user, ctx.staff, row)) throw forbidden();
  return { user, row };
}

// --- identity verification projection ------------------------------------------------------

function identityVerificationView(row: VerificationRow, staff: boolean) {
  const traits = fromJson<SessionTraits>(row.traits);
  const doc = traits?.document ?? null;
  const det = fromJson<CoverageDetermination>(row.determination);
  const curated = curateChecks(fromJson<VerificationCheck[]>(row.checks) ?? []);
  const checks = curated.shown;
  const phone = traits?.phone?.number ?? null;
  const flagRow = staff ? primaryFlagForVerification(row.id) : undefined;
  return {
    id: row.id,
    provider: "CLEAR",
    status: row.status,
    mode: row.clear_session_id ? "sandbox" : "mock",
    subjectName: row.subject_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    checks: checks.map((c) => ({
      name: c.name,
      status: checkPassed(c) ? "success" : c.value === false ? "failed" : c.status,
    })),
    checksSummary: summarizeChecks(curated),
    traits: traits
      ? {
          document: doc
            ? {
                first_name: doc.first_name || null,
                middle_name: doc.middle_name,
                last_name: doc.last_name || null,
                date_of_birth: doc.dob || null,
                address_line1: doc.address_1 || null,
                address_line2: doc.address_2,
                city: doc.city || null,
                state: doc.subdivision || null,
                postal_code: doc.postal_code || null,
                document_type: doc.document_type || null,
                issuing_state: doc.issuing_subdivision || null,
                document_number_last4: doc.document_number ? doc.document_number.slice(-4) : null,
                expiration_date: doc.expiration_date || null,
                gender: doc.sex,
              }
            : null,
          phone,
          ssnLast4: traits.ssn9 ? traits.ssn9.slice(-4) : null,
        }
      : null,
    determination: det
      ? {
          result: det.result,
          duplicate_enrollment: det.duplicate_enrollment,
          payer_state: det.payer_state,
          payer_state_name: det.payer_state_name,
          coverage: staff && det.coverage ? det.coverage : null,
        }
      : null,
    resolution: row.resolution,
    proofDocument: (() => {
      const doc = row.proof_document_id ? getDocument(row.proof_document_id) : undefined;
      return doc ? toProofDocument(doc) : null;
    })(),
    flag: flagRow ? toFlag(flagRow) : null,
  };
}

// --- resolvers -------------------------------------------------------------------------------

export const resolvers = {
  Query: {
    me(_: unknown, __: unknown, ctx: GqlContext) {
      const u = ctx.user;
      if (!u) return null;
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        status: "ACTIVE",
        customerId: CUSTOMER_ID,
        role: u.role,
      };
    },

    residentMe(_: unknown, __: unknown, ctx: GqlContext) {
      return ctx.user && ctx.user.role === "resident" ? residentUser(ctx.user) : null;
    },

    person(_: unknown, args: { personId: string }, ctx: GqlContext) {
      const user = requireUser(ctx);
      if (!ctx.staff && args.personId !== user.id) throw forbidden();
      return getPerson(args.personId);
    },

    household(_: unknown, args: { id: string; customerId: string }, ctx: GqlContext) {
      requireUser(ctx);
      const hh = getHousehold(args.id);
      if (!hh) return null;
      if (!ctx.staff && !householdMembers(hh.id).some((m) => m.personId === ctx.user!.id)) throw forbidden();
      return householdView(hh);
    },

    householdList(_: unknown, args: { customerId: string; pagination?: Pagination | null }, ctx: GqlContext) {
      requireStaffUser(ctx);
      const { page, limit } = paginate(args.pagination);
      const { rows, total } = listHouseholds(page, limit);
      return { data: rows.map(householdView), pagination: paginationInfo(page, limit, total) };
    },

    medicaidEeCase(_: unknown, args: { id: string }, ctx: GqlContext) {
      const user = requireUser(ctx);
      const row = getCaseRow(args.id);
      if (!row) return null;
      if (!canSeeCase(user, ctx.staff, row)) throw forbidden();
      return caseView(row);
    },

    medicaidEeCases(_: unknown, args: { filter?: CaseFilter | null; pagination?: Pagination | null }, ctx: GqlContext) {
      const user = requireUser(ctx);
      const filter: CaseFilter = { ...(args.filter ?? {}) };
      // Residents only ever see their own cases, whatever filter they pass.
      if (!ctx.staff) filter.applicantPersonId = user.id;
      const { page, limit } = paginate(args.pagination);
      const { rows, total } = listCases(filter, page, limit);
      return { data: rows.map(caseView), pagination: paginationInfo(page, limit, total) };
    },

    medicaidAuditLog(_: unknown, args: { filter: AuditLogFilter; pagination?: Pagination | null }, ctx: GqlContext) {
      requireStaffUser(ctx);
      const { page, limit } = paginate(args.pagination, 50);
      return queryMedicaidAudit(args.filter, page, limit);
    },

    eligibilityNotice(_: unknown, args: { caseId: string }, ctx: GqlContext) {
      const user = requireUser(ctx);
      const row = getCaseRow(args.caseId);
      if (!row || !canSeeCase(user, ctx.staff, row)) {
        return { noticeUrl: null, documentId: null, errors: [{ code: "NOT_FOUND", message: "Case not found" }] };
      }
      if (row.status !== "APPROVED" && row.status !== "DENIED") {
        return {
          noticeUrl: null,
          documentId: null,
          errors: [{ code: "NOT_FOUND", message: "No eligibility notice has been generated for this case yet" }],
        };
      }
      return {
        noticeUrl: `${config.publicUrl}/api/cases/${row.id}/notice.pdf`,
        documentId: `notice_${row.id}`,
        errors: [],
      };
    },
  },

  Mutation: {
    // identity-service ------------------------------------------------------------------
    createPerson(_: unknown, args: { input: PersonInput & { firstName: string; lastName: string } }, ctx: GqlContext) {
      requireUser(ctx);
      if (!args.input.firstName?.trim() || !args.input.lastName?.trim()) {
        return {
          person: null,
          errors: [{ code: "VALIDATION_ERROR", message: "firstName and lastName are required", field: "firstName" }],
        };
      }
      return { person: createPerson(args.input), errors: [] };
    },

    updatePerson(_: unknown, args: { input: PersonInput & { personId: string } }, ctx: GqlContext) {
      const user = requireUser(ctx);
      const { personId, ...patch } = args.input;
      if (!ctx.staff && personId !== user.id) {
        // Residents may edit themselves and the members of their own household.
        const inOwnHousehold = householdsForPerson(user.id).some((hid) =>
          householdMembers(hid).some((m) => m.personId === personId),
        );
        if (!inOwnHousehold) throw forbidden();
      }
      const person = updatePerson(personId, patch);
      if (!person) return { person: null, errors: [{ code: "NOT_FOUND", message: "Person not found", field: "personId" }] };
      return { person, errors: [] };
    },

    // household-service --------------------------------------------------------------------
    createHousehold(_: unknown, args: { input: { customerId: string; members: HouseholdMemberInput[] } }, ctx: GqlContext) {
      const user = requireUser(ctx);
      try {
        if (!ctx.staff && !args.input.members.some((m) => m.personId === user.id)) {
          throw new HouseholdError("UNAUTHORIZED", "Residents must be a member of the household they create", "members");
        }
        return { household: householdView(createHousehold(args.input.members)), errors: [] };
      } catch (err) {
        return { household: null, errors: householdErrors(err) };
      }
    },

    addHouseholdMember(
      _: unknown,
      args: { input: HouseholdMemberInput & { householdId: string; customerId: string } },
      ctx: GqlContext,
    ) {
      const user = requireUser(ctx);
      try {
        assertHouseholdAccess(user, ctx.staff, args.input.householdId);
        const { householdId, customerId: _c, ...member } = args.input;
        return { household: householdView(addHouseholdMember(householdId, member)), errors: [] };
      } catch (err) {
        return { household: null, errors: householdErrors(err) };
      }
    },

    removeHouseholdMember(
      _: unknown,
      args: { input: { householdId: string; personId: string; customerId: string } },
      ctx: GqlContext,
    ) {
      const user = requireUser(ctx);
      try {
        assertHouseholdAccess(user, ctx.staff, args.input.householdId);
        return { household: householdView(removeHouseholdMember(args.input.householdId, args.input.personId)), errors: [] };
      } catch (err) {
        return { household: null, errors: householdErrors(err) };
      }
    },

    // medicaid-ee-service --------------------------------------------------------------------
    createMedicaidEeCase(_: unknown, args: { input: CreateCaseInput }, ctx: GqlContext) {
      const user = requireUser(ctx);
      try {
        const row = createCase(args.input, user);
        kickOffCaseAssist(row);
        return { case: caseView(row), errors: [] };
      } catch (err) {
        return { case: null, errors: caseErrors(err) };
      }
    },

    queueForReviewMedicaidEeCase(_: unknown, args: { input: { id: string } }, ctx: GqlContext) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => queueForReview(args.input.id, user));
    },

    approveMedicaidEeCase(_: unknown, args: { input: { id: string } }, ctx: GqlContext) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => approveCase(args.input.id, user));
    },

    denyMedicaidEeCase(_: unknown, args: { input: { id: string; reason: string } }, ctx: GqlContext) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => denyCase(args.input.id, args.input.reason, user));
    },

    cancelMedicaidEeCase(_: unknown, args: { input: { id: string; reason: string } }, ctx: GqlContext) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => cancelCase(args.input.id, args.input.reason, user));
    },

    issueMedicaidEeCaseRfi(
      _: unknown,
      args: { input: { id: string; itemsRequested: string[]; deadline: string; noteToApplicant?: string | null } },
      ctx: GqlContext,
    ) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => issueRfi(args.input, user));
    },

    resolveMedicaidEeCaseRfi(_: unknown, args: { input: { id: string; resolution?: string | null } }, ctx: GqlContext) {
      const user = requireStaffUser(ctx);
      return transitionPayload(() => resolveRfi(args.input, user));
    },

    // Argyle (mock) ----------------------------------------------------------------------------
    createArgyleUser(_: unknown, args: { input: { caseId: string } }, ctx: GqlContext) {
      try {
        caseForArgyle(ctx, args.input.caseId);
        argyleCreateUser(args.input.caseId);
        return { success: true, errors: [] };
      } catch (err) {
        return { success: false, errors: caseErrors(err) };
      }
    },

    getPayrollLinkToken(_: unknown, args: { input: { caseId: string } }, ctx: GqlContext) {
      try {
        caseForArgyle(ctx, args.input.caseId);
        return { linkToken: argylePayrollLinkToken(args.input.caseId).token, errors: [] };
      } catch (err) {
        return { linkToken: null, errors: caseErrors(err) };
      }
    },

    requestIncomeVerification(_: unknown, args: { input: { caseId: string } }, ctx: GqlContext) {
      try {
        const { user } = caseForArgyle(ctx, args.input.caseId);
        argyleVerifyIncome(args.input.caseId, user);
        return { success: true, errors: [] };
      } catch (err) {
        return { success: false, errors: caseErrors(err) };
      }
    },

    getArgyleBankingConnectUrl(_: unknown, args: { input: { caseId: string } }, ctx: GqlContext) {
      try {
        caseForArgyle(ctx, args.input.caseId);
        return { connectUrl: argyleBankingConnectUrl(args.input.caseId).url, errors: [] };
      } catch (err) {
        return { connectUrl: null, errors: caseErrors(err) };
      }
    },

    requestAssetVerification(_: unknown, args: { input: { caseId: string } }, ctx: GqlContext) {
      try {
        const { user } = caseForArgyle(ctx, args.input.caseId);
        argyleVerifyAssets(args.input.caseId, user);
        return { success: true, errors: [] };
      } catch (err) {
        return { success: false, errors: caseErrors(err) };
      }
    },

    // document-service (metadata only) -----------------------------------------------------------
    createDocument(_: unknown, args: { input: CreateDocumentInput }, ctx: GqlContext) {
      const user = requireUser(ctx);
      const doc = createDocument(user.id, args.input);
      return { ...doc, errors: [] };
    },

    confirmDocumentUpload(
      _: unknown,
      args: { input: { documentId: string; sizeBytes: number; checksumSha256: string } },
      ctx: GqlContext,
    ) {
      const user = requireUser(ctx);
      const doc = getDocument(args.input.documentId);
      if (!doc || (!ctx.staff && doc.owner_id !== user.id)) {
        return { documentId: null, errors: [{ code: "NOT_FOUND", message: "Document not found", field: "documentId" }] };
      }
      confirmDocumentUpload(doc.id, args.input.sizeBytes, args.input.checksumSha256);
      return { documentId: doc.id, errors: [] };
    },

    extractDocumentFields(_: unknown, _args: unknown, ctx: GqlContext) {
      requireUser(ctx);
      // Reducto is not wired in the demo: an empty extraction, never an error.
      return {
        fields: { applicationForm: null, income: null, address: null, confidence: null, fullApplicationJson: null },
        errors: [],
      };
    },

    requestDraftUploadUrl(
      _: unknown,
      args: { input: { draftId: string; sectionKey: string; documentCategory: string; mimeType: string; program: string } },
      ctx: GqlContext,
    ) {
      const user = requireUser(ctx);
      const doc = createDocument(user.id, {
        fileName: `${args.input.sectionKey}.${args.input.mimeType.split("/")[1] ?? "bin"}`,
        mimeType: args.input.mimeType,
        fileType: "OTHER",
        documentPurpose: args.input.documentCategory.toUpperCase().replace(/-/g, "_"),
        sensitivityLevel: "CONFIDENTIAL",
        retentionPolicy: "HIPAA_6_YEAR",
        sizeBytes: 0,
        program: args.input.program,
        programId: args.input.draftId,
      });
      return { uploadUrl: doc.uploadUrl, uploadFields: "{}", s3Key: doc.s3Key, expiresAt: doc.expiresAt, errors: [] };
    },

    // Verify Assist ------------------------------------------------------------------------------
    updateVerifyAssistFlag(
      _: unknown,
      args: { input: { flagId: string; status?: string | null; dispositionReason?: string | null; note?: string | null; assignee?: string | null } },
      ctx: GqlContext,
    ) {
      const user = requireStaffUser(ctx);
      try {
        const { flagId, ...patch } = args.input;
        return { flag: updateFlag(flagId, patch, user), errors: [] };
      } catch (err) {
        if (err instanceof FlagError) return { flag: null, errors: [{ code: err.code, message: err.message, field: err.field }] };
        throw err;
      }
    },

    // Resident GraphQL auth (parity with the resident operations file) --------------------------------
    loginResident(_: unknown, args: { input: { email: string; password: string } }, ctx: GqlContext) {
      const row = findUserByEmail(args.input.email ?? "");
      if (!row || !verifyPassword(args.input.password ?? "", row)) {
        return { resident: null, expiresIn: null, errors: [{ code: "INVALID_CREDENTIALS", message: "Incorrect email or password." }] };
      }
      if (row.role !== "resident") {
        return { resident: null, expiresIn: null, errors: [{ code: "WRONG_APP", message: "This account cannot sign in to the resident portal." }] };
      }
      const user = toUser(row);
      const session = createSession(user.id);
      setSessionCookie(ctx.res, "cms-demo-resident", session.token);
      return { resident: residentUser(user), expiresIn: Math.floor(SESSION_TTL_MS / 1000), errors: [] };
    },

    createResidentAccount(
      _: unknown,
      args: { input: { email: string; password: string; firstName: string; lastName: string } },
      ctx: GqlContext,
    ) {
      const { email, password, firstName, lastName } = args.input;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")) {
        return { resident: null, expiresIn: null, errors: [{ code: "VALIDATION_ERROR", message: "A valid email address is required." }] };
      }
      if (!password || password.length < 8 || password.length > 128) {
        return { resident: null, expiresIn: null, errors: [{ code: "VALIDATION_ERROR", message: "Password must be between 8 and 128 characters." }] };
      }
      if (!firstName?.trim() || !lastName?.trim()) {
        return { resident: null, expiresIn: null, errors: [{ code: "VALIDATION_ERROR", message: "First and last name are required." }] };
      }
      if (findUserByEmail(email)) {
        return { resident: null, expiresIn: null, errors: [{ code: "EMAIL_TAKEN", message: "An account with that email already exists." }] };
      }
      const user = createUser({ role: "resident", email, password, firstName: firstName.trim(), lastName: lastName.trim() });
      const session = createSession(user.id);
      setSessionCookie(ctx.res, "cms-demo-resident", session.token);
      return { resident: residentUser(user), expiresIn: Math.floor(SESSION_TTL_MS / 1000), errors: [] };
    },

    logoutResident(_: unknown, __: unknown, ctx: GqlContext) {
      if (ctx.token) deleteSession(ctx.token);
      clearSessionCookie(ctx.res, "cms-demo-resident");
      return { success: true, errors: [] };
    },

    refreshResidentToken(_: unknown, __: unknown, ctx: GqlContext) {
      return refreshPayload(ctx);
    },

    refreshToken(_: unknown, __: unknown, ctx: GqlContext) {
      return refreshPayload(ctx);
    },
  },

  // --- type resolvers ----------------------------------------------------------------------------

  Household: {
    members(hh: { id: string }) {
      return householdMembers(hh.id).map((m) => ({
        id: m.id,
        role: m.role,
        relationshipToHead: m.relationshipToHead,
        startDate: m.startDate,
        person: getPerson(m.personId) ?? { personId: m.personId, status: "ACTIVE", addresses: [], phones: [], emails: [], createdAt: "", updatedAt: "" },
      }));
    },
  },

  MedicaidEeCase: {
    household(c: CaseView) {
      const hh = getHousehold(c.householdId);
      return hh
        ? householdView(hh)
        : { id: c.householdId, customerId: c.customerId, createdAt: c.createdAt, updatedAt: c.updatedAt };
    },
    linkedCase(c: CaseView) {
      const row = c.linkedCaseId ? getCaseRow(c.linkedCaseId) : undefined;
      return row ? caseView(row) : null;
    },
    determinations(c: CaseView) {
      return determinationsForCase(c.id).map(toDetermination);
    },
    documents(c: CaseView) {
      return documentsForCase(c.id).map(toCaseDocument);
    },
    identityVerification(c: CaseView, _: unknown, ctx: GqlContext) {
      const row = verificationForCase(c.id);
      return row ? identityVerificationView(row, ctx.staff) : null;
    },
    async caseAssist(c: CaseView) {
      return ensureCaseAssist(c.__row);
    },
    caseAssistNarrative(c: CaseView) {
      return c.caseAssistNarrative;
    },
  },

  MedicaidEeDetermination: {
    person(d: { personId: string | null }) {
      const p = d.personId ? getPerson(d.personId) : null;
      return p ? toPersonRecord(p) : null;
    },
  },
};

// --- access helpers -----------------------------------------------------------------------------

function residentUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    customerId: CUSTOMER_ID,
    status: "ACTIVE",
    personId: user.id,
  };
}

function refreshPayload(ctx: GqlContext) {
  if (!ctx.token || !ctx.user) {
    return { expiresIn: null, errors: [{ code: "UNAUTHENTICATED", message: "No valid session." }] };
  }
  const session = extendSession(ctx.token);
  if (!session) return { expiresIn: null, errors: [{ code: "UNAUTHENTICATED", message: "No valid session." }] };
  setSessionCookie(ctx.res, ctx.app ?? (ctx.user.role === "resident" ? "cms-demo-resident" : "cms-demo-admin"), session.token);
  return { expiresIn: Math.floor(SESSION_TTL_MS / 1000), errors: [] };
}

function householdsForPerson(personId: string): string[] {
  return (db.prepare(`SELECT household_id FROM household_members WHERE person_id = ?`).all(personId) as Array<{
    household_id: string;
  }>).map((r) => r.household_id);
}

function assertHouseholdAccess(user: User, staff: boolean, householdId: string): void {
  if (staff) return;
  if (!getHousehold(householdId)) throw new HouseholdError("NOT_FOUND", "Household not found", "householdId");
  if (!householdMembers(householdId).some((m) => m.personId === user.id)) {
    throw new HouseholdError("UNAUTHORIZED", "Not a member of this household", "householdId");
  }
}
