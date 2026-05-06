import puppeteer from 'puppeteer';

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
        if(msg.type() === 'error') errors.push(msg.text());
        // console.log('BROWSER LOG:', msg.text());
    });
    
    page.on('dialog', async dialog => {
        console.log('ALERT DIALOG:', dialog.message());
        await dialog.dismiss();
    });

    console.log("Navigating to App...");
    await page.goto('http://localhost:5173/TG001_FinalCheck_V3.html', { waitUntil: 'networkidle2' });
    
    const appElement = await page.$('#app');
    if (!appElement) throw new Error("App failed to mount.");
    console.log("✅ App loaded successfully.");

    // Grid selector
    console.log("Testing grid selection (setting betAmount via input)...");
    await page.evaluate(() => {
      // 找到第一個格子的 number input，把它填成 100
      const inputs = document.querySelectorAll('.grid-cell input[type="number"]');
      if (inputs.length > 0) {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputSetter.call(inputs[0], '100');
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 300));

    // Single Simulation
    console.log("Testing Single Simulation...");
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (let b of buttons) {
        if (b.innerText && b.innerText.includes('單局')) {
           b.click();
        }
      }
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Check history (div with border-l-4 inside history area)
    const historyCount = await page.evaluate(() => {
      const histories = document.querySelectorAll('.custom-scrollbar > div.cursor-pointer');
      return histories.length;
    });
    console.log(`History records count after single simulation: ${historyCount}`);
    if (historyCount < 1) throw new Error("History was not recorded for single simulation!");
    console.log("✅ Single Simulation executed correctly.");

    // Batch Simulation
    console.log("Testing Batch Simulation...");
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="number"]');
      if(inputs.length > 0) {
          inputs[0].value = 10;
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }

      const buttons = document.querySelectorAll('button');
      for (let b of buttons) {
        if (b.innerText && b.innerText.includes('自動開獎')) {
           b.click();
        }
      }
    });

    await new Promise(r => setTimeout(r, 3000));

    const newHistoryCount = await page.evaluate(() => {
        return document.querySelectorAll('.custom-scrollbar > div.cursor-pointer').length;
    });
    console.log(`History records count after batch simulation: ${newHistoryCount}`);
    if (newHistoryCount <= historyCount) throw new Error("Batch simulation failed to update history!");
    console.log("✅ Batch Simulation executed correctly.");

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (canvasCount === 0) throw new Error("Chart canvas is not present in the DOM!");
    console.log("✅ Chart canvas found and rendered.");

    if (errors.length > 0) {
        console.error("❌ BROWSER ERRORS DETECTED:");
        errors.forEach(e => console.error(e));
        process.exit(1);
    } else {
        console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    }
    
  } catch (e) {
    console.error("❌ TEST RUNNER ERROR:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
