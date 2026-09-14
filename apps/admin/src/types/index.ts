/** Domain error returned by GraphQL mutation payloads. */
export interface DomainError {
  code: string;
  message: string;
}

/** Pagination info returned by list queries. */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
