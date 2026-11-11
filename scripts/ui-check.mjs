// Browser check of every main page at phone and desktop sizes (acceptance Test 7).
// Usage: start web + worker, then  node scripts/ui-check.mjs <base-url> <email> <password> <out-dir>
// Fails if any page scrolls horizontally on a phone or logs a console error.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [base, email, password, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function session(name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|404)/.test(m.text())) problems.push(`${name} console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} page error: ${e.message}`));
  return { ctx, page };
}

async function shoot(page, name, url, label) {
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) problems.push(`${label} ${url}: page is ${overflow}px wider than the screen`);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: true });
  console.log(`${label.padEnd(8)} ${url.padEnd(40)} overflow=${overflow}px`);
}

for (const [label, opts] of [['phone', devices['iPhone 13']], ['tablet', devices['iPad Mini']], ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]]) {
  const { ctx, page } = await session(label, opts);
  await shoot(page, 'landing', '/', label);
  await shoot(page, 'pricing', '/pricing', label);
  await shoot(page, 'help', '/help', label);
  await shoot(page, 'login', '/login', label);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/app/), page.click('button[type=submit]')]);
  await shoot(page, 'dashboard', '/app', label);
  await shoot(page, 'new', '/app/new', label);
  await shoot(page, 'projects', '/app/projects', label);
  const projectHref = await page.locator('a[href^="/app/projects/"]').first().getAttribute('href');
  await shoot(page, 'project', projectHref, label);
  // workspace with a ready video: configure screen
  const videoHref = await page.locator('a[href^="/app/new?video="]').first().getAttribute('href').catch(() => null);
  if (videoHref) {
    await shoot(page, 'configure', videoHref, label);
    await page.getByRole('button', { name: /Custom times/ }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `${label}-configure-custom.png`), fullPage: true });
  }
  const jobHref = await page.locator('a[href^="/app/jobs/"]').first().getAttribute('href').catch(() => null);
  if (jobHref) await shoot(page, 'job', jobHref, label);
  await shoot(page, 'settings', '/app/settings', label);
  await shoot(page, 'admin', '/admin', label);
  await shoot(page, 'admin-users', '/admin/users', label);
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.log('\nProblems:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nNo horizontal overflow or console errors on any page.');
