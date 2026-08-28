import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'docs/busgo-map-hero.png');

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox'
  ]
});

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 420 },
    deviceScaleFactor: 2
  });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('https://busgo.bernar.cz', {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });

  const canvas = page.locator('.maplibregl-canvas');
  await page.waitForTimeout(15000);
  const debugState = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText?.slice(0, 2000) || '',
    bodyHtml: document.body?.innerHTML?.slice(0, 2000) || ''
  }));
  console.log('Deployed app state:', JSON.stringify(debugState));
  console.log('Page errors:', JSON.stringify(pageErrors));
  if (!(await canvas.isVisible())) {
    throw new Error('The deployed app did not create its MapLibre canvas. ' + pageErrors.join('\n'));
  }
  await page.waitForFunction(() => {
    const splash = document.querySelector('#splash-screen');
    if (!splash) return true;
    const style = getComputedStyle(splash);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
  }, { timeout: 120000 });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(8000);

  // Zoom out and pan north-west from BusGo's real default Prague position.
  // Mouse interaction makes the running app request the real stops for the new viewport.
  await page.mouse.move(600, 180);
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(1800);
  await page.mouse.move(500, 90);
  await page.mouse.down();
  await page.mouse.move(575, 330, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(10000);

  const map = page.locator('.maplibregl-map');
  await map.waitFor({ state: 'visible', timeout: 30000 });

  // Raise the real map above app controls for a clean documentation crop.
  // This change exists only in this headless page and does not modify BusGo.
  await map.evaluate(element => {
    element.style.position = 'fixed';
    element.style.inset = '0';
    element.style.width = '1200px';
    element.style.height = '420px';
    element.style.zIndex = '2147483646';

    const wordmark = document.createElement('div');
    wordmark.id = 'readme-hero-wordmark';
    wordmark.textContent = 'BusGo';
    Object.assign(wordmark.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10',
      pointerEvents: 'none',
      userSelect: 'none',
      fontFamily: 'Onest, Inter, sans-serif',
      fontWeight: '900',
      fontSize: '118px',
      letterSpacing: '-4px',
      color: '#2563eb',
      WebkitTextStroke: '3.5px #fff',
      paintOrder: 'stroke fill',
      textShadow: '0 4px 14px rgba(0, 0, 0, 0.62)'
    });
    element.appendChild(wordmark);
    window.dispatchEvent(new Event('resize'));
  });

  await page.waitForTimeout(2500);

  const rendered = await map.screenshot({ type: 'png' });
  await fs.writeFile(outputPath, rendered);

  if (rendered.length < 100000) {
    throw new Error('Rendered hero is unexpectedly small; map assets may not have loaded.');
  }

  const webglErrors = pageErrors.filter(message =>
    /Failed to initialize WebGL|webglcontextcreationerror|Could not create a WebGL context/i.test(message)
  );
  if (webglErrors.length) {
    throw new Error(webglErrors.join('\n'));
  }

  console.log('Saved real BusGo map hero:', outputPath, rendered.length, 'bytes');
} finally {
  await browser.close();
}
