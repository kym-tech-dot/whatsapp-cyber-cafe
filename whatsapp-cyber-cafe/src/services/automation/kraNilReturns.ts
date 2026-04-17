import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export async function fileKraNilReturns(pin: string, password: string): Promise<string> {
  // Launch Playwright in headless mode
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Starting automation for PIN: ${pin}`);
    
    // 1. Navigate to iTax Portal
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle' });

    // 2. Login Process
    await page.fill('input[name="logid"]', pin);
    await page.click('#continueBtn');
    
    // Wait for password field and captcha to appear
    await page.waitForSelector('input[name="logpass"]', { timeout: 10000 });
    await page.fill('input[name="logpass"]', password);

    // Solve simple arithmetic captcha (e.g., "7 + 5")
    const captchaText = await page.innerText('#captchaimg');
    const [num1, operator, num2] = captchaText.trim().split(' ');
    let result = 0;
    
    if (operator === '+') result = parseInt(num1) + parseInt(num2);
    else if (operator === '-') result = parseInt(num1) - parseInt(num2);
    
    await page.fill('input[name="captchaCode"]', result.toString());
    
    // Submit Login
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('#loginButton')
    ]);

    // Check for login errors (e.g., invalid password)
    const errorMsg = await page.$('.error');
    if (errorMsg) {
      const text = await errorMsg.innerText();
      if (text.includes('Invalid') || text.includes('failed')) {
        throw new Error('Invalid PIN or Password provided.');
      }
    }

    // 3. Navigate to NIL Returns
    await page.hover('a:has-text("Returns")');
    await page.click('a:has-text("File Nil Return")');
    await page.waitForLoadState('networkidle');

    // 4. Fill Return Form
    await page.selectOption('select[name="taxObligation"]', { label: 'Income Tax - Resident Individual' });
    await page.click('#btnSubmit');
    await page.waitForLoadState('networkidle');

    // The period usually defaults to the previous year
    await page.click('#btnSubmitReturn');
    
    // Handle the alert confirmation ("Are you sure you want to submit?")
    page.on('dialog', dialog => dialog.accept());
    await page.waitForLoadState('networkidle');

    // 5. Download Receipt
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('a:has-text("Download Receipt")')
    ]);
    
    const downloadPath = await download.path();
    
    // Move to a permanent public folder or upload to S3 (Mocking S3 upload here)
    const publicDir = path.join(__dirname, '../../../public/receipts');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    const fileName = `${pin}_NIL_Return_${Date.now()}.pdf`;
    const finalPath = path.join(publicDir, fileName);
    
    // Copy the temporary download to our public folder
    fs.copyFileSync(downloadPath, finalPath);
    
    // Return a mock URL that would be accessible via the Express static file server
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return `${appUrl}/receipts/${fileName}`;

  } catch (error: any) {
    console.error(`Automation failed for PIN ${pin}:`, error.message);
    throw new Error(`Failed to file returns: ${error.message}`);
  } finally {
    await context.close();
    await browser.close();
  }
}
