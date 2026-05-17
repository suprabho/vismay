const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set auth cookie to bypass middleware
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
    if (text.includes('MapboxBackground') || text.includes('re-render') || text.includes('[map]') || text.includes('Warning') || text.includes('blink')) {
      logs.push(`[${msg.type()}] ${text}`);
    }
  });

  console.log('Navigating...');
  await page.goto('http://localhost:3000/story/delimitation-2011-census/share', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Current URL:', page.url());
  console.log('Waiting 3s for map tiles + GeoJSON...');
  await page.waitForTimeout(3000);

  console.log('Taking screenshot 1...');
  await page.screenshot({ path: '/tmp/map_check_1.png', fullPage: true });
  console.log('Screenshot 1 saved.');

  await page.waitForTimeout(1000);
  console.log('Taking screenshot 2...');
  await page.screenshot({ path: '/tmp/map_check_2.png', fullPage: true });
  console.log('Screenshot 2 saved.');

  await page.waitForTimeout(1000);
  console.log('Taking screenshot 3...');
  await page.screenshot({ path: '/tmp/map_check_3.png', fullPage: true });
  console.log('Screenshot 3 saved.');

  console.log('Console logs captured:', logs.length);
  if (logs.length > 0) {
    logs.forEach(l => console.log(l));
  } else {
    console.log('No MapboxBackground/re-render/Warning logs detected.');
  }

  await browser.close();
  console.log('Done.');
})();
