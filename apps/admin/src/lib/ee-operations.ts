/**
 * GraphQL operations for E&E (Eligibility & Enrollment) pages.
 *
 * Queries and mutations target the medicaid-ee-service subgraph.
 * Federation resolves household/person fields from household-service.
 */

import { gql } from '@apollo/client';
import type { TypedDocumentNode } from '@apollo/client';
import type {
  EECase,
  EECaseStatus,
  EECaseType,
  EEError,
  PersonRecord,
  EEDetermination,
  EEHouseholdMember,
  IdentityVerificationListSummary,
  VerifyAssistFlag,
} from '../types/ee';
import type { PaginationInfo } from '../types';

// List query narrowed types (match actual GQL selection)

type EEPersonListSummary = Pick<PersonRecord, 'personId' | 'firstName' | 'lastName'>;

export type EEHouseholdMemberListSummary = Pick<EEHouseholdMember, 'id' | 'role'> & {
  person: { personId: string } | null;
};

export type EEDeterminationListSummary = Pick<EEDetermination, 'id' | 'status' | 'category'> & {
  person: EEPersonListSummary | null;
};

export type EECaseListItem = Pick<EECase, 'id' | 'caseNumber' | 'status' | 'flagReason' | 'createdAt' | 'updatedAt'> & {
  household: { id: string; members: EEHouseholdMemberListSummary[] };
  determinations: EEDeterminationListSummary[];
  intakeData: Record<string, unknown> | null;
  identityVerification?: IdentityVerificationListSummary | null;
};

// Queries

export const LIST_EE_CASES_QUERY: TypedDocumentNode<
  {
    medicaidEeCases: {
      data: EECaseListItem[];
      pagination: PaginationInfo;
    };
  },
  {
    filter?: { status?: EECaseStatus; caseType?: EECaseType; householdId?: string };
    pagination?: { page?: number; limit?: number };
  }
> = gql`
  query ListEECases($filter: MedicaidEeCaseFilter, $pagination: PaginationInput) {
    medicaidEeCases(filter: $filter, pagination: $pagination) {
      data {
        id
        caseNumber
        status
        flagReason
        createdAt
        updatedAt
        household {
          id
          members {
            id
            role
            person {
              personId
            }
          }
        }
        intakeData
        determinations {
          id
          status
          category
          person {
            personId
            firstName
            lastName
          }
        }
        identityVerification {
          status
          subjectName
          determination {
            duplicate_enrollment
            payer_state
          }
          flag {
            status
          }
        }
      }
      pagination {
        currentPage
        totalPages
        totalCount
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

export const GET_EE_CASE_QUERY: TypedDocumentNode<{ medicaidEeCase: EECase | null }, { id: string }> = gql`
  query GetEECase($id: ID!) {
    medicaidEeCase(id: $id) {
      id
      customerId
      caseNumber
      caseType
      status
      statusReason
      notes
      flagReason
      intakeData
      documents {
        id
        caseId
        s3Key
        documentCategory
        createdAt
        fileName
        mimeType
        sizeBytes
        uploadedAt
        source
        url
      }
      ruleEvaluations
      rfiDetails {
        itemsRequested
        deadline
        noteToApplicant
        issuedAt
        issuedBy
      }
      documentId
      householdId
      linkedCaseId
      caseAssistNarrative
      createdAt
      updatedAt
      household {
        id
        customerId
        members {
          id
          role
          relationshipToHead
          startDate
          person {
            personId
          }
        }
      }
      incomeVerification {
        status
        employer {
          name
          logoUrl
        }
        employmentType
        incomeAnnual
        incomeMonthly
        hoursPerWeek
        payFrequency
        lastPaystubDate
        verifiedAt
      }
      assetVerification {
        status
        totalAssets
        accounts {
          institutionName
          accountType
          balance
        }
        verifiedAt
      }
      determinations {
        id
        customerId
        personId
        coverageGroup
        status
        category
        effectiveDate
        expirationDate
        denialReason
        notes
        determinedAt
        determinedBy
        person {
          personId
          policyId
          firstName
          lastName
          middleName
          suffix
          dateOfBirth
          preferredLanguage
          ssnLast4
          addresses {
            street
            city
            state
            zip
          }
          emails {
            value
          }
          phones {
            value
          }
        }
      }
      identityVerification {
        id
        provider
        status
        mode
        subjectName
        createdAt
        completedAt
        checks {
          name
          status
        }
        checksSummary
        traits {
          phone
          ssnLast4
          document {
            first_name
            middle_name
            last_name
            date_of_birth
            address_line1
            address_line2
            city
            state
            postal_code
            document_type
            issuing_state
            document_number_last4
            expiration_date
            gender
          }
        }
        determination {
          result
          duplicate_enrollment
          payer_state
          payer_state_name
          coverage {
            payer_id
            payer_name
            plan_status
            insurance_member_id
            policy_holder_first_name
            policy_holder_last_name
            coverage_start_date
          }
        }
        resolution
        proofDocument {
          id
          fileName
          mimeType
          sizeBytes
          uploadedAt
          url
        }
        flag {
          id
          type
          status
          assignee
          dispositionReason
          details
          notes {
            id
            author
            body
            createdAt
          }
          createdAt
          updatedAt
        }
      }
      caseAssist {
        recommendations {
          id
          type
          priority
          severity
          source
          title
          body
          rationale {
            summary
            citedFieldPaths
          }
          suggestedActions
        }
        narrative
        narrativeSource
        generatedAt
      }
    }
  }
`;

// Mutations

// ── Verify Assist flag (Case Assist panel) ──────────────────────────────────

export interface UpdateVerifyAssistFlagInput {
  flagId: string;
  status?: string;
  dispositionReason?: string;
  note?: string;
  assignee?: string;
}

export type UpdateVerifyAssistFlagResult = Pick<
  VerifyAssistFlag,
  'id' | 'status' | 'assignee' | 'dispositionReason' | 'notes' | 'updatedAt'
>;

export const UPDATE_VERIFY_ASSIST_FLAG_MUTATION: TypedDocumentNode<
  {
    updateVerifyAssistFlag: {
      flag: UpdateVerifyAssistFlagResult | null;
      errors: { code: string; message: string; field: string | null }[];
    };
  },
  { input: UpdateVerifyAssistFlagInput }
> = gql`
  mutation UpdateVerifyAssistFlag($input: UpdateVerifyAssistFlagInput!) {
    updateVerifyAssistFlag(input: $input) {
      flag {
        id
        status
        assignee
        dispositionReason
        notes {
          id
          author
          body
          createdAt
        }
        updatedAt
      }
      errors {
        code
        message
        field
      }
    }
  }
`;

export const APPROVE_EE_CASE_MUTATION: TypedDocumentNode<
  {
    approveMedicaidEeCase: {
      case: Pick<EECase, 'id' | 'status' | 'statusReason'> | null;
      errors: EEError[];
    };
  },
  { input: { id: string } }
> = gql`
  mutation ApproveEECase($input: CaseTransitionInput!) {
    approveMedicaidEeCase(input: $input) {
      case {
        id
        status
        statusReason
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

export const DENY_EE_CASE_MUTATION: TypedDocumentNode<
  {
    denyMedicaidEeCase: {
      case: Pick<EECase, 'id' | 'status' | 'statusReason'> | null;
      errors: EEError[];
    };
  },
  { input: { id: string; reason: string } }
> = gql`
  mutation DenyEECase($input: CaseTransitionWithReasonInput!) {
    denyMedicaidEeCase(input: $input) {
      case {
        id
        status
        statusReason
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

// Document Upload Mutations (document-service)

export const CREATE_DOCUMENT_MUTATION: TypedDocumentNode<
  {
    createDocument: {
      documentId: string | null;
      uploadUrl: string | null;
      s3Key: string | null;
      expiresAt: string | null;
      errors: { code: string; message: string; field: string | null }[];
    };
  },
  {
    input: {
      fileName: string;
      mimeType: string;
      fileType: string;
      documentPurpose: string;
      sensitivityLevel: string;
      retentionPolicy: string;
      sizeBytes: number;
      program: string;
    };
  }
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

export const CONFIRM_DOCUMENT_UPLOAD_MUTATION: TypedDocumentNode<
  {
    confirmDocumentUpload: {
      documentId: string | null;
      errors: { code: string; message: string; field: string | null }[];
    };
  },
  {
    input: {
      documentId: string;
      sizeBytes: number;
      checksumSha256: string;
    };
  }
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

// Case Creation Mutation

export const CREATE_EE_CASE_MUTATION: TypedDocumentNode<
  {
    createMedicaidEeCase: {
      case: Pick<EECase, 'id' | 'status' | 'caseNumber'> | null;
      errors: EEError[];
    };
  },
  {
    input: {
      householdId: string;
      caseType?: EECaseType;
      notes?: string;
      documentId?: string;
    };
  }
> = gql`
  mutation CreateEECase($input: CreateMedicaidEeCaseInput!) {
    createMedicaidEeCase(input: $input) {
      case {
        id
        status
        caseNumber
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

// Household Search Query (household-service)

export type HouseholdSearchItem = {
  id: string;
};

export const LIST_HOUSEHOLDS_QUERY: TypedDocumentNode<
  {
    householdList: {
      data: HouseholdSearchItem[];
      pagination: PaginationInfo;
    };
  },
  {
    customerId: string;
    pagination?: { page?: number; limit?: number };
  }
> = gql`
  query ListHouseholds($customerId: ID!, $pagination: PaginationInput) {
    householdList(customerId: $customerId, pagination: $pagination) {
      data {
        id
      }
      pagination {
        currentPage
        totalPages
        totalCount
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

export const RESOLVE_RFI_EE_CASE_MUTATION: TypedDocumentNode<
  {
    resolveMedicaidEeCaseRfi: {
      case: Pick<EECase, 'id' | 'status' | 'flagReason'> | null;
      errors: EEError[];
    };
  },
  {
    input: {
      id: string;
    };
  }
> = gql`
  mutation ResolveRfiEECase($input: ResolveMedicaidEeCaseRfiInput!) {
    resolveMedicaidEeCaseRfi(input: $input) {
      case {
        id
        status
        flagReason
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

export const ISSUE_RFI_EE_CASE_MUTATION: TypedDocumentNode<
  {
    issueMedicaidEeCaseRfi: {
      case: Pick<EECase, 'id' | 'status' | 'flagReason'> | null;
      errors: EEError[];
    };
  },
  {
    input: {
      id: string;
      itemsRequested: string[];
      deadline: string;
      noteToApplicant?: string | null;
    };
  }
> = gql`
  mutation IssueRfiEECase($input: IssueMedicaidEeCaseRfiInput!) {
    issueMedicaidEeCaseRfi(input: $input) {
      case {
        id
        status
        flagReason
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

// ENG-1726: eligibility notice query — backed by ENG-1725 approval hook via medicaid-ee-service
export type EligibilityNoticeErrorCode = 'NOT_FOUND' | 'STORAGE_FAILED' | 'INTERNAL_ERROR';

export interface EligibilityNoticeError {
  code: EligibilityNoticeErrorCode;
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

export const QUEUE_FOR_REVIEW_EE_CASE_MUTATION: TypedDocumentNode<
  {
    queueForReviewMedicaidEeCase: {
      case: Pick<EECase, 'id' | 'status' | 'statusReason'> | null;
      errors: EEError[];
    };
  },
  { input: { id: string } }
> = gql`
  mutation QueueForReviewEECase($input: CaseTransitionInput!) {
    queueForReviewMedicaidEeCase(input: $input) {
      case {
        id
        status
        statusReason
      }
      errors {
        code
        field
        message
      }
    }
  }
`;

// ── Argyle income verification mutations ────────────────────────────────────

export type ArgyleCaseInput = { input: { caseId: string } };

export const CREATE_ARGYLE_USER_MUTATION: TypedDocumentNode<
  {
    createArgyleUser: {
      success: boolean;
      errors: EEError[];
    };
  },
  ArgyleCaseInput
> = gql`
  mutation CreateArgyleUser($input: CreateArgyleUserInput!) {
    createArgyleUser(input: $input) {
      success
      errors {
        code
        field
        message
      }
    }
  }
`;

export const REQUEST_INCOME_VERIFICATION_MUTATION: TypedDocumentNode<
  {
    requestIncomeVerification: {
      success: boolean;
      errors: EEError[];
    };
  },
  ArgyleCaseInput
> = gql`
  mutation RequestIncomeVerification($input: RequestIncomeVerificationInput!) {
    requestIncomeVerification(input: $input) {
      success
      errors {
        code
        field
        message
      }
    }
  }
`;

export const GET_PAYROLL_LINK_TOKEN_MUTATION: TypedDocumentNode<
  {
    getPayrollLinkToken: {
      linkToken: string | null;
      errors: EEError[];
    };
  },
  ArgyleCaseInput
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

// ── Argyle asset verification mutations ─────────────────────────────────────

export const GET_BANKING_CONNECT_URL_MUTATION: TypedDocumentNode<
  {
    getArgyleBankingConnectUrl: {
      connectUrl: string | null;
      errors: EEError[];
    };
  },
  ArgyleCaseInput
> = gql`
  mutation GetBankingConnectUrl($input: GetBankingConnectUrlInput!) {
    getArgyleBankingConnectUrl(input: $input) {
      connectUrl
      errors {
        code
        field
        message
      }
    }
  }
`;

export const REQUEST_ASSET_VERIFICATION_MUTATION: TypedDocumentNode<
  {
    requestAssetVerification: {
      success: boolean;
      errors: EEError[];
    };
  },
  ArgyleCaseInput
> = gql`
  mutation RequestAssetVerification($input: RequestAssetVerificationInput!) {
    requestAssetVerification(input: $input) {
      success
      errors {
        code
        field
        message
      }
    }
  }
`;
