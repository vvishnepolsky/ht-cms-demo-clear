import { gql, type TypedDocumentNode } from '@apollo/client';

/*
 * GraphQL operation documents for the State-X demo resident app.
 *
 * These documents ARE the client↔server contract: apps/server's schema
 * (docs/api-contract.md) resolves exactly the operations declared here (plus
 * document-operations.ts). Auth is the resident session cookie + `x-app`,
 * sent by src/lib/apollo.ts — there are no GraphQL auth mutations.
 */

/* ------------------------------------------------------------------ */
/*  Shared field types                                                 */
/* ------------------------------------------------------------------ */

/** Shared payload error shape — structurally identical across all services. */
export interface PayloadError {
  code: string;
  message: string;
  field?: string | null;
}

/**
 * Client-side error codes for mutations that fail outside the GraphQL
 * payload-error contract (network failures, no-response). Backend-issued
 * codes come back as strings in PayloadError.code as-is.
 */
export const ERROR_CODES = {
  /** Fallback when no specific code applies (e.g. server returned no payload). */
  UNKNOWN: 'UNKNOWN',
  /** Network / transport failure before the request reached the server. */
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

/** Household-service specific alias (most mutations in this file are household-service). */
export type HouseholdError = PayloadError;

/* ------------------------------------------------------------------ */
/*  Identity-service person mutations                                  */
/* ------------------------------------------------------------------ */

export interface AddressInput {
  use: 'HOME' | 'WORK' | 'TEMP' | 'OLD' | 'BILLING';
  type: 'POSTAL' | 'PHYSICAL' | 'BOTH';
  line: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isPrimary?: boolean | null;
}

export interface PhoneInput {
  use: 'HOME' | 'WORK' | 'MOBILE' | 'TEMP' | 'OLD';
  value: string;
  isPrimary?: boolean | null;
}

export interface PersonEmailInput {
  value: string;
}

export interface UpdatePersonInput {
  personId: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  suffix?: string | null;
  preferredLanguage?: string | null;
  dateOfBirth?: string | null;
  ssn?: string | null;
  addresses?: AddressInput[] | null;
  phones?: PhoneInput[] | null;
  emails?: PersonEmailInput[] | null;
}

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  preferredLanguage?: string | null;
  dateOfBirth?: string | null;
  ssn?: string | null;
  addresses?: AddressInput[] | null;
  phones?: PhoneInput[] | null;
  emails?: PersonEmailInput[] | null;
}

export interface IdentityPerson {
  personId: string;
}

export interface IdentityMutationPayload {
  person: IdentityPerson | null;
  errors: PayloadError[];
}

export const UPDATE_PERSON_MUTATION: TypedDocumentNode<
  { updatePerson: IdentityMutationPayload },
  { input: UpdatePersonInput }
> = gql`
  mutation UpdatePerson($input: UpdatePersonInput!) {
    updatePerson(input: $input) {
      person {
        personId
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

export const CREATE_PERSON_MUTATION: TypedDocumentNode<
  { createPerson: IdentityMutationPayload },
  { input: CreatePersonInput }
> = gql`
  mutation CreatePerson($input: CreatePersonInput!) {
    createPerson(input: $input) {
      person {
        personId
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  Household                                                          */
/* ------------------------------------------------------------------ */

export type HouseholdMemberRole = 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER_ADULT' | 'OTHER_DEPENDENT';

export interface HouseholdMemberInput {
  personId: string;
  role: HouseholdMemberRole;
  relationshipToHead?: string | null;
  startDate: string; // ISO DateTime
}

export interface CreateHouseholdInput {
  customerId: string;
  members: HouseholdMemberInput[];
}

export interface AddHouseholdMemberInput {
  householdId: string;
  customerId: string;
  personId: string;
  role: HouseholdMemberRole;
  relationshipToHead?: string | null;
  startDate: string; // ISO DateTime
}

export interface HouseholdResult {
  id: string;
  customerId: string;
}

export const CREATE_HOUSEHOLD_MUTATION: TypedDocumentNode<
  {
    createHousehold: {
      household: HouseholdResult | null;
      errors: HouseholdError[];
    };
  },
  { input: CreateHouseholdInput }
> = gql`
  mutation CreateHousehold($input: CreateHouseholdInput!) {
    createHousehold(input: $input) {
      household {
        id
        customerId
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

export const ADD_HOUSEHOLD_MEMBER_MUTATION: TypedDocumentNode<
  {
    addHouseholdMember: {
      household: HouseholdResult | null;
      errors: HouseholdError[];
    };
  },
  { input: AddHouseholdMemberInput }
> = gql`
  mutation AddHouseholdMember($input: AddHouseholdMemberInput!) {
    addHouseholdMember(input: $input) {
      household {
        id
        customerId
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

export interface RemoveHouseholdMemberInput {
  householdId: string;
  personId: string;
  customerId: string;
}

export const REMOVE_HOUSEHOLD_MEMBER_MUTATION: TypedDocumentNode<
  {
    removeHouseholdMember: {
      household: HouseholdResult | null;
      errors: HouseholdError[];
    };
  },
  { input: RemoveHouseholdMemberInput }
> = gql`
  mutation RemoveHouseholdMember($input: RemoveHouseholdMemberInput!) {
    removeHouseholdMember(input: $input) {
      household {
        id
        customerId
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

export interface HouseholdMemberSummary {
  id: string;
  role: HouseholdMemberRole;
  relationshipToHead: string | null;
  person: { personId: string } | null;
}

export interface HouseholdSummary extends HouseholdResult {
  members: HouseholdMemberSummary[];
}

export const GET_HOUSEHOLD_QUERY: TypedDocumentNode<
  { household: HouseholdSummary | null },
  { id: string; customerId: string }
> = gql`
  query GetHousehold($id: ID!, $customerId: ID!) {
    household(id: $id, customerId: $customerId) {
      id
      customerId
      members {
        id
        role
        relationshipToHead
        person {
          personId
        }
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  CreateMedicaidEeCase                                               */
/* ------------------------------------------------------------------ */

export type MedicaidEeCaseStatus = 'PENDING_VERIFICATION' | 'IN_REVIEW' | 'APPROVED' | 'DENIED' | 'CANCELED';

export interface CreateMedicaidEeCaseInput {
  householdId: string;
  applicantPersonId: string;
  caseType?: 'INITIAL' | 'RENEWAL' | 'REDETERMINATION' | 'APPEAL';
  notes?: string | null;
  intakeData?: Record<string, unknown> | null;
  draftId?: string;
  /**
   * ENG-3015: proof uploads to promote to the customer bucket and link to the
   * created case. Replaced the flat `documentS3Keys: [String!]` — the server no
   * longer accepts that field, so sending it would be a GraphQL validation
   * error. Nothing in cms-demo populates this yet (no upload UI here); the
   * declaration tracks the server contract.
   */
  documents?: { s3Key: string; documentCategory: string }[];
  /**
   * CLEAR / Verify Assist verification to link to the case
   * (docs/api-contract.md: `extend input CreateMedicaidEeCaseInput { identityVerificationId: ID }`).
   * Optional — the server falls back to the caller's latest unlinked applicant verification.
   */
  identityVerificationId?: string;
}

export interface MedicaidEeCaseResult {
  id: string;
  customerId: string;
  caseNumber: string | null;
  status: MedicaidEeCaseStatus;
}

export const CREATE_MEDICAID_EE_CASE_MUTATION: TypedDocumentNode<
  {
    createMedicaidEeCase: {
      case: MedicaidEeCaseResult | null;
      errors: PayloadError[];
    };
  },
  { input: CreateMedicaidEeCaseInput }
> = gql`
  mutation CreateMedicaidEeCase($input: CreateMedicaidEeCaseInput!) {
    createMedicaidEeCase(input: $input) {
      case {
        id
        customerId
        caseNumber
        status
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  GetMedicaidEeCase                                                  */
/* ------------------------------------------------------------------ */

export interface MedicaidEeCaseRfiDetails {
  itemsRequested: string[];
  deadline: string;
  noteToApplicant: string | null;
}

export interface MedicaidEeCaseDeterminationDates {
  /** DeterminationStatus enum value (e.g. ELIGIBLE / INELIGIBLE / PENDING). */
  status: string;
  /** Coverage start. Set via coverageEffectiveDate() when eligible; null otherwise. */
  effectiveDate: string | null;
  /** Coverage end ≈ recertification due date. */
  expirationDate: string | null;
}

/**
 * Resident view of the CLEAR / Verify Assist verification linked to the case
 * (docs/api-contract.md `IdentityVerification`). Coverage details
 * (`determination.coverage`, `flag`) are staff-only and intentionally not
 * selected — residents only see that out-of-state coverage was found, where,
 * and how they responded.
 */
export interface CaseIdentityVerification {
  id: string;
  status: string;
  provider: string;
  completedAt: string | null;
  determination: {
    result: string;
    duplicate_enrollment: boolean;
    payer_state: string | null;
    payer_state_name: string | null;
  } | null;
  /** 'ended_submit_proof' | 'confirm_enrolled' | null */
  resolution: string | null;
}

/** A document on the resident's own case (proof of disenrollment, dashboard uploads). */
export interface MedicaidEeCaseDocumentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** e.g. proof-of-disenrollment | proof-of-residence */
  documentCategory: string;
  /** verify_assist | resident_upload */
  source: string;
  /** Same-origin URL streaming the bytes to the owner (cookie auth). */
  url: string;
}

export interface MedicaidEeCaseQueryResult {
  id: string;
  caseNumber: string | null;
  status: MedicaidEeCaseStatus;
  createdAt: string;
  updatedAt: string;
  rfiDetails: MedicaidEeCaseRfiDetails | null;
  documents: MedicaidEeCaseDocumentRecord[];
  /** ENG-1883: coverage-start (enrolledOn) + recert-due dates are derived from
   *  these on the dashboard. */
  determinations: MedicaidEeCaseDeterminationDates[];
  identityVerification: CaseIdentityVerification | null;
}

export const GET_MEDICAID_EE_CASE_QUERY: TypedDocumentNode<
  { medicaidEeCase: MedicaidEeCaseQueryResult | null },
  { id: string }
> = gql`
  query GetMedicaidEeCase($id: ID!) {
    medicaidEeCase(id: $id) {
      id
      caseNumber
      status
      createdAt
      updatedAt
      rfiDetails {
        itemsRequested
        deadline
        noteToApplicant
      }
      documents {
        id
        fileName
        mimeType
        sizeBytes
        uploadedAt
        documentCategory
        source
        url
      }
      determinations {
        status
        effectiveDate
        expirationDate
      }
      identityVerification {
        id
        status
        provider
        completedAt
        determination {
          result
          duplicate_enrollment
          payer_state
          payer_state_name
        }
        resolution
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  ListMyMedicaidEeCases — resolve the logged-in resident's own case */
/*  by their identity-service personId. Used by the dashboard to find */
/*  a case after login when sessionStorage has no submitted CASE_ID.  */
/* ------------------------------------------------------------------ */

export interface MyMedicaidEeCaseListItem {
  id: string;
  status: MedicaidEeCaseStatus;
  updatedAt: string;
}

export const LIST_MY_MEDICAID_EE_CASES_QUERY: TypedDocumentNode<
  { medicaidEeCases: { data: MyMedicaidEeCaseListItem[] } },
  { applicantPersonId: string }
> = gql`
  query ListMyMedicaidEeCases($applicantPersonId: ID!) {
    medicaidEeCases(filter: { applicantPersonId: $applicantPersonId }, pagination: { page: 1, limit: 1 }) {
      data {
        id
        status
        updatedAt
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  CreateDocument / ConfirmDocumentUpload (ENG-433)                  */
/* ------------------------------------------------------------------ */

export type DocumentFileType = 'PDF' | 'IMAGE' | 'SPREADSHEET' | 'CSV' | 'WORD_DOC' | 'OTHER';
export type DocumentPurpose =
  | 'VERIFICATION_CERTIFICATE'
  | 'INCOME_PROOF'
  | 'ID_VERIFICATION'
  | 'ELIGIBILITY_DOCUMENT'
  | 'ELIGIBILITY_NOTICE'
  | 'APPEAL_DOCUMENT'
  | 'OTHER';
export type DocumentSensitivityLevel = 'STANDARD' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DocumentRetentionPolicy = 'STANDARD_1_YEAR' | 'HIPAA_6_YEAR' | 'HIPAA_7_YEAR' | 'LEGAL_HOLD';
export type DocumentProgram = 'IOWA_MEDICAID_EE' | 'MISSOURI_SUN_BUCKS';

export interface DocumentError {
  code: string;
  message: string;
  field?: string | null;
}

export interface CreateDocumentInput {
  fileName: string;
  mimeType: string;
  fileType: DocumentFileType;
  documentPurpose: DocumentPurpose;
  sensitivityLevel: DocumentSensitivityLevel;
  retentionPolicy: DocumentRetentionPolicy;
  sizeBytes: number;
  program: DocumentProgram;
  programId?: string | null;
}

export const CREATE_DOCUMENT_MUTATION: TypedDocumentNode<
  {
    createDocument: {
      documentId: string | null;
      uploadUrl: string | null;
      s3Key: string | null;
      expiresAt: string | null;
      errors: DocumentError[];
    };
  },
  { input: CreateDocumentInput }
> = gql`
  mutation CreateDocument($input: CreateDocumentInput!) {
    createDocument(input: $input) {
      documentId
      uploadUrl
      s3Key
      expiresAt
      errors {
        code
        message
        field
      }
    }
  }
`;

export interface ConfirmDocumentUploadInput {
  documentId: string;
  sizeBytes: number;
  checksumSha256: string;
}

export const CONFIRM_DOCUMENT_UPLOAD_MUTATION: TypedDocumentNode<
  {
    confirmDocumentUpload: {
      documentId: string | null;
      errors: DocumentError[];
    };
  },
  { input: ConfirmDocumentUploadInput }
> = gql`
  mutation ConfirmDocumentUpload($input: ConfirmDocumentUploadInput!) {
    confirmDocumentUpload(input: $input) {
      documentId
      errors {
        code
        message
        field
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  ExtractDocumentFields (ENG-425)                                    */
/* ------------------------------------------------------------------ */

export type DocumentExtractionCategory =
  | 'APPLICATION_FORM'
  | 'INCOME_PAYSTUB'
  | 'INCOME_W2'
  | 'INCOME_1099'
  | 'INCOME_BENEFIT_LETTER'
  | 'IDENTITY_PHOTO_ID'
  | 'IDENTITY_PASSPORT'
  | 'ADDRESS_PROOF'
  | 'BANK_STATEMENT'
  | 'ENROLLMENT';

export interface ExtractedApplicationFormFields {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;
  ssn?: string | null;
  street?: string | null;
  apt?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ExtractedIncomeFields {
  employerName?: string | null;
  employeeName?: string | null;
  grossMonthlyIncome?: number | null;
  netMonthlyIncome?: number | null;
  payPeriod?: string | null;
  employerStreet?: string | null;
  employerCity?: string | null;
  employerState?: string | null;
  employerZip?: string | null;
}

export interface ExtractedAddressFields {
  street?: string | null;
  apt?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface ExtractedDocumentFields {
  applicationForm?: ExtractedApplicationFormFields | null;
  income?: ExtractedIncomeFields | null;
  address?: ExtractedAddressFields | null;
  confidence?: number | null;
  fullApplicationJson?: string | null;
}

export const EXTRACT_DOCUMENT_FIELDS_MUTATION: TypedDocumentNode<
  {
    extractDocumentFields: {
      fields: ExtractedDocumentFields | null;
      errors: PayloadError[];
    };
  },
  { input: { fileDataUrl: string; category: DocumentExtractionCategory } }
> = gql`
  mutation ExtractDocumentFields($input: ExtractDocumentFieldsInput!) {
    extractDocumentFields(input: $input) {
      fields {
        applicationForm {
          firstName
          lastName
          middleName
          dateOfBirth
          ssn
          street
          apt
          city
          state
          zip
          phone
          email
        }
        income {
          employerName
          employeeName
          grossMonthlyIncome
          netMonthlyIncome
          payPeriod
          employerStreet
          employerCity
          employerState
          employerZip
        }
        address {
          street
          apt
          city
          state
          zip
        }
        confidence
        fullApplicationJson
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  GetEligibilityNotice                                               */
/* ------------------------------------------------------------------ */

export interface EligibilityNoticeError {
  code: string;
  message: string;
}

export interface EligibilityNoticeResult {
  noticeUrl: string | null;
  documentId: string | null;
  errors: EligibilityNoticeError[];
}

export const GET_ELIGIBILITY_NOTICE_QUERY: TypedDocumentNode<
  { eligibilityNotice: EligibilityNoticeResult },
  { caseId: string }
> = gql`
  query GetEligibilityNotice($caseId: ID!) {
    eligibilityNotice(caseId: $caseId) {
      noticeUrl
      documentId
      errors {
        code
        message
      }
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  GetPayrollLinkToken (Argyle income verification — resident wizard)  */
/* ------------------------------------------------------------------ */

export interface ArgyleEeError {
  code: string;
  field?: string | null;
  message: string;
}

export const GET_PAYROLL_LINK_TOKEN_MUTATION: TypedDocumentNode<
  {
    getPayrollLinkToken: {
      linkToken: string | null;
      errors: ArgyleEeError[];
    };
  },
  { input: { caseId: string } }
> = gql`
  mutation GetPayrollLinkToken($input: GetPayrollLinkTokenInput!) {
    getPayrollLinkToken(input: $input) {
      linkToken
      errors {
        code
        field
        message
      }
    }
  }
`;
