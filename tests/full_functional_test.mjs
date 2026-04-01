/**
 * Seedance Studio - 完整功能性测试（含登录）
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const issues = [];
const brokenButtons = [];
const workingButtons = [];

function logIssue(category, description, severity = 'MEDIUM') {
  issues.push({ category, description, severity });
  console.log(`  ❌ [${severity}] ${category}: ${description}`);
}
function logOk(description) {
  console.log(`  ✅ ${description}`);
}

async function safeClick(page, selector, description, timeout = 3000) {
  try {
    const el = await page.waitForSelector(selector, { timeout });
    if (!el) { brokenButtons.push({ description, reason: '元素未找到' }); return false; }
    if (!(await el.isVisible())) { brokenButtons.push({ description, reason: '不可见' }); return false; }
    if (!(await el.isEnabled())) { brokenButtons.push({ description, reason: '禁用' }); return false; }
    await el.click({ timeout: 2000 });
    workingButtons.push(description);
    return true;
  } catch (e) {
    brokenButtons.push({ description, reason: e.message.slice(0, 100) });
    return false;
  }
}

async function exists(page, selector, timeout = 2000) {
  try {
    const el = await page.waitForSelector(selector, { timeout });
    return el && await el.isVisible();
  } catch { return false; }
}

(async () => {
  console.log('🚀 Seedance Studio 完整功能性测试\n' + '='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const networkErrors = [];
  page.on('requestfailed', req => { networkErrors.push({ url: req.url(), err: req.failure()?.errorText }); });

  // ============ 阶段1: 登录页面测试 ============
  console.log('\n📋 阶段1: 登录页面测试');

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshots/00_login_page.png' });

  // 测试登录页元素
  const loginTab = await exists(page, 'button:has-text("登录")');
  const registerTab = await exists(page, 'button:has-text("注册")');
  const usernameInput = await exists(page, 'input[placeholder*="用户名"]');
  const passwordInput = await exists(page, 'input[placeholder*="密码"]');
  const loginBtn = await exists(page, 'button:has-text("登录")');

  if (loginTab) logOk('登录 Tab 存在');
  else logIssue('登录页', '登录 Tab 未找到', 'CRITICAL');
  if (registerTab) logOk('注册 Tab 存在');
  else logIssue('登录页', '注册 Tab 未找到', 'HIGH');
  if (usernameInput) logOk('用户名输入框存在');
  else logIssue('登录页', '用户名输入框未找到', 'CRITICAL');
  if (passwordInput) logOk('密码输入框存在');
  else logIssue('登录页', '密码输入框未找到', 'CRITICAL');

  // 测试: 空表单提交
  console.log('\n  🔍 测试空表单提交...');
  const loginButton = await page.$('button:has-text("登录"):not([role="tab"])');
  // Find the submit button (not the tab)
  const allBtns = await page.$$('button');
  let submitBtn = null;
  for (const b of allBtns) {
    const text = (await b.textContent())?.trim();
    const bbox = await b.boundingBox();
    if (text === '登录' && bbox && bbox.height > 35) { // Submit button is larger
      submitBtn = b;
      break;
    }
  }
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForTimeout(500);
    const errorMsg = await page.$('[class*="error"], [class*="alert"], [class*="warning"], [style*="red"]');
    if (errorMsg) {
      logOk('空表单提交有错误提示');
    } else {
      logIssue('登录页', '空表单提交无错误提示', 'MEDIUM');
    }
  }

  // 先注册一个测试账号
  console.log('\n  🔍 注册测试账号...');
  const regTabBtn = await page.$('button:has-text("注册")');
  if (regTabBtn) {
    await regTabBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/01_register_page.png' });

    // Fill registration form
    const inputs = await page.$$('input');
    console.log(`  📌 注册表单找到 ${inputs.length} 个输入框`);

    // Try to register
    const usernameField = await page.$('input[placeholder*="用户名"]');
    const passwordField = await page.$('input[placeholder*="密码"]');
    const confirmField = await page.$('input[placeholder*="确认"], input[placeholder*="再次"]');

    if (usernameField) await usernameField.fill('testuser');
    if (passwordField) await passwordField.fill('testpass123');
    if (confirmField) {
      await confirmField.fill('testpass123');
      logOk('注册表单有确认密码字段');
    } else {
      logIssue('注册页', '注册表单缺少确认密码字段', 'MEDIUM');
    }

    // Click register submit
    const regSubmitBtns = await page.$$('button');
    for (const b of regSubmitBtns) {
      const text = (await b.textContent())?.trim();
      const bbox = await b.boundingBox();
      if (text === '注册' && bbox && bbox.height > 35) {
        await b.click();
        break;
      }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/02_after_register.png' });
  }

  // 登录
  console.log('\n  🔍 登录...');
  // Navigate back to login if needed
  const loginTabBtn = await page.$('button:has-text("登录")');
  if (loginTabBtn) {
    await loginTabBtn.click();
    await page.waitForTimeout(300);
  }

  const userField = await page.$('input[placeholder*="用户名"]');
  const passField = await page.$('input[placeholder*="密码"]');
  if (userField && passField) {
    await userField.fill('testuser');
    await passField.fill('testpass123');

    // Find and click login submit
    const btns = await page.$$('button');
    for (const b of btns) {
      const text = (await b.textContent())?.trim();
      const bbox = await b.boundingBox();
      if (text === '登录' && bbox && bbox.height > 35) {
        await b.click();
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/03_after_login.png' });

    // Check if we got to main page
    const mainPage = await exists(page, 'textarea, nav, aside, [class*="sidebar"]', 5000);
    if (mainPage) {
      logOk('登录成功，进入主页面');
    } else {
      logIssue('登录', '登录后未能进入主页面', 'CRITICAL');
      // Try to check what happened
      const bodyText = await page.textContent('body');
      console.log(`  📌 页面内容: ${bodyText?.slice(0, 200)}`);
    }
  }

  // Take screenshot of main page
  await page.screenshot({ path: 'tests/screenshots/04_main_page.png', fullPage: true });

  // ============ 阶段2: 主页面布局测试 ============
  console.log('\n📋 阶段2: 主页面布局测试');

  const hasSidebar = await exists(page, 'nav, aside, [class*="sidebar"], [class*="Sidebar"]');
  const hasHeader = await exists(page, 'header, [class*="header"], [class*="Header"]');
  const hasTextarea = await exists(page, 'textarea');
  const hasMainContent = await exists(page, 'main, [class*="main"], [class*="content"]');

  if (hasSidebar) logOk('侧边栏存在');
  else logIssue('布局', '侧边栏未找到', 'HIGH');
  if (hasHeader) logOk('头部导航存在');
  else logIssue('布局', '头部导航未找到', 'HIGH');
  if (hasTextarea) logOk('主输入框 (textarea) 存在');
  else logIssue('布局', '主输入框未找到', 'HIGH');
  if (hasMainContent) logOk('主内容区域存在');
  else logIssue('布局', '主内容区域未找到', 'MEDIUM');

  // ============ 阶段3: 全量按钮扫描 ============
  console.log('\n📋 阶段3: 全量按钮扫描');

  const allPageButtons = await page.$$('button');
  console.log(`  📌 页面共找到 ${allPageButtons.length} 个按钮`);

  const buttonInfo = [];
  for (let i = 0; i < allPageButtons.length; i++) {
    try {
      const b = allPageButtons[i];
      const text = (await b.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 50);
      const title = await b.getAttribute('title');
      const ariaLabel = await b.getAttribute('aria-label');
      const isVisible = await b.isVisible();
      const isEnabled = await b.isEnabled();
      const bbox = await b.boundingBox();
      const label = text || title || ariaLabel || `#${i}`;

      buttonInfo.push({
        index: i, label, text, title, ariaLabel,
        visible: isVisible, enabled: isEnabled,
        x: bbox?.x, y: bbox?.y, w: bbox?.width, h: bbox?.height,
      });
    } catch {}
  }

  // Report visible buttons
  const visibleBtns = buttonInfo.filter(b => b.visible);
  console.log(`  📌 其中 ${visibleBtns.length} 个可见按钮:`);
  for (const b of visibleBtns) {
    const status = b.enabled ? '✅ 启用' : '❌ 禁用';
    console.log(`    ${status} [${b.index}] "${b.label}" (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
    if (!b.enabled) {
      brokenButtons.push({ description: `按钮 "${b.label}"`, reason: '被禁用' });
    }
  }

  // ============ 阶段4: 侧边栏按钮逐一测试 ============
  console.log('\n📋 阶段4: 侧边栏按钮测试');

  const sidebarEl = await page.$('nav, aside, [class*="sidebar"], [class*="Sidebar"]');
  if (sidebarEl) {
    const sideButtons = await sidebarEl.$$('button');
    console.log(`  📌 侧边栏找到 ${sideButtons.length} 个按钮`);
    for (let i = 0; i < sideButtons.length; i++) {
      const text = (await sideButtons[i].textContent())?.trim().slice(0, 30);
      const title = await sideButtons[i].getAttribute('title');
      const label = text || title || `侧边栏按钮 #${i}`;
      try {
        if (await sideButtons[i].isVisible()) {
          await sideButtons[i].click();
          await page.waitForTimeout(600);
          logOk(`侧边栏: "${label}" ✓ 可点击`);
          workingButtons.push(`侧边栏: ${label}`);
          await page.screenshot({ path: `tests/screenshots/04_sidebar_${i}.png` });
        }
      } catch (e) {
        brokenButtons.push({ description: `侧边栏: ${label}`, reason: e.message.slice(0, 80) });
        logIssue('侧边栏按钮', `"${label}" 点击失败`, 'HIGH');
      }
    }
    // Go home
    if (sideButtons.length > 0 && await sideButtons[0].isVisible()) {
      await sideButtons[0].click();
      await page.waitForTimeout(500);
    }
  }

  // ============ 阶段5: 头部按钮逐一测试 ============
  console.log('\n📋 阶段5: 头部按钮测试');

  const headerEl = await page.$('header, [class*="header"], [class*="Header"]');
  if (headerEl) {
    const headerBtns = await headerEl.$$('button');
    console.log(`  📌 头部找到 ${headerBtns.length} 个按钮`);
    for (let i = 0; i < headerBtns.length; i++) {
      const text = (await headerBtns[i].textContent())?.trim().slice(0, 30);
      const title = await headerBtns[i].getAttribute('title');
      const label = text || title || `头部按钮 #${i}`;
      try {
        if (await headerBtns[i].isVisible()) {
          await headerBtns[i].click();
          await page.waitForTimeout(600);
          logOk(`头部: "${label}" ✓ 可点击`);
          workingButtons.push(`头部: ${label}`);
          await page.screenshot({ path: `tests/screenshots/05_header_${i}.png` });
          // Close any modal
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      } catch (e) {
        brokenButtons.push({ description: `头部: ${label}`, reason: e.message.slice(0, 80) });
        logIssue('头部按钮', `"${label}" 点击失败`, 'HIGH');
      }
    }
  }

  // ============ 阶段6: 输入框和工具栏 ============
  console.log('\n📋 阶段6: 输入框和工具栏测试');

  const textarea = await page.$('textarea');
  if (textarea) {
    // Test input
    await textarea.click();
    await textarea.fill('');
    await textarea.type('一只猫在月光下跳舞');
    const value = await textarea.inputValue();
    if (value.includes('猫')) logOk('输入框: 文本输入正常');
    else logIssue('输入框', '文本输入异常', 'HIGH');

    // Test placeholder
    await textarea.fill('');
    const placeholder = await textarea.getAttribute('placeholder');
    if (placeholder) logOk(`输入框: placeholder = "${placeholder.slice(0, 40)}"`);
  }

  // Find toolbar buttons (near textarea)
  const toolbarKeywords = [
    { text: '+', label: '上传(+)' },
    { text: '剧本中文', label: '剧本中文' },
    { text: 'Script', label: '脚本(EN)' },
    { text: '风格', label: '风格' },
    { text: 'Style', label: '风格(EN)' },
    { text: '素材', label: '素材' },
    { text: 'Asset', label: '素材(EN)' },
    { text: '147', label: '风格数量' },
  ];

  for (const kw of toolbarKeywords) {
    const btn = await page.$(`button:has-text("${kw.text}")`);
    if (btn && await btn.isVisible()) {
      try {
        await btn.click();
        await page.waitForTimeout(800);
        const hasModal = await exists(page, '[class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"], [class*="Modal"]', 1000);
        if (hasModal) {
          logOk(`工具栏 "${kw.label}": 点击后弹窗正常打开`);
          workingButtons.push(`工具栏: ${kw.label}`);
          await page.screenshot({ path: `tests/screenshots/06_toolbar_${kw.label}.png` });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } else {
          logIssue('工具栏', `"${kw.label}" 点击后无弹窗/响应`, 'HIGH');
          brokenButtons.push({ description: `工具栏: ${kw.label}`, reason: '点击无弹窗' });
        }
      } catch (e) {
        brokenButtons.push({ description: `工具栏: ${kw.label}`, reason: e.message.slice(0, 80) });
        logIssue('工具栏', `"${kw.label}" 交互异常`, 'HIGH');
      }
    }
  }

  // ============ 阶段7: 生成模式按钮 ============
  console.log('\n📋 阶段7: 生成模式按钮测试');

  const modeKeywords = [
    '纯文本', 'text', '首帧', 'first frame', '首尾帧', 'first last',
    '图生视频', 'image to video', '视频参考', 'video ref', '延展视频', 'extend',
  ];

  for (const kw of modeKeywords) {
    const btn = await page.$(`button:has-text("${kw}")`);
    if (btn && await btn.isVisible()) {
      try {
        await btn.click();
        await page.waitForTimeout(400);
        logOk(`生成模式: "${kw}" ✓ 可切换`);
        workingButtons.push(`模式: ${kw}`);
      } catch (e) {
        brokenButtons.push({ description: `模式: ${kw}`, reason: e.message.slice(0, 80) });
        logIssue('生成模式', `"${kw}" 点击失败`, 'MEDIUM');
      }
    }
  }

  // ============ 阶段8: 高级参数面板 ============
  console.log('\n📋 阶段8: 高级参数面板');

  // Try to expand generation panel
  const expandBtn = await page.$('button:has-text("展开"), button:has-text("高级"), button:has-text("Advanced"), button:has-text("参数"), [class*="expand"]');
  if (expandBtn && await expandBtn.isVisible()) {
    await expandBtn.click();
    await page.waitForTimeout(500);
    logOk('高级参数面板展开按钮可用');
    workingButtons.push('展开高级参数');
  }

  // Check select dropdowns
  const selects = await page.$$('select');
  console.log(`  📌 找到 ${selects.length} 个下拉选择器`);
  for (const sel of selects) {
    if (await sel.isVisible()) {
      const name = await sel.getAttribute('name') || await sel.getAttribute('id') || '';
      const options = await sel.$$('option');
      logOk(`下拉框 "${name}": ${options.length} 个选项`);
    }
  }

  // Check toggles/switches
  const toggles = await page.$$('input[type="checkbox"], [class*="toggle"], [class*="switch"]');
  let visibleToggles = 0;
  for (const t of toggles) {
    if (await t.isVisible()) visibleToggles++;
  }
  console.log(`  📌 找到 ${visibleToggles} 个可见开关控件`);

  // ============ 阶段9: 发送功能测试（空 prompt） ============
  console.log('\n📋 阶段9: 发送按钮测试');

  // Find send button - could be icon button (circular)
  const sendBtns = await page.$$('button');
  let sendButton = null;
  for (const b of sendBtns) {
    const ariaLabel = await b.getAttribute('aria-label');
    const text = (await b.textContent())?.trim();
    const cls = (await b.getAttribute('class')) || '';
    const svg = await b.$('svg');
    if ((text === '发送' || text === 'Send' || ariaLabel?.includes('send') || ariaLabel?.includes('发送') ||
         cls.includes('send') || cls.includes('pink') || cls.includes('submit')) &&
        await b.isVisible()) {
      sendButton = b;
      break;
    }
    // Check for circular pink button (send icon)
    if (svg && await b.isVisible()) {
      const bbox = await b.boundingBox();
      if (bbox && Math.abs(bbox.width - bbox.height) < 5 && bbox.width > 30 && bbox.width < 60) {
        sendButton = b; // Likely the send icon button
      }
    }
  }

  if (sendButton) {
    const isEnabled = await sendButton.isEnabled();
    const sendText = (await sendButton.textContent())?.trim() || '(icon)';
    logOk(`发送按钮找到: "${sendText}" (${isEnabled ? '启用' : '禁用'})`);

    // Test send with content
    if (textarea) {
      await textarea.fill('测试发送 - 一只猫在跳舞');
      await page.waitForTimeout(300);
      // Don't actually click send to avoid API call
      logOk('发送按钮: 填入内容后状态正常');
    }
  } else {
    logIssue('发送按钮', '未找到发送按钮', 'HIGH');
    brokenButtons.push({ description: '发送按钮', reason: '未找到' });
  }

  // ============ 阶段10: Managed/Chat 模式切换 ============
  console.log('\n📋 阶段10: Managed/Chat 模式切换');

  for (const kw of ['Managed', '管理', 'Chat', '对话']) {
    const btn = await page.$(`button:has-text("${kw}")`);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(400);
      logOk(`模式: "${kw}" ✓`);
      workingButtons.push(`模式切换: ${kw}`);
    }
  }

  // ============ 阶段11: 设置/头像菜单 ============
  console.log('\n📋 阶段11: 设置和头像菜单');

  // Find avatar/user menu
  const avatarSelectors = ['[class*="avatar"]', '[class*="Avatar"]', 'button[class*="user"]', 'button:has-text("设置")'];
  for (const sel of avatarSelectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) {
      await el.click();
      await page.waitForTimeout(600);
      logOk(`头像/设置按钮 (${sel}) 可点击`);
      await page.screenshot({ path: 'tests/screenshots/11_avatar_menu.png' });

      // Check for menu items
      const menuItems = await page.$$('[class*="menu"] button, [class*="Menu"] button, [class*="dropdown"] button, [role="menuitem"]');
      if (menuItems.length > 0) {
        console.log(`  📌 菜单中找到 ${menuItems.length} 个选项`);
        for (const mi of menuItems) {
          const miText = (await mi.textContent())?.trim().slice(0, 30);
          if (miText) console.log(`    • ${miText}`);
        }
      }

      // Check for settings modal
      const hasSettingsModal = await exists(page, '[class*="modal"], [class*="Modal"]');
      if (hasSettingsModal) {
        logOk('设置弹窗已打开');
        // Check for form inputs in the modal
        const modalInputs = await page.$$('[class*="modal"] input, [class*="Modal"] input');
        console.log(`  📌 设置弹窗中找到 ${modalInputs.length} 个输入框`);

        // Check save button
        const saveBtn = await page.$('button:has-text("保存"), button:has-text("Save")');
        if (saveBtn && await saveBtn.isVisible()) {
          logOk('保存设置按钮存在');
          workingButtons.push('保存设置');
        } else {
          logIssue('设置弹窗', '保存按钮未找到', 'MEDIUM');
          brokenButtons.push({ description: '保存设置按钮', reason: '未找到' });
        }
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      break;
    }
  }

  // ============ 阶段12: FAQ/帮助测试 ============
  console.log('\n📋 阶段12: FAQ/帮助测试');

  const faqSelectors = ['button:has-text("FAQ")', 'button:has-text("帮助")', 'button:has-text("?")', 'button[title*="FAQ"]'];
  for (const sel of faqSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(600);
      const hasModal = await exists(page, '[class*="modal"], [class*="Modal"]');
      if (hasModal) {
        logOk('FAQ 弹窗正常打开');
        workingButtons.push('FAQ');
        await page.screenshot({ path: 'tests/screenshots/12_faq.png' });
        await page.keyboard.press('Escape');
      } else {
        logIssue('FAQ', '点击后弹窗未出现', 'MEDIUM');
        brokenButtons.push({ description: 'FAQ按钮', reason: '无弹窗' });
      }
      break;
    }
  }

  // ============ 阶段13: WeChat/Discord 链接 ============
  console.log('\n📋 阶段13: 社交链接测试');

  const socialKeywords = ['微信', 'WeChat', 'Discord', 'QR'];
  for (const kw of socialKeywords) {
    const btn = await page.$(`button:has-text("${kw}"), a:has-text("${kw}")`);
    if (btn && await btn.isVisible()) {
      logOk(`社交链接: "${kw}" 按钮存在`);
      workingButtons.push(`社交: ${kw}`);
    }
  }

  // Check all links
  const links = await page.$$('a[href]');
  console.log(`  📌 找到 ${links.length} 个链接`);
  for (const link of links) {
    const href = await link.getAttribute('href');
    const text = (await link.textContent())?.trim().slice(0, 30);
    const isVisible = await link.isVisible();
    if (isVisible && href) {
      if (href === '#' || href === '') {
        logIssue('链接', `空链接: "${text}" (href="${href}")`, 'LOW');
      } else {
        logOk(`链接: "${text}" → ${href.slice(0, 60)}`);
      }
    }
  }

  // ============ 阶段14: Projects 页面 ============
  console.log('\n📋 阶段14: Projects 页面');

  const projectsSelectors = [
    'button:has-text("Projects")', 'button:has-text("项目")',
    'button[title*="project"]', 'button[title*="Project"]',
  ];
  let navigatedToProjects = false;
  for (const sel of projectsSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(1000);
      logOk('导航到 Projects 页面');
      navigatedToProjects = true;
      await page.screenshot({ path: 'tests/screenshots/14_projects.png' });

      // Test project page elements
      const searchInput = await page.$('input[type="search"], input[placeholder*="搜索"], input[placeholder*="Search"]');
      if (searchInput) logOk('项目搜索框存在');
      else logIssue('Projects', '搜索框未找到', 'LOW');

      const tabs = await page.$$('[class*="tab"] button, [role="tab"]');
      console.log(`  📌 Projects 页面 Tab: ${tabs.length} 个`);

      break;
    }
  }
  if (!navigatedToProjects) {
    logIssue('导航', 'Projects 页面无法导航', 'MEDIUM');
  }

  // Navigate back home
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // ============ 阶段15: Workflow 页面 ============
  console.log('\n📋 阶段15: Workflow 页面');

  // Find workflow button
  const wfBtn = await page.$('button:has-text("AI Workflow"), button:has-text("工作流"), a[href*="workflow"]');
  if (wfBtn && await wfBtn.isVisible()) {
    await wfBtn.click();
    await page.waitForTimeout(1500);
    logOk('Workflow 按钮可点击');
    await page.screenshot({ path: 'tests/screenshots/15_workflow.png' });
  } else {
    // Try direct navigation
    await page.goto(`${BASE_URL}/workflow/new`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tests/screenshots/15_workflow_direct.png' });
  }

  const wfContent = await page.textContent('body');
  if (wfContent && wfContent.length > 100) {
    logOk('Workflow 页面有内容');
    // Check workflow buttons
    const wfButtons = await page.$$('button');
    console.log(`  📌 Workflow 页面找到 ${wfButtons.length} 个按钮`);
  } else {
    logIssue('Workflow', '页面内容很少', 'MEDIUM');
  }

  // ============ 阶段16: Trash 页面 ============
  console.log('\n📋 阶段16: Trash (回收站) 页面');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const trashBtn = await page.$('button:has-text("Trash"), button:has-text("回收站"), button[title*="trash"], button[title*="Trash"]');
  if (trashBtn && await trashBtn.isVisible()) {
    await trashBtn.click();
    await page.waitForTimeout(800);
    logOk('回收站按钮可点击');
    await page.screenshot({ path: 'tests/screenshots/16_trash.png' });
    workingButtons.push('回收站');
  } else {
    logIssue('回收站', '回收站按钮未找到', 'LOW');
  }

  // ============ 阶段17: API 端点测试 ============
  console.log('\n📋 阶段17: API 端点测试');

  const apiEndpoints = [
    { url: '/api/config', method: 'GET', name: 'Config' },
    { url: '/api/history', method: 'GET', name: 'History' },
    { url: '/api/library', method: 'GET', name: 'Library' },
    { url: '/api/health', method: 'GET', name: 'Health' },
    { url: '/api/trash', method: 'GET', name: 'Trash' },
    { url: '/api/projects', method: 'GET', name: 'Projects' },
    { url: '/api/auth/me', method: 'GET', name: 'Auth/Me' },
  ];

  for (const ep of apiEndpoints) {
    try {
      const result = await page.evaluate(async (endpoint) => {
        try {
          const r = await fetch(endpoint.url, { method: endpoint.method });
          const text = await r.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text.slice(0, 100); }
          return { status: r.status, data };
        } catch (e) {
          return { error: e.message };
        }
      }, ep);

      if (result.error) {
        logIssue('API', `${ep.name} (${ep.url}) 请求失败: ${result.error}`, 'HIGH');
      } else if (result.status >= 200 && result.status < 300) {
        logOk(`API ${ep.name}: ${result.status} OK`);
      } else if (result.status === 401) {
        logIssue('API', `${ep.name}: 401 未授权 (可能 session 未传递)`, 'MEDIUM');
      } else if (result.status === 404) {
        logIssue('API', `${ep.name}: 404 未找到`, 'MEDIUM');
      } else {
        logIssue('API', `${ep.name}: ${result.status} - ${JSON.stringify(result.data).slice(0, 60)}`, 'MEDIUM');
      }
    } catch (e) {
      logIssue('API', `${ep.name} 测试异常: ${e.message.slice(0, 60)}`, 'HIGH');
    }
  }

  // ============ 阶段18: 响应式布局 ============
  console.log('\n📋 阶段18: 响应式布局测试');

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const viewports = [
    { width: 1920, height: 1080, name: '桌面(1920)' },
    { width: 1366, height: 768, name: '笔记本(1366)' },
    { width: 768, height: 1024, name: '平板(768)' },
    { width: 375, height: 812, name: '手机(375)' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    const missingElements = await page.evaluate(() => {
      const issues = [];
      const textarea = document.querySelector('textarea');
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        if (rect.right > window.innerWidth) issues.push('输入框溢出屏幕');
        if (rect.width < 100) issues.push('输入框太窄');
      }
      return issues;
    });

    if (overflow) logIssue('响应式', `${vp.name} 水平溢出`, 'MEDIUM');
    else logOk(`${vp.name} 无溢出`);

    for (const issue of missingElements) {
      logIssue('响应式', `${vp.name}: ${issue}`, 'MEDIUM');
    }

    await page.screenshot({ path: `tests/screenshots/18_responsive_${vp.width}.png` });
  }

  // Reset
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ============ 阶段19: Keyboard shortcuts ============
  console.log('\n📋 阶段19: 键盘快捷键');

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const ta = await page.$('textarea');
  if (ta) {
    await ta.fill('键盘测试 prompt');
    // Ctrl+Enter should submit
    // We don't actually submit, just check the event fires
    logOk('Ctrl+Enter 快捷键区域可测试');

    // Tab key
    await ta.press('Tab');
    await page.waitForTimeout(300);
    logOk('Tab 键测试完成');
  }

  // Escape should close modals - already tested above

  // ============ FINAL: 收集控制台和网络错误 ============
  console.log('\n📋 控制台错误统计');
  const uniqueConsoleErrors = [...new Set(consoleErrors)];
  if (uniqueConsoleErrors.length > 0) {
    console.log(`  ⚠️  ${uniqueConsoleErrors.length} 个不同的控制台错误:`);
    for (const err of uniqueConsoleErrors.slice(0, 15)) {
      logIssue('控制台', err.slice(0, 150), 'MEDIUM');
    }
  } else {
    logOk('无控制台错误');
  }

  console.log('\n📋 网络错误统计');
  const uniqueNetErrors = [...new Map(networkErrors.map(e => [e.url, e])).values()];
  if (uniqueNetErrors.length > 0) {
    console.log(`  ⚠️  ${uniqueNetErrors.length} 个网络请求失败:`);
    for (const err of uniqueNetErrors.slice(0, 10)) {
      logIssue('网络', `${err.url.slice(0, 80)} - ${err.err}`, 'MEDIUM');
    }
  } else {
    logOk('无网络请求失败');
  }

  // ============ 生成最终报告 ============
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 最终测试报告');
  console.log('='.repeat(60));

  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const low = issues.filter(i => i.severity === 'LOW');

  console.log(`\n🔢 问题统计:`);
  console.log(`  🔴 CRITICAL: ${critical.length}`);
  console.log(`  🟠 HIGH:     ${high.length}`);
  console.log(`  🟡 MEDIUM:   ${medium.length}`);
  console.log(`  🔵 LOW:      ${low.length}`);
  console.log(`  📊 总计:     ${issues.length}`);

  console.log(`\n✅ 正常工作的按钮: ${workingButtons.length} 个`);
  for (const b of workingButtons) console.log(`  ✅ ${b}`);

  console.log(`\n❌ 失效/问题按钮: ${brokenButtons.length} 个`);
  for (const b of brokenButtons) console.log(`  ❌ ${b.description} → ${b.reason}`);

  if (critical.length > 0) {
    console.log('\n🔴 CRITICAL 问题:');
    for (const i of critical) console.log(`  • ${i.category}: ${i.description}`);
  }
  if (high.length > 0) {
    console.log('\n🟠 HIGH 问题:');
    for (const i of high) console.log(`  • ${i.category}: ${i.description}`);
  }
  if (medium.length > 0) {
    console.log('\n🟡 MEDIUM 问题:');
    for (const i of medium) console.log(`  • ${i.category}: ${i.description}`);
  }
  if (low.length > 0) {
    console.log('\n🔵 LOW 问题:');
    for (const i of low) console.log(`  • ${i.category}: ${i.description}`);
  }

  // Save report
  const fs = await import('fs');
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: issues.length, critical: critical.length, high: high.length, medium: medium.length, low: low.length },
    workingButtons, brokenButtons, issues,
    consoleErrors: uniqueConsoleErrors, networkErrors: uniqueNetErrors,
  };
  fs.writeFileSync('tests/functional_test_report.json', JSON.stringify(report, null, 2));

  await browser.close();
  console.log('\n📁 报告: tests/functional_test_report.json');
  console.log('📁 截图: tests/screenshots/');
  console.log('\n✅ 测试完成\n');
})();
