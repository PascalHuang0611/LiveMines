import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));
    
    await page.goto('http://localhost:5173/TG001_FinalCheck_V14A.html', { waitUntil: 'networkidle2' });
    
    console.log("Page loaded. Clicking a grid...");
    
    await page.evaluate(() => {
      const grids = document.querySelectorAll('.grid-cell');
      if (grids.length > 0) grids[0].click();
    });
    
    await new Promise(r => setTimeout(r, 500));
    
    console.log("Clicking simulate single round...");
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (let b of buttons) {
        if (b.innerText && b.innerText.includes('單局')) {
           b.click();
        }
      }
    });
    
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
  } catch (e) {
    console.error("SCRIPT ERROR:", e);
  }
})();
