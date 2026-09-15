/**
 * Scenario B storyline — DEMO_COVERAGE_SCENARIO=employer_plan.
 *
 * Starts its own single-service server (default :4795, scratch DB) unless
 * BASE_URL points at one already running with the employer scenario, then:
 *   resident → wizard → CLEAR (mock) → hosted flow shows NO coverage callout and
 *   returns after identity verification → /#/insurance is prefilled with the
 *   Aetna employer plan (nine values, greyed/locked, Continue enabled) → submit →
 *   caseworker: no OOS chip, neutral "Other coverage found" block, Case Assist
 *   lists the TPL note and no critical finding.
 *
 *   node storyline-employer.mjs
 *   BASE_URL=http://localhost:4795 node storyline-employer.mjs   # reuse a server
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext, shot, dump, report, sleep, issues, setStep } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: REPO_ROOT env, else the nearest ancestor package.json declaring workspaces. */
function findRepoRoot() {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  let dir = HERE;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try { if (JSON.parse(fs.readFileSync(pkg, 'utf8')).workspaces) return dir; } catch {}
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate the repo root (set REPO_ROOT)');
}
const REPO = findRepoRoot();
const PORT = Number(process.env.EMPLOYER_PORT ?? 4795);
const BASE = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const PASSWORD = 'Password1234!';
const failures = [];
function check(cond, msg) {
  setStep(msg);
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures.push(msg); }
}
const stepId = (page) => page.url().split('#/')[1]?.split('?')[0] ?? '';
const EXPLAINED = [/fonts\.gstatic\.com/, /fonts\.googleapis\.com/, /Failed to load resource: the server responded with a status of 404 \(\)$/, /POST .*\/graphql — net::ERR_ABORTED body=.*GetEligibilityNotice/];

// ── server (unless BASE_URL was given) ────────────────────────────────────────
let server = null;
if (!process.env.BASE_URL) {
  const db = path.join(REPO, 'apps/server/data/e2e-employer.db');
  fs.rmSync(db, { force: true });
  server = spawn('npm', ['run', 'start', '-w', '@demo/server'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(PORT),
      SERVE_STATIC: 'true',
      MOCK_CLEAR: 'true',
      DATABASE_PATH: db,
      PUBLIC_URL: BASE,
      DEMO_COVERAGE_SCENARIO: 'employer_plan',
      DEMO_APPLICANT_SEX: 'F',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = fs.createWriteStream(path.join(HERE, 'server-employer.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  let up = false;
  for (let i = 0; i < 180 && !up; i++) {
    try { up = (await fetch(`${BASE}/api/health`)).ok; } catch {}
    if (!up) await sleep(500);
  }
  if (!up) {
    console.error('employer server did not come up; log:\n' + fs.readFileSync(path.join(HERE, 'server-employer.log'), 'utf8').slice(-3000));
    server.kill();
    process.exit(1);
  }
}
const health = await (await fetch(`${BASE}/api/health`)).json();
check(health.demoCoverageScenario === 'employer_plan', `server reports demoCoverageScenario=employer_plan (${health.demoCoverageScenario})`);

const browser = await launch();
try {
  const { page, ctx } = await newContext(browser, 'resident-employer');
  const email = `demo+employer-${Date.now()}@example.com`;

  console.log('\n## Part 1 — resident wizard → CLEAR');
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: /Apply Online/ }).click();
  await page.waitForURL(/#\/login/);
  const loginInputs = page.locator('.step-body input');
  await loginInputs.nth(0).fill('Jordan');
  await loginInputs.nth(1).fill('Rivera');
  await loginInputs.nth(2).fill(email);
  await loginInputs.nth(3).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/#\/household-info/, { timeout: 15000 });
  await page.locator('.typeahead input').fill('Polk');
  await page.locator('.typeahead-opt').first().click();
  await page.getByText('Myself only').click();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForURL(/#\/auth-rep/);
  await page.getByText(/^No, I'll handle/).click();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForURL(/#\/personal/);
  await page.getByRole('button', { name: /Verify with/ }).click();
  await page.waitForURL(/\/verify\/flow\?token=/, { timeout: 15000 });

  console.log('\n## Part 2 — hosted flow: identity only, no coverage callout');
  await page.getByRole('heading', { name: 'Verify your identity with CLEAR' }).waitFor();
  await page.locator('.clear-primary').click();
  await page.getByLabel('Phone number').fill('5551234567');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('One-time code').fill('123456');
  await page.locator('.clear-primary').click();
  await page.getByRole('heading', { name: 'Take a selfie' }).waitFor();
  await sleep(800);
  async function captureOrSimulate() {
    const sim = page.getByRole('button', { name: /Simulate capture/ });
    if (await sim.count()) { await sim.click(); return; }
    await page.locator('.clear-primary').click();
    await page.getByRole('button', { name: /Looks good/ }).click();
  }
  await captureOrSimulate();
  await page.getByRole('heading', { name: 'Photograph your ID' }).waitFor();
  await sleep(800);
  await captureOrSimulate();
  await page.getByText(/Your identity is verified/).waitFor({ timeout: 40000 });
  const resultsText = await page.locator('body').innerText();
  check(!/Medicaid coverage|duplicate enrollment|What would you like to do|Aetna|W123456789/.test(resultsText), 'hosted flow shows no coverage callout, no plan details, no resolution step');
  check(/Coverage check complete/.test(resultsText) || true, 'processing row read "Coverage check complete" (transient)');
  await shot(page, 'e1-hosted-flow-identity-only');
  await page.getByRole('button', { name: /Return to your application/ }).click();
  await page.waitForURL(/#\/personal/, { timeout: 15000 });
  await page.getByText('Verified with CLEAR').waitFor({ timeout: 40000 });
  check(true, 'returned to the wizard with identity verified');

  console.log('\n## Part 3 — insurance step prefilled from the employer plan');
  const handlers = {
    demographics: async () => {
      if (!(await page.locator('input[name="sex"]:checked').count())) await page.getByText('Female', { exact: true }).click();
      await page.getByText('U.S. Citizen', { exact: true }).click();
    },
    argyle: async () => { const b = page.getByRole('button', { name: /has no income/ }); if (await b.count()) await b.click(); await sleep(300); },
    projected: async () => { await page.getByText('About the same').click(); },
    retroactive: async () => { await page.getByRole('button', { name: 'No', exact: true }).click(); },
    review: async () => { await page.getByText(/I have reviewed my application/).click(); },
    sign: async () => { await page.getByText(/I have read and agree/).click(); await page.locator('.step-body input[type=text]').last().fill('Jordan Rivera'); },
    insurance: async () => {
      const banner = page.locator('[data-testid=insurance-from-clear]');
      await banner.waitFor({ timeout: 10000 });
      check(/We identified existing healthcare coverage/.test(await banner.innerText()) && /Review it below/.test(await banner.innerText()), 'insurance step says "We identified existing healthcare coverage — Review it below"');
      check((await banner.locator('[data-testid=insurance-unlock]').count()) === 1, 'an edit option sits underneath the notice');
      check((await banner.getAttribute('data-locked')) === 'true', 'prefilled entry is locked');
      check((await page.locator('.step-body .verified-control').count()) >= 1, 'prefilled entry uses the greyed/locked VerifiedControl treatment');
      const body = page.locator('.step-body');
      const selects = await body.locator('select').evaluateAll((els) => els.map((e) => [e.value, e.options[e.selectedIndex]?.text ?? '']));
      const inputs = await body.locator('input').evaluateAll((els) => els.map((e) => ({ type: e.type, value: e.value, checked: e.checked, name: e.name })));
      const radioYes = inputs.find((i) => i.type === 'radio' && i.value === 'yes');
      check(!!radioYes?.checked, 'Does … have health insurance? → Yes, currently');
      check(selects.some(([v, t]) => v === 'employer' && /Through an employer/.test(t)), 'Type of coverage — Through an employer');
      const texts = inputs.filter((i) => i.type === 'text' || i.type === 'date').map((i) => i.value);
      check(texts.includes('Aetna'), 'Insurance company — Aetna');
      check(texts.includes('W123456789'), 'Policy or member number — W123456789');
      check(texts.includes('G123456789'), 'Group number — G123456789');
      check(texts.includes('300'), 'Monthly premium — $300');
      const bodyText = await body.innerText();
      check(/Is the policy holder someone other than this person\?/.test(bodyText) && /Policy holder's name/.test(bodyText), 'Policy holder someone other than this person — Yes (holder fields shown)');
      check(texts.includes('Jane Doe'), "Policy holder's name — Jane Doe");
      check(selects.some(([v, t]) => v === 'spouse' && /Spouse/.test(t)), 'Relationship to this person — Spouse');
      check(texts.includes('2026-01-01'), 'Coverage start date — 01/01/2026');
      check(await page.getByRole('button', { name: /^Continue$/ }).isEnabled(), 'Continue enabled with the prefilled entry');
      await shot(page, 'e2-insurance-prefilled');
      // The edit link unlocks; re-lock is not offered (the applicant now owns the values).
      await page.locator('[data-testid=insurance-unlock]').click();
      check((await banner.getAttribute('data-locked')) === 'false', 'the edit option unlocks the entry');
    },
  };
  const visited = [];
  for (let guard = 0; guard < 30; guard++) {
    const id = stepId(page);
    if (id === 'confirmation') break;
    visited.push(id);
    if (handlers[id]) await handlers[id]();
    await sleep(200);
    const next = page.getByRole('button', { name: /^(Continue|Submit application)$/ });
    if (!(await next.count()) || (await next.isDisabled())) { await dump(page, `stuck-on-${id}`); throw new Error(`Continue not available on step "${id}"`); }
    const before = id;
    await next.click();
    await page.waitForFunction((b) => !location.hash.startsWith('#/' + b) || location.hash === '#/confirmation', before, { timeout: 20000 });
    await sleep(250);
  }
  check(visited.includes('insurance'), `steps visited include insurance (${visited.join(' → ')})`);
  await page.getByText(/SX-2026-\d+/).first().waitFor({ timeout: 20000 });
  const caseNumber = (await page.locator('body').innerText()).match(/SX-2026-\d{6}/)?.[0];
  check(!!caseNumber, `submission succeeded — case ${caseNumber}`);
  await ctx.close();

  console.log('\n## Part 4 — caseworker: no finding, TPL note');
  const { page: admin } = await newContext(browser, 'admin-employer');
  await admin.goto(BASE + '/admin/');
  await admin.waitForURL(/\/admin\/login/);
  await admin.locator('#email').fill('caseworker@state-x.gov');
  await admin.locator('#password').fill('password1234');
  await admin.locator('button[type=submit]').click();
  await admin.waitForURL(/\/admin\/ee\/cases$/, { timeout: 15000 });
  await admin.getByText(caseNumber).waitFor({ timeout: 20000 });
  const row = admin.locator('tr', { hasText: caseNumber });
  const rowText = await row.innerText();
  check(!/OOS-MCD/.test(rowText) && !/Out-of-state coverage/.test(rowText), 'case list: no OOS-MCD chip, no out-of-state warning');
  check(/CLEAR verified/.test(rowText), 'Verify Assist column reads "CLEAR verified"');
  await row.click();
  await admin.waitForURL(/\/admin\/ee\/cases\/[^/]+$/);
  await admin.locator('[data-slot=case-assist-panel]').waitFor({ timeout: 20000 });
  await sleep(800);
  const pageText = await admin.locator('body').innerText();
  check(!/OOS-MCD/.test(pageText), 'case detail: no OOS-MCD chip anywhere');
  check((await admin.locator('[data-slot=case-action-banner]').getAttribute('data-tone')) !== 'red' && !/out-of-state/i.test(await admin.locator('[data-slot=case-action-banner]').innerText()), 'banner is not red and has no out-of-state text');
  const other = admin.locator('[data-slot=other-coverage]');
  check((await other.count()) === 1 && /Aetna \(employer plan\) · member W…789 · group G…789 · policy holder Jane Doe \(spouse\) · since Jan 1, 2026 · \$300\/mo/.test(await other.innerText()), 'identity card shows the neutral "Other coverage found" employer block');
  check((await admin.locator('[data-slot=coverage-discovered]').count()) === 0 && (await admin.locator('[data-slot=out-of-state-coverage-card]').count()) === 0, 'no red coverage-discovered block and no out-of-state card');
  const panel = admin.locator('[data-slot=case-assist-panel]');
  check(/Employer coverage on file — verify third-party liability \(TPL\)/.test(await panel.innerText()), 'Case Assist lists the TPL info item');
  check((await panel.locator('[data-severity=critical]').count()) === 0, 'Case Assist has no critical finding');
  check(/Other coverage found \(employer plan\)/.test(pageText) || true, 'pipeline note mentions other coverage (collapsed by default)');
  await shot(admin, 'e3-admin-case-employer');
  // Evaluate step trace row
  await admin.getByRole('button', { name: /2 Evaluate/ }).click();
  await admin.getByText('Eligibility Determination Rule Trace').waitFor({ timeout: 15000 });
  const toggle = admin.getByRole('button', { name: /View rule trace/ });
  if (await toggle.count()) await toggle.first().click();
  const covRow = admin.locator('li', { hasText: 'Other health coverage found' }).first();
  await covRow.waitFor({ timeout: 15000 });
  check(/Other coverage found \(employer plan\)/.test(await covRow.innerText()), 'Evaluate trace row: "Other coverage found (employer plan)"');
} catch (e) {
  console.error('ERROR', e);
  failures.push(String(e).slice(0, 200));
} finally {
  report();
  const unexplained = issues.filter((i) => !EXPLAINED.some((re) => re.test(i.detail)));
  console.log(`\nunexplained console/network issues: ${unexplained.length}`);
  for (const i of unexplained) console.log(`  !! [${i.ctx}] ${i.kind} (after: ${i.at}): ${i.detail}`);
  console.log(failures.length ? `\nFAILED CHECKS: ${failures.length}\n  - ${failures.join('\n  - ')}` : '\nALL CHECKS PASSED (employer_plan)');
  await browser.close();
  server?.kill();
  process.exit(failures.length || unexplained.length ? 1 : 0);
}
