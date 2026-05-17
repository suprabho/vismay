const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([{
    name: 'vmy_admin',
    value: 'ef7ea416e956919e5efb2361111a597002d4999066a64a6b482641bb27b04509',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('MapboxBackground') || text.includes('re-render') || text.includes('style.load') || text.includes('Warning') || text.includes('blink') || text.includes('geojson') || text.includes('GeoJSON')) {
      logs.push(`[${msg.type()}] ${text}`);
    }
  });

  console.log('Navigating...');
  await page.goto('http://localhost:3000/story/delimitation-2011-census/share', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Current URL:', page.url());
  const title = await page.title();
  console.log('Page title:', title);

  // Check what's actually on the page
  const h1s = await page.$$eval('h1, [class*="title"]', els => els.slice(0,3).map(e => e.textContent?.trim()));
  console.log('Headings found:', h1s);

  // Count map containers
  const mapCount = await page.$$eval('[class*="mapbox"], canvas, .mapboxgl-canvas', els => els.length);
  console.log('Mapbox canvas elements:', mapCount);

  console.log('Waiting 5s for map tiles + GeoJSON...');
  await page.waitForTimeout(5000);

  // Screenshot top portion (first ~2 cards)
  await page.screenshot({ path: '/tmp/map_top.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log('Top screenshot saved.');

  // Full page screenshot
  await page.screenshot({ path: '/tmp/map_full_1.png', fullPage: true });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_full_2.png', fullPage: true });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_full_3.png', fullPage: true });

  console.log('Console logs captured:', logs.length);
  logs.slice(0, 20).forEach(l => console.log(l));

  await browser.close();
  console.log('Done.');
})();
