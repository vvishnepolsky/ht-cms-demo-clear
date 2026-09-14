import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = process.env.BASE_URL || 'http://localhost:4777';
export const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

export const issues = []; // { ctx, kind, detail, at }
export let currentStep = '(start)';
export function setStep(label) { currentStep = label; }

export async function launch() {
  return chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
}

export async function newContext(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 960 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  wire(page, name);
  return { ctx, page };
}

export function wire(page, name) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text();
      // Vite/React dev noise never appears in prod builds; record everything.
      issues.push({ ctx: name, kind: `console.${msg.type()}`, detail: text.slice(0, 500), at: currentStep });
    }
  });
  page.on('pageerror', (err) => issues.push({ ctx: name, kind: 'pageerror', detail: String(err).slice(0, 500), at: currentStep }));
  page.on('requestfailed', (req) => {
    issues.push({ ctx: name, kind: 'requestfailed', detail: `${req.method()} ${req.url()} — ${req.failure()?.errorText}${req.postData() ? ' body=' + req.postData().slice(0, 160) : ''}`, at: currentStep });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (res.status() >= 400) {
      let body = '';
      try { body = (await res.text()).slice(0, 400); } catch {}
      issues.push({ ctx: name, kind: `http.${res.status()}`, detail: `${res.request().method()} ${url} ${body}`, at: currentStep });
    }
    if (url.includes('/graphql') && res.status() === 200) {
      try {
        const json = await res.json();
        if (json.errors?.length) {
          issues.push({ ctx: name, kind: 'graphql.errors', detail: `${res.request().postData()?.slice(0, 120)} → ${JSON.stringify(json.errors).slice(0, 400)}`, at: currentStep });
        }
      } catch {}
    }
  });
}

let shotN = 0;
export async function shot(page, label) {
  shotN += 1;
  const file = path.join(SHOTS, `${String(shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  [shot] ${file}`);
  return file;
}

export async function dump(page, label = '') {
  const info = await page.evaluate(() => {
    const vis = (el) => !!(el.offsetParent || el.getClientRects().length);
    const btns = [...document.querySelectorAll('button, a, [role=button], input[type=submit]')]
      .filter(vis)
      .map((b) => `${b.tagName.toLowerCase()}${b.disabled ? '[disabled]' : ''}: ${(b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80)}`);
    const inputs = [...document.querySelectorAll('input, select, textarea')]
      .filter(vis)
      .map((i) => `${i.tagName.toLowerCase()}[${i.type || ''}] name=${i.name || ''} id=${i.id || ''} ph=${i.placeholder || ''} aria=${i.getAttribute('aria-label') || ''} val=${String(i.value).slice(0, 30)}`);
    const heads = [...document.querySelectorAll('h1,h2,h3,legend,label')].filter(vis).map((h) => h.innerText.trim().replace(/\s+/g, ' ').slice(0, 100));
    return { url: location.href, heads, btns, inputs };
  });
  console.log(`--- dump ${label} @ ${info.url}`);
  console.log('  heads:', JSON.stringify(info.heads));
  console.log('  buttons:', JSON.stringify(info.btns));
  console.log('  inputs:', JSON.stringify(info.inputs));
}

export function report() {
  console.log('\n===== ISSUES (' + issues.length + ') =====');
  for (const i of issues) console.log(`[${i.ctx}] ${i.kind} (after: ${i.at}): ${i.detail}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
