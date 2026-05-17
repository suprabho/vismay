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
    logs.push(`[${msg.type()}] ${text}`);
  });

  await page.goto('http://localhost:3000/story/delimitation-2011-census/share', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait longer for GeoJSON choropleth to paint
  console.log('Waiting 8s for full map + GeoJSON choropleth load...');
  await page.waitForTimeout(8000);

  // Take viewport screenshots at different scroll positions
  // First, scroll to roughly the 3rd card area
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/map_scroll1_a.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_scroll1_b.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_scroll1_c.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });

  // Scroll to deeper cards
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/map_scroll2_a.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_scroll2_b.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/map_scroll2_c.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });

  // Filter for MapboxBackground or notable logs
  const notable = logs.filter(l => l.includes('MapboxBackground') || l.includes('re-render') || l.includes('blink') || l.includes('Error') || (l.includes('Warning') && !l.includes('findDOMNode')));
  console.log('Notable logs:', notable.length);
  notable.slice(0, 30).forEach(l => console.log(l));

  await browser.close();
  console.log('Done.');
})();
