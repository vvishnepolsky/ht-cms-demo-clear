import { Card, CardContent } from '../ui';
import type { EECaseStatus } from '../../types/ee';
import type { RuleEvaluation } from './MagiRulesEngine';

interface NextStep {
  label: string;
  detail: string;
}

function deriveNextSteps(status: EECaseStatus, isNonMagi: boolean, rules: RuleEvaluation[]): NextStep[] {
  if (status === 'APPROVED') {
    return [
      {
        label: 'Determination issued',
        detail: 'Case is closed. Member eligibility letters will be generated automatically.',
      },
    ];
  }

  const hasFailures = rules.some((r) => r.status === 'FAILED');

  if (isNonMagi) {
    const incomePassed = rules.find((r) => r.ruleId === 'SX-NMAGI-INCOME-001')?.status === 'PASSED';
    const resourcesPassed = rules.find((r) => r.ruleId === 'SX-NMAGI-RESOURCES')?.status === 'PASSED';
    const abdPassed = rules.find((r) => r.ruleId === 'SX-NMAGI-001')?.status === 'PASSED';

    const steps: NextStep[] = [
      {
        label: 'Review ABD eligibility criteria',
        detail:
          incomePassed && resourcesPassed
            ? 'SSI income passes the $994/mo limit after $20 general income disregard. Resources pass the $2,000 limit.'
            : 'Verify income and resource documentation against Non-MAGI ABD eligibility limits.',
      },
    ];

    if (abdPassed || !hasFailures) {
      steps.push({
        label: 'Issue Non-MAGI ABD determination',
        detail: 'All automated checks passed. Approve Non-MAGI ABD Medicaid effective from the application date.',
      });
    } else {
      steps.push({
        label: 'Resolve failed eligibility checks',
        detail: 'One or more ABD criteria did not pass. Review the rules table above and gather missing documentation.',
      });
    }

    return steps;
  }

  if (status === 'PENDING_VERIFICATION') {
    return [
      {
        label: 'Resolve income discrepancy',
        detail: 'Review payroll records against self-reported income. Contact applicant if documentation is needed.',
      },
      {
        label: 'Issue an RFI if documentation is missing',
        detail: 'Use "Request Info" to send a formal Request for Information to the applicant with a deadline.',
      },
      {
        label: 'Queue for review after verification',
        detail: 'Once income is confirmed, move the case to IN_REVIEW status for final determination.',
      },
    ];
  }

  if (hasFailures) {
    return [
      {
        label: 'Resolve failed rule checks',
        detail: 'One or more MAGI eligibility rules failed. Review the rules table and gather missing documentation.',
      },
      {
        label: 'Issue an RFI or deny the case',
        detail: 'If documentation can resolve the failure, issue an RFI. Otherwise, proceed with denial.',
      },
    ];
  }

  return [
    {
      label: 'Review household composition and income',
      detail: 'Confirm all household members and income sources are accurate before issuing a determination.',
    },
    {
      label: 'Approve or deny the case',
      detail: 'All automated MAGI checks passed. Use the action bar below to issue a final determination.',
    },
  ];
}

export interface NextStepsPanelProps {
  status: EECaseStatus;
  isNonMagi: boolean;
  ruleEvaluations: RuleEvaluation[];
}

export function NextStepsPanel({ status, isNonMagi, ruleEvaluations }: NextStepsPanelProps) {
  const steps = deriveNextSteps(status, isNonMagi, ruleEvaluations);

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Next Steps</h3>
        <ol className="space-y-4">
          {steps.map((step, idx) => (
            <li key={step.label} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-0.5">
                {idx + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
