/**
 * End-to-end storyline for the State-X E&E demo (single-service mode).
 *   node storyline.mjs            # BASE_URL defaults to http://localhost:4777
 *
 * Part 1  resident wizard → account → personal step → Verify with CLEAR
 * Part 2  hosted Verify Assist flow (mock CLEAR replica) → SC Medicaid finding → return
 * Part 3  return leg (prefill, chips, masked SSN) → rest of wizard → confirmation → dashboard
 * Part 4  caseworker: case list → Case Assist → flag in review → RFI → resolve → approve
 *         (+ a second case proves the approve guard fires while the flag is still open)
 * Part 5  reloads (admin case URL, resident dashboard) and admin sign-out
 * Exit code 1 when any check fails or an unexplained console/network error was seen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext, BASE, shot, dump, report, sleep, issues, setStep } from './lib.mjs';

const PASSWORD = 'Password1234!';
const state = { cases: [] };
const failures = [];
function check(cond, msg) {
  setStep(msg);
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures.push(msg); }
}
const stepId = (page) => page.url().split('#/')[1]?.split('?')[0] ?? '';

// Known-benign noise: Google Fonts is unreachable from this sandbox.
const EXPLAINED = [
  /fonts\.gstatic\.com/,
  /fonts\.googleapis\.com/,
  /Failed to load resource: the server responded with a status of 404 \(\)$/,
  // Apollo tears down one of two concurrent GetEligibilityNotice fetches while the
  // approval re-render settles; the surviving request returns 200 (verified: "View
  // Notice" is enabled on the completed view). Client-side abort, not a server error.
  /POST .*\/graphql — net::ERR_ABORTED body=.*GetEligibilityNotice/,
];

const browser = await launch();

// ─────────────────────────────────────────────────────────────────────────
// Resident journey (Parts 1–3). `full` also walks the wizard to submission.
// ─────────────────────────────────────────────────────────────────────────
const PROOF_PNG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'proof-sc-disenrollment.png');

async function residentJourney({ label, full, proof = false }) {
  const { page, ctx } = await newContext(browser, `resident-${label}`);
  const email = `demo+${label}-${Date.now()}@example.com`;
  const rec = { email };

  console.log(`\n## Part 1 — resident wizard (${label})`);
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
  check(true, `account created (${email}); wizard advanced to household-info`);
  await page.locator('.typeahead input').fill('Polk');
  await page.locator('.typeahead-opt').first().click();
  await page.getByText('Myself only').click();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForURL(/#\/auth-rep/);
  await page.getByText(/^No, I'll handle/).click();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForURL(/#\/personal/);
  await sleep(300);
  check(await page.getByRole('button', { name: /^Continue$/ }).isDisabled(), 'personal step: Continue disabled before verification');
  if (full) await shot(page, 'p1-personal-before-clear');
  await page.getByRole('button', { name: /Verify with/ }).click();
  await page.waitForURL(/\/verify\/flow\?token=/, { timeout: 15000 });
  check(true, `handed off to hosted flow ${page.url()}`);

  console.log(`\n## Part 2 — hosted Verify Assist flow (${label})`);
  // No welcome interstitial: mock mode lands directly on the CLEAR capture replica.
  await page.getByRole('heading', { name: 'Verify your identity with CLEAR' }).waitFor();
  await page.locator('.clear-primary').click(); // Get started
  await page.getByLabel('Phone number').fill('5551234567');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('One-time code').fill('123456');
  await page.locator('.clear-primary').click();
  await page.getByRole('heading', { name: 'Take a selfie' }).waitFor();
  await sleep(800); // let the fake camera stream start
  async function captureOrSimulate() {
    const sim = page.getByRole('button', { name: /Simulate capture/ });
    if (await sim.count()) { await sim.click(); return; }
    await page.locator('.clear-primary').click(); // Take selfie / Capture ID
    await page.getByRole('button', { name: /Looks good/ }).click();
  }
  await captureOrSimulate();
  await page.getByRole('heading', { name: 'Photograph your ID' }).waitFor();
  await sleep(800);
  await captureOrSimulate();
  await page.getByText(/Our records show you have active Medicaid coverage with/).waitFor({ timeout: 40000 });
  check((await page.getByText(/South Carolina Medicaid/).count()) > 0, 'results name the South Carolina Medicaid payer');
  check(true, 'results show the South Carolina Medicaid finding');
  check((await page.getByText('Identity verified').count()) > 0, 'results show identity verified');
  if (full) { await shot(page, 'p2-results-sc-medicaid'); }
  if (proof) {
    // "I have ended this coverage" → upload proof (a small PNG) → send.
    await page.getByText(/I have ended this coverage/).click();
    await page.locator('#proof-file').setInputFiles(PROOF_PNG);
    await page.getByText(/Selected:/).waitFor({ timeout: 10000 });
    check(true, 'proof of disenrollment selected in the hosted flow (proof-sc-disenrollment.png)');
  } else {
    await page.getByText(/I am still enrolled/).click();
  }
  await page.getByRole('button', { name: /Send results/ }).click();
  await page.getByRole('heading', { name: /Results sent/ }).waitFor({ timeout: 15000 });
  if (full) await shot(page, 'p2-closeout');
  await page.waitForURL(/#\/personal/, { timeout: 15000 });
  rec.verificationId = new URL(page.url()).hash.match(/verified=([^&]+)/)?.[1] ?? null;
  check(!!rec.verificationId, `returned to wizard with ?verified=${rec.verificationId}`);

  console.log(`\n## Part 3 — return leg, submit, dashboard (${label})`);
  const polling = await page.getByText(/Confirming your verification with CLEAR/).count();
  console.log(`  (polling state visible: ${polling > 0})`);
  await page.getByText('Verified with CLEAR').waitFor({ timeout: 40000 });
  await sleep(300);
  if (full) {
    const stepInputs = page.locator('.step-body input');
    check((await stepInputs.nth(0).inputValue()) === 'Jordan', 'first name prefilled Jordan');
    check((await stepInputs.nth(2).inputValue()) === 'Rivera', 'last name prefilled Rivera');
    check((await page.locator('.step-body input[type=date]').inputValue()) === '1991-01-10', 'DOB prefilled 1991-01-10');
    check((await page.locator('#addr-personal').inputValue()) === '742 Evergreen Terrace', 'street prefilled 742 Evergreen Terrace');
    const texts = await page.locator('.step-body input[type=text]').evaluateAll((els) => els.map((e) => e.value));
    check(texts.includes('Springfield') && texts.includes('55501'), 'city Springfield + ZIP 55501 prefilled');
    check((await page.locator('.step-body select').nth(1).inputValue()) === 'SX', 'state prefilled SX');
    const chips = await page.locator('.verified-control').count();
    check(chips >= 8, `verified fields greyed out (${chips})`);
    check((await page.locator('[aria-label*="ending in 6789"]').count()) > 0, 'masked SSN •••-••-6789 shown');
    check(await page.getByRole('button', { name: /^Continue$/ }).isEnabled(), 'Continue enabled after prefill');
    check(!page.url().includes('verified='), 'hash rewritten to bare #/personal');
    await shot(page, 'p3-personal-verified');
  }

  // Walk the remaining steps with minimal plausible answers.
  const handlers = {
    demographics: async () => {
      if (full) {
        check((await page.getByText(/No upload needed/).count()) > 0, 'proof of identity satisfied by CLEAR (no upload)');
        check((await page.getByText(/Upload a driver's license/).count()) === 0, 'proof-of-identity dropzone hidden when verified');
        await shot(page, 'p3-demographics-verified');
      }
      const sexPicked = await page.locator('input[name="sex"]:checked').count();
      if (full) check(sexPicked > 0 && (await page.getByText(/Confirmed during identity verification/).count()) > 0, 'sex assigned at birth pre-marked by CLEAR and locked');
      if (!sexPicked) await page.getByText('Female', { exact: true }).click();
      await page.getByText('U.S. Citizen', { exact: true }).click();
    },
    argyle: async () => {
      const noIncome = page.getByRole('button', { name: /has no income/ });
      if (await noIncome.count()) await noIncome.click();
      await sleep(300);
    },
    projected: async () => { await page.getByText('About the same').click(); },
    retroactive: async () => { await page.getByRole('button', { name: 'No', exact: true }).click(); },
    review: async () => { await page.getByText(/I have reviewed my application/).click(); },
    sign: async () => {
      await page.getByText(/I have read and agree/).click();
      await page.locator('.step-body input[type=text]').last().fill('Jordan Rivera');
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
    if (!(await next.count()) || (await next.isDisabled())) {
      await dump(page, `stuck-on-${id}`);
      await shot(page, `p3-stuck-${id}`);
      throw new Error(`Continue not available on step "${id}"`);
    }
    const before = id;
    await next.click();
    await page.waitForFunction((b) => !location.hash.startsWith('#/' + b) || location.hash === '#/confirmation', before, { timeout: 20000 });
    await sleep(250);
  }
  console.log('  steps visited:', visited.join(' → '));
  await page.getByText(/SX-2026-\d+/).first().waitFor({ timeout: 20000 });
  const confText = await page.locator('body').innerText();
  rec.caseNumber = confText.match(/SX-2026-\d{6}/)?.[0] ?? null;
  check(!!rec.caseNumber, `confirmation shows case number ${rec.caseNumber}`);
  check(/identity was verified by CLEAR|Identity verified by CLEAR/i.test(confText), 'confirmation mentions identity verified by CLEAR');
  if (full) {
    await shot(page, 'p3-confirmation');
    await page.getByRole('button', { name: /View dashboard/ }).click();
    await page.waitForURL(/\/dashboard/);
    await page.locator('[data-testid=dashboard-case-number]').waitFor({ timeout: 20000 });
    await sleep(500);
    const hero = await page.locator('.status-hero').innerText();
    check(hero.includes(rec.caseNumber), 'dashboard hero shows the case number');
    check(/Identity verified by CLEAR/.test(hero), 'dashboard hero shows the CLEAR chip');
    const notice = page.locator('.coverage-notice');
    check((await notice.count()) > 0 && /South Carolina/.test(await notice.innerText()), 'dashboard shows the out-of-state coverage notice');
    await shot(page, 'p3-dashboard');

    console.log('\n## Part 5a — resident dashboard reload');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid=dashboard-case-number]').waitFor({ timeout: 20000 });
    check((await page.locator('.status-hero').innerText()).includes(rec.caseNumber), 'resident /dashboard survives a full reload (cookie session + SPA route)');
  }
  if (proof) {
    console.log(`\n## Part 3b — proof shows up on the resident dashboard (${label})`);
    await page.getByRole('button', { name: /View dashboard/ }).click();
    await page.waitForURL(/\/dashboard/);
    const uploads = page.locator('[data-testid=dashboard-uploads]');
    await uploads.waitFor({ timeout: 20000 });
    const uploadsText = await uploads.innerText();
    check(/proof-sc-disenrollment\.png/.test(uploadsText), 'dashboard "Your uploads" lists the proof file');
    check(/Proof of Medicaid disenrollment — South Carolina/.test(uploadsText), 'upload is labelled "Proof of Medicaid disenrollment — South Carolina"');
    const href = await uploads.locator('[data-testid=document-view-link]').first().getAttribute('href');
    rec.proofUrl = href ? new URL(href, BASE).toString() : null;
    check(!!rec.proofUrl && /\/api\/documents\/[^/]+\/content$/.test(rec.proofUrl), `View link points at the document content endpoint (${rec.proofUrl})`);
    const owned = await page.request.get(rec.proofUrl);
    check(owned.status() === 200 && /^image\/png/.test(owned.headers()['content-type'] ?? ''), `View link returns 200 image/png with the resident's cookies (${owned.status()} ${owned.headers()['content-type']})`);
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.request.get(rec.proofUrl);
    check(anon.status() !== 200 && [401, 403, 404].includes(anon.status()), `document content is refused without cookies (${anon.status()})`);
    await anonCtx.close();
    await shot(page, 'p3b-dashboard-proof-upload');
  }
  await ctx.close();
  state.cases.push(rec);
  return rec;
}

const primary = await residentJourney({ label: 'a', full: true });
const secondary = await residentJourney({ label: 'b', full: false, proof: true });

// ─────────────────────────────────────────────────────────────────────────
// Part 4 — caseworker
// ─────────────────────────────────────────────────────────────────────────
console.log('\n## Part 4 — caseworker');
const { page: admin } = await newContext(browser, 'admin');
const flagBadge = async () =>
  (await admin.locator('[data-slot=verify-assist-flag-status]').count())
    ? (await admin.locator('[data-slot=verify-assist-flag-status]').first().innerText()).trim()
    : '(no badge)';

await admin.goto(BASE + '/admin/');
await admin.waitForURL(/\/admin\/login/, { timeout: 15000 });
check(true, 'unauthenticated /admin/ redirects to /admin/login');
await admin.locator('#email').fill('caseworker@state-x.gov');
await admin.locator('#password').fill('password1234');
await admin.locator('button[type=submit]').click();
await admin.waitForURL(/\/admin\/ee\/cases$/, { timeout: 15000 });
await admin.getByText(primary.caseNumber).waitFor({ timeout: 20000 });
await sleep(500);
const row = admin.locator('tr', { hasText: primary.caseNumber });
const rowText = await row.innerText();
check(/OOS-MCD/.test(rowText), 'case list row carries the OOS-MCD flag');
check(/ID-CLEAR/.test(rowText), 'case list row carries the ID-CLEAR chip');
check(/Out-of-state coverage/.test(rowText), 'Verify Assist column shows "Out-of-state coverage"');
check((await row.getAttribute('data-verify-assist-pinned')) !== null, 'row is pinned (red rail) for the open Verify Assist flag');
check(/Jordan Rivera/.test(rowText), 'applicant name resolved from the verified identity');
const flagsKpi = await admin.getByText('Verify Assist Flags').locator('..').innerText().catch(() => '');
console.log(`  (KPI tile: ${flagsKpi.replace(/\s+/g, ' ').slice(0, 80)})`);
await shot(admin, 'p4-case-list');

await row.click();
await admin.waitForURL(/\/admin\/ee\/cases\/[^/]+$/);
primary.caseId = admin.url().split('/').pop();
await admin.locator('[data-slot=case-assist-panel]').waitFor({ timeout: 20000 });
await sleep(800);
const panel = admin.locator('[data-slot=case-assist-panel]');
const panelText = await panel.innerText();
check(/Active out-of-state Medicaid coverage detected \(South Carolina\)/.test(panelText), 'Case Assist lists the critical SC Medicaid recommendation');
check(/CRITICAL/.test(panelText), 'recommendation is marked CRITICAL');
check((await admin.locator('[data-slot=case-assist-narrative]').count()) > 0, 'Case Assist narrative rendered');
check((await admin.locator('[data-slot=out-of-state-coverage-card]').count()) > 0, 'out-of-state coverage card rendered');
check((await flagBadge()) === 'Open', `flag status is Open (${await flagBadge()})`);
const banner = admin.locator('[aria-label^="Case assist:"]');
const bannerText = (await banner.count()) ? await banner.innerText() : '';
check(/ACTION NEEDED/i.test(bannerText) && /out-of-state Medicaid/i.test(bannerText), 'CaseActionBanner shows ACTION NEEDED for the out-of-state coverage');
const oosCards = panel.locator('article').filter({ hasText: 'South Carolina' });
check((await oosCards.count()) === 1, `Case Assist shows exactly ONE card mentioning South Carolina (${await oosCards.count()})`);
check((await panel.locator('[data-slot=out-of-state-coverage-card][data-state=open]').count()) === 1, 'the finding card is the open out-of-state coverage card');
check((await panel.locator('[data-slot=verify-assist-flag-card]').count()) === 0 && (await panel.locator('article').filter({ hasText: /Applicant confirmed they are still enrolled/ }).count()) === 0, 'no separate flag card or applicant-response card duplicates the finding');
check((await admin.locator('[data-slot=case-action-banner]').getAttribute('data-tone')) === 'red', 'CaseActionBanner tone is red while the flag is open');
const ivCard = admin.locator('[data-slot=identity-verification-card]');
const ivText = await ivCard.innerText();
const checkRows = ivCard.getByRole('list', { name: 'Verification checks' }).getByRole('listitem');
check((await checkRows.count()) <= 9 && (await checkRows.count()) > 0, `identity card lists ≤ 9 curated checks (${await checkRows.count()})`);
check(!/Phone/.test(await ivCard.getByRole('list', { name: 'Verification checks' }).innerText()), 'no Phone/device rows in the checks list');
check((await ivCard.locator('[data-slot=checks-summary]').count()) === 1 && /identity checks passed/.test(await ivCard.locator('[data-slot=checks-summary]').innerText()), `checks summary footer present (${(await ivCard.locator('[data-slot=checks-summary]').innerText().catch(() => '')).trim()})`);
check((await ivCard.locator('[data-slot=coverage-discovered][data-state=open]').count()) === 1, 'identity card coverage block is red/open before resolution');
const ssnRow = admin.locator('[data-slot=ssn-from-clear]');
check((await ssnRow.count()) > 0 && /6789/.test(await ssnRow.first().innerText()) && /from CLEAR/i.test(await ssnRow.first().innerText()), `sidebar SSN shows the masked CLEAR last-4, not a dash (${(await ssnRow.first().innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
check(/Selfie passes liveness check/.test(ivText) && /Passed/.test(ivText), 'Identity verification card lists CLEAR checks as Passed');
check(/COVERAGE DISCOVERED/i.test(ivText) && /South Carolina Medicaid/.test(ivText) && /123485135/.test(ivText), 'Identity verification card shows coverage discovered (payer + member id)');
check(/•••-••-6789/.test(ivText), 'Identity card shows masked SSN last-4 only');
check((await admin.getByRole('button', { name: /1 Verify/ }).count()) > 0, 'Verify phase is available');
const sidebarCaseId = await admin.locator('aside, .applicant-sidebar').first().innerText().catch(() => '');
check(new RegExp(primary.caseNumber).test(await admin.locator('body').innerText()) && !/SX-2026-\d{4}-\d{5}/.test(await admin.locator('body').innerText()), 'sidebar/header agree on the server-assigned case number');
await shot(admin, 'p4-case-detail-open-flag');

// Mark flag in review
await admin.getByRole('button', { name: 'Mark flag in review' }).click();
await admin.locator('[data-slot=verify-assist-flag-status]', { hasText: 'In review' }).waitFor({ timeout: 15000 });
check(true, 'flag refetched as In review');
check(/caseworker@state-x\.gov/.test(await admin.locator('[data-slot=out-of-state-coverage-card]').innerText()), 'flag assigned to the signed-in caseworker');

// Issue RFI from the suggested action
await admin.getByRole('button', { name: /Issue RFI for proof of SC Medicaid disenrollment/ }).click();
const dialog = admin.locator('[role=dialog]');
await dialog.getByText('Request additional information').waitFor();
const dialogText = await dialog.innerText();
check(/Proof of South Carolina Medicaid disenrollment/.test(dialogText), 'RFI modal pre-filled with the SC disenrollment proof item');
await shot(admin, 'p4-rfi-modal');
await dialog.getByRole('button', { name: 'Issue RFI', exact: true }).click();
await admin.getByText('Request for additional information pending', { exact: true }).waitFor({ timeout: 15000 });
check(true, 'pending RFI banner shown after issuing the RFI');
check(/RFI outstanding/.test(await panel.innerText()), 'Case Assist adds the "RFI outstanding" finding');
await shot(admin, 'p4-rfi-pending');

// Resolve the RFI
await admin.getByRole('button', { name: 'Mark as resolved' }).click();
await admin.getByRole('button', { name: 'Confirm resolve' }).click();
await admin.getByText('Request for additional information pending', { exact: true }).waitFor({ state: 'detached', timeout: 15000 });
check(true, 'RFI resolved — pending banner cleared');

// Resolve the flag with a reason
await admin.getByRole('button', { name: 'Resolve flag' }).click();
await dialog.getByText('Resolve Verify Assist flag').waitFor();
await dialog.getByText('Disenrollment confirmed by the other state').click();
await admin.locator('#flag-disposition-note').fill('SCDHHS confirmed termination effective 08/31/2026.');
await dialog.getByRole('button', { name: 'Resolve flag' }).click();
await admin.locator('[data-slot=out-of-state-coverage-card][data-state=closed]').waitFor({ timeout: 15000 });
check(true, 'flag refetched as Resolved — Case Assist card collapsed to the closed state');
await sleep(500);
const closedCard = admin.locator('[data-slot=out-of-state-coverage-card]');
check(/Out-of-state coverage finding resolved/.test(await closedCard.innerText()) && /Disenrollment confirmed by the other state/.test(await closedCard.innerText()), 'Case Assist shows the resolved summary line with the disposition');
check((await panel.locator('article').filter({ hasText: /Active out-of-state Medicaid coverage detected/ }).count()) === 0, 'no open finding card remains after resolution');
check(!/Issue RFI for proof of SC Medicaid disenrollment/.test(await panel.innerText()), 'resolved finding no longer offers the RFI action');
await closedCard.getByRole('button', { name: /notes?$/ }).click();
check(/SCDHHS confirmed termination/.test(await closedCard.innerText()), 'disposition note appears in the (expanded) notes thread');
const pageAfter = await admin.locator('body').innerText();
check(!/OOS-MCD/.test(pageAfter), 'no OOS-MCD chip anywhere on the page after resolution');
const bannerEl = admin.locator('[data-slot=case-action-banner]');
const bannerAfter = await bannerEl.innerText().catch(() => '');
check((await bannerEl.getAttribute('data-tone')) !== 'red' && !/out-of-state/i.test(bannerAfter), `banner is not red and has no out-of-state text (tone=${await bannerEl.getAttribute('data-tone')})`);
check(/finding was resolved/i.test(await admin.locator('[data-slot=case-assist-narrative]').innerText()), 'Case Assist narrative regenerated to a status summary saying the finding was resolved');
check((await ivCard.locator('[data-slot=coverage-discovered][data-state=closed]').count()) === 1 && /Resolved/.test(await ivCard.locator('[data-slot=coverage-discovered]').innerText()), 'identity card coverage block shows Resolved (neutral) after resolution');
check(!/resolve the flag before determination/i.test(pageAfter), 'bottom ActionBar no longer asks to resolve the flag');
await shot(admin, 'p4-flag-resolved');
// Evaluate step: the persisted rule trace followed the flag.
await admin.getByRole('button', { name: /2 Evaluate/ }).click();
// The sectioned rule trace is collapsed by default — expand it first.
await admin.getByText('Eligibility Determination Rule Trace').waitFor({ timeout: 15000 });
const traceToggle = admin.getByRole('button', { name: /View rule trace/ });
if (await traceToggle.count()) await traceToggle.first().click();
else await admin.getByText('Eligibility Determination Rule Trace').click();
const covRow = admin.locator('li', { hasText: 'Other health coverage found' }).first();
await covRow.waitFor({ timeout: 15000 });
await sleep(400);
const covRowText = (await covRow.innerText()).replace(/\s+/g, ' ');
check(/Resolved/.test(covRowText) && !/Pending/.test(covRowText), `Evaluate step Coverage discovery row reads Resolved (${covRowText.slice(0, 120)})`);
check(/Disenrollment confirmed by the other state/.test(covRowText), 'Coverage discovery row carries the disposition note');
await shot(admin, 'p4-evaluate-resolved');
await admin.getByRole('button', { name: /1 Verify/ }).click();
await sleep(300);

// Review & Decide → approve (guard must NOT appear now)
await admin.getByRole('button', { name: /Review & Decide/ }).click();
await dialog.getByText('Review & Decide').waitFor();
await dialog.getByRole('button', { name: 'Confirm Approval' }).click();
await sleep(1500);
check((await admin.getByText('Verify Assist flag still open').count()) === 0, 'approve guard dialog does NOT appear once the flag is resolved');
await admin.getByText(/Approved/i).first().waitFor({ timeout: 20000 });
await sleep(800);
const bodyAfter = await admin.locator('body').innerText();
check(/APPROVED|Approved/.test(bodyAfter) && !/Confirm Approval/.test(bodyAfter), 'case shows APPROVED');
check(!/auto-processed/i.test(bodyAfter) && !/NO-TOUCH/.test(bodyAfter), 'manually approved case is not labelled auto-processed / NO-TOUCH');
check(/Approved after caseworker review/.test(bodyAfter), 'completed view says approved after caseworker review');
await shot(admin, 'p4-approved');
// Audit log on the completed case
const auditTab = admin.getByRole('button', { name: /Audit Log/ });
if (await auditTab.count()) {
  await auditTab.first().click();
  await sleep(1000);
}
const logText = await admin.locator('body').innerText();
check(/RFI|Request for information/i.test(logText) && /Approved|APPROVED|Status/i.test(logText), 'activity/audit log lists the RFI and approval actions');
check(/marked the Verify Assist flag in review/.test(logText) && /resolved the Verify Assist flag/.test(logText), 'activity/audit log humanizes the Verify Assist flag updates');
check(!/VERIFY_ASSIST_FLAG_UPDATED|CASE_FLAG_UPDATED/.test(logText), 'no raw audit action codes leak into the activity log');
check(/cleared the OOS-MCD case flag/.test(logText), 'audit log shows the case flag being cleared when the finding was resolved');
check(/changed case status from Pending Verification to In Review/.test(logText) && /from In Review to Approved/.test(logText), 'audit log shows both status transitions (queued for review, approved)');
await shot(admin, 'p4-audit-log');

// Case list: the worked case must no longer carry OOS-MCD and reads "CLEAR verified"
await admin.goto(BASE + '/admin/ee/cases');
await admin.getByRole('button', { name: /Completed/ }).click().catch(() => {});
await admin.getByText(primary.caseNumber).waitFor({ timeout: 20000 });
const doneRow = admin.locator('tr', { hasText: primary.caseNumber });
const doneRowText = await doneRow.innerText();
check(!/OOS-MCD/.test(doneRowText), 'case list row has no OOS-MCD chip after resolution');
check(/CLEAR verified/.test(doneRowText) && !/Out-of-state coverage/.test(doneRowText), 'Verify Assist column shows "CLEAR verified" only after resolution');

// Approve guard SHOULD appear on the second case (flag still open)
console.log('\n## Part 4b — approve guard on a case with an open flag');
await admin.goto(BASE + '/admin/ee/cases');
await admin.getByText(secondary.caseNumber).waitFor({ timeout: 20000 });
await admin.locator('tr', { hasText: secondary.caseNumber }).click();
await admin.waitForURL(/\/admin\/ee\/cases\/[^/]+$/);
secondary.caseId = admin.url().split('/').pop();
await admin.locator('[data-slot=case-assist-panel]').waitFor({ timeout: 20000 });
await sleep(800);
const oosCardB = admin.locator('[data-slot=out-of-state-coverage-card]');
check((await oosCardB.locator('[data-slot=oos-proof-link]').count()) === 1 && /proof-sc-disenrollment\.png/.test(await oosCardB.innerText()), 'Case Assist card shows "coverage ended — proof submitted: <file> · View"');
check((await oosCardB.locator('[data-slot=oos-review-proof]').count()) === 1, 'Case Assist card offers "Review submitted proof"');
check((await oosCardB.getByRole('button', { name: /Issue RFI for proof/ }).count()) === 0, '"Issue RFI for proof" action hidden when proof is on file');
check((await admin.locator('[data-slot=identity-proof-link]').count()) === 1, 'identity card coverage block links the proof');
const proofHref = await oosCardB.locator('[data-slot=oos-proof-link]').getAttribute('href');
const staffFetch = await admin.request.get(new URL(proofHref, BASE).toString());
check(staffFetch.status() === 200 && /^image\/png/.test(staffFetch.headers()['content-type'] ?? ''), `staff can open the proof (${staffFetch.status()})`);
await shot(admin, 'p4b-case-assist-proof-link');
await admin.getByRole('button', { name: /Full Case Details/ }).click();
await admin.getByRole('tab', { name: /Documents/ }).first().click();
await admin.getByRole('button', { name: /Open document proof-sc-disenrollment\.png/ }).waitFor({ timeout: 15000 });
check(true, 'admin Documents tab lists the proof file');
check(/Proof of Medicaid disenrollment/.test(await admin.locator('body').innerText()), 'Documents tab labels it as proof of Medicaid disenrollment');
await shot(admin, 'p4b-documents-tab');
await admin.getByRole('button', { name: /Open document proof-sc-disenrollment\.png/ }).click();
await admin.locator('[data-slot=document-preview] img').waitFor({ timeout: 15000 });
check(true, 'DocumentViewer renders the image from the content endpoint');
await admin.keyboard.press('Escape');
await sleep(300);
const closeDrawer = admin.getByRole('dialog').getByRole('button', { name: /^Back$/ }).first();
if (await closeDrawer.count()) await closeDrawer.click(); else await admin.keyboard.press('Escape');
await sleep(400);
await admin.getByRole('button', { name: /Review & Decide/ }).click();
await dialog.getByText('Review & Decide').waitFor();
await dialog.getByRole('button', { name: 'Confirm Approval' }).click();
await admin.getByText('Verify Assist flag still open').waitFor({ timeout: 10000 });
check(true, 'approve guard dialog appears while the flag is still open');
await shot(admin, 'p4b-approve-guard');
await admin.getByRole('button', { name: 'Back to case' }).click();
await sleep(500);
check((await admin.getByText('Verify Assist flag still open').count()) === 0, '"Back to case" dismisses the guard without approving');
check(!/APPROVED/.test(await admin.locator('[aria-label^="Case assist:"], header, nav').first().innerText().catch(() => '')), 'second case is not approved');

// ─────────────────────────────────────────────────────────────────────────
// Part 5 — reloads + sign-out
// ─────────────────────────────────────────────────────────────────────────
console.log('\n## Part 5 — reloads and sign-out');
await admin.goto(`${BASE}/admin/ee/cases/${primary.caseId}`);
await admin.waitForLoadState('networkidle');
await admin.getByText(primary.caseNumber).first().waitFor({ timeout: 20000 });
check(admin.url().includes(`/admin/ee/cases/${primary.caseId}`), 'full reload of /admin/ee/cases/<id> works (SPA fallback + cookie session)');
await admin.getByRole('button', { name: 'Sign out' }).click();
await admin.waitForURL(/\/admin\/login/, { timeout: 15000 });
check(true, 'admin sign-out returns to /admin/login');
await admin.goto(`${BASE}/admin/ee/cases/${primary.caseId}`);
await admin.waitForURL(/\/admin\/login/, { timeout: 15000 });
check(true, 'after sign-out the case URL redirects to /admin/login');

fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
console.log('\nstate:', JSON.stringify(state));
report();
const unexplained = issues.filter((i) => !EXPLAINED.some((re) => re.test(i.detail)));
console.log(`\nunexplained console/network issues: ${unexplained.length}`);
for (const i of unexplained) console.log(`  !! [${i.ctx}] ${i.kind} (after: ${i.at}): ${i.detail}`);
console.log(failures.length ? `\nFAILED CHECKS: ${failures.length}\n  - ${failures.join('\n  - ')}` : '\nALL CHECKS PASSED');
await browser.close();
process.exit(failures.length || unexplained.length ? 1 : 0);
