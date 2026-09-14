/**
 * CaseHeader -- expandable case header card for the EE Case Workspace.
 *
 * Collapsed: shows case number, applicant name, age, location (city/state),
 * applied date, program badge, days-open badge, status badge, and toggle.
 *
 * Expanded: shows Personal Information, Contact & Address, Household Members,
 * Determinations, Case Metadata, and Caseworker Notes.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, Card, CardContent } from '../ui';
import { cn, fmtDate, formatCategory, caseDisplayNumber, toCalendarDate } from '../../lib/utils';
import { EEStatusBadge } from '../EEStatusBadge';
import { DetailsSection } from './DetailsSection';
import {
  UNKNOWN_APPLICANT,
  type EECase,
  type PersonRecord,
  type EEHouseholdMember,
  type EEDetermination,
} from '../../types/ee';

// Helpers

/** Calculate age from ISO date string. */
function calcAge(dob: string): number | null {
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Get the number of calendar days since a date. */
function daysOpen(isoDate: string): number {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T12:00:00`) : new Date(isoDate);
  const ms = d.getTime();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

function findPersonRecord(member: EEHouseholdMember, determinations: EEDetermination[]): PersonRecord | null {
  if (!member.person?.personId) return null;
  return determinations.find((d) => d.person?.personId === member.person?.personId)?.person ?? null;
}

/**
 * Build a PersonRecord-shaped fallback from `intakeData.householdMembers`
 * (populated by the wizard's `build-intake-data.ts`). Used when the
 * federated PersonRecord can't be resolved — typically true for cases
 * submitted by a freshly-registered resident before the rules engine has
 * created determinations with `personPolicyId` set.
 */
function intakeMemberByPersonId(
  intakeData: unknown,
  personId: string | null | undefined,
): Partial<PersonRecord> | null {
  if (!personId) return null;
  const intake = (intakeData ?? {}) as { householdMembers?: Array<Record<string, unknown>> };
  const match = intake.householdMembers?.find((m) => m?.personId === personId);
  if (!match) return null;
  return {
    personId,
    firstName: typeof match.firstName === 'string' ? match.firstName : undefined,
    lastName: typeof match.lastName === 'string' ? match.lastName : undefined,
    dateOfBirth: typeof match.dateOfBirth === 'string' ? match.dateOfBirth : undefined,
  } as Partial<PersonRecord>;
}

function resolveMemberPerson(
  member: EEHouseholdMember,
  determinations: EEDetermination[],
  intakeData: unknown,
): (Partial<PersonRecord> & { personId?: string | null }) | null {
  const fromDeterminations = findPersonRecord(member, determinations);
  if (fromDeterminations?.firstName && fromDeterminations?.lastName) return fromDeterminations;
  const fromIntake = intakeMemberByPersonId(intakeData, member.person?.personId);
  return fromIntake ?? fromDeterminations;
}

function getApplicant(
  members: EEHouseholdMember[],
  determinations: EEDetermination[],
  intakeData?: unknown,
): (Partial<PersonRecord> & { personId?: string | null }) | null {
  const head = members.find((m) => m.role === 'HEAD') ?? members[0];
  if (!head) return null;
  return resolveMemberPerson(head, determinations, intakeData);
}

// Household table

function HouseholdTable({
  members,
  determinations,
  intakeData,
}: {
  members: EEHouseholdMember[];
  determinations: EEDetermination[];
  intakeData?: unknown;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <caption className="sr-only">Household Members</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
              Name
            </th>
            <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
              Relation
            </th>
            <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
              DOB
            </th>
            <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
              Age
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((m) => {
            const person = resolveMemberPerson(m, determinations, intakeData);
            return (
              <tr key={m.id}>
                <td className="px-3 py-2 font-medium">
                  {person?.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : '--'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{m.relationshipToHead ?? m.role}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(person?.dateOfBirth)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {person?.dateOfBirth ? (calcAge(person.dateOfBirth) ?? '--') : '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Main component

export interface CaseHeaderProps {
  eeCase: EECase;
}

export function CaseHeader({ eeCase }: CaseHeaderProps) {
  const [expanded, setExpanded] = useState(false);

  const applicant = getApplicant(eeCase.household?.members ?? [], eeCase.determinations ?? [], eeCase.intakeData);
  const applicantName =
    applicant?.firstName && applicant.lastName ? `${applicant.firstName} ${applicant.lastName}` : UNKNOWN_APPLICANT;
  const age = applicant?.dateOfBirth ? calcAge(applicant.dateOfBirth) : null;
  const days = daysOpen(eeCase.createdAt);
  const category = eeCase.determinations?.[0]?.category;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Collapsed summary row */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
          aria-expanded={expanded}
          aria-controls={`case-header-details-${eeCase.id}`}
        >
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <span className="font-mono text-sm font-bold">{caseDisplayNumber(eeCase)}</span>
            <span className="text-sm font-medium text-primary">{applicantName}</span>
            {age !== null && <span className="text-xs text-muted-foreground">Age {age}</span>}
            <span className="text-xs text-muted-foreground">Applied {fmtDate(eeCase.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {category && (
              <Badge variant={category === 'MAGI' ? 'default' : 'secondary'} className="text-xs">
                {formatCategory(category)}
              </Badge>
            )}
            <Badge variant={days > 14 ? 'destructive' : 'outline'} className="text-xs">
              {days}d open
            </Badge>
            <EEStatusBadge status={eeCase.status} />
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </div>
        </button>

        {/* Expanded detail sections */}
        <div id={`case-header-details-${eeCase.id}`} hidden={!expanded} className="border-t px-5 py-5 space-y-6">
          {applicant && (
            <DetailsSection
              title="Personal Information"
              fields={[
                {
                  label: 'Full Name',
                  value: [applicant.firstName, applicant.middleName, applicant.lastName, applicant.suffix]
                    .filter(Boolean)
                    .join(' '),
                },
                { label: 'Date of Birth', value: fmtDate(applicant.dateOfBirth) },
                { label: 'Age', value: age !== null ? String(age) : '--' },
                { label: 'Preferred Language', value: applicant.preferredLanguage ?? '--' },
              ]}
            />
          )}

          {eeCase.household?.members && eeCase.household.members.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Household Members</h4>
              <HouseholdTable
                members={eeCase.household.members}
                determinations={eeCase.determinations ?? []}
                intakeData={eeCase.intakeData}
              />
            </div>
          )}

          {eeCase.determinations && eeCase.determinations.length > 0 && (
            <DetailsSection
              title="Determinations"
              fields={eeCase.determinations.map((d) => ({
                id: d.id,
                label: d.person?.firstName && d.person.lastName ? `${d.person.firstName} ${d.person.lastName}` : '—',
                value: (
                  <span>
                    <Badge
                      variant={
                        d.status === 'ELIGIBLE' ? 'default' : d.status === 'INELIGIBLE' ? 'destructive' : 'secondary'
                      }
                      className="text-xs mr-2"
                    >
                      {d.status}
                    </Badge>
                    {formatCategory(d.category)}
                    {d.effectiveDate && ` | Eff: ${fmtDate(toCalendarDate(d.effectiveDate))}`}
                    {d.denialReason && ` | Reason: ${d.denialReason}`}
                  </span>
                ),
              }))}
            />
          )}

          <DetailsSection
            title="Case Metadata"
            fields={[
              { label: 'Case Type', value: eeCase.caseType },
              { label: 'Status', value: eeCase.status.replace(/_/g, ' ') },
              { label: 'Status Reason', value: eeCase.statusReason ?? '--' },
              { label: 'Linked Case', value: eeCase.linkedCaseId ?? '--' },
              { label: 'Created', value: fmtDate(eeCase.createdAt) },
              { label: 'Updated', value: fmtDate(eeCase.updatedAt) },
            ]}
          />

          {eeCase.notes && (
            <div className="rounded-md bg-muted/50 p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Caseworker Notes</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{eeCase.notes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
