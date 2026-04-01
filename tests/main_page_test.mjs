/**
 * Seedance Studio - 主页面完整功能测试（通过 cookie 登录）
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://127.0.0.1:8787';
const issues = [];
const brokenButtons = [];
const workingButtons = [];

function logIssue(cat, desc, sev = 'MEDIUM') {
  issues.push({ category: cat, description: desc, severity: sev });
  console.log(`  ❌ [${sev}] ${cat}: ${desc}`);
}
function logOk(desc) {
  console.log(`  ✅ ${desc}`);
}
async function exists(page, sel, timeout = 2000) {
  try {
    const el = await page.waitForSelector(sel, { timeout });
    return el && await el.isVisible();
  } catch { return false; }
}

(async () => {
  console.log('🚀 Seedance Studio 主页面功能测试\n' + '='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  // Login via API and set cookie
  console.log('\n📋 登录...');
  const loginPage = await context.newPage();

  // Register first
  await loginPage.goto(BACKEND_URL + '/api/auth/register', { waitUntil: 'commit' }).catch(() => {});
  const registerResult = await loginPage.evaluate(async (url) => {
    const r = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tester2', password: 'test123' }),
    });
    return r.json();
  }, BACKEND_URL).catch(() => ({ ok: false }));

  // Login via the actual login page to get proper cookies
  await loginPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await loginPage.waitForTimeout(1500);

  // Fill login form
  const usernameInput = await loginPage.$('input[placeholder*="用户名"]');
  const passwordInput = await loginPage.$('input[placeholder*="密码"]');

  if (usernameInput && passwordInput) {
    await usernameInput.fill('tester2');
    await passwordInput.fill('test123');
    await loginPage.waitForTimeout(300);

    // Click the big login button (not the tab)
    const btns = await loginPage.$$('button');
    for (const b of btns) {
      const text = (await b.textContent())?.trim();
      const bbox = await b.boundingBox();
      // The submit button is wider and taller
      if (text === '登录' && bbox && bbox.width > 200) {
        await b.click();
        break;
      }
    }
    await loginPage.waitForTimeout(3000);
  }

  // Check if login succeeded
  await loginPage.screenshot({ path: 'tests/screenshots/00_after_login.png' });
  const loginSuccess = await exists(loginPage, 'textarea, nav, aside, [class*="sidebar"]', 5000);

  if (!loginSuccess) {
    console.log('  ⚠️  前端登录可能失败,尝试直接注入 cookie...');
    // Get session cookie from backend
    const apiPage = await context.newPage();
    const response = await apiPage.evaluate(async () => {
      const r = await fetch('http://127.0.0.1:8787/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'tester2', password: 'test123' }),
        credentials: 'include',
      });
      return { ok: r.ok, headers: Object.fromEntries(r.headers.entries()) };
    });
    console.log(`  📌 Direct API login: ${JSON.stringify(response).slice(0, 200)}`);
    await apiPage.close();

    // Set cookie manually for the Next.js proxy
    await context.addCookies([{
      name: 'sid',
      value: '99183a610d00573f350894354bceeb8853458f7f95739a6ecc2ac4dd725dfc0f',
      domain: 'localhost',
      path: '/',
    }, {
      name: 'sid',
      value: '99183a610d00573f350894354bceeb8853458f7f95739a6ecc2ac4dd725dfc0f',
      domain: '127.0.0.1',
      path: '/',
    }]);
  }

  await loginPage.close();

  // Now open main page
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const networkErrors = [];
  page.on('requestfailed', req => { networkErrors.push({ url: req.url(), err: req.failure()?.errorText }); });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/01_main_page.png', fullPage: true });

  // Check if we're on the main page or still login
  const onLoginPage = await exists(page, 'input[placeholder*="用户名"]', 1000);
  if (onLoginPage) {
    logIssue('认证', '无法进入主页面，仍停在登录页', 'CRITICAL');
    console.log('\n  ⚠️  尝试通过前端登录...');

    // Try login through the frontend form
    const uInput = await page.$('input[placeholder*="用户名"]');
    const pInput = await page.$('input[placeholder*="密码"]');
    if (uInput && pInput) {
      await uInput.fill('tester2');
      await pInput.fill('test123');

      // Find and click the submit button
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const bbox = await b.boundingBox();
        const text = (await b.textContent())?.trim();
        if (text === '登录' && bbox && bbox.width > 200 && bbox.height > 40) {
          console.log(`  📌 点击登录按钮: ${bbox.width}x${bbox.height} at (${bbox.x},${bbox.y})`);
          await b.click();
          break;
        }
      }

      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'tests/screenshots/01b_after_retry_login.png' });
    }
  }

  const isMainPage = await exists(page, 'textarea', 3000);
  if (isMainPage) {
    logOk('成功进入主页面');
  } else {
    // Check what page we're on
    const bodyText = (await page.textContent('body'))?.slice(0, 300);
    console.log(`  📌 当前页面内容: ${bodyText}`);
  }

  // ============ 全量 UI 元素扫描 ============
  console.log('\n📋 全量 UI 元素扫描');

  const allButtons = await page.$$('button');
  console.log(`  📌 按钮总数: ${allButtons.length}`);

  const visibleButtons = [];
  for (let i = 0; i < allButtons.length; i++) {
    try {
      const b = allButtons[i];
      const isVis = await b.isVisible();
      if (!isVis) continue;
      const text = (await b.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 50);
      const title = await b.getAttribute('title');
      const ariaLabel = await b.getAttribute('aria-label');
      const cls = (await b.getAttribute('class')) || '';
      const isEnabled = await b.isEnabled();
      const bbox = await b.boundingBox();
      const label = text || title || ariaLabel || `Button#${i}`;

      visibleButtons.push({ index: i, label, text, title, ariaLabel, cls: cls.slice(0, 60), enabled: isEnabled, bbox });
    } catch {}
  }

  console.log(`  📌 可见按钮: ${visibleButtons.length}`);
  for (const b of visibleButtons) {
    const status = b.enabled ? '✅' : '❌禁用';
    console.log(`    ${status} [${b.index}] "${b.label}" (${Math.round(b.bbox?.x||0)},${Math.round(b.bbox?.y||0)} ${Math.round(b.bbox?.width||0)}x${Math.round(b.bbox?.height||0)})`);
  }

  // ============ 逐一测试每个按钮 ============
  console.log('\n📋 逐一测试每个可见按钮');

  for (const btnInfo of visibleButtons) {
    const b = allButtons[btnInfo.index];
    if (!b || !btnInfo.enabled) {
      if (!btnInfo.enabled) {
        brokenButtons.push({ description: btnInfo.label, reason: '被禁用' });
        logIssue('按钮禁用', `"${btnInfo.label}" 被禁用`, 'MEDIUM');
      }
      continue;
    }

    try {
      // Skip potentially dangerous buttons (logout, delete, send)
      const skipTexts = ['退出', 'Logout', '登出', '删除', 'Delete'];
      const shouldSkip = skipTexts.some(s => btnInfo.label.includes(s));
      if (shouldSkip) {
        logOk(`"${btnInfo.label}" (跳过危险操作)`);
        workingButtons.push(`${btnInfo.label} (存在,跳过)`);
        continue;
      }

      await b.click();
      await page.waitForTimeout(600);

      // Check if a modal/popup opened
      const hasModal = await exists(page, '[class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="overlay"], [class*="Overlay"], [class*="popup"], [class*="Popup"]', 500);

      if (hasModal) {
        logOk(`"${btnInfo.label}" → 弹窗打开 ✓`);
        workingButtons.push(`${btnInfo.label} (弹窗)`);
        await page.screenshot({ path: `tests/screenshots/btn_${btnInfo.index}_${btnInfo.label.slice(0,10)}.png` });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        logOk(`"${btnInfo.label}" → 点击成功 ✓`);
        workingButtons.push(btnInfo.label);
      }
    } catch (e) {
      brokenButtons.push({ description: btnInfo.label, reason: e.message.slice(0, 80) });
      logIssue('按钮点击失败', `"${btnInfo.label}": ${e.message.slice(0, 60)}`, 'HIGH');
    }
  }

  // Go back home after clicking sidebar/navigation
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);

  // ============ 所有 <a> 链接测试 ============
  console.log('\n📋 链接检查');
  const links = await page.$$('a[href]');
  console.log(`  📌 链接总数: ${links.length}`);
  for (const link of links) {
    try {
      const href = await link.getAttribute('href');
      const text = (await link.textContent())?.trim().slice(0, 30);
      const isVis = await link.isVisible();
      if (!isVis) continue;
      if (!href || href === '#' || href === '' || href.startsWith('javascript:')) {
        logIssue('空链接', `"${text}" href="${href}"`, 'LOW');
        brokenButtons.push({ description: `链接: ${text}`, reason: `空 href: ${href}` });
      } else {
        logOk(`链接: "${text}" → ${href.slice(0, 60)}`);
      }
    } catch {}
  }

  // ============ 输入框测试 ============
  console.log('\n📋 输入框测试');
  const inputs = await page.$$('input, textarea, select');
  for (const inp of inputs) {
    try {
      if (!(await inp.isVisible())) continue;
      const tag = await inp.evaluate(el => el.tagName.toLowerCase());
      const type = await inp.getAttribute('type') || tag;
      const name = await inp.getAttribute('name') || await inp.getAttribute('placeholder') || '';
      const isEnabled = await inp.isEnabled();
      const isReadonly = await inp.getAttribute('readonly') !== null;

      if (isEnabled && !isReadonly) {
        logOk(`输入: ${type} "${name.slice(0, 30)}" 可编辑`);
      } else {
        logIssue('输入框', `${type} "${name.slice(0, 30)}" ${isReadonly ? '只读' : '禁用'}`, 'LOW');
      }
    } catch {}
  }

  // ============ select 下拉框测试 ============
  console.log('\n📋 下拉选择器测试');
  const selects = await page.$$('select');
  for (const sel of selects) {
    try {
      if (!(await sel.isVisible())) continue;
      const name = await sel.getAttribute('name') || await sel.getAttribute('id') || '';
      const options = await sel.$$('option');
      const isEnabled = await sel.isEnabled();
      if (isEnabled && options.length > 0) {
        logOk(`下拉: "${name}" (${options.length} 选项)`);
      } else if (!isEnabled) {
        logIssue('下拉框', `"${name}" 被禁用`, 'MEDIUM');
        brokenButtons.push({ description: `下拉: ${name}`, reason: '禁用' });
      } else {
        logIssue('下拉框', `"${name}" 无选项`, 'MEDIUM');
      }
    } catch {}
  }

  // ============ 特定功能测试: 风格弹窗 ============
  console.log('\n📋 特定功能: 风格选择');
  const styleBtn = await page.$('button:has-text("风格"), button:has-text("Style"), button:has-text("147")');
  if (styleBtn && await styleBtn.isVisible()) {
    await styleBtn.click();
    await page.waitForTimeout(800);
    const styleModal = await exists(page, '[class*="modal"], [class*="Modal"]');
    if (styleModal) {
      // Count style items
      const styleItems = await page.$$('[class*="style"] [class*="item"], [class*="style"] [class*="card"], [class*="grid"] > div');
      logOk(`风格弹窗打开, 找到 ${styleItems.length} 个风格元素`);

      // Test category filter
      const categoryBtns = await page.$$('[class*="modal"] button, [class*="Modal"] button');
      console.log(`  📌 弹窗中按钮数: ${categoryBtns.length}`);

      await page.screenshot({ path: 'tests/screenshots/style_modal.png' });
      await page.keyboard.press('Escape');
    } else {
      logIssue('风格', '风格弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '风格按钮', reason: '弹窗未打开' });
    }
  }

  // ============ 特定功能: 上传弹窗 ============
  console.log('\n📋 特定功能: 上传弹窗');
  const uploadBtn = await page.$('button:has-text("+")');
  if (uploadBtn && await uploadBtn.isVisible()) {
    await uploadBtn.click();
    await page.waitForTimeout(800);
    const uploadModal = await exists(page, '[class*="modal"], [class*="Modal"]');
    if (uploadModal) {
      logOk('上传弹窗打开');
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) logOk('文件上传 input 存在');
      else logIssue('上传', '文件上传 input 未找到', 'MEDIUM');
      await page.screenshot({ path: 'tests/screenshots/upload_modal.png' });
      await page.keyboard.press('Escape');
    } else {
      logIssue('上传', '上传弹窗未打开', 'HIGH');
    }
  }

  // ============ API 端点测试 ============
  console.log('\n📋 API 端点测试');
  const endpoints = [
    { path: '/api/config', name: 'Config' },
    { path: '/api/history', name: 'History' },
    { path: '/api/library', name: 'Library' },
    { path: '/api/health', name: 'Health' },
    { path: '/api/trash', name: 'Trash' },
    { path: '/api/projects', name: 'Projects' },
    { path: '/api/auth/me', name: 'Auth/Me' },
  ];

  for (const ep of endpoints) {
    try {
      const result = await page.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, ok: r.ok };
      }, ep.path);

      if (result.ok) logOk(`API ${ep.name}: ${result.status}`);
      else logIssue('API', `${ep.name} (${ep.path}): ${result.status}`, result.status === 401 ? 'HIGH' : 'MEDIUM');
    } catch (e) {
      logIssue('API', `${ep.name}: ${e.message.slice(0, 60)}`, 'HIGH');
    }
  }

  // ============ 响应式测试 ============
  console.log('\n📋 响应式布局');
  for (const vp of [{ w: 1920, h: 1080, n: '桌面' }, { w: 768, h: 1024, n: '平板' }, { w: 375, h: 812, n: '手机' }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    if (overflow) logIssue('响应式', `${vp.n}(${vp.w}) 水平溢出`, 'MEDIUM');
    else logOk(`${vp.n}(${vp.w}) 正常`);
    await page.screenshot({ path: `tests/screenshots/responsive_${vp.w}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ============ 最终报告 ============
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 最终测试报告');
  console.log('='.repeat(60));

  const uniqueConsoleErrors = [...new Set(consoleErrors)];
  if (uniqueConsoleErrors.length > 0) {
    console.log(`\n⚠️  控制台错误 (${uniqueConsoleErrors.length}):`);
    for (const e of uniqueConsoleErrors.slice(0, 15)) {
      logIssue('控制台', e.slice(0, 120), 'MEDIUM');
    }
  }

  const uniqueNetErrors = [...new Map(networkErrors.map(e => [e.url, e])).values()];
  if (uniqueNetErrors.length > 0) {
    console.log(`\n⚠️  网络错误 (${uniqueNetErrors.length}):`);
    for (const e of uniqueNetErrors.slice(0, 10)) {
      logIssue('网络', `${e.url.slice(0, 80)} - ${e.err}`, 'MEDIUM');
    }
  }

  const c = issues.filter(i => i.severity === 'CRITICAL');
  const h = issues.filter(i => i.severity === 'HIGH');
  const m = issues.filter(i => i.severity === 'MEDIUM');
  const l = issues.filter(i => i.severity === 'LOW');

  console.log(`\n🔢 问题统计: 总计 ${issues.length}`);
  console.log(`  🔴 CRITICAL: ${c.length}`);
  console.log(`  🟠 HIGH:     ${h.length}`);
  console.log(`  🟡 MEDIUM:   ${m.length}`);
  console.log(`  🔵 LOW:      ${l.length}`);

  console.log(`\n✅ 正常按钮 (${workingButtons.length}):`);
  for (const b of workingButtons) console.log(`  ✅ ${b}`);

  console.log(`\n❌ 失效按钮 (${brokenButtons.length}):`);
  for (const b of brokenButtons) console.log(`  ❌ ${b.description}: ${b.reason}`);

  for (const [sev, label, list] of [['CRITICAL', '🔴', c], ['HIGH', '🟠', h], ['MEDIUM', '🟡', m], ['LOW', '🔵', l]]) {
    if (list.length > 0) {
      console.log(`\n${label} ${sev} (${list.length}):`);
      for (const i of list) console.log(`  • ${i.category}: ${i.description}`);
    }
  }

  const fs = await import('fs');
  fs.writeFileSync('tests/functional_test_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: issues.length, critical: c.length, high: h.length, medium: m.length, low: l.length },
    workingButtons, brokenButtons, issues,
    consoleErrors: uniqueConsoleErrors, networkErrors: uniqueNetErrors,
  }, null, 2));

  await browser.close();
  console.log('\n✅ 测试完成\n');
})();
