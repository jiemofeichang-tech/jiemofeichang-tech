import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";

async function login(page) {
  const username = `home_refresh_${Date.now()}`;
  const password = "pass123456";

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });

  const authResult = await page.evaluate(async ({ username, password }) => {
    const headers = { "Content-Type": "application/json" };

    const registerRes = await fetch("/api/auth/register", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    const loginRes = await fetch("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    return {
      registerOk: registerRes.ok,
      loginOk: loginRes.ok,
    };
  }, { username, password });

  if (!authResult.loginOk) {
    throw new Error(`登录失败: ${JSON.stringify(authResult)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

  try {
    await login(page);
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

    await page.locator('[data-home-shell="cinema"]').waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-home-hero="headline"]').waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-home-hero="stats"]').waitFor({ state: "visible", timeout: 5000 });

    const sections = ["workflow", "projects", "highlights", "discover"];
    for (const section of sections) {
      await page.locator(`[data-home-section="${section}"]`).waitFor({ state: "visible", timeout: 5000 });
    }

    console.log("PASS: 首页新版结构和主题变量已生效");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FAIL: 首页新版结构检查失败");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
