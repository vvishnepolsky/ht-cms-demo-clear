/**
 * GraphQL operations for the document-service — State-X Medicaid EE.
 * Presigned upload URL for draft documents (ENG-754 / ENG-1313).
 */
import { gql } from '@apollo/client';
import type { TypedDocumentNode } from '@apollo/client';

export interface DocumentError {
  code: string;
  message: string;
}

export const REQUEST_DRAFT_UPLOAD_URL: TypedDocumentNode<
  {
    requestDraftUploadUrl: {
      uploadUrl: string | null;
      s3Key: string | null;
      expiresAt: string | null;
      errors: DocumentError[];
    };
  },
  {
    input: {
      draftId: string;
      sectionKey: string;
      documentCategory: string;
      mimeType: string;
      program: string;
    };
  }
> = gql`
  mutation RequestDraftUploadUrl($input: RequestDraftUploadUrlInput!) {
    requestDraftUploadUrl(input: $input) {
      uploadUrl
      s3Key
      expiresAt
      errors {
        code
        message
      }
    }
  }
`;
