/**
 * Canonical State-X eligibility team roster.
 *
 * Single source of truth for the people who appear on caseworker and manager
 * screens: dashboard assignee column, reassign modal dropdown, team overview,
 * settings users list, reporting leaderboard, broadcast authors, sidebar
 * caseworker identity, etc. Every mock data file should reference these
 * records rather than inlining names, so role/email/caseload edits propagate
 * everywhere.
 *
 * Roster shape: 1 manager + 1 supervisor + 6 caseworkers. Sarah Mitchell is
 * the default signed-in caseworker per the storyboard convention.
 *
 * When the seeded admin/caseworker accounts in admin-identity-service grow,
 * keep the emails here in sync — the canonical manager is `david.chen@state-x.gov`.
 */

export type TeamRole = 'manager' | 'supervisor' | 'caseworker';

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: TeamRole;
  caseLoad: number;
  /** ISO date of hire — used for tenure displays in Team Overview / Settings. */
  hiredOn: string;
}

function member(
  id: string,
  firstName: string,
  lastName: string,
  role: TeamRole,
  caseLoad: number,
  hiredOn: string,
): TeamMember {
  return {
    id,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@state-x.gov`,
    role,
    caseLoad,
    hiredOn,
  };
}

export const TEAM = {
  david: member('david', 'David', 'Chen', 'manager', 0, '2019-04-08'),
  lisa: member('lisa', 'Lisa', 'Morgan', 'supervisor', 24, '2020-09-14'),
  sarah: member('sarah', 'Sarah', 'Mitchell', 'caseworker', 68, '2021-02-22'),
  thomas: member('thomas', 'Thomas', 'Park', 'caseworker', 71, '2021-06-01'),
  priya: member('priya', 'Priya', 'Desai', 'caseworker', 65, '2022-01-18'),
  aisha: member('aisha', 'Aisha', 'Williams', 'caseworker', 73, '2022-08-30'),
  daniel: member('daniel', 'Daniel', 'Reyes', 'caseworker', 58, '2023-03-13'),
  hannah: member('hannah', 'Hannah', 'Nakamura', 'caseworker', 62, '2024-05-07'),
} as const;

export type TeamMemberId = keyof typeof TEAM;

export const TEAM_ROSTER: TeamMember[] = Object.values(TEAM);

export const MANAGER = TEAM.david;
export const SUPERVISOR = TEAM.lisa;
export const CASEWORKERS: TeamMember[] = TEAM_ROSTER.filter((m) => m.role === 'caseworker');

/** Default signed-in caseworker when no auth context is present (storyboard convention). */
export const DEFAULT_CASEWORKER = TEAM.sarah;
