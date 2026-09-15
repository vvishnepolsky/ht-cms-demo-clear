/**
 * Shared types for the CaseDetailsDrawer and its tab implementations.
 * Each tab consumes the full CaseDetailFixture (its slice is its own
 * concern) plus the chrome-level `caseRow` providing the GraphQL-fed
 * header data.
 */

import type { CaseDetailFixture } from '../../../data/case-details';
import type { CaseDocumentRecord } from '../../../types/ee';

export type DrawerTabId = 'application' | 'documents' | 'messages' | 'activity';

/**
 * Minimal slice of the medicaidEeCases row that the drawer chrome needs.
 * Kept loose to avoid coupling the drawer to the full Apollo type tree;
 * the DashboardPage adapts the GraphQL row down to this shape.
 */
export interface DrawerCaseRow {
  id: string;
  caseNumber: string | null;
  applicantName: string;
  status: string;
  flagReason: string | null;
  /**
   * Additional flag-badge values to render in the drawer header next to the
   * status pill. Mirrors the dashboard / CaseNavBar flag badges (DIS, RFI,
   * RENEWAL, etc.). When omitted, the drawer falls back to rendering just
   * `flagReason` as a single pill.
   */
  flags?: ReadonlyArray<string>;
  /** Real documents on the case (GraphQL `documents`), rendered by the Documents tab. */
  documents?: ReadonlyArray<CaseDocumentRecord>;
}

export interface DrawerTabProps {
  caseRow: DrawerCaseRow;
  details: CaseDetailFixture;
  /**
   * True when the case has real data to render — either a backend-derived
   * `eeCase` or a hand-authored fixture entry. False only when the drawer
   * would fall through to the demo default identity. Fixture-backed tabs
   * (Application Data, Messages & Notices) render an empty state instead
   * of someone else's data when this is false. The Documents tab pulls
   * from live backend data via `documentsForCase()` and the Activity Log
   * tab pulls from `GET_CASE_AUDIT_LOG`; both ignore this flag.
   *
   * Optional — defaults to true at the tab destructure site so consumers
   * outside the drawer chrome (e.g., CompletedCaseDetail) that always
   * render against real case data don't need to thread the flag through.
   */
  hasRealDetails?: boolean;
}
