// @ts-nocheck
import React, {
  useState,
  useEffect,
  useMemo,
  useContext,
  useRef,
  useLayoutEffect,
  Fragment,
  createContext,
} from 'react';
import { VerifiedControl } from './VerifiedChip';
import { PAY_FREQUENCY, computeMonthlyIncome } from './income-calc';
import {
  Icon,
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  RadioGroup,
  CheckboxGroup,
  YesNo,
  Alert,
  Stack,
  Panel,
  Avatar,
  ChoiceCard,
  QuestionRow,
  fmt$,
  fmtDate,
} from './ui';
import {
  useFormData,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
  FormDataContext,
} from './context';
import { computeEligibility, FPL_2026, PATHWAYS, lookupFPL, ageFrom, toMonthly, isApplyingAdult } from './eligibility';
import { INCOME_TYPE_SSI, INCOME_TYPE_SSDI } from './wizard-constants';
import { FileUpload } from './screens-e';
import { applyingPeople } from './screens-f';
import { useReductoExtract } from '../hooks/useReductoExtract';
import { DEMO_TODAY_ISO } from '../data/demoToday';
import { formatPhone, stripPhone } from '../lib/phone';
import { useMutation } from '@apollo/client/react';
import { GET_PAYROLL_LINK_TOKEN_MUTATION } from '../lib/operations';
import { SESSION_KEYS } from '../lib/session-keys';

/* =========================================================================
   Screens G — Employment loop (JobInfo Pattern B, JobHistory, JobSummary),
   IncomeInfo with per-type toggles, HealthInsurance with completion state.
   ========================================================================= */

// Module-level singleton: loads the Argyle Web SDK once on demand.
// Stored outside React so re-renders don't re-inject the script tag.
let _argyleSdkPromise = null;
function ensureArgyleSdk() {
  if (typeof window !== 'undefined' && window.Argyle) return Promise.resolve();
  if (_argyleSdkPromise) return _argyleSdkPromise;
  _argyleSdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://plugin.argyle.com/argyle.web.v5.js';
    s.onload = resolve;
    s.onerror = () => {
      _argyleSdkPromise = null;
      reject(new Error('Argyle SDK failed to load'));
    };
    document.head.appendChild(s);
  });
  return _argyleSdkPromise;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 9 · Argyle Connect (v2 — searchable provider list + mock login)
// ─────────────────────────────────────────────────────────────────────────
const ARGYLE_PROVIDERS = [
  { id: 'adp', name: 'ADP', hue: '#d32027' },
  { id: 'paychex', name: 'Paychex', hue: '#0033a0' },
  { id: 'gusto', name: 'Gusto', hue: '#f45d48' },
  { id: 'workday', name: 'Workday', hue: '#0875e1' },
  { id: 'ukg', name: 'UKG', hue: '#3661a0' },
  { id: 'paylocity', name: 'Paylocity', hue: '#0091c8' },
  { id: 'paycom', name: 'Paycom', hue: '#1a8743' },
  { id: 'square', name: 'Square Payroll', hue: '#101418' },
  { id: 'qb', name: 'QuickBooks Payroll', hue: '#2ca01c' },
  { id: 'dayforce', name: 'Ceridian Dayforce', hue: '#005ca9' },
];

const BANK_PROVIDERS = [
  { id: 'chase', name: 'Chase', hue: '#002D62' },
  { id: 'wells', name: 'Wells Fargo', hue: '#CC0000' },
  { id: 'bofa', name: 'Bank of America', hue: '#E31837' },
  { id: 'usbank', name: 'U.S. Bank', hue: '#0C2340' },
  { id: 'citi', name: 'Citibank', hue: '#003B70' },
  { id: 'cu', name: 'Credit Union', hue: '#2E7D32' },
  { id: 'td', name: 'TD Bank', hue: '#34A853' },
  { id: 'pnc', name: 'PNC Bank', hue: '#F05A28' },
];

function StepArgyleConnectV2({ ctx, goNext }) {
  const { data, setData } = ctx;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | connecting | done
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extractedIncome, setExtractedIncome] = useState(null);

  const { extract } = useReductoExtract();

  const filtered = ARGYLE_PROVIDERS.filter((pr) => pr.name.toLowerCase().includes(q.toLowerCase()));

  // Bank account connection state (ENG-1684 — ABD asset verification mock)
  const [bankQ, setBankQ] = useState('');
  const [bankPicked, setBankPicked] = useState(null);
  const [bankPhase, setBankPhase] = useState('idle'); // idle | connecting | done

  const bankFiltered = BANK_PROVIDERS.filter((pr) => pr.name.toLowerCase().includes(bankQ.toLowerCase()));

  function connectBank(provider) {
    setBankPicked(provider);
    setBankPhase('connecting');
    setTimeout(() => {
      setBankPhase('done');
      setData((prev) => ({ ...prev, _bankConnected: true, _bankBalance: 'verified' }));
    }, 1400);
  }

  function connect(provider) {
    setPicked(provider);
    setPhase('connecting');
    setTimeout(() => setPhase('done'), 1400);
  }

  const docs = data._payrollDocs || [];
  const setDocs = (next) => {
    setData((prev) => ({ ...prev, _payrollDocs: next }));
  };

  async function handleRawFiles(pairs) {
    if (pairs.length === 0) return;
    const file = pairs[0].file;
    setExtracting(true);
    setExtractError(null);
    setExtractedIncome(null);
    try {
      const result = await extract(file, 'INCOME_PAYSTUB');
      if (result.success && result.fields?.income) {
        const income = result.fields.income;
        setExtractedIncome(income);
        // Write prefill job immediately so it's in data.jobs before Continue is clicked,
        // avoiding a React render-order race between setData and setIndex.
        const prefillJob = {
          id: 'j_reducto_' + Date.now(),
          memberId: '0',
          employer: income.employerName || '',
          address: income.employerStreet || '',
          city: income.employerCity || '',
          state: income.employerState || 'IA',
          zip: income.employerZip || '',
          phone: '',
          startDate: '',
          ongoing: true,
          endDate: '',
          payRate: income.grossMonthlyIncome != null ? String(income.grossMonthlyIncome) : '',
          payType: 'gross',
          payFrequency: PAY_FREQUENCY.MONTHLY,
          hoursPerWeek: '',
          hasExtras: false,
          extrasMonthly: '',
          selfEmployed: false,
          businessName: '',
          businessType: '',
          grossRevenue: '',
          businessExpenses: '',
          monthlyIncome: income.grossMonthlyIncome ?? 0,
          _reductoFilled: true,
        };
        setData((prev) => ({
          ...prev,
          jobs: {
            ...prev.jobs,
            '0': [prefillJob, ...(prev.jobs['0'] || []).filter((j) => !j._reductoFilled)],
          },
        }));
      } else {
        setExtractError('Could not read income data from this file. You can enter it manually on the next step.');
      }
    } catch {
      setExtractError('Unable to process the document. You can enter income manually on the next step.');
    } finally {
      setExtracting(false);
    }
  }

  const fmt$ = (n) => (n != null ? `$${Number(n).toLocaleString()}/mo` : '—');

  return (
    <Stack gap={20}>
      <Panel
        title="Connect with Argyle"
        subtitle="Find your employer's payroll provider — Argyle securely pulls your last 90 days of pay stubs. Read-only · bank-grade encryption."
      >
        <Stack gap={14}>
          <TextInput value={q} onChange={setQ} placeholder="Search by provider name (e.g. ADP, Gusto, Workday)…" />
          <div className="argyle-grid">
            {filtered.map((pr) => (
              <button key={pr.id} type="button" className="argyle-tile" onClick={() => connect(pr)}>
                <div className="argyle-logo" style={{ background: pr.hue }} aria-hidden="true">
                  {pr.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="argyle-name">{pr.name}</div>
              </button>
            ))}
          </div>
          {phase === 'connecting' ? (
            <Alert kind="info" title={`Connecting to ${picked?.name}…`}>
              Pulling your last 90 days of pay stubs. This usually takes 10–30 seconds.
            </Alert>
          ) : null}
          {phase === 'done' ? (
            <Alert kind="success" title={`✓ Connected to ${picked?.name}`}>
              We'll keep your income information up to date for 90 days. You can revoke access anytime.
            </Alert>
          ) : null}
        </Stack>
      </Panel>

      <div className="login-divider">
        <span>or</span>
      </div>

      <FileUpload
        files={docs}
        onChange={setDocs}
        onRawFiles={handleRawFiles}
        title="Upload a bank statement or pay stub"
        subtitle="Upload recent pay stubs, a bank statement, or another income document. We accept the most recent 90 days."
        badge="Alternative to Argyle"
      />

      {extracting ? (
        <Alert kind="info" title="Reading your pay stub…">
          Extracting income details. This takes a few seconds.
        </Alert>
      ) : null}

      {extractError && !extracting ? (
        <Alert kind="warning" title="Could not extract income">
          {extractError}
        </Alert>
      ) : null}

      {extractedIncome && !extracting ? (
        <Panel title="Extracted from your pay stub">
          <div className="grid-2" style={{ gap: '10px 20px' }}>
            {extractedIncome.employeeName ? (
              <Field label="Employee name">
                <div className="text-body">{extractedIncome.employeeName}</div>
              </Field>
            ) : null}
            {extractedIncome.employerName ? (
              <Field label="Employer name">
                <div className="text-body">{extractedIncome.employerName}</div>
              </Field>
            ) : null}
            {extractedIncome.grossMonthlyIncome != null ? (
              <Field label="Monthly salary">
                <div className="text-body">{fmt$(extractedIncome.grossMonthlyIncome)}</div>
              </Field>
            ) : null}
            {extractedIncome.employerStreet ? (
              <Field label="Employer address">
                <div className="text-body">
                  {extractedIncome.employerStreet}
                  {extractedIncome.employerCity ? `, ${extractedIncome.employerCity}` : ''}
                  {extractedIncome.employerState ? `, ${extractedIncome.employerState}` : ''}
                  {extractedIncome.employerZip ? ` ${extractedIncome.employerZip}` : ''}
                </div>
              </Field>
            ) : null}
          </div>
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--color-text-muted)' }}>
            These details will be pre-filled in your job entry on the next step. You can edit them there.
          </p>
        </Panel>
      ) : null}

      {/* ── Bank account connection (ENG-1684 ABD asset verification) ──── */}
      <div className="login-divider" style={{ marginTop: 8 }}>
        <span>Also connect your bank account</span>
      </div>

      <Panel
        title="Connect with your bank"
        subtitle="For Medicaid pathways that require asset verification, we securely pull your current account balance. Read-only · bank-grade encryption."
      >
        <Stack gap={14}>
          <TextInput value={bankQ} onChange={setBankQ} placeholder="Search by bank name (e.g. Chase, Wells Fargo)…" />
          <div className="argyle-grid">
            {bankFiltered.map((pr) => (
              <button
                key={pr.id}
                type="button"
                className="argyle-tile"
                onClick={() => connectBank(pr)}
                disabled={bankPhase !== 'idle'}
              >
                <div className="argyle-logo" style={{ background: pr.hue }} aria-hidden="true">
                  {pr.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="argyle-name">{pr.name}</div>
              </button>
            ))}
          </div>
          {bankPhase === 'connecting' ? (
            <Alert kind="info" title={`Connecting to ${bankPicked?.name}…`}>
              Verifying your account balance. This takes a few seconds.
            </Alert>
          ) : null}
          {bankPhase === 'done' ? (
            <Alert kind="success" title={`✓ Connected to ${bankPicked?.name}`}>
              Account balance verified. Your bank information will be included with your application.
            </Alert>
          ) : null}
        </Stack>
      </Panel>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 10 · JobInfo (Pattern B — one job at a time, member dropdown)
// ─────────────────────────────────────────────────────────────────────────
function recomputeMonthly(job) {
  return computeMonthlyIncome(job);
}

function StepJobInfoV2({ ctx, scopeMemberId = undefined }) {
  const { data, setData } = ctx;
  const allPeople = applyingPeople(data).filter(isApplyingAdult);
  const people = scopeMemberId ? allPeople.filter((p) => p.id === scopeMemberId) : allPeople;
  const peopleOpts = people.map((p) => ({ value: p.id, label: p.name }));

  // Flatten jobs: when scopeMemberId is set, only show that person's jobs.
  const allJobs = scopeMemberId
    ? (data.jobs[scopeMemberId] || []).map((j) => ({ ...j, memberId: scopeMemberId }))
    : Object.entries(data.jobs).flatMap(([memberId, list]) => list.map((j) => ({ ...j, memberId })));

  // Auto-open a Reducto-prefilled job if one was seeded from Step 9
  const [editing, setEditing] = useState(() => {
    const prefill = (data.jobs?.['0'] || []).find((j) => j._reductoFilled);
    return prefill ? { ...prefill, memberId: '0' } : null;
  });
  // editing shape: { ...jobFields, memberId }

  function newDraft(memberId = peopleOpts[0]?.value || '0') {
    return {
      id: 'j' + Math.floor(Math.random() * 1e6),
      memberId,
      employer: '',
      address: '',
      city: '',
      state: 'IA',
      zip: '',
      phone: '',
      startDate: '',
      ongoing: true,
      endDate: '',
      payRate: '',
      payType: 'gross',
      payFrequency: PAY_FREQUENCY.BIWEEKLY,
      hoursPerWeek: '',
      hasExtras: false,
      extrasMonthly: '',
      selfEmployed: false,
      businessName: '',
      businessType: '',
      grossRevenue: '',
      businessExpenses: '',
      monthlyIncome: 0,
    };
  }

  function startNew(forMemberId) {
    setEditing(newDraft(forMemberId));
  }

  function updateDraft(patch) {
    setEditing((prev) => {
      const next = { ...prev, ...patch };
      next.monthlyIncome = recomputeMonthly(next);
      return next;
    });
  }

  function commit(closeAfter) {
    if (!editing) return;
    const { memberId, ...job } = editing;
    setData((prev) => {
      const list = prev.jobs[memberId] || [];
      const exists = list.find((j) => j.id === job.id);
      const nextList = exists ? list.map((j) => (j.id === job.id ? job : j)) : [...list, job];
      return { ...prev, jobs: { ...prev.jobs, [memberId]: nextList } };
    });
    if (closeAfter) setEditing(null);
    else setEditing(newDraft(memberId)); // Save & add another (same person)
  }

  function discard() {
    setEditing(null);
  }

  function editExisting(memberId, jobId) {
    const j = (data.jobs[memberId] || []).find((jj) => jj.id === jobId);
    if (j) setEditing({ ...j, memberId });
  }

  function deleteJob(memberId, jobId) {
    setData((prev) => ({
      ...prev,
      jobs: { ...prev.jobs, [memberId]: (prev.jobs[memberId] || []).filter((j) => j.id !== jobId) },
    }));
  }

  const memberName = (id) => people.find((p) => p.id === id)?.name || id;

  // ── Form body for the editing job ──────────────────────────────────────
  const FormBody = !editing ? null : (
    <Panel
      title={
        editing.id && allJobs.some((j) => j.id === editing.id)
          ? `Edit job for ${memberName(editing.memberId)}`
          : `Add job for ${memberName(editing.memberId)}`
      }
      action={
        <button type="button" className="btn btn--ghost size-sm" onClick={discard}>
          <Icon name="x" size={14} /> Cancel
        </button>
      }
    >
      <Stack gap={14}>
        <Field label="Who is this job for?" required>
          <Select value={editing.memberId} onChange={(x) => updateDraft({ memberId: x })} options={peopleOpts} />
        </Field>

        <ChoiceCard
          kind="checkbox"
          name="self"
          value="self"
          current={editing.selfEmployed ? ['self'] : []}
          onChange={(arr) => updateDraft({ selfEmployed: arr.includes('self') })}
          title="This is self-employment"
          desc="Sole proprietor, freelancer, gig worker, or owner of a small business."
        />

        {!editing.selfEmployed ? (
          <Fragment>
            <div className="grid-2">
              <Field label="Employer name" required>
                <TextInput
                  value={editing.employer}
                  onChange={(x) => updateDraft({ employer: x })}
                  placeholder="Hy-Vee Stores"
                />
              </Field>
              <Field label="Employer phone">
                <TextInput
                  type="tel"
                  inputMode="tel"
                  value={formatPhone(editing.phone)}
                  onChange={(x) => updateDraft({ phone: stripPhone(x) })}
                  placeholder="(515) 555-0190"
                />
              </Field>
            </div>
            <Field label="Employer street address">
              <TextInput
                value={editing.address}
                onChange={(x) => updateDraft({ address: x })}
                placeholder="5750 Mills Civic Pkwy"
              />
            </Field>
            <div className="grid-csz">
              <Field label="City">
                <TextInput value={editing.city} onChange={(x) => updateDraft({ city: x })} />
              </Field>
              <Field label="State">
                <Select value={editing.state} onChange={(x) => updateDraft({ state: x })} options={US_STATES} />
              </Field>
              <Field label="ZIP">
                <TextInput
                  value={editing.zip}
                  onChange={(x) => updateDraft({ zip: x })}
                  inputMode="numeric"
                  maxLength={5}
                />
              </Field>
            </div>
          </Fragment>
        ) : (
          <div className="grid-2">
            <Field label="Business name">
              <TextInput value={editing.businessName} onChange={(x) => updateDraft({ businessName: x })} />
            </Field>
            <Field label="Type of business">
              <TextInput
                value={editing.businessType}
                onChange={(x) => updateDraft({ businessType: x })}
                placeholder="Photography, Etsy shop, etc."
              />
            </Field>
          </div>
        )}

        <div className="grid-3">
          <Field label="Job start date">
            <TextInput type="date" value={editing.startDate} onChange={(x) => updateDraft({ startDate: x })} />
          </Field>
          <Field label="Still working there?">
            <YesNo value={editing.ongoing} onChange={(x) => updateDraft({ ongoing: x })} />
          </Field>
          {editing.ongoing === false ? (
            <Field label="End date">
              <TextInput type="date" value={editing.endDate} onChange={(x) => updateDraft({ endDate: x })} />
            </Field>
          ) : (
            <Field label="Hours per week">
              <TextInput
                inputMode="numeric"
                value={editing.hoursPerWeek}
                onChange={(x) => updateDraft({ hoursPerWeek: x })}
                placeholder="32"
              />
            </Field>
          )}
        </div>

        {!editing.selfEmployed ? (
          <Fragment>
            <div className="grid-3">
              <Field label="Pay rate" hint="Per hour, per week, etc.">
                <TextInput
                  inputMode="decimal"
                  value={editing.payRate}
                  onChange={(x) => updateDraft({ payRate: x })}
                  prefix="$"
                />
              </Field>
              <Field label="Pay frequency">
                <Select
                  value={editing.payFrequency}
                  onChange={(x) => updateDraft({ payFrequency: x })}
                  options={[
                    { value: PAY_FREQUENCY.HOURLY, label: 'Per hour' },
                    { value: PAY_FREQUENCY.WEEKLY, label: 'Weekly' },
                    { value: PAY_FREQUENCY.BIWEEKLY, label: 'Bi-weekly (every 2 weeks)' },
                    { value: PAY_FREQUENCY.SEMIMONTHLY, label: 'Semi-monthly (1st & 15th)' },
                    { value: PAY_FREQUENCY.MONTHLY, label: 'Monthly' },
                    { value: PAY_FREQUENCY.ANNUALLY, label: 'Yearly' },
                    { value: PAY_FREQUENCY.VARIES, label: 'Varies' },
                  ]}
                />
              </Field>
              <Field label="Gross or net?">
                <RadioGroup
                  name="payType"
                  value={editing.payType}
                  onChange={(x) => updateDraft({ payType: x })}
                  cols={2}
                  options={[
                    { value: 'gross', label: 'Gross' },
                    { value: 'net', label: 'Net' },
                  ]}
                />
              </Field>
            </div>
            <ChoiceCard
              kind="checkbox"
              name="extras"
              value="extras"
              current={editing.hasExtras ? ['extras'] : []}
              onChange={(arr) => updateDraft({ hasExtras: arr.includes('extras') })}
              title="I receive tips, commissions, or bonuses"
              desc="We'll count an average monthly amount."
            />
            {editing.hasExtras ? (
              <Field label="Average monthly amount from tips, commissions, or bonuses">
                <TextInput
                  inputMode="numeric"
                  value={editing.extrasMonthly}
                  onChange={(x) => updateDraft({ extrasMonthly: x })}
                  prefix="$"
                />
              </Field>
            ) : null}
          </Fragment>
        ) : (
          <div className="grid-2">
            <Field label="Gross monthly revenue">
              <TextInput
                inputMode="numeric"
                value={editing.grossRevenue}
                onChange={(x) => updateDraft({ grossRevenue: x })}
                prefix="$"
              />
            </Field>
            <Field label="Monthly business expenses">
              <TextInput
                inputMode="numeric"
                value={editing.businessExpenses}
                onChange={(x) => updateDraft({ businessExpenses: x })}
                prefix="$"
              />
            </Field>
          </div>
        )}

        <div className="estimate-row">
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Estimated monthly
          </div>
          <div className="estimate-amount">{fmt$(editing.monthlyIncome)}</div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            paddingTop: 8,
            borderTop: '1px solid var(--civic-border-default)',
          }}
        >
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button variant="outline" onClick={() => commit(false)}>
            Save &amp; add another for {memberName(editing.memberId).split(' ')[0]}
          </Button>
          <Button variant="primary" onClick={() => commit(true)}>
            Save &amp; done
          </Button>
        </div>
      </Stack>
    </Panel>
  );

  // ── Existing jobs list ─────────────────────────────────────────────────
  const jobsList = (
    <Stack gap={10}>
      {allJobs.map((j) => (
        <div key={j.id} className="job-row">
          <div className="job-row-main">
            <div className="job-row-emp">{j.employer || j.businessName || 'Job'}</div>
            <div className="job-row-meta">
              {memberName(j.memberId)} · {j.selfEmployed ? 'Self-employed' : `${j.hoursPerWeek || '?'} hrs/wk`}
            </div>
          </div>
          <div className="job-row-amount">{fmt$(j.monthlyIncome)}/mo</div>
          <div className="job-row-actions">
            <button type="button" className="btn btn--ghost size-sm" onClick={() => editExisting(j.memberId, j.id)}>
              <Icon name="edit" size={12} /> Edit
            </button>
            <button
              type="button"
              className="btn btn--ghost size-sm"
              style={{ color: 'var(--civic-destructive-text)' }}
              aria-label={`Remove job for ${memberName(j.memberId)}`}
              onClick={() => deleteJob(j.memberId, j.id)}
            >
              <Icon name="trash" size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </Stack>
  );

  return (
    <Stack gap={20}>
      {!editing ? (
        <Fragment>
          {allJobs.length === 0 ? (
            <Alert kind="info">
              Add wages from every job. If multiple adults in your household work, add each person's jobs separately.
            </Alert>
          ) : (
            <Panel
              title={`${allJobs.length} job${allJobs.length === 1 ? '' : 's'} added`}
              subtitle="Edit anything that doesn't look right, or add another job below."
            >
              {jobsList}
            </Panel>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {people.map((p) => (
              <Button key={p.id} variant="outline" onClick={() => startNew(p.id)}>
                <Icon name="plus" size={14} /> Add a job for {p.name.split(' ')[0]}
              </Button>
            ))}
          </div>

          {allJobs.length === 0 ? (
            <Alert kind="neutral">
              No one in your household works? You can continue — State-X Medicaid considers households with $0 wage income
              too.
            </Alert>
          ) : null}
        </Fragment>
      ) : (
        FormBody
      )}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 11 · JobHistory (past 30 days, optional Argyle-confirm pattern)
// ─────────────────────────────────────────────────────────────────────────
function StepJobHistoryV2({ ctx, scopeMemberId = undefined, embedded = false }) {
  const { data, setData } = ctx;
  const rawHistory = data._jobHistory || [];
  // When scoped, show only entries belonging to this member (or untagged entries).
  const history = scopeMemberId ? rawHistory.filter((h) => !h.memberId || h.memberId === scopeMemberId) : rawHistory;
  const setHist = (next) => {
    if (scopeMemberId) {
      // Merge: keep other members' entries, replace this member's entries.
      setData((prev) => ({
        ...prev,
        _jobHistory: [...(prev._jobHistory || []).filter((h) => h.memberId && h.memberId !== scopeMemberId), ...next],
      }));
    } else {
      setData((prev) => ({ ...prev, _jobHistory: next }));
    }
  };

  const add = () =>
    setHist([
      ...history,
      {
        id: 'h' + Math.floor(Math.random() * 1e6),
        employer: '',
        startDate: '',
        endDate: '',
        grossPay: '',
        ...(scopeMemberId ? { memberId: scopeMemberId } : {}),
      },
    ]);
  const update = (id, patch) => setHist(history.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const remove = (id) => setHist(history.filter((h) => h.id !== id));

  return (
    <Stack gap={20}>
      {!embedded ? (
        <Alert kind="info" title="Jobs ended in the last 30 days">
          Past income still counts for the months it was earned. If you may need retroactive coverage, list any jobs
          you've recently left.
        </Alert>
      ) : null}

      {history.length === 0 ? (
        <Panel subtitle="No past jobs listed. Skip this if no one has had a job end recently.">
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add a past job
          </button>
        </Panel>
      ) : (
        <Stack gap={12}>
          {history.map((h, idx) => (
            <Panel
              key={h.id}
              title={`Past job ${idx + 1}`}
              action={
                <button
                  type="button"
                  className="btn btn--ghost size-sm"
                  onClick={() => remove(h.id)}
                  style={{ color: 'var(--civic-destructive-text)' }}
                >
                  <Icon name="trash" size={14} /> Remove
                </button>
              }
            >
              <Stack gap={12}>
                <Field label="Employer">
                  <TextInput value={h.employer} onChange={(x) => update(h.id, { employer: x })} />
                </Field>
                <div className="grid-3">
                  <Field label="Start date">
                    <TextInput type="date" value={h.startDate} onChange={(x) => update(h.id, { startDate: x })} />
                  </Field>
                  <Field label="End date">
                    <TextInput type="date" value={h.endDate} onChange={(x) => update(h.id, { endDate: x })} />
                  </Field>
                  <Field label="Total gross pay">
                    <TextInput
                      inputMode="numeric"
                      value={h.grossPay}
                      onChange={(x) => update(h.id, { grossPay: x })}
                      prefix="$"
                    />
                  </Field>
                </div>
              </Stack>
            </Panel>
          ))}
          <button className="add-link" type="button" onClick={add}>
            <Icon name="plus" size={16} /> Add another past job
          </button>
        </Stack>
      )}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 14 · IncomeInfo (toggles per income type)
// ─────────────────────────────────────────────────────────────────────────
const INCOME_TOGGLES = [
  {
    value: 'social_security_retirement',
    label: 'Social Security (retirement or survivor)',
    hint: 'Title II retirement or survivor benefits.',
  },
  {
    value: INCOME_TYPE_SSI,
    label: 'SSI (Supplemental Security Income)',
    hint: 'Needs-based federal income for aged, blind, or disabled adults.',
  },
  {
    value: INCOME_TYPE_SSDI,
    label: 'SSDI (Social Security Disability Insurance)',
    hint: 'Insurance-based disability benefit from prior work history.',
  },
  { value: 'unemployment', label: 'Unemployment', hint: 'state Workforce Development or another state.' },
  { value: 'child_support', label: 'Child support received', hint: 'Court-ordered or informal.' },
  { value: 'va', label: 'VA benefits', hint: 'Disability comp, pension, GI Bill.' },
  { value: 'pension', label: 'Pension or retirement', hint: 'Including IRA / 401(k) withdrawals.' },
  { value: 'rental', label: 'Rental income', hint: 'Net after expenses.' },
  { value: 'alimony', label: 'Alimony received', hint: 'Spousal maintenance.' },
  { value: 'contributions', label: 'Contributions from others', hint: 'Regular cash help from family or friends.' },
  { value: 'other', label: 'Other', hint: 'Anything not covered above.' },
];

const FREQ_OPTS_V2 = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

function StepIncomeInfoV2({ ctx }) {
  const { data, updateFormData } = ctx;
  const items = data.otherIncome || [];

  const people = applyingPeople(data);
  const recipients = people.map((p) => ({ value: p.id, label: p.name }));

  const byType = (type) => items.filter((i) => i.type === type);

  function toggle(type) {
    const has = byType(type).length > 0;
    if (has) {
      // Remove all of this type
      updateFormData(
        'otherIncome',
        items.filter((i) => i.type !== type),
      );
    } else {
      updateFormData('otherIncome', [
        ...items,
        {
          id: 'o' + Math.floor(Math.random() * 1e6),
          type,
          recipient: people[0]?.id || '0',
          amount: '',
          frequency: 'monthly',
        },
      ]);
    }
  }

  function addAnother(type) {
    updateFormData('otherIncome', [
      ...items,
      {
        id: 'o' + Math.floor(Math.random() * 1e6),
        type,
        recipient: people[0]?.id || '0',
        amount: '',
        frequency: 'monthly',
      },
    ]);
  }

  function update(id, patch) {
    updateFormData(
      'otherIncome',
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  }

  function removeEntry(id) {
    updateFormData(
      'otherIncome',
      items.filter((i) => i.id !== id),
    );
  }

  const anyOn = items.length > 0;

  return (
    <Stack gap={20}>
      <Stack gap={10}>
        {INCOME_TOGGLES.map((t) => {
          const entries = byType(t.value);
          const on = entries.length > 0;
          return (
            <div key={t.value} className={'toggle-row' + (on ? ' on' : '')}>
              <div className="toggle-row-head">
                <div>
                  <div className="toggle-row-label">{t.label}</div>
                  <div className="toggle-row-hint">{t.hint}</div>
                </div>
                <button type="button" className={'toggle-switch' + (on ? ' on' : '')} onClick={() => toggle(t.value)}>
                  <span className="knob" />
                </button>
              </div>
              {on ? (
                <Stack gap={10} style={{ marginTop: 14 }}>
                  {entries.map((e, idx) => (
                    <div key={e.id} className="income-entry">
                      <div className="grid-3">
                        <Field label="Recipient">
                          <Select
                            value={e.recipient}
                            onChange={(x) => update(e.id, { recipient: x })}
                            options={recipients}
                          />
                        </Field>
                        <Field label="Amount">
                          <TextInput
                            inputMode="decimal"
                            value={e.amount}
                            onChange={(x) => update(e.id, { amount: x })}
                            prefix="$"
                          />
                        </Field>
                        <Field label="Frequency">
                          <Select
                            value={e.frequency}
                            onChange={(x) => update(e.id, { frequency: x })}
                            options={FREQ_OPTS_V2}
                          />
                        </Field>
                      </div>
                      {entries.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn--ghost size-sm"
                          style={{ color: 'var(--civic-destructive-text)', marginTop: 6 }}
                          onClick={() => removeEntry(e.id)}
                        >
                          <Icon name="trash" size={12} /> Remove this entry
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" className="add-link" onClick={() => addAnother(t.value)}>
                    <Icon name="plus" size={14} /> Add another {t.label} entry
                  </button>
                </Stack>
              ) : null}
            </div>
          );
        })}
      </Stack>

      {!anyOn ? (
        <Alert kind="neutral" title="No other income — that's fine">
          You've indicated no other income. Many applicants qualify with just employment income.
        </Alert>
      ) : null}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 16 · IncomeDiscrepancy (success state default per spec)
// ─────────────────────────────────────────────────────────────────────────
function StepVerifyingAnimation({ goNext }) {
  useEffect(() => {
    const t = setTimeout(() => goNext(), 3200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line -- one-shot timer to auto-advance; no deps needed

  const sources = [
    'Checking with Social Security Administration…',
    'Checking with Internal Revenue Service…',
    'Checking state records…',
  ];

  return (
    <div className="verify-loading">
      <div className="verify-loading-spinner" aria-hidden="true" />
      <div>
        <div className="verify-loading-title">Verifying your information</div>
        <p className="verify-loading-subtitle">We're checking with federal databases to confirm your eligibility.</p>
      </div>
      <div className="verify-loading-sources" aria-live="polite">
        {sources.map((s) => (
          <div key={s} className="verify-loading-source">
            <Icon name="arrowRight" size={12} aria-hidden="true" />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepIncomeDiscrepancyV2({ ctx }) {
  const hasSsdi = (ctx?.data?.otherIncome || []).some(
    (e) => (e?.type ?? e?.kind ?? '').toLowerCase() === INCOME_TYPE_SSDI,
  );

  const rows = [
    { k: 'Citizenship', v: 'Confirmed with Social Security', pending: false },
    {
      k: 'Income',
      v: hasSsdi ? 'SSDI income requires additional review' : 'Confirmed with the IRS',
      pending: hasSsdi,
    },
    { k: 'Identity', v: 'Confirmed with Social Security', pending: false },
    { k: 'Tax filing', v: 'Confirmed with the IRS', pending: false },
  ];

  return (
    <Stack gap={24}>
      <div className={`outcome-banner ${hasSsdi ? 'maybe' : 'qualify'}`}>
        <div className="ic">
          <Icon name="shieldCheck" size={22} aria-hidden="true" />
        </div>
        <div>
          <h2>{hasSsdi ? 'Most information verified' : '✓ Your information has been verified'}</h2>
          <p>
            {hasSsdi
              ? 'Some items confirmed. SSDI income requires additional verification before a final determination.'
              : "Great news — what you told us matches what's on file with the IRS and Social Security."}
          </p>
        </div>
      </div>

      <Panel title="What we checked">
        <Stack gap={10}>
          {rows.map((r) => (
            <div key={r.k} className={`verify-row${r.pending ? ' pending' : ''}`}>
              <Icon name={r.pending ? 'alert' : 'check'} size={16} />
              <div style={{ flex: 1 }}>
                <div className="verify-row-k">{r.k}</div>
                <div className="verify-row-v">{r.v}</div>
                {r.pending && <span className="verify-row-pending-badge">Pending verification</span>}
              </div>
            </div>
          ))}
        </Stack>
      </Panel>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 18 · HealthInsurance (per-member with completion checkmarks)
// ─────────────────────────────────────────────────────────────────────────
function StepInsuranceV2({ ctx }) {
  const { data, setData } = ctx;

  const allMembers = [
    {
      id: '0',
      name:
        [data.primaryApplicant.firstName, data.primaryApplicant.lastName].filter(Boolean).join(' ') ||
        'Primary applicant',
      applying: true,
    },
    ...data.householdMembers.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim() || 'Member',
      applying: !!m.applying,
    })),
  ];

  const [activeId, setActiveId] = useState(allMembers[0]?.id || '0');
  const ins = data.healthInsurance || {};

  function setMember(id, patch) {
    setData((prev) => ({
      ...prev,
      healthInsurance: {
        ...prev.healthInsurance,
        [id]: {
          hasInsurance: '',
          insuranceType: '',
          companyName: '',
          policyNumber: '',
          groupNumber: '',
          differentHolder: false,
          holderName: '',
          holderRelationship: '',
          premium: '',
          coverageStartDate: '',
          coverageEndDate: '',
          lossReason: '',
          skipped: false,
          ...(prev.healthInsurance[id] || {}),
          ...patch,
        },
      },
    }));
  }

  function statusOf(id) {
    const h = ins[id] || {};
    if (h.skipped) return 'skipped';
    if (h.hasInsurance === 'yes' || h.hasInsurance === 'no' || h.hasInsurance === 'lost') return 'done';
    return 'todo';
  }

  const member = allMembers.find((m) => m.id === activeId) || allMembers[0];
  const h = ins[activeId] || {};
  // Entry prefilled from CLEAR's coverage discovery: greyed/locked until the
  // applicant says it isn't right. Editing keeps `source: 'clear'` for the record.
  const fromClear = h.source === 'clear';
  const locked = fromClear && h.locked !== false;

  return (
    <Stack gap={20}>
      <div className="member-strip">
        {allMembers.map((m) => {
          const s = statusOf(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={'member-strip-item ' + (m.id === activeId ? 'active ' : '') + s}
              onClick={() => setActiveId(m.id)}
            >
              <span className={'check-bubble ' + s}>
                {s === 'done' ? <Icon name="check" size={12} /> : s === 'skipped' ? <Icon name="x" size={12} /> : null}
              </span>
              <span className="ms-name">{m.name}</span>
              {!m.applying ? <span className="hhm-badge muted">Not applying</span> : null}
            </button>
          );
        })}
      </div>

      <Panel title={member.name}>
        <Stack gap={14}>
          {fromClear ? (
            <div className="verified-requirement" data-testid="insurance-from-clear" data-locked={locked ? 'true' : 'false'}>
              <span className="verified-requirement-ic" aria-hidden="true">
                <Icon name="shieldCheck" size={16} />
              </span>
              <div className="verified-requirement-body">
                <div className="verified-requirement-title">Found during identity verification</div>
                <div className="verified-requirement-sub">
                  CLEAR's coverage check found this {h.companyName ? `${h.companyName} ` : ''}plan for{' '}
                  {member.name.split(' ')[0]}. Review it below
                  {locked ? ' — the details are locked to what was found.' : '.'}
                </div>
              </div>
              {locked ? (
                <button
                  type="button"
                  className="btn btn--link"
                  data-testid="insurance-unlock"
                  onClick={() => setMember(activeId, { locked: false })}
                >
                  This isn't right — edit
                </button>
              ) : (
                <span className="fineprint">Editable</span>
              )}
            </div>
          ) : null}
          <VerifiedControl verified={locked}>
            <Field label={`Does ${member.name.split(' ')[0]} currently have health insurance?`}>
              <RadioGroup
                name={`ins-${activeId}`}
                value={h.hasInsurance}
                onChange={(x) => setMember(activeId, { hasInsurance: x, skipped: false })}
                cols={3}
                options={[
                  { value: 'yes', label: 'Yes, currently' },
                  { value: 'lost', label: 'Lost in past 3 months' },
                  { value: 'no', label: 'No coverage' },
                ]}
              />
            </Field>
          </VerifiedControl>

          {h.hasInsurance === 'yes' ? (
            <VerifiedControl verified={locked}>
            <Stack gap={12}>
              <Field label="Type of coverage">
                <Select
                  value={h.insuranceType}
                  onChange={(x) => setMember(activeId, { insuranceType: x })}
                  options={[
                    { value: 'employer', label: 'Through an employer' },
                    { value: 'marketplace', label: 'Marketplace / healthcare.gov' },
                    { value: 'medicare', label: 'Medicare' },
                    { value: 'tricare', label: 'TRICARE / military' },
                    { value: 'private', label: 'Direct-purchase / private plan' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="—"
                />
              </Field>
              <div className="grid-2">
                <Field label="Insurance company">
                  <TextInput
                    value={h.companyName}
                    onChange={(x) => setMember(activeId, { companyName: x })}
                    placeholder="e.g. Wellmark Blue Cross"
                  />
                </Field>
                <Field label="Policy or member number">
                  <TextInput value={h.policyNumber} onChange={(x) => setMember(activeId, { policyNumber: x })} />
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Group number">
                  <TextInput value={h.groupNumber} onChange={(x) => setMember(activeId, { groupNumber: x })} />
                </Field>
                <Field label="Monthly premium">
                  <TextInput
                    value={h.premium}
                    inputMode="decimal"
                    onChange={(x) => setMember(activeId, { premium: x })}
                    prefix="$"
                  />
                </Field>
              </div>
              <QuestionRow
                q="Is the policy holder someone other than this person?"
                value={h.differentHolder}
                onChange={(x) => setMember(activeId, { differentHolder: x })}
              />
              {h.differentHolder === true ? (
                <div className="grid-2">
                  <Field label="Policy holder's name">
                    <TextInput value={h.holderName} onChange={(x) => setMember(activeId, { holderName: x })} />
                  </Field>
                  <Field label="Relationship to this person">
                    <Select
                      value={h.holderRelationship}
                      onChange={(x) => setMember(activeId, { holderRelationship: x })}
                      options={REL_OPTS_V2}
                      placeholder="—"
                    />
                  </Field>
                </div>
              ) : null}
              <Field label="Coverage start date">
                <TextInput
                  type="date"
                  value={h.coverageStartDate}
                  onChange={(x) => setMember(activeId, { coverageStartDate: x })}
                />
              </Field>
            </Stack>
            </VerifiedControl>
          ) : null}

          {h.hasInsurance === 'lost' ? (
            <Stack gap={12}>
              <div className="grid-2">
                <Field label="When did coverage end?">
                  <TextInput
                    type="date"
                    value={h.coverageEndDate}
                    onChange={(x) => setMember(activeId, { coverageEndDate: x })}
                  />
                </Field>
                <Field label="Why did it end?">
                  <Select
                    value={h.lossReason}
                    onChange={(x) => setMember(activeId, { lossReason: x })}
                    options={[
                      { value: 'lost_job', label: 'Lost a job' },
                      { value: 'employer_stopped', label: 'Employer stopped offering' },
                      { value: 'aged_off', label: "Aged off a parent's plan" },
                      { value: 'divorce', label: 'Divorce / separation' },
                      { value: 'premium', label: "Couldn't afford premium" },
                      { value: 'other', label: 'Other' },
                    ]}
                    placeholder="—"
                  />
                </Field>
              </div>
              <Alert kind="warning" title="You may qualify for a Special Enrollment Period">
                Losing coverage gives you 60 days to enroll without waiting for open enrollment.
              </Alert>
            </Stack>
          ) : null}

          {!member.applying ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setMember(activeId, { skipped: true, hasInsurance: '' })}>
                Skip — not applying for coverage
              </Button>
            </div>
          ) : null}
        </Stack>
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="fineprint">
          {allMembers.filter((m) => statusOf(m.id) === 'done' || statusOf(m.id) === 'skipped').length} of{' '}
          {allMembers.length} complete
        </span>
        {allMembers.some((m) => statusOf(m.id) === 'todo') ? (
          <Button
            variant="outline"
            onClick={() => {
              const next = allMembers.find((m) => statusOf(m.id) === 'todo' && m.id !== activeId);
              if (next) setActiveId(next.id);
            }}
          >
            Next person <Icon name="arrowRight" size={14} />
          </Button>
        ) : null}
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Income method picker — constants and helpers
// ─────────────────────────────────────────────────────────────────────────
const ARGYLE_MOCK_DELAY_MS = 1400;
const METHOD_ARGYLE = 'argyle';
const METHOD_UPLOAD = 'upload';
const METHOD_MANUAL = 'manual';
const METHOD_REVIEW = 'review';

// Fixed ISO timestamp for Argyle connection metadata — avoids ht/no-wallclock-in-demo.
// The `at` field is stored but never rendered in the CMS demo UI.
const ARGYLE_DEMO_AT = '2026-03-15T14:30:00.000Z';
const INCOME_METHOD_PANEL_ID = 'income-method-panel';

const INCOME_METHODS = [
  {
    id: METHOD_ARGYLE,
    icon: 'shieldCheck',
    badge: 'Fastest',
    title: 'Connect with Argyle',
    desc: "Securely link your employer's payroll provider. We pull the last 90 days of pay stubs automatically — nothing to type.",
  },
  {
    id: METHOD_UPLOAD,
    icon: 'upload',
    badge: '',
    title: 'Upload pay stubs',
    desc: 'Add photos or PDFs of recent pay stubs, a bank statement, or another income document. A caseworker reviews them.',
  },
  {
    id: METHOD_MANUAL,
    icon: 'edit',
    badge: '',
    title: 'Enter it manually',
    desc: "Type in each job's employer, pay rate, and hours yourself. Best if you don't have documents handy.",
  },
];

// Per-adult mock income keyed by position in the applying-adults list (0 = primary).
// Using index avoids depending on member IDs, which are random when added manually.
const MOCK_MEMBER_INCOME = {
  0: { payRate: '25.38', hoursPerWeek: '40', monthlyIncome: 2200 }, // Jasmine Carter (primary)
  1: { payRate: '10.96', hoursPerWeek: '20', monthlyIncome: 950 }, // Marcus Carter (second adult)
};
const MOCK_INCOME_DEFAULT = { payRate: '18.50', hoursPerWeek: '40', monthlyIncome: 1610 };

function buildArgyleMockJob(data, provider, adultIndex = 0) {
  const { payRate, hoursPerWeek, monthlyIncome } = MOCK_MEMBER_INCOME[adultIndex] ?? MOCK_INCOME_DEFAULT;
  return {
    id: 'j_argyle_' + Math.floor(Math.random() * 1e6),
    employer: provider.name,
    address: '',
    city: '',
    state: 'IA',
    zip: '',
    phone: '',
    startDate: '2023-03-15',
    ongoing: true,
    endDate: '',
    payRate,
    payType: 'gross',
    payFrequency: PAY_FREQUENCY.BIWEEKLY,
    hoursPerWeek,
    hasExtras: false,
    extrasMonthly: '',
    selfEmployed: false,
    businessName: '',
    businessType: '',
    grossRevenue: '',
    businessExpenses: '',
    monthlyIncome,
    _argyleImported: true,
    _argyleProvider: provider.name,
  };
}

function buildArgyleMockPastJob(provider) {
  return {
    id: 'h_argyle_' + Math.floor(Math.random() * 1e6),
    employer: provider.name + ' (prior location)',
    startDate: '2022-06-01',
    endDate: '2023-03-10',
    grossPay: '8200',
    _argyleImported: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PersonProgress — tab strip showing completion status per adult
// Hidden when there is only one applying adult.
// ─────────────────────────────────────────────────────────────────────────
function PersonProgress({ adults, confirmed, currentId, onSelect, panelId }) {
  if (adults.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="Income verification — people"
      className="member-strip"
      style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
    >
      {adults.map((p) => {
        const done = confirmed.includes(p.id);
        const active = p.id === currentId;
        const cls = done ? 'done' : 'todo';
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId || undefined}
            aria-label={`${p.name} — ${done ? 'complete' : 'pending'}`}
            className={'member-strip-item ' + (active ? 'active ' : '') + cls}
            onClick={() => onSelect && onSelect(p.id)}
          >
            <span className={'check-bubble ' + cls}>
              {done ? <Icon name="check" size={12} aria-hidden="true" /> : null}
            </span>
            <span className="ms-name">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// IncomeArgylePanel — provider search + connect for one person.
// Real SDK path: calls getPayrollLinkToken when SESSION_KEYS.CASE_ID is set,
// then opens the Argyle Link overlay. Falls back to a mock timeout for new
// applications where no case exists yet.
// ─────────────────────────────────────────────────────────────────────────
function IncomeArgylePanel({ ctx, onConnected, onFallback, memberId = '0', adultIndex = 0 }) {
  const { data, setData } = ctx;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  // phase: idle | login | fetching | connecting | done | error
  const [phase, setPhase] = useState('idle');
  const [sdkError, setSdkError] = useState(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const gridRef = useRef(null); // focus-restoration anchor (AC-005)

  const [getPayrollLinkToken] = useMutation(GET_PAYROLL_LINK_TOKEN_MUTATION);
  const caseId = sessionStorage.getItem(SESSION_KEYS.CASE_ID);

  const filtered = ARGYLE_PROVIDERS.filter((pr) => pr.name.toLowerCase().includes(q.toLowerCase()));
  const busy = phase === 'fetching' || phase === 'connecting';

  function writeArgyleData(provider) {
    let monthly = 0;
    let pastEmployer = '';
    setData((prev) => {
      const list = (prev.jobs?.[memberId] || []).filter((j) => !j._argyleImported);
      const job = buildArgyleMockJob({ ...prev, jobs: { ...prev.jobs, [memberId]: list } }, provider, adultIndex);
      monthly = job.monthlyIncome;
      const pastJob = buildArgyleMockPastJob(provider);
      pastEmployer = pastJob.employer;
      const history0 = (prev._jobHistory || []).filter((h) => !(h._argyleImported && h.memberId === memberId));
      return {
        ...prev,
        jobs: { ...prev.jobs, [memberId]: [...list, job] },
        _jobHistory: [...history0, { ...pastJob, memberId }],
        _argyleByPerson: {
          ...(prev._argyleByPerson || {}),
          [memberId]: { provider: provider.name, at: ARGYLE_DEMO_AT },
        },
      };
    });
    return { monthly, pastEmployer };
  }

  function restoreFocus() {
    // Defer past the React state-flush so busy=false has propagated and
    // the provider buttons are no longer disabled before we query them.
    queueMicrotask(() => {
      const first = gridRef.current?.querySelector('button:not([disabled])');
      first?.focus();
    });
  }

  function pickProvider(provider) {
    setPicked(provider);
    setLoginUser('');
    setLoginPass('');
    setSdkError(null);
    setPhase('login');
  }

  function cancelLogin() {
    setPicked(null);
    setPhase('idle');
  }

  async function connect(provider) {
    setSdkError(null);

    if (caseId) {
      // Real SDK path — fetch link token, then open Argyle overlay
      setPhase('fetching');
      let linkToken;
      try {
        const { data: res } = await getPayrollLinkToken({ variables: { input: { caseId } } });
        linkToken = res?.getPayrollLinkToken?.linkToken;
        if (!linkToken) {
          setPhase('error');
          setSdkError('Unable to get a secure token. Check your connection and try again.');
          restoreFocus();
          return;
        }
      } catch {
        setPhase('error');
        setSdkError('Unable to get a secure token. Check your connection and try again.');
        restoreFocus();
        return;
      }

      setPhase('connecting');
      try {
        await ensureArgyleSdk();
        const argyle = window.Argyle.create({
          userToken: linkToken,
          onAccountConnected: () => {
            const { monthly, pastEmployer } = writeArgyleData(provider);
            setPhase('done');
            if (onConnected) onConnected({ provider: provider.name, count: 1, monthly, pastEmployer });
          },
          onError: () => {
            setPhase('error');
            setSdkError('The connection failed. Try again or upload a document instead.');
            restoreFocus();
          },
          onClose: () => {
            // Only reset if user closed without completing
            setPhase((prev) => (prev === 'done' ? 'done' : 'idle'));
            restoreFocus();
          },
        });
        argyle.open();
      } catch {
        setPhase('error');
        setSdkError('Unable to open the connection window. Try again or upload a document instead.');
        restoreFocus();
      }
    } else {
      // Mock path — no case yet (new application before submission)
      setPhase('connecting');
      setTimeout(() => {
        const { monthly, pastEmployer } = writeArgyleData(provider);
        setPhase('done');
        if (onConnected) onConnected({ provider: provider.name, count: 1, monthly, pastEmployer });
      }, ARGYLE_MOCK_DELAY_MS);
    }
  }

  // ── Login screen — shown after provider is selected, before connect() ──────
  if (phase === 'login' && picked) {
    const initials = picked.name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('');
    return (
      <Panel title={`Sign in to ${picked.name}`}>
        <Stack gap={18}>
          <div className="argyle-login-header">
            <div className="argyle-logo argyle-logo--lg" style={{ background: picked.hue }} aria-hidden="true">
              {initials}
            </div>
            <div>
              <div className="argyle-login-title">Connect your payroll account</div>
              <div className="argyle-login-note">Demo mode — any credentials work</div>
            </div>
          </div>

          <Stack gap={12}>
            <Field label="Employee ID or email">
              <TextInput
                value={loginUser}
                onChange={setLoginUser}
                placeholder="you@company.com"
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <TextInput
                type="password"
                value={loginPass}
                onChange={setLoginPass}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Field>
          </Stack>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={cancelLogin}>
              <Icon name="arrowLeft" size={14} aria-hidden="true" /> Back
            </Button>
            <Button variant="primary" onClick={() => connect(picked)} disabled={!loginUser || !loginPass}>
              Connect to {picked.name} <Icon name="arrowRight" size={14} aria-hidden="true" />
            </Button>
          </div>

          <div className="fineprint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={12} aria-hidden="true" />
            Read-only access · bank-grade encryption · disconnect anytime
          </div>
        </Stack>
      </Panel>
    );
  }

  // ── Provider grid + status alerts ──────────────────────────────────────────
  return (
    <Panel
      title="Connect with Argyle"
      subtitle="Find your employer's payroll provider — Argyle securely pulls your last 90 days of pay stubs. Read-only · bank-grade encryption."
    >
      <Stack gap={14}>
        <TextInput
          value={q}
          onChange={setQ}
          placeholder="Search by provider name (e.g. ADP, Gusto, Workday)…"
          disabled={busy}
        />
        <div className="argyle-grid" ref={gridRef}>
          {filtered.map((pr) => (
            <button key={pr.id} type="button" className="argyle-tile" onClick={() => pickProvider(pr)} disabled={busy}>
              <div className="argyle-logo" style={{ background: pr.hue }} aria-hidden="true">
                {pr.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="argyle-name">{pr.name}</div>
            </button>
          ))}
        </div>

        {phase === 'fetching' ? (
          <Alert kind="info" title={`Preparing connection to ${picked?.name}…`}>
            Getting a secure token. One moment.
          </Alert>
        ) : null}
        {phase === 'connecting' ? (
          <Alert kind="info" title={`Connecting to ${picked?.name}…`}>
            {caseId
              ? "Complete the steps in the Argyle window. We'll pull your last 90 days of pay stubs automatically."
              : 'Pulling your last 90 days of pay stubs. This usually takes 10–30 seconds.'}
          </Alert>
        ) : null}
        {phase === 'done' ? (
          <Alert kind="success" title={`✓ Connected to ${picked?.name}`}>
            We'll keep your income information up to date for 90 days. You can revoke access anytime.
          </Alert>
        ) : null}
        {phase === 'error' ? (
          <Alert kind="destr" title="Connection failed">
            {sdkError}
          </Alert>
        ) : null}
        {phase === 'error' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              onClick={() => {
                setPhase('idle');
                setSdkError(null);
              }}
            >
              Try again
            </Button>
            {onFallback ? (
              <Button variant="ghost" onClick={onFallback}>
                Upload document instead
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="fineprint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="lock" size={12} aria-hidden="true" />
          Read-only access · bank-grade encryption · disconnect anytime
        </div>
      </Stack>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// IncomeUploadPanel — file upload for one person (no Reducto extraction)
// ─────────────────────────────────────────────────────────────────────────
function IncomeUploadPanel({ ctx, memberId = '0' }) {
  const { data, setData } = ctx;
  const docs = (data._payrollDocsByPerson || {})[memberId] || [];
  const setDocs = (next) =>
    setData((prev) => ({
      ...prev,
      _payrollDocsByPerson: { ...(prev._payrollDocsByPerson || {}), [memberId]: next },
    }));

  return (
    <Stack gap={14}>
      <FileUpload
        files={docs}
        onChange={setDocs}
        title="Upload pay stubs or a bank statement"
        subtitle="Add the most recent 90 days. A caseworker matches the amounts to your application — you don't need to type anything in."
        badge="Reviewed by a caseworker"
      />
      {docs.length > 0 ? (
        <Alert kind="success" title={`${docs.length} document${docs.length === 1 ? '' : 's'} uploaded`}>
          We'll read your wages from these. You can also switch to "Enter it manually" if you'd like to type them in
          now.
        </Alert>
      ) : null}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PersonEmploymentReview — mandatory review after Argyle import
// ─────────────────────────────────────────────────────────────────────────
function PersonEmploymentReview({ ctx, memberId, firstName, meta, onBack }) {
  const { data } = ctx;
  const jobs = data.jobs?.[memberId] || [];
  const monthly = jobs.reduce((s, j) => s + Number(j.monthlyIncome || 0), 0);
  // Fall back to persisted _argyleByPerson[memberId] when meta is null
  // (e.g. returning via editPerson after navigating away resets reviewMeta).
  // resolvedMeta may be reviewMeta (has .monthly) or an _argyleByPerson entry
  // (no .monthly — resolvedMeta?.monthly is undefined, falling through to jobs sum).
  const resolvedMeta = meta ?? data._argyleByPerson?.[memberId] ?? null;

  return (
    <Stack gap={18}>
      <div className="outcome-banner qualify">
        <div className="ic">
          <Icon name="shieldCheck" size={22} aria-hidden="true" />
        </div>
        <div>
          <h2>Review {firstName}'s imported income</h2>
          <p>
            Connected to <strong>{resolvedMeta?.provider || 'your payroll provider'}</strong> · pulled the last 90 days.
            We added <strong>{fmt$(resolvedMeta?.monthly ?? monthly)}/mo</strong> in wages. Check everything below and
            edit anything that's off — this is required before we continue.
          </p>
        </div>
      </div>

      <div>
        <div className="review-group-label">Current job{jobs.length === 1 ? '' : 's'}</div>
        <StepJobInfoV2 ctx={ctx} scopeMemberId={memberId} />
      </div>

      <div>
        <div className="review-group-label">Recent work history</div>
        <StepJobHistoryV2 ctx={ctx} scopeMemberId={memberId} embedded />
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PersonMethodPanel — scoped to one person; holds method + reviewMeta state.
// Receives key={effectiveId ?? 'done'} from parent so React remounts it on
// person change, automatically resetting local state without a useEffect.
// ─────────────────────────────────────────────────────────────────────────
function PersonMethodPanel({ ctx, person, adults, confirmed, currentIdx, onConfirm, onSelectPerson }) {
  const [method, setMethod] = useState(null);
  const [reviewMeta, setReviewMeta] = useState(null);

  const firstName = person.name.split(' ')[0];
  const nextPerson = adults.find((p) => p.id !== person.id && !confirmed.includes(p.id));
  const stepLabel = `Person ${currentIdx + 1} of ${adults.length}`;

  // ── Post-Argyle mandatory review screen ──────────────────────────────────
  if (method === METHOD_REVIEW) {
    return (
      <Stack gap={20}>
        <PersonProgress adults={adults} confirmed={confirmed} currentId={person.id} onSelect={onSelectPerson} />
        <PersonEmploymentReview
          ctx={ctx}
          memberId={person.id}
          firstName={firstName}
          meta={reviewMeta}
          onBack={() => {
            setMethod(METHOD_ARGYLE);
            setReviewMeta(null);
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--civic-border-default)',
          }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              setMethod(null);
              setReviewMeta(null);
            }}
          >
            <Icon name="arrowLeft" size={14} aria-hidden="true" /> Use a different method
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {nextPerson
              ? `Looks right — confirm ${firstName}'s income, next: ${nextPerson.name.split(' ')[0]}`
              : `Looks right — confirm ${firstName}'s income & finish`}{' '}
            <Icon name="arrowRight" size={14} aria-hidden="true" />
          </Button>
        </div>
      </Stack>
    );
  }

  // ── A method is active — show its sub-UI ────────────────────────────────
  if (method) {
    return (
      <Stack gap={20}>
        <PersonProgress adults={adults} confirmed={confirmed} currentId={person.id} onSelect={onSelectPerson} />
        <button type="button" className="btn btn--link" onClick={() => setMethod(null)}>
          <Icon name="arrowLeft" size={14} aria-hidden="true" /> Choose a different way
        </button>

        {method === METHOD_MANUAL ? (
          <StepJobInfoV2 ctx={ctx} scopeMemberId={person.id} />
        ) : method === METHOD_ARGYLE ? (
          <IncomeArgylePanel
            ctx={ctx}
            memberId={person.id}
            adultIndex={currentIdx}
            onConnected={(m) => {
              setReviewMeta(m);
              setMethod(METHOD_REVIEW);
            }}
            onFallback={() => setMethod(METHOD_UPLOAD)}
          />
        ) : (
          <IncomeUploadPanel ctx={ctx} memberId={person.id} />
        )}

        {/* Argyle routes to its own review screen; manual/upload confirm inline */}
        {method !== METHOD_ARGYLE ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--civic-border-default)',
            }}
          >
            <Button
              variant="ghost"
              onClick={() => {
                setMethod(null);
                setReviewMeta(null);
              }}
            >
              <Icon name="arrowLeft" size={14} aria-hidden="true" /> Use a different method
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              {nextPerson
                ? `Confirm ${firstName}'s income — next: ${nextPerson.name.split(' ')[0]}`
                : `Confirm ${firstName}'s income & finish`}{' '}
              <Icon name="arrowRight" size={14} aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </Stack>
    );
  }

  // ── Method chooser (initial state for current person) ───────────────────
  return (
    <Stack gap={20}>
      <PersonProgress
        adults={adults}
        confirmed={confirmed}
        currentId={person.id}
        panelId={INCOME_METHOD_PANEL_ID}
        onSelect={onSelectPerson}
      />
      <Panel
        title={`How would you like to add income for ${firstName}?`}
        subtitle={`${stepLabel} · Pick whichever is easiest — you can switch methods at any time.`}
      >
        <div id={INCOME_METHOD_PANEL_ID} className="method-grid" aria-label={`Income method for ${firstName}`}>
          {INCOME_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="method-card"
              aria-label={`${m.title} for ${firstName}`}
              onClick={() => setMethod(m.id)}
            >
              <div className="method-card-ic">
                <Icon name={m.icon} size={22} aria-hidden="true" />
              </div>
              <div className="method-card-body">
                <div className="method-card-title">
                  {m.title}
                  {m.badge ? <span className="method-card-badge">{m.badge}</span> : null}
                </div>
                <div className="method-card-desc">{m.desc}</div>
              </div>
              <span className="method-card-arrow">
                <Icon name="arrowRight" size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </Panel>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" onClick={onConfirm}>
          {firstName} has no income — {nextPerson ? `next: ${nextPerson.name.split(' ')[0]}` : 'finish'}{' '}
          <Icon name="arrowRight" size={14} aria-hidden="true" />
        </Button>
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StepIncomeMethodPicker — per-person income verification method selection.
// Manages which person is active; delegates per-person method/review state
// to PersonMethodPanel. key={effectiveId} on PersonMethodPanel causes React
// to remount it when the person changes, resetting method without useEffect.
// ─────────────────────────────────────────────────────────────────────────
function StepIncomeMethodPicker({ ctx, goNext }) {
  const { data, setData } = ctx;

  const adults = applyingPeople(data).filter(isApplyingAdult);
  const confirmed = data._incomeConfirmed || [];

  const firstUnconfirmed = (adults.find((p) => !confirmed.includes(p.id)) || {}).id || null;
  const [activeId, setActiveId] = useState(null);
  const effectiveId = activeId && adults.some((p) => p.id === activeId) ? activeId : firstUnconfirmed;
  const allDone = effectiveId === null;
  const person = allDone ? null : adults.find((p) => p.id === effectiveId);
  const currentIdx = allDone ? -1 : adults.findIndex((p) => p.id === effectiveId);

  function confirmPerson(personId) {
    setData((prev) => ({
      ...prev,
      _incomeConfirmed: [...new Set([...(prev._incomeConfirmed || []), personId])],
    }));
    setActiveId(null); // key change → PersonMethodPanel remounts → method auto-resets
  }

  function editPerson(id) {
    setData((prev) => ({
      ...prev,
      _incomeConfirmed: (prev._incomeConfirmed || []).filter((x) => x !== id),
    }));
    setActiveId(id); // key change → PersonMethodPanel remounts → method auto-resets
  }

  // ── All adults done — hand off to employment summary ────────────────────
  if (allDone) {
    return (
      <Stack gap={20}>
        <PersonProgress adults={adults} confirmed={confirmed} currentId={null} onSelect={editPerson} />
        <Panel
          title="Income captured for everyone"
          subtitle="We have wages for each working adult. Review the full picture on the next screen."
        >
          <p className="muted" style={{ fontSize: 15 }}>
            Tap a name above to revisit anyone's income, or continue to the employment summary.
          </p>
        </Panel>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={() => goNext && goNext()}>
            Continue to employment summary <Icon name="arrowRight" size={14} aria-hidden="true" />
          </Button>
        </div>
      </Stack>
    );
  }

  return (
    <PersonMethodPanel
      key={effectiveId ?? 'done'}
      ctx={ctx}
      person={person}
      adults={adults}
      confirmed={confirmed}
      currentIdx={currentIdx}
      onConfirm={() => confirmPerson(person.id)}
      onSelectPerson={setActiveId}
    />
  );
}

Object.assign(window, {
  StepArgyleConnectV2,
  StepJobInfoV2,
  StepJobHistoryV2,
  StepIncomeInfoV2,
  StepIncomeDiscrepancyV2,
  StepInsuranceV2,
  ARGYLE_PROVIDERS,
  INCOME_TOGGLES,
  FREQ_OPTS_V2,
  recomputeMonthly,
  StepIncomeMethodPicker,
  PersonMethodPanel,
  INCOME_METHODS,
  METHOD_ARGYLE,
  METHOD_UPLOAD,
  METHOD_MANUAL,
});

export {
  StepArgyleConnectV2,
  StepIncomeMethodPicker,
  buildArgyleMockJob,
  buildArgyleMockPastJob,
  recomputeMonthly,
  StepJobInfoV2,
  StepJobHistoryV2,
  StepIncomeInfoV2,
  StepIncomeDiscrepancyV2,
  StepInsuranceV2,
  StepVerifyingAnimation,
  ARGYLE_PROVIDERS,
  FREQ_OPTS_V2,
  INCOME_TOGGLES,
  INCOME_METHODS,
  METHOD_ARGYLE,
  METHOD_UPLOAD,
  METHOD_MANUAL,
};
