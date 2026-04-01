/**
 * Seedance Studio - 精确功能测试（逐一测试每个按钮，避免弹窗阻塞）
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
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

async function exists(page, sel, timeout = 1500) {
  try {
    const el = await page.waitForSelector(sel, { timeout });
    return el && await el.isVisible();
  } catch { return false; }
}

async function closeModals(page) {
  // Press Escape multiple times to close any open modals
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // Click any visible close (×) buttons in modals
  const closeBtns = await page.$$('[class*="modal"] button:has-text("×"), [class*="Modal"] button:has-text("×"), [class*="overlay"] button:has-text("×")');
  for (const b of closeBtns) {
    try { if (await b.isVisible()) await b.click({ timeout: 500 }); } catch {}
  }
  await page.waitForTimeout(200);
}

async function goHome(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
}

(async () => {
  console.log('🚀 Seedance Studio 精确功能测试\n' + '='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  // Login
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const networkErrors = [];
  page.on('requestfailed', req => networkErrors.push({ url: req.url(), err: req.failure()?.errorText }));

  // Register + Login
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Check if on login page
  const onLogin = await exists(page, 'input[placeholder*="用户名"]', 2000);
  if (onLogin) {
    // Register
    const regTab = await page.$('button:has-text("注册")');
    if (regTab) {
      await regTab.click();
      await page.waitForTimeout(500);
      const inputs = await page.$$('input');
      if (inputs.length >= 3) {
        await inputs[0].fill('autotest' + Date.now());
        await inputs[1].fill('pass123456');
        await inputs[2].fill('pass123456');
      }
      // Click register submit (the big button, not the tab)
      const allBtns = await page.$$('button');
      for (const b of allBtns) {
        const bbox = await b.boundingBox();
        const text = (await b.textContent())?.trim();
        if (text === '注册' && bbox && bbox.width > 200 && bbox.height > 40) {
          await b.click();
          break;
        }
      }
      await page.waitForTimeout(2000);
    }

    // Check if registered and auto-logged in
    const loggedIn = await exists(page, 'textarea', 3000);
    if (!loggedIn) {
      // Try login with known user
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      const uInput = await page.$('input[placeholder*="用户名"]');
      const pInput = await page.$('input[placeholder*="密码"]');
      if (uInput && pInput) {
        await uInput.fill('tester2');
        await pInput.fill('test123');
        const btns = await page.$$('button');
        for (const b of btns) {
          const bbox = await b.boundingBox();
          const text = (await b.textContent())?.trim();
          if (text === '登录' && bbox && bbox.width > 200 && bbox.height > 40) {
            await b.click();
            break;
          }
        }
        await page.waitForTimeout(3000);
      }
    }
  }

  // Verify we're on main page
  const onMainPage = await exists(page, 'textarea', 3000);
  if (!onMainPage) {
    logIssue('登录', '无法进入主页面', 'CRITICAL');
    console.log('FATAL: Cannot proceed without login');
    await browser.close();
    return;
  }
  logOk('成功登录并进入主页面');

  // Close any announcement banners
  await closeModals(page);
  // Close the banner × button at top
  const bannerClose = await page.$('button:has-text("×")');
  if (bannerClose && await bannerClose.isVisible()) {
    const bbox = await bannerClose.boundingBox();
    if (bbox && bbox.y < 100) { // Top banner close
      await bannerClose.click();
      await page.waitForTimeout(300);
    }
  }

  // ==========================================
  // TEST GROUP 1: 登录页面问题
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 1: 登录页面检查');
  console.log('='.repeat(50));
  logIssue('登录页', '空表单提交登录按钮无前端校验、无错误提示', 'MEDIUM');

  // ==========================================
  // TEST GROUP 2: 头部导航栏
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 2: 头部导航栏按钮');
  console.log('='.repeat(50));

  // 2.1 语言切换
  const langBtn = await page.$('button:has-text("简体中文")');
  if (langBtn && await langBtn.isVisible()) {
    await langBtn.click();
    await page.waitForTimeout(500);
    const dropdown = await exists(page, '[class*="dropdown"], [class*="menu"], [class*="lang"]', 1000);
    if (dropdown) {
      logOk('语言切换下拉菜单: 正常打开');
      workingButtons.push('语言切换');
    } else {
      // Check if any new elements appeared
      logIssue('语言切换', '点击后无下拉菜单出现', 'MEDIUM');
      brokenButtons.push({ description: '语言切换按钮', reason: '无下拉菜单' });
    }
    await page.screenshot({ path: 'tests/screenshots/t2_lang.png' });
    await closeModals(page);
  }

  // 2.2 微信按钮 (Button#1 - WeChat icon)
  await goHome(page);
  const wechatBtns = await page.$$('header button, [class*="header"] button, [class*="Header"] button');
  // Based on scan: Button#1 at (1448,17) and Button#2 at (1488,17) are icon buttons
  const headerArea = await page.$$('button');
  const topButtons = [];
  for (const b of headerArea) {
    const bbox = await b.boundingBox();
    if (bbox && bbox.y < 60 && bbox.y > 5) {
      const text = (await b.textContent())?.trim();
      topButtons.push({ btn: b, text, x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height });
    }
  }
  console.log(`  📌 顶部栏按钮: ${topButtons.length}`);

  for (const tb of topButtons) {
    console.log(`    "${tb.text}" at (${Math.round(tb.x)},${Math.round(tb.y)}) ${Math.round(tb.w)}x${Math.round(tb.h)}`);
  }

  // Test WeChat icon button (typically has a WeChat SVG icon)
  for (const tb of topButtons) {
    if (tb.text === '' || tb.text.length <= 2) {
      // Icon button
      try {
        await tb.btn.click({ timeout: 3000 });
        await page.waitForTimeout(600);
        const hasPopup = await exists(page, '[class*="modal"], [class*="Modal"], [class*="popup"], [class*="qr"], [class*="QR"]', 1000);
        if (hasPopup) {
          logOk(`头部图标按钮 (x=${Math.round(tb.x)}): 弹窗正常`);
          workingButtons.push(`头部图标 x=${Math.round(tb.x)}`);
          await page.screenshot({ path: `tests/screenshots/t2_icon_${Math.round(tb.x)}.png` });
        } else {
          logIssue('头部图标', `x=${Math.round(tb.x)} 的图标按钮点击后无响应`, 'MEDIUM');
          brokenButtons.push({ description: `头部图标 x=${Math.round(tb.x)}`, reason: '点击无响应' });
        }
        await closeModals(page);
      } catch (e) {
        logIssue('头部图标', `x=${Math.round(tb.x)} 点击失败: ${e.message.slice(0, 60)}`, 'HIGH');
        brokenButtons.push({ description: `头部图标 x=${Math.round(tb.x)}`, reason: e.message.slice(0, 60) });
      }
    }
  }

  // 2.3 常见问题
  await goHome(page); await closeModals(page);
  const faqBtn = await page.$('button:has-text("常见问题")');
  if (faqBtn && await faqBtn.isVisible()) {
    await faqBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const hasModal = await exists(page, '[class*="modal"], [class*="Modal"]');
    if (hasModal) {
      logOk('常见问题弹窗: 正常打开');
      workingButtons.push('常见问题');
      await page.screenshot({ path: 'tests/screenshots/t2_faq.png' });

      // Test FAQ accordion items
      const faqItems = await page.$$('[class*="modal"] [class*="accordion"], [class*="Modal"] details, [class*="faq"] button');
      console.log(`  📌 FAQ 条目: ${faqItems.length}`);
      if (faqItems.length > 0) {
        try {
          await faqItems[0].click({ timeout: 2000 });
          await page.waitForTimeout(300);
          logOk('FAQ 手风琴展开正常');
        } catch {
          logIssue('FAQ', '手风琴条目点击失败', 'LOW');
        }
      }
    } else {
      logIssue('常见问题', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '常见问题', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 2.4 我的资产 (头部)
  await goHome(page); await closeModals(page);
  // Close banner first
  const banner = await page.$('button:has-text("×")');
  if (banner) { const bb = await banner.boundingBox(); if (bb && bb.y < 100) await banner.click({ timeout: 1000 }).catch(()=>{}); }
  await page.waitForTimeout(300);

  const assetBtnHeader = await page.$('button:has-text("我的资产")');
  if (assetBtnHeader && await assetBtnHeader.isVisible()) {
    // There might be 2 "我的资产" buttons - one in header, one in toolbar
    const allAssetBtns = await page.$$('button:has-text("我的资产")');
    // The header one should be at top (y < 60)
    for (const ab of allAssetBtns) {
      const bbox = await ab.boundingBox();
      if (bbox && bbox.y < 60) {
        await ab.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        const hasModal = await exists(page, '[class*="modal"], [class*="Modal"]');
        if (hasModal) {
          logOk('我的资产(头部)弹窗: 正常打开');
          workingButtons.push('我的资产(头部)');
          await page.screenshot({ path: 'tests/screenshots/t2_assets_header.png' });
        } else {
          logIssue('我的资产(头部)', '弹窗未打开', 'MEDIUM');
          brokenButtons.push({ description: '我的资产(头部)', reason: '弹窗未打开' });
        }
        await closeModals(page);
        break;
      }
    }
  }

  // 2.5 积分/头像按钮
  await goHome(page); await closeModals(page);
  const avatarBtn = await page.$('[class*="avatar"], button:has-text("BASE")');
  if (avatarBtn && await avatarBtn.isVisible()) {
    await avatarBtn.click({ timeout: 3000 });
    await page.waitForTimeout(600);
    const hasMenu = await exists(page, '[class*="menu"], [class*="Menu"], [class*="dropdown"]');
    if (hasMenu) {
      logOk('头像/积分菜单: 正常');
      workingButtons.push('头像菜单');
    } else {
      logIssue('头像菜单', '点击后无菜单出现', 'MEDIUM');
      brokenButtons.push({ description: '头像/积分按钮', reason: '无菜单' });
    }
    await page.screenshot({ path: 'tests/screenshots/t2_avatar.png' });
    await closeModals(page);
  }

  // ==========================================
  // TEST GROUP 3: 侧边栏
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 3: 侧边栏按钮');
  console.log('='.repeat(50));

  const sidebarTests = [
    { text: '首页', expected: 'home' },
    { text: '我的项目', expected: 'projects' },
    { text: '我的资产', expected: 'community/assets' },
    { text: 'AI漫剧工作流', expected: 'workflow' },
    { text: '回收站', expected: 'trash' },
  ];

  for (const st of sidebarTests) {
    await goHome(page); await closeModals(page);
    await page.waitForTimeout(300);

    // Find sidebar button by title (sidebar buttons use title attribute)
    let sideBtn = null;
    const allBtns = await page.$$('button');
    for (const b of allBtns) {
      const title = await b.getAttribute('title');
      const text = (await b.textContent())?.trim();
      const bbox = await b.boundingBox();
      if (bbox && bbox.x < 80 && (title === st.text || text === st.text)) {
        sideBtn = b;
        break;
      }
    }

    if (sideBtn && await sideBtn.isVisible()) {
      try {
        await sideBtn.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        logOk(`侧边栏 "${st.text}": 可点击`);
        workingButtons.push(`侧边栏: ${st.text}`);
        await page.screenshot({ path: `tests/screenshots/t3_side_${st.text}.png` });
      } catch (e) {
        logIssue('侧边栏', `"${st.text}" 点击超时/失败`, 'HIGH');
        brokenButtons.push({ description: `侧边栏: ${st.text}`, reason: e.message.slice(0, 60) });
      }
    } else {
      logIssue('侧边栏', `"${st.text}" 按钮未找到`, 'HIGH');
      brokenButtons.push({ description: `侧边栏: ${st.text}`, reason: '未找到' });
    }
  }

  // ==========================================
  // TEST GROUP 4: 工具栏按钮
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 4: 工具栏按钮');
  console.log('='.repeat(50));

  // 4.1 上传按钮 (+)
  await goHome(page); await closeModals(page);
  const uploadBtn = await page.$('button:has-text("+")');
  if (uploadBtn && await uploadBtn.isVisible()) {
    const bbox = await uploadBtn.boundingBox();
    if (bbox && bbox.y > 200 && bbox.y < 400) { // toolbar area
      await uploadBtn.click({ timeout: 3000 });
      await page.waitForTimeout(800);
      const hasModal = await exists(page, '[class*="modal"], [class*="Modal"], [class*="upload"], [class*="Upload"]');
      if (hasModal) {
        logOk('上传弹窗 (+): 正常打开');
        workingButtons.push('上传(+)');

        // Check file input
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) logOk('上传弹窗: 文件输入存在');
        else logIssue('上传弹窗', '缺少 file input 元素', 'MEDIUM');

        // Check drag-drop area
        const dropZone = await exists(page, '[class*="drop"], [class*="drag"]');
        if (dropZone) logOk('上传弹窗: 拖拽区域存在');

        await page.screenshot({ path: 'tests/screenshots/t4_upload.png' });
      } else {
        logIssue('上传(+)', '弹窗未打开', 'HIGH');
        brokenButtons.push({ description: '上传(+)', reason: '弹窗未打开' });
      }
      await closeModals(page);
    }
  }

  // 4.2 剧本中文按钮
  await goHome(page); await closeModals(page);
  const scriptBtn = await page.$('button:has-text("剧本中文")');
  if (scriptBtn && await scriptBtn.isVisible()) {
    await scriptBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const hasModal = await exists(page, '[class*="modal"], [class*="Modal"]');
    if (hasModal) {
      logOk('剧本中文编辑器弹窗: 正常打开');
      workingButtons.push('剧本中文');

      // Check textarea in modal
      const modalTextarea = await page.$('[class*="modal"] textarea, [class*="Modal"] textarea');
      if (modalTextarea) logOk('剧本中文编辑器: textarea 存在');
      else logIssue('剧本中文编辑器', '缺少 textarea', 'MEDIUM');

      await page.screenshot({ path: 'tests/screenshots/t4_script.png' });
    } else {
      logIssue('剧本中文', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '剧本中文按钮', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 4.3 147种风格
  await goHome(page); await closeModals(page);
  const styleBtn = await page.$('button:has-text("147 种风格"), button:has-text("147种风格")');
  if (styleBtn && await styleBtn.isVisible()) {
    await styleBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const hasModal = await exists(page, '[class*="modal"], [class*="Modal"]');
    if (hasModal) {
      logOk('风格选择弹窗: 正常打开');
      workingButtons.push('147种风格');

      // Count style items
      const grid = await page.$$('[class*="modal"] [class*="grid"] > *, [class*="Modal"] [class*="grid"] > *');
      console.log(`  📌 风格网格元素: ${grid.length}`);

      // Test category buttons
      const catBtns = await page.$$('[class*="modal"] button, [class*="Modal"] button');
      let catCount = 0;
      for (const cb of catBtns) {
        const text = (await cb.textContent())?.trim();
        if (text && text.length > 1 && text !== '×') catCount++;
      }
      console.log(`  📌 风格分类按钮: ${catCount}`);

      await page.screenshot({ path: 'tests/screenshots/t4_styles.png' });
    } else {
      logIssue('147种风格', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '147种风格', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 4.4 我的资产 (工具栏)
  await goHome(page); await closeModals(page);
  const assetBtns = await page.$$('button:has-text("我的资产")');
  for (const ab of assetBtns) {
    const bbox = await ab.boundingBox();
    if (bbox && bbox.y > 200 && bbox.y < 400) { // toolbar area
      await ab.click({ timeout: 3000 });
      await page.waitForTimeout(800);
      const hasPopup = await exists(page, '[class*="modal"], [class*="Modal"], [class*="popup"], [class*="Popup"], [class*="asset"]');
      if (hasPopup) {
        logOk('我的资产(工具栏)弹窗: 正常打开');
        workingButtons.push('我的资产(工具栏)');
        await page.screenshot({ path: 'tests/screenshots/t4_assets_toolbar.png' });
      } else {
        logIssue('我的资产(工具栏)', '弹窗/弹出未打开', 'MEDIUM');
        brokenButtons.push({ description: '我的资产(工具栏)', reason: '弹窗未打开' });
      }
      await closeModals(page);
      break;
    }
  }

  // ==========================================
  // TEST GROUP 5: 模式切换
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 5: 模式切换');
  console.log('='.repeat(50));

  await goHome(page); await closeModals(page);

  // 5.1 托管模式
  const managedBtn = await page.$('button:has-text("托管模式")');
  if (managedBtn && await managedBtn.isVisible()) {
    await managedBtn.click({ timeout: 3000 });
    await page.waitForTimeout(400);
    logOk('托管模式按钮: 可点击');
    workingButtons.push('托管模式');
  } else {
    logIssue('模式切换', '托管模式按钮未找到', 'MEDIUM');
  }

  // 5.2 对话模式
  const chatBtn = await page.$('button:has-text("对话模式")');
  if (chatBtn && await chatBtn.isVisible()) {
    await chatBtn.click({ timeout: 3000 });
    await page.waitForTimeout(400);
    logOk('对话模式按钮: 可点击');
    workingButtons.push('对话模式');
  } else {
    logIssue('模式切换', '对话模式按钮未找到', 'MEDIUM');
  }

  // ==========================================
  // TEST GROUP 6: 发送按钮
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 6: 发送按钮');
  console.log('='.repeat(50));

  await goHome(page); await closeModals(page);

  // The send button (Button#18) was DISABLED
  const allBtnsForSend = await page.$$('button');
  let sendBtn = null;
  for (const b of allBtnsForSend) {
    const bbox = await b.boundingBox();
    // Send button is the circular button near the input (around x=1345, y=270, 44x44)
    if (bbox && Math.abs(bbox.width - bbox.height) < 5 && bbox.width > 35 && bbox.width < 55 && bbox.y > 200 && bbox.y < 350) {
      sendBtn = b;
      break;
    }
  }

  if (sendBtn) {
    const isEnabled = await sendBtn.isEnabled();
    if (!isEnabled) {
      logIssue('发送按钮', '发送按钮在空输入时被禁用（正确行为，但需要填入内容后测试）', 'LOW');

      // Fill textarea and check again
      const ta = await page.$('textarea');
      if (ta) {
        await ta.fill('测试发送内容');
        await page.waitForTimeout(500);
        const isEnabledNow = await sendBtn.isEnabled();
        if (isEnabledNow) {
          logOk('发送按钮: 填入内容后启用 ✓');
          workingButtons.push('发送按钮');
        } else {
          logIssue('发送按钮', '填入内容后仍然禁用', 'HIGH');
          brokenButtons.push({ description: '发送按钮', reason: '填入内容后仍禁用' });
        }
        await ta.fill(''); // Clear
      }
    } else {
      logOk('发送按钮: 启用');
      workingButtons.push('发送按钮');
    }
  } else {
    logIssue('发送按钮', '未找到发送按钮', 'HIGH');
    brokenButtons.push({ description: '发送按钮', reason: '未找到' });
  }

  // ==========================================
  // TEST GROUP 7: 输入框功能
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 7: 输入框功能');
  console.log('='.repeat(50));

  const textarea = await page.$('textarea');
  if (textarea) {
    // 7.1 文本输入
    await textarea.fill('一只可爱的猫咪在月光下跳舞');
    const val = await textarea.inputValue();
    if (val.includes('猫咪')) logOk('文本输入: 正常');
    else logIssue('输入框', '文本输入异常', 'HIGH');

    // 7.2 Placeholder
    await textarea.fill('');
    const ph = await textarea.getAttribute('placeholder');
    if (ph) logOk(`Placeholder: "${ph.slice(0, 50)}"`);
    else logIssue('输入框', '缺少 placeholder', 'LOW');

    // 7.3 Auto-resize
    const heightBefore = (await textarea.boundingBox())?.height || 0;
    await textarea.fill('第一行\n第二行\n第三行\n第四行\n第五行');
    await page.waitForTimeout(300);
    const heightAfter = (await textarea.boundingBox())?.height || 0;
    if (heightAfter > heightBefore) logOk(`输入框自动增高: ${heightBefore}px → ${heightAfter}px`);
    else logIssue('输入框', '多行输入时未自动增高', 'LOW');

    await textarea.fill('');
  } else {
    logIssue('输入框', 'textarea 未找到', 'CRITICAL');
  }

  // ==========================================
  // TEST GROUP 8: 推荐卡片
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 8: 推荐卡片/标签');
  console.log('='.repeat(50));

  await goHome(page); await closeModals(page);

  const cardTexts = ['自由生图/生视频', '剧情故事短片', '音乐概念短片', '衍生品设计'];
  for (const ct of cardTexts) {
    const cardBtn = await page.$(`button:has-text("${ct}")`);
    if (cardBtn && await cardBtn.isVisible()) {
      try {
        await cardBtn.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        logOk(`推荐卡片 "${ct}": 可点击`);
        workingButtons.push(`推荐: ${ct}`);
      } catch (e) {
        logIssue('推荐卡片', `"${ct}" 点击失败`, 'MEDIUM');
        brokenButtons.push({ description: `推荐: ${ct}`, reason: e.message.slice(0, 60) });
      }
    } else {
      logIssue('推荐卡片', `"${ct}" 未找到`, 'LOW');
    }
  }

  // ==========================================
  // TEST GROUP 9: AI漫剧工作流区域
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 9: AI漫剧工作流');
  console.log('='.repeat(50));

  await goHome(page); await closeModals(page);

  // 9.1 新建漫剧按钮
  const newDramaBtn = await page.$('button:has-text("新建漫剧")');
  if (newDramaBtn && await newDramaBtn.isVisible()) {
    await newDramaBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    // Check if dialog or navigation happened
    const hasDialog = await exists(page, '[class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"]');
    const urlChanged = page.url() !== BASE_URL + '/';
    if (hasDialog || urlChanged) {
      logOk('新建漫剧: 响应正常');
      workingButtons.push('新建漫剧');
      await page.screenshot({ path: 'tests/screenshots/t9_new_drama.png' });
      if (hasDialog) await closeModals(page);
      if (urlChanged) await goHome(page);
    } else {
      logIssue('新建漫剧', '点击后无响应', 'MEDIUM');
      brokenButtons.push({ description: '新建漫剧', reason: '无响应' });
    }
  }

  // 9.2 项目卡片上的 × 删除按钮
  await goHome(page); await closeModals(page);
  const deleteXBtns = await page.$$('button:has-text("×")');
  let projectDeleteCount = 0;
  for (const xBtn of deleteXBtns) {
    const bbox = await xBtn.boundingBox();
    if (bbox && bbox.y > 300) { // Below toolbar area = project cards
      projectDeleteCount++;
    }
  }
  console.log(`  📌 项目卡片删除按钮(×): ${projectDeleteCount} 个`);
  if (projectDeleteCount > 0) logOk(`项目卡片: ${projectDeleteCount} 个删除按钮存在`);

  // 9.3 "新建漫剧" card (the + card)
  const newCard = await page.$('div:has-text("新建漫剧")');
  if (newCard) logOk('新建漫剧空卡片存在');

  // ==========================================
  // TEST GROUP 10: 底部区域 - 发现更多
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 10: 底部"发现更多"区域');
  console.log('='.repeat(50));

  await goHome(page); await closeModals(page);

  const viewAllBtn = await page.$('button:has-text("查看全部")');
  if (viewAllBtn && await viewAllBtn.isVisible()) {
    await viewAllBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    logOk('"查看全部" 按钮: 可点击');
    workingButtons.push('查看全部');
    await page.screenshot({ path: 'tests/screenshots/t10_view_all.png' });
  } else {
    logIssue('发现更多', '"查看全部" 按钮未找到', 'LOW');
  }

  // History task cards
  await goHome(page); await closeModals(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  const historyCards = await page.$$('[class*="card"][class*="history"], [class*="task"]');
  console.log(`  📌 历史任务卡片: ${historyCards.length}`);

  // ==========================================
  // TEST GROUP 11: API 端点
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 11: API 端点测试');
  console.log('='.repeat(50));

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
    const result = await page.evaluate(async (p) => {
      try {
        const r = await fetch(p);
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 100); }
        return { status: r.status, ok: r.ok, data };
      } catch (e) { return { error: e.message }; }
    }, ep.path);

    if (result.error) {
      logIssue('API', `${ep.name}: 请求失败 - ${result.error}`, 'HIGH');
    } else if (result.ok) {
      logOk(`API ${ep.name}: ${result.status} OK`);
    } else {
      logIssue('API', `${ep.name}: ${result.status} ${JSON.stringify(result.data).slice(0, 60)}`, 'MEDIUM');
    }
  }

  // ==========================================
  // TEST GROUP 12: 响应式
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 12: 响应式布局');
  console.log('='.repeat(50));

  await goHome(page);
  for (const vp of [
    { w: 1920, h: 1080, n: '桌面(1920)' },
    { w: 1366, h: 768, n: '笔记本(1366)' },
    { w: 768, h: 1024, n: '平板(768)' },
    { w: 375, h: 812, n: '手机(375)' },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    if (overflow) logIssue('响应式', `${vp.n}: 水平溢出`, 'MEDIUM');
    else logOk(`${vp.n}: 正常`);
    await page.screenshot({ path: `tests/screenshots/t12_responsive_${vp.w}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ==========================================
  // TEST GROUP 13: Workflow 页面
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('📋 TEST 13: Workflow 页面');
  console.log('='.repeat(50));

  await page.goto(BASE_URL + '/workflow/new', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshots/t13_workflow.png' });

  const wfButtons = await page.$$('button');
  const visWfBtns = [];
  for (const b of wfButtons) {
    if (await b.isVisible()) {
      const text = (await b.textContent())?.trim().slice(0, 40);
      visWfBtns.push(text);
    }
  }
  console.log(`  📌 Workflow 页面按钮: ${visWfBtns.length} → [${visWfBtns.join(', ')}]`);

  // Check key workflow elements
  const wfTextarea = await exists(page, 'textarea');
  if (wfTextarea) logOk('Workflow: 输入框存在');
  else logIssue('Workflow', '输入框未找到', 'MEDIUM');

  // ==========================================
  // FINAL REPORT
  // ==========================================
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 最 终 测 试 报 告');
  console.log('='.repeat(60));

  // Console errors
  const uniqueConsoleErrors = [...new Set(consoleErrors)];
  if (uniqueConsoleErrors.length > 0) {
    console.log(`\n⚠️  控制台错误 (${uniqueConsoleErrors.length}):`);
    for (const e of uniqueConsoleErrors.slice(0, 15)) {
      logIssue('控制台', e.slice(0, 150), 'MEDIUM');
    }
  }

  // Network errors
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

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔢 问题统计: 共 ${issues.length} 个`);
  console.log(`  🔴 CRITICAL: ${c.length}`);
  console.log(`  🟠 HIGH:     ${h.length}`);
  console.log(`  🟡 MEDIUM:   ${m.length}`);
  console.log(`  🔵 LOW:      ${l.length}`);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ 正常工作的按钮/功能 (${workingButtons.length}):`);
  for (const b of workingButtons) console.log(`  ✅ ${b}`);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ 失效/问题按钮 (${brokenButtons.length}):`);
  for (const b of brokenButtons) console.log(`  ❌ ${b.description} → ${b.reason}`);

  console.log(`\n${'─'.repeat(50)}`);
  if (c.length > 0) { console.log('🔴 CRITICAL:'); for (const i of c) console.log(`  • ${i.category}: ${i.description}`); }
  if (h.length > 0) { console.log('🟠 HIGH:'); for (const i of h) console.log(`  • ${i.category}: ${i.description}`); }
  if (m.length > 0) { console.log('🟡 MEDIUM:'); for (const i of m) console.log(`  • ${i.category}: ${i.description}`); }
  if (l.length > 0) { console.log('🔵 LOW:'); for (const i of l) console.log(`  • ${i.category}: ${i.description}`); }

  // Save report
  const fs = await import('fs');
  fs.writeFileSync('tests/functional_test_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: issues.length, critical: c.length, high: h.length, medium: m.length, low: l.length },
    workingButtons, brokenButtons, issues,
    consoleErrors: uniqueConsoleErrors, networkErrors: uniqueNetErrors,
  }, null, 2));

  await browser.close();
  console.log('\n📁 报告: tests/functional_test_report.json');
  console.log('📁 截图: tests/screenshots/');
  console.log('\n✅ 全部测试完成\n');
})();
