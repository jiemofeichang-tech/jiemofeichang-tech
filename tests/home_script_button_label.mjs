import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    const username = `button_test_${Date.now()}`;
    const password = 'pass123456';

    await page.goto('http://127.0.0.1:3001/login', { waitUntil: 'networkidle', timeout: 30000 });
    const authResult = await page.evaluate(async ({ username, password }) => {
      const headers = { 'Content-Type': 'application/json' };

      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      return {
        registerOk: registerRes.ok,
        loginOk: loginRes.ok,
      };
    }, { username, password });

    if (!authResult.loginOk) {
      throw new Error(`无法建立登录态: ${JSON.stringify(authResult)}`);
    }

    await page.goto('http://127.0.0.1:3001', { waitUntil: 'networkidle', timeout: 30000 });

    const button = page.locator('button:has-text("剧本中文")').first();
    await button.waitFor({ state: 'visible', timeout: 5000 });
    await button.click();

    const modalTextarea = page.locator('[class*="modal"] textarea, [class*="Modal"] textarea').first();
    await modalTextarea.waitFor({ state: 'visible', timeout: 5000 });

    console.log('PASS: 首页“剧本中文”按钮可见并可打开剧本编辑器');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('FAIL: 首页“剧本中文”按钮校验失败');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
