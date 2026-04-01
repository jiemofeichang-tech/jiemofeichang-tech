/**
 * Seedance Studio - 全面功能性测试
 * 测试所有页面元素、按钮、交互功能
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const issues = [];
const brokenButtons = [];

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
    if (!el) {
      brokenButtons.push({ selector, description, reason: '元素未找到' });
      logIssue('按钮失效', `${description} - 元素未找到 (${selector})`, 'HIGH');
      return false;
    }
    const isVisible = await el.isVisible();
    if (!isVisible) {
      brokenButtons.push({ selector, description, reason: '元素不可见' });
      logIssue('按钮失效', `${description} - 元素存在但不可见`, 'MEDIUM');
      return false;
    }
    const isEnabled = await el.isEnabled();
    if (!isEnabled) {
      brokenButtons.push({ selector, description, reason: '元素被禁用' });
      logIssue('按钮失效', `${description} - 元素被禁用`, 'MEDIUM');
      return false;
    }
    await el.click({ timeout: 2000 });
    return true;
  } catch (e) {
    brokenButtons.push({ selector, description, reason: e.message.slice(0, 100) });
    logIssue('按钮失效', `${description} - 点击失败: ${e.message.slice(0, 80)}`, 'HIGH');
    return false;
  }
}

async function checkElementExists(page, selector, description, timeout = 3000) {
  try {
    const el = await page.waitForSelector(selector, { timeout });
    if (el && await el.isVisible()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

(async () => {
  console.log('🚀 Seedance Studio 功能性测试开始\n');
  console.log('=' .repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Collect network errors
  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push({ url: request.url(), failure: request.failure()?.errorText });
  });

  // ============================================================
  // TEST 1: 页面加载
  // ============================================================
  console.log('\n📋 测试1: 页面加载');
  try {
    const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    if (response.ok()) {
      logOk(`主页加载成功 (状态码: ${response.status()})`);
    } else {
      logIssue('页面加载', `主页返回非200状态码: ${response.status()}`, 'CRITICAL');
    }
  } catch (e) {
    logIssue('页面加载', `主页加载失败: ${e.message}`, 'CRITICAL');
  }

  // Wait for hydration
  await page.waitForTimeout(2000);

  // Take initial screenshot
  await page.screenshot({ path: 'tests/screenshots/01_initial_load.png', fullPage: true });

  // ============================================================
  // TEST 2: 布局元素检查
  // ============================================================
  console.log('\n📋 测试2: 布局元素检查');

  // Check sidebar exists
  const sidebarExists = await checkElementExists(page, 'nav, [class*="sidebar"], aside');
  if (sidebarExists) logOk('侧边栏存在');
  else logIssue('布局', '侧边栏未找到', 'HIGH');

  // Check header exists
  const headerExists = await checkElementExists(page, 'header, [class*="header"]');
  if (headerExists) logOk('头部导航存在');
  else logIssue('布局', '头部导航未找到', 'HIGH');

  // Check main input area
  const inputExists = await checkElementExists(page, 'textarea, [contenteditable], input[type="text"]');
  if (inputExists) logOk('主输入区域存在');
  else logIssue('布局', '主输入区域未找到', 'HIGH');

  // ============================================================
  // TEST 3: 侧边栏导航按钮
  // ============================================================
  console.log('\n📋 测试3: 侧边栏导航按钮');

  // Find all sidebar buttons
  const sidebarButtons = await page.$$('nav button, aside button, [class*="sidebar"] button');
  console.log(`  📌 找到 ${sidebarButtons.length} 个侧边栏按钮`);

  for (let i = 0; i < sidebarButtons.length; i++) {
    try {
      const text = await sidebarButtons[i].textContent();
      const title = await sidebarButtons[i].getAttribute('title');
      const ariaLabel = await sidebarButtons[i].getAttribute('aria-label');
      const label = text?.trim() || title || ariaLabel || `Button #${i}`;
      const isVisible = await sidebarButtons[i].isVisible();
      if (isVisible) {
        await sidebarButtons[i].click();
        await page.waitForTimeout(500);
        logOk(`侧边栏按钮 "${label}" 可点击`);
      } else {
        logIssue('侧边栏', `按钮 "${label}" 不可见`, 'LOW');
      }
    } catch (e) {
      logIssue('侧边栏', `按钮 #${i} 点击失败: ${e.message.slice(0, 60)}`, 'MEDIUM');
    }
  }

  // Navigate back to home
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // ============================================================
  // TEST 4: 头部按钮和菜单
  // ============================================================
  console.log('\n📋 测试4: 头部按钮和菜单');

  const headerButtons = await page.$$('header button, [class*="header"] button');
  console.log(`  📌 找到 ${headerButtons.length} 个头部按钮`);

  for (let i = 0; i < headerButtons.length; i++) {
    try {
      const text = await headerButtons[i].textContent();
      const title = await headerButtons[i].getAttribute('title');
      const label = text?.trim().slice(0, 30) || title || `Header Button #${i}`;
      const isVisible = await headerButtons[i].isVisible();
      if (isVisible) {
        await headerButtons[i].click();
        await page.waitForTimeout(500);
        logOk(`头部按钮 "${label}" 可点击`);
        // Close any opened modal/popup
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    } catch (e) {
      logIssue('头部', `按钮 #${i} 交互失败: ${e.message.slice(0, 60)}`, 'MEDIUM');
    }
  }

  // ============================================================
  // TEST 5: 语言切换
  // ============================================================
  console.log('\n📋 测试5: 语言切换下拉菜单');

  const langDropdown = await page.$('[class*="lang"], select[class*="language"], button:has-text("中文"), button:has-text("EN"), button:has-text("Language")');
  if (langDropdown) {
    try {
      await langDropdown.click();
      await page.waitForTimeout(500);
      logOk('语言下拉菜单可打开');
      await page.keyboard.press('Escape');
    } catch (e) {
      logIssue('语言切换', `下拉菜单无法打开: ${e.message.slice(0, 60)}`, 'MEDIUM');
    }
  } else {
    logIssue('语言切换', '未找到语言切换控件', 'LOW');
  }

  // ============================================================
  // TEST 6: 主输入框交互
  // ============================================================
  console.log('\n📋 测试6: 主输入框交互');

  const textarea = await page.$('textarea');
  if (textarea) {
    try {
      await textarea.click();
      await textarea.fill('测试输入 - 功能性测试');
      const value = await textarea.inputValue();
      if (value.includes('测试输入')) {
        logOk('文本输入正常');
      } else {
        logIssue('输入框', '文本输入后无法读取值', 'HIGH');
      }
    } catch (e) {
      logIssue('输入框', `文本输入失败: ${e.message.slice(0, 60)}`, 'HIGH');
    }
  } else {
    logIssue('输入框', '未找到 textarea 元素', 'CRITICAL');
  }

  // ============================================================
  // TEST 7: 工具栏按钮（上传、脚本、风格、素材）
  // ============================================================
  console.log('\n📋 测试7: 工具栏按钮');

  // Find toolbar area buttons near the input
  const allButtons = await page.$$('button');
  console.log(`  📌 页面上共找到 ${allButtons.length} 个按钮`);

  // Test each button with text content identification
  const buttonResults = [];
  for (let i = 0; i < allButtons.length; i++) {
    try {
      const text = (await allButtons[i].textContent())?.trim();
      const title = await allButtons[i].getAttribute('title');
      const ariaLabel = await allButtons[i].getAttribute('aria-label');
      const className = await allButtons[i].getAttribute('class');
      const isVisible = await allButtons[i].isVisible();
      const isEnabled = await allButtons[i].isEnabled();
      const boundingBox = await allButtons[i].boundingBox();

      buttonResults.push({
        index: i,
        text: text?.slice(0, 40),
        title,
        ariaLabel,
        visible: isVisible,
        enabled: isEnabled,
        hasSize: boundingBox ? (boundingBox.width > 0 && boundingBox.height > 0) : false,
        x: boundingBox?.x,
        y: boundingBox?.y,
      });

      if (isVisible && !isEnabled) {
        brokenButtons.push({
          selector: `button:nth-of-type(${i})`,
          description: text || title || `Button #${i}`,
          reason: '被禁用',
        });
      }
    } catch { /* skip */ }
  }

  // Group buttons and identify key ones
  const keyButtonTexts = ['发送', 'Send', '上传', 'Upload', '+', '剧本中文', 'Script', '风格', 'Style',
    '素材', 'Asset', '保存', 'Save', '下载', 'Download', '刷新', 'Refresh',
    'FAQ', '设置', 'Settings', '微信', 'WeChat', 'Discord'];

  for (const keyword of keyButtonTexts) {
    const btn = buttonResults.find(b =>
      b.visible && (
        b.text?.includes(keyword) ||
        b.title?.includes(keyword) ||
        b.ariaLabel?.includes(keyword)
      )
    );
    if (btn) {
      if (btn.enabled) {
        logOk(`"${keyword}" 按钮存在且可用`);
      } else {
        logIssue('按钮', `"${keyword}" 按钮存在但被禁用`, 'MEDIUM');
      }
    }
  }

  // ============================================================
  // TEST 8: 上传按钮 (+) 弹窗
  // ============================================================
  console.log('\n📋 测试8: 上传按钮弹窗');

  const uploadBtn = await page.$('button:has-text("+"), button[title*="上传"], button[title*="Upload"], button[aria-label*="upload"]');
  if (uploadBtn && await uploadBtn.isVisible()) {
    await uploadBtn.click();
    await page.waitForTimeout(800);
    const modal = await checkElementExists(page, '[class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"]');
    if (modal) {
      logOk('上传弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/08_upload_modal.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('上传弹窗', '点击上传按钮后弹窗未出现', 'HIGH');
    }
  } else {
    logIssue('上传按钮', '上传按钮未找到或不可见', 'HIGH');
  }

  // ============================================================
  // TEST 9: 风格选择弹窗
  // ============================================================
  console.log('\n📋 测试9: 风格选择弹窗');

  const styleBtn = await page.$('button:has-text("风格"), button:has-text("Style"), button:has-text("Styles"), button:has-text("147")');
  if (styleBtn && await styleBtn.isVisible()) {
    await styleBtn.click();
    await page.waitForTimeout(800);
    const modal = await checkElementExists(page, '[class*="modal"], [class*="dialog"], [class*="overlay"]');
    if (modal) {
      logOk('风格选择弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/09_style_modal.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('风格弹窗', '点击风格按钮后弹窗未出现', 'HIGH');
    }
  } else {
    logIssue('风格按钮', '风格按钮未找到或不可见', 'MEDIUM');
  }

  // ============================================================
  // TEST 10: 剧本中文编辑器弹窗
  // ============================================================
  console.log('\n📋 测试10: 剧本中文编辑器弹窗');

  const scriptBtn = await page.$('button:has-text("剧本中文"), button:has-text("Script")');
  if (scriptBtn && await scriptBtn.isVisible()) {
    await scriptBtn.click();
    await page.waitForTimeout(800);
    const modal = await checkElementExists(page, '[class*="modal"], [class*="dialog"], [class*="overlay"]');
    if (modal) {
      logOk('剧本中文编辑器弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/10_script_modal.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('剧本中文弹窗', '点击剧本中文按钮后弹窗未出现', 'HIGH');
    }
  } else {
    logIssue('剧本中文按钮', '剧本中文按钮未找到或不可见', 'MEDIUM');
  }

  // ============================================================
  // TEST 11: 素材管理弹窗
  // ============================================================
  console.log('\n📋 测试11: 素材管理弹窗');

  const assetBtn = await page.$('button:has-text("素材"), button:has-text("Asset"), button:has-text("Assets")');
  if (assetBtn && await assetBtn.isVisible()) {
    await assetBtn.click();
    await page.waitForTimeout(800);
    const popup = await checkElementExists(page, '[class*="modal"], [class*="popup"], [class*="dropdown"], [class*="overlay"]');
    if (popup) {
      logOk('素材管理弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/11_asset_popup.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('素材弹窗', '点击素材按钮后弹窗未出现', 'HIGH');
    }
  } else {
    logIssue('素材按钮', '素材按钮未找到或不可见', 'MEDIUM');
  }

  // ============================================================
  // TEST 12: 生成面板（模式切换按钮）
  // ============================================================
  console.log('\n📋 测试12: 生成面板模式按钮');

  const modeTexts = ['纯文本', 'Pure text', '首帧', 'First frame', '首尾帧',
    '图生视频', 'Image', '视频参考', 'Video ref', '延展视频', 'Extend'];

  for (const modeText of modeTexts) {
    const modeBtn = await page.$(`button:has-text("${modeText}")`);
    if (modeBtn && await modeBtn.isVisible()) {
      try {
        await modeBtn.click();
        await page.waitForTimeout(300);
        logOk(`模式按钮 "${modeText}" 可点击`);
      } catch (e) {
        logIssue('模式切换', `"${modeText}" 按钮点击失败`, 'MEDIUM');
      }
    }
  }

  // ============================================================
  // TEST 13: 展开/折叠面板
  // ============================================================
  console.log('\n📋 测试13: 展开/折叠控制');

  const expandBtns = await page.$$('button:has-text("展开"), button:has-text("折叠"), button:has-text("Expand"), button:has-text("Collapse"), [class*="expand"], [class*="collapse"], [class*="toggle"]');
  console.log(`  📌 找到 ${expandBtns.length} 个展开/折叠控件`);

  for (const btn of expandBtns) {
    try {
      if (await btn.isVisible()) {
        const text = (await btn.textContent())?.trim().slice(0, 20);
        await btn.click();
        await page.waitForTimeout(300);
        logOk(`展开/折叠按钮 "${text}" 可点击`);
      }
    } catch (e) {
      logIssue('展开/折叠', `控件交互失败: ${e.message.slice(0, 60)}`, 'LOW');
    }
  }

  // ============================================================
  // TEST 14: 发送按钮（不实际发送）
  // ============================================================
  console.log('\n📋 测试14: 发送按钮状态');

  // Clear textarea first
  const textareaForSend = await page.$('textarea');
  if (textareaForSend) {
    await textareaForSend.fill('');
    await page.waitForTimeout(300);
  }

  // Check send button - should it be disabled when empty?
  const sendBtn = await page.$('button:has-text("发送"), button:has-text("Send"), button[type="submit"], button[class*="send"]');
  if (sendBtn) {
    const isEnabled = await sendBtn.isEnabled();
    const isVisible = await sendBtn.isVisible();
    if (isVisible) {
      logOk(`发送按钮可见 (${isEnabled ? '启用' : '禁用'})`);
    } else {
      logIssue('发送按钮', '发送按钮不可见', 'HIGH');
    }
  } else {
    // Maybe it's an icon button (circular pink button)
    const iconSendBtn = await page.$('button svg, button[class*="pink"], button[class*="send"]');
    if (iconSendBtn) {
      logOk('发送按钮存在（图标按钮）');
    } else {
      logIssue('发送按钮', '未找到发送按钮', 'HIGH');
    }
  }

  // ============================================================
  // TEST 15: 模式切换（Managed/Chat）
  // ============================================================
  console.log('\n📋 测试15: Managed/Chat 模式切换');

  const managedBtn = await page.$('button:has-text("Managed"), button:has-text("管理模式"), [class*="mode"] button');
  const chatBtn = await page.$('button:has-text("Chat"), button:has-text("对话模式")');

  if (managedBtn && await managedBtn.isVisible()) {
    await managedBtn.click();
    await page.waitForTimeout(300);
    logOk('Managed 模式按钮可点击');
  }
  if (chatBtn && await chatBtn.isVisible()) {
    await chatBtn.click();
    await page.waitForTimeout(300);
    logOk('Chat 模式按钮可点击');
  }
  if (!managedBtn && !chatBtn) {
    logIssue('模式切换', '未找到 Managed/Chat 模式切换按钮', 'MEDIUM');
  }

  // ============================================================
  // TEST 16: 设置弹窗
  // ============================================================
  console.log('\n📋 测试16: 设置弹窗');

  // Try avatar/settings button
  const settingsBtn = await page.$('button:has-text("设置"), button:has-text("Settings"), button[title*="设置"]');
  const avatarBtn = await page.$('[class*="avatar"], button:has-text("登"), button[class*="user"]');

  if (settingsBtn && await settingsBtn.isVisible()) {
    await settingsBtn.click();
    await page.waitForTimeout(800);
    const settingsModal = await checkElementExists(page, '[class*="modal"], [class*="dialog"]');
    if (settingsModal) {
      logOk('设置弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/16_settings_modal.png' });
      // Check for form fields
      const inputs = await page.$$('[class*="modal"] input, [class*="dialog"] input');
      console.log(`  📌 设置弹窗中找到 ${inputs.length} 个输入框`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('设置弹窗', '点击设置后弹窗未出现', 'HIGH');
    }
  } else if (avatarBtn && await avatarBtn.isVisible()) {
    await avatarBtn.click();
    await page.waitForTimeout(500);
    logOk('头像按钮可点击');
    // Look for menu items
    const menuItems = await page.$$('[class*="menu"] button, [class*="dropdown"] button, [role="menuitem"]');
    if (menuItems.length > 0) {
      logOk(`头像菜单出现 (${menuItems.length} 个选项)`);
    }
    await page.keyboard.press('Escape');
  } else {
    logIssue('设置入口', '未找到设置按钮或头像按钮', 'HIGH');
  }

  // ============================================================
  // TEST 17: FAQ 弹窗
  // ============================================================
  console.log('\n📋 测试17: FAQ 弹窗');

  const faqBtn = await page.$('button:has-text("FAQ"), button:has-text("帮助"), button:has-text("?")');
  if (faqBtn && await faqBtn.isVisible()) {
    await faqBtn.click();
    await page.waitForTimeout(800);
    const faqModal = await checkElementExists(page, '[class*="modal"], [class*="dialog"]');
    if (faqModal) {
      logOk('FAQ 弹窗正常打开');
      await page.screenshot({ path: 'tests/screenshots/17_faq_modal.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      logIssue('FAQ 弹窗', '点击 FAQ 后弹窗未出现', 'MEDIUM');
    }
  } else {
    logIssue('FAQ 按钮', 'FAQ 按钮未找到', 'LOW');
  }

  // ============================================================
  // TEST 18: 高级参数控件
  // ============================================================
  console.log('\n📋 测试18: 高级参数控件');

  const selectElements = await page.$$('select');
  console.log(`  📌 找到 ${selectElements.length} 个下拉选择器`);

  for (const sel of selectElements) {
    try {
      if (await sel.isVisible()) {
        const name = await sel.getAttribute('name') || await sel.getAttribute('id') || 'unknown';
        const options = await sel.$$('option');
        logOk(`下拉选择器 "${name}" 存在 (${options.length} 个选项)`);
      }
    } catch { /* skip */ }
  }

  // Check sliders/range inputs
  const sliders = await page.$$('input[type="range"]');
  console.log(`  📌 找到 ${sliders.length} 个滑块控件`);

  // Check toggle switches
  const toggles = await page.$$('[class*="toggle"], [class*="switch"], input[type="checkbox"]');
  console.log(`  📌 找到 ${toggles.length} 个开关控件`);

  // ============================================================
  // TEST 19: 导航到 Projects 页面
  // ============================================================
  console.log('\n📋 测试19: Projects 页面');

  const projectsBtn = await page.$('button:has-text("Projects"), button:has-text("项目"), button[title*="project"]');
  if (projectsBtn && await projectsBtn.isVisible()) {
    await projectsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/19_projects_page.png' });
    logOk('Projects 页面导航成功');

    // Check for project cards
    const projectCards = await page.$$('[class*="card"], [class*="project"]');
    console.log(`  📌 Projects 页面找到 ${projectCards.length} 个项目卡片`);

    // Check create project button
    const createBtn = await page.$('button:has-text("新建"), button:has-text("Create"), button:has-text("New"), [class*="create"]');
    if (createBtn && await createBtn.isVisible()) {
      logOk('新建项目按钮存在');
    } else {
      logIssue('Projects 页面', '未找到新建项目按钮', 'MEDIUM');
    }

    // Search input
    const searchInput = await page.$('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]');
    if (searchInput && await searchInput.isVisible()) {
      logOk('搜索输入框存在');
    }

    // Navigate back
    const homeBtn = await page.$('button:has-text("Home"), button:has-text("首页"), button[title*="home"]');
    if (homeBtn) await homeBtn.click();
    await page.waitForTimeout(500);
  } else {
    logIssue('导航', 'Projects 导航按钮未找到', 'MEDIUM');
  }

  // ============================================================
  // TEST 20: API 请求检查
  // ============================================================
  console.log('\n📋 测试20: API 请求检查');

  // Check backend health
  try {
    const healthResp = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/config');
        return { status: r.status, data: await r.json() };
      } catch (e) {
        return { error: e.message };
      }
    });
    if (healthResp.error) {
      logIssue('API', `/api/config 请求失败: ${healthResp.error}`, 'HIGH');
    } else if (healthResp.status === 200) {
      logOk(`/api/config 返回 200`);
    } else {
      logIssue('API', `/api/config 返回 ${healthResp.status}: ${JSON.stringify(healthResp.data).slice(0, 80)}`, 'MEDIUM');
    }
  } catch (e) {
    logIssue('API', `API 测试失败: ${e.message.slice(0, 60)}`, 'HIGH');
  }

  // Test history API
  try {
    const historyResp = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/history');
        return { status: r.status, data: await r.json() };
      } catch (e) {
        return { error: e.message };
      }
    });
    if (historyResp.error) {
      logIssue('API', `/api/history 请求失败: ${historyResp.error}`, 'MEDIUM');
    } else if (historyResp.status === 200) {
      logOk(`/api/history 返回 200`);
    } else {
      logIssue('API', `/api/history 返回 ${historyResp.status}`, 'MEDIUM');
    }
  } catch (e) {
    logIssue('API', `History API 测试失败: ${e.message.slice(0, 60)}`, 'MEDIUM');
  }

  // ============================================================
  // TEST 21: 键盘快捷键
  // ============================================================
  console.log('\n📋 测试21: 键盘快捷键');

  // Test Ctrl+Enter in textarea
  const textareaKB = await page.$('textarea');
  if (textareaKB) {
    await textareaKB.fill('键盘快捷键测试');
    await page.waitForTimeout(300);

    // Listen for submit event
    const submitted = await page.evaluate(() => {
      return new Promise(resolve => {
        const ta = document.querySelector('textarea');
        if (!ta) return resolve(false);
        const handler = (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            resolve(true);
          }
        };
        ta.addEventListener('keydown', handler);
        setTimeout(() => resolve(false), 2000);
      });
    });

    // Press Ctrl+Enter
    await textareaKB.press('Control+Enter');
    await page.waitForTimeout(1000);
    logOk('Ctrl+Enter 快捷键已测试');

    // Clear textarea
    await page.waitForTimeout(500);
  }

  // ============================================================
  // TEST 22: 响应式布局
  // ============================================================
  console.log('\n📋 测试22: 响应式布局');

  // Navigate back to home
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const viewports = [
    { width: 1920, height: 1080, name: '桌面' },
    { width: 768, height: 1024, name: '平板' },
    { width: 375, height: 812, name: '手机' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);

    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });

    if (hasOverflow) {
      logIssue('响应式', `${vp.name}视口 (${vp.width}x${vp.height}) 存在水平溢出`, 'MEDIUM');
    } else {
      logOk(`${vp.name}视口 (${vp.width}x${vp.height}) 无水平溢出`);
    }

    await page.screenshot({ path: `tests/screenshots/22_viewport_${vp.width}.png` });
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ============================================================
  // TEST 23: 链接检查
  // ============================================================
  console.log('\n📋 测试23: 链接检查');

  const links = await page.$$('a[href]');
  console.log(`  📌 找到 ${links.length} 个链接`);

  for (const link of links) {
    try {
      const href = await link.getAttribute('href');
      const text = (await link.textContent())?.trim().slice(0, 30);
      if (href && href !== '#' && !href.startsWith('javascript:')) {
        if (href.startsWith('/') || href.startsWith(BASE_URL)) {
          logOk(`内部链接: "${text}" → ${href}`);
        } else {
          logOk(`外部链接: "${text}" → ${href.slice(0, 50)}`);
        }
      } else if (href === '#' || href === '') {
        logIssue('链接', `空链接: "${text}" href="${href}"`, 'LOW');
      }
    } catch { /* skip */ }
  }

  // ============================================================
  // TEST 24: Workflow 页面
  // ============================================================
  console.log('\n📋 测试24: Workflow 页面');

  try {
    await page.goto(`${BASE_URL}/workflow/new`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const workflowLoaded = await checkElementExists(page, 'body', '页面加载', 2000);
    if (workflowLoaded) {
      await page.screenshot({ path: 'tests/screenshots/24_workflow_page.png' });
      const content = await page.textContent('body');
      if (content && content.length > 50) {
        logOk('Workflow 页面加载成功');
      } else {
        logIssue('Workflow', '页面内容为空', 'MEDIUM');
      }
    }
  } catch (e) {
    logIssue('Workflow', `页面加载失败: ${e.message.slice(0, 60)}`, 'MEDIUM');
  }

  // Navigate back to home for final checks
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // ============================================================
  // FINAL: 收集所有控制台错误和网络错误
  // ============================================================
  console.log('\n📋 控制台错误检查');
  if (consoleErrors.length > 0) {
    console.log(`  ⚠️  发现 ${consoleErrors.length} 个控制台错误:`);
    const uniqueErrors = [...new Set(consoleErrors)];
    for (const err of uniqueErrors.slice(0, 20)) {
      logIssue('控制台错误', err.slice(0, 120), 'MEDIUM');
    }
  } else {
    logOk('无控制台错误');
  }

  console.log('\n📋 网络错误检查');
  if (networkErrors.length > 0) {
    console.log(`  ⚠️  发现 ${networkErrors.length} 个网络请求失败:`);
    for (const err of networkErrors.slice(0, 10)) {
      logIssue('网络错误', `${err.url} - ${err.failure}`, 'MEDIUM');
    }
  } else {
    logOk('无网络请求失败');
  }

  // ============================================================
  // 生成报告
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试报告总结');
  console.log('='.repeat(60));

  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const low = issues.filter(i => i.severity === 'LOW');

  console.log(`\n总计发现 ${issues.length} 个问题:`);
  console.log(`  🔴 CRITICAL: ${critical.length}`);
  console.log(`  🟠 HIGH: ${high.length}`);
  console.log(`  🟡 MEDIUM: ${medium.length}`);
  console.log(`  🔵 LOW: ${low.length}`);
  console.log(`\n失效按钮: ${brokenButtons.length} 个`);

  // Write report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalIssues: issues.length,
      critical: critical.length,
      high: high.length,
      medium: medium.length,
      low: low.length,
      brokenButtons: brokenButtons.length,
    },
    issues,
    brokenButtons,
    consoleErrors: [...new Set(consoleErrors)],
    networkErrors,
    allButtons: buttonResults.filter(b => b.visible),
  };

  const fs = await import('fs');
  fs.writeFileSync('tests/functional_test_report.json', JSON.stringify(report, null, 2));
  console.log('\n📁 详细报告已保存到 tests/functional_test_report.json');
  console.log('📁 截图已保存到 tests/screenshots/');

  await browser.close();
  console.log('\n✅ 测试完成\n');
})();
