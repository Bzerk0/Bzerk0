// Screenshots of the landing view and the walk-in, for eyeballing changes: node scripts/shot.js [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => document.body.dataset.state === 'outside', null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/landing.png' });
await page.keyboard.press('Enter');
for (const [name, ms] of [['walk-1', 1300], ['walk-2', 600], ['walk-3', 300]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `screenshots/${name}.png` });
}
await browser.close();
