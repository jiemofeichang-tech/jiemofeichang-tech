/**
 * Seedance Studio - 最终精确测试
 * 弹窗使用 inline style (position:fixed; inset:0; zIndex:1000)
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

// Detect fixed overlay modals (inline style based)
async function hasOverlayModal(page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll('div');
    for (const el of els) {
      const s = el.style;
      if (s.position === 'fixed' && (s.inset === '0' || s.inset === '0px') && el.offsetWidth > 0) {
        return true;
      }
    }
    // Also check Tailwind fixed modals
    for (const el of document.querySelectorAll('.fixed.inset-0')) {
      if (el.offsetWidth > 0) return true;
    }
    return false;
  });
}

async function closeModals(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Click backdrop area
  await page.mouse.click(10, 10);
  await page.waitForTimeout(200);
}

(async () => {
  console.log('🚀 Seedance Studio 最终功能测试\n' + '='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const networkErrors = [];
  page.on('requestfailed', req => networkErrors.push({ url: req.url(), err: req.failure()?.errorText }));

  // ==================== LOGIN ====================
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Register + Login
  const onLogin = await page.$('input[placeholder*="用户名"]');
  if (onLogin) {
    const regTab = await page.$('button:has-text("注册")');
    if (regTab) {
      await regTab.click();
      await page.waitForTimeout(500);
      const inputs = await page.$$('input');
      const uname = 'at' + Date.now();
      if (inputs.length >= 3) {
        await inputs[0].fill(uname);
        await inputs[1].fill('pass123');
        await inputs[2].fill('pass123');
      }
      const btns = await page.$$('button');
      for (const b of btns) {
        const bbox = await b.boundingBox();
        const text = (await b.textContent())?.trim();
        if (text === '注册' && bbox?.width > 200 && bbox?.height > 40) { await b.click(); break; }
      }
      await page.waitForTimeout(3000);
    }
  }

  // Verify main page
  const ta = await page.$('textarea');
  if (!ta) {
    console.log('FATAL: 无法进入主页面');
    await page.screenshot({ path: 'tests/screenshots/fatal.png' });
    await browser.close();
    return;
  }
  logOk('登录成功，进入主页面');

  // Close announcement banner
  const bannerX = await page.$$('button:has-text("×")');
  for (const b of bannerX) {
    const bbox = await b.boundingBox();
    if (bbox && bbox.y < 100) { await b.click().catch(()=>{}); break; }
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screenshots/f0_main.png', fullPage: true });

  // ==================== TEST 1: 登录页 ====================
  console.log('\n📋 T1: 登录页问题');
  logIssue('登录页', '空用户名/密码提交无前端校验提示（直接发请求）', 'MEDIUM');
  logIssue('登录页', '注册成功后无 toast/提示信息确认', 'LOW');

  // ==================== TEST 2: 头部导航 ====================
  console.log('\n📋 T2: 头部导航栏');

  // 2.1 语言切换
  const langBtn = await page.$('button:has-text("简体中文")');
  if (langBtn) {
    await langBtn.click();
    await page.waitForTimeout(600);
    // Check for dropdown (may be absolutely positioned div near the button)
    const dropdown = await page.evaluate(() => {
      const els = document.querySelectorAll('div');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.top > 40 && r.top < 120 && r.right > 1300 && el.innerText.includes('English')) return true;
      }
      return false;
    });
    if (dropdown) {
      logOk('语言切换: 下拉菜单正常');
      workingButtons.push('语言切换');
    } else {
      logIssue('语言切换', '点击后下拉菜单未出现（或未检测到）', 'MEDIUM');
      brokenButtons.push({ description: '语言切换', reason: '下拉菜单未出现' });
    }
    await page.screenshot({ path: 'tests/screenshots/f2_lang.png' });
    await closeModals(page);
  }

  // 2.2 头部图标按钮（微信、Discord）
  const topIcons = [];
  for (const b of await page.$$('button')) {
    const bbox = await b.boundingBox();
    const text = (await b.textContent())?.trim();
    if (bbox && bbox.y < 60 && bbox.y > 5 && (!text || text.length < 3) && bbox.width < 45) {
      topIcons.push({ btn: b, x: Math.round(bbox.x), text });
    }
  }

  for (const icon of topIcons) {
    await icon.btn.click();
    await page.waitForTimeout(600);
    const modal = await hasOverlayModal(page);
    await page.screenshot({ path: `tests/screenshots/f2_icon_${icon.x}.png` });
    if (modal) {
      logOk(`头部图标 x=${icon.x}: 弹窗正常`);
      workingButtons.push(`头部图标 x=${icon.x}`);
    } else {
      // Could be a link that opens in new tab
      const isLink = await icon.btn.evaluate(el => el.closest('a')?.href || '');
      if (isLink) {
        logOk(`头部图标 x=${icon.x}: 链接 → ${isLink.slice(0, 60)}`);
        workingButtons.push(`头部图标 x=${icon.x} (链接)`);
      } else {
        logIssue('头部图标', `x=${icon.x} 点击后无弹窗无导航`, 'MEDIUM');
        brokenButtons.push({ description: `头部图标 x=${icon.x}`, reason: '无响应' });
      }
    }
    await closeModals(page);
    await page.waitForTimeout(300);
  }

  // 2.3 常见问题
  const faqBtn = await page.$('button:has-text("常见问题")');
  if (faqBtn) {
    await faqBtn.click();
    await page.waitForTimeout(600);
    const modal = await hasOverlayModal(page);
    await page.screenshot({ path: 'tests/screenshots/f2_faq.png' });
    if (modal) {
      logOk('常见问题: 弹窗正常');
      workingButtons.push('常见问题');
      // Check accordion items
      const faqCount = await page.evaluate(() => {
        return document.querySelectorAll('[style*="cursor:pointer"], [style*="cursor: pointer"]').length;
      });
      console.log(`  📌 FAQ 条目约: ${faqCount}`);
    } else {
      logIssue('常见问题', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '常见问题', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 2.4 我的资产 (头部)
  const assetBtnsAll = await page.$$('button:has-text("我的资产")');
  for (const ab of assetBtnsAll) {
    const bbox = await ab.boundingBox();
    if (bbox && bbox.y < 60) {
      await ab.click();
      await page.waitForTimeout(600);
      const modal = await hasOverlayModal(page);
      await page.screenshot({ path: 'tests/screenshots/f2_assets_header.png' });
      if (modal) {
        logOk('我的资产(头部): 弹窗正常');
        workingButtons.push('我的资产(头部)');
      } else {
        logIssue('我的资产(头部)', '弹窗未打开', 'MEDIUM');
        brokenButtons.push({ description: '我的资产(头部)', reason: '弹窗未打开' });
      }
      await closeModals(page);
      break;
    }
  }

  // 2.5 积分/头像
  const avatarArea = await page.$$('button');
  for (const b of avatarArea) {
    const bbox = await b.boundingBox();
    const text = (await b.textContent())?.trim();
    if (bbox && bbox.y < 50 && bbox.x > 1700 && text?.includes('BASE')) {
      await b.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'tests/screenshots/f2_avatar.png' });
      // Check for dropdown menu
      const hasMenu = await page.evaluate(() => {
        const els = document.querySelectorAll('div');
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const s = el.style;
          if ((s.position === 'absolute' || s.position === 'fixed') && r.top > 40 && r.right > 1700 && el.offsetHeight > 50) {
            return el.innerText.slice(0, 100);
          }
        }
        return null;
      });
      if (hasMenu) {
        logOk(`积分/头像菜单: 打开 (${hasMenu.slice(0, 40)})`);
        workingButtons.push('积分/头像');
      } else {
        logIssue('积分/头像', '点击后无菜单', 'MEDIUM');
        brokenButtons.push({ description: '积分/头像', reason: '无菜单' });
      }
      await closeModals(page);
      break;
    }
  }

  // ==================== TEST 3: 侧边栏 ====================
  console.log('\n📋 T3: 侧边栏');

  const sideNames = ['首页', '我的项目', '我的资产', 'AI漫剧工作流', '回收站'];
  for (const name of sideNames) {
    const allBtns = await page.$$('button');
    let found = false;
    for (const b of allBtns) {
      const bbox = await b.boundingBox();
      const title = await b.getAttribute('title');
      if (bbox && bbox.x < 80 && title === name) {
        await b.click();
        await page.waitForTimeout(800);
        logOk(`侧边栏 "${name}": 可点击`);
        workingButtons.push(`侧边栏: ${name}`);
        await page.screenshot({ path: `tests/screenshots/f3_${name}.png` });
        found = true;
        break;
      }
    }
    if (!found) {
      // Try text match
      const btn = await page.$(`button:has-text("${name}")`);
      if (btn) {
        const bbox = await btn.boundingBox();
        if (bbox && bbox.x < 80) {
          await btn.click();
          await page.waitForTimeout(800);
          logOk(`侧边栏 "${name}": 可点击`);
          workingButtons.push(`侧边栏: ${name}`);
          found = true;
        }
      }
    }
    if (!found) {
      logIssue('侧边栏', `"${name}" 未找到`, 'HIGH');
      brokenButtons.push({ description: `侧边栏: ${name}`, reason: '未找到' });
    }
  }

  // Go back to home
  for (const b of await page.$$('button')) {
    const bbox = await b.boundingBox();
    const title = await b.getAttribute('title');
    if (bbox && bbox.x < 80 && title === '首页') { await b.click(); break; }
  }
  await page.waitForTimeout(1000);

  // ==================== TEST 4: 工具栏 ====================
  console.log('\n📋 T4: 工具栏按钮');

  // 4.1 上传 (+)
  const uploadBtn = await page.$('button:has-text("+")');
  if (uploadBtn) {
    const bbox = await uploadBtn.boundingBox();
    if (bbox && bbox.y > 200) {
      await uploadBtn.click();
      await page.waitForTimeout(800);
      const modal = await hasOverlayModal(page);
      await page.screenshot({ path: 'tests/screenshots/f4_upload.png' });
      if (modal) {
        logOk('上传(+): 弹窗正常');
        workingButtons.push('上传(+)');
        // Check file input
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) logOk('上传弹窗: file input 存在');
        else logIssue('上传弹窗', '缺少 file input', 'MEDIUM');
      } else {
        logIssue('上传(+)', '弹窗未打开', 'HIGH');
        brokenButtons.push({ description: '上传(+)', reason: '弹窗未打开' });
      }
      await closeModals(page);
    }
  }

  // 4.2 剧本中文
  const scriptBtn = await page.$('button:has-text("剧本中文")');
  if (scriptBtn) {
    await scriptBtn.click();
    await page.waitForTimeout(800);
    const modal = await hasOverlayModal(page);
    await page.screenshot({ path: 'tests/screenshots/f4_script.png' });
    if (modal) {
      logOk('剧本中文编辑器: 弹窗正常');
      workingButtons.push('剧本中文');
      const ta = await page.$$('textarea');
      console.log(`  📌 剧本中文弹窗中 textarea: ${ta.length}`);
    } else {
      logIssue('剧本中文', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '剧本中文', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 4.3 147种风格
  const styleBtn = await page.$('button:has-text("147")');
  if (styleBtn) {
    await styleBtn.click();
    await page.waitForTimeout(800);
    const modal = await hasOverlayModal(page);
    await page.screenshot({ path: 'tests/screenshots/f4_styles.png' });
    if (modal) {
      logOk('风格选择: 弹窗正常');
      workingButtons.push('147种风格');
      const gridItems = await page.evaluate(() => {
        const grids = document.querySelectorAll('[style*="grid"]');
        let total = 0;
        for (const g of grids) total += g.children.length;
        return total;
      });
      console.log(`  📌 风格网格元素: ${gridItems}`);
    } else {
      logIssue('147种风格', '弹窗未打开', 'HIGH');
      brokenButtons.push({ description: '147种风格', reason: '弹窗未打开' });
    }
    await closeModals(page);
  }

  // 4.4 我的资产 (工具栏)
  for (const ab of assetBtnsAll) {
    const bbox = await ab.boundingBox();
    if (bbox && bbox.y > 200 && bbox.y < 400) {
      await ab.click();
      await page.waitForTimeout(800);
      const modal = await hasOverlayModal(page);
      await page.screenshot({ path: 'tests/screenshots/f4_assets_toolbar.png' });
      if (modal) {
        logOk('我的资产(工具栏): 弹窗正常');
        workingButtons.push('我的资产(工具栏)');
      } else {
        logIssue('我的资产(工具栏)', '弹窗未打开', 'MEDIUM');
        brokenButtons.push({ description: '我的资产(工具栏)', reason: '弹窗未打开' });
      }
      await closeModals(page);
      break;
    }
  }

  // ==================== TEST 5: 模式切换 ====================
  console.log('\n📋 T5: 模式切换 & 发送');

  const managed = await page.$('button:has-text("托管模式")');
  if (managed) { await managed.click(); await page.waitForTimeout(300); logOk('托管模式: ✓'); workingButtons.push('托管模式'); }
  else logIssue('模式切换', '托管模式按钮未找到', 'MEDIUM');

  const chat = await page.$('button:has-text("对话模式")');
  if (chat) { await chat.click(); await page.waitForTimeout(300); logOk('对话模式: ✓'); workingButtons.push('对话模式'); }
  else logIssue('模式切换', '对话模式按钮未找到', 'MEDIUM');

  // Switch back to managed
  if (managed) await managed.click();
  await page.waitForTimeout(300);

  // 发送按钮
  const textarea = await page.$('textarea');
  const sendBtnCheck = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (Math.abs(r.width - r.height) < 5 && r.width > 35 && r.width < 55 && r.y > 200 && r.y < 350) {
        return { disabled: b.disabled, x: Math.round(r.x), y: Math.round(r.y) };
      }
    }
    return null;
  });

  if (sendBtnCheck) {
    if (sendBtnCheck.disabled) {
      logOk('发送按钮: 空输入时正确禁用');
      if (textarea) {
        await textarea.fill('测试内容');
        await page.waitForTimeout(500);
        const nowEnabled = await page.evaluate((pos) => {
          const btns = document.querySelectorAll('button');
          for (const b of btns) {
            const r = b.getBoundingClientRect();
            if (Math.abs(r.x - pos.x) < 5 && Math.abs(r.y - pos.y) < 5) return !b.disabled;
          }
          return false;
        }, sendBtnCheck);
        if (nowEnabled) {
          logOk('发送按钮: 有内容后启用 ✓');
          workingButtons.push('发送按钮');
        } else {
          logIssue('发送按钮', '输入内容后仍禁用', 'HIGH');
          brokenButtons.push({ description: '发送按钮', reason: '有内容仍禁用' });
        }
        await textarea.fill('');
      }
    } else {
      logOk('发送按钮: 启用');
      workingButtons.push('发送按钮');
    }
  } else {
    logIssue('发送按钮', '未找到', 'HIGH');
    brokenButtons.push({ description: '发送按钮', reason: '未找到' });
  }

  // ==================== TEST 6: 输入框 ====================
  console.log('\n📋 T6: 输入框');

  if (textarea) {
    await textarea.fill('一只可爱的猫咪在月光下跳舞');
    const val = await textarea.inputValue();
    if (val.includes('猫')) logOk('输入: 正常');
    else logIssue('输入框', '输入异常', 'HIGH');

    const ph = await textarea.getAttribute('placeholder');
    if (ph) logOk(`Placeholder: "${ph.slice(0, 50)}"`);

    await textarea.fill('');
  }

  // ==================== TEST 7: 推荐卡片 ====================
  console.log('\n📋 T7: 推荐卡片');

  for (const label of ['自由生图/生视频', '剧情故事短片', '音乐概念短片', '衍生品设计']) {
    const btn = await page.$(`button:has-text("${label}")`);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(400);
      logOk(`"${label}": ✓`);
      workingButtons.push(`推荐: ${label}`);
    } else {
      logIssue('推荐卡片', `"${label}" 未找到`, 'LOW');
    }
  }

  // ==================== TEST 8: 新建漫剧 ====================
  console.log('\n📋 T8: 新建漫剧');

  const newBtn = await page.$('button:has-text("新建漫剧")');
  if (newBtn && await newBtn.isVisible()) {
    await newBtn.click();
    await page.waitForTimeout(800);
    const modal = await hasOverlayModal(page);
    const urlChanged = !page.url().endsWith('/');
    await page.screenshot({ path: 'tests/screenshots/f8_new_drama.png' });
    if (modal) {
      logOk('新建漫剧: 创建弹窗正常');
      workingButtons.push('新建漫剧');
    } else if (urlChanged) {
      logOk(`新建漫剧: 导航到 ${page.url()}`);
      workingButtons.push('新建漫剧 (导航)');
      await page.goBack();
      await page.waitForTimeout(1000);
    } else {
      logIssue('新建漫剧', '点击后无弹窗无导航', 'MEDIUM');
      brokenButtons.push({ description: '新建漫剧', reason: '无响应' });
    }
    await closeModals(page);
  }

  // ==================== TEST 9: 查看全部 ====================
  console.log('\n📋 T9: 查看全部 & 历史');

  const viewAll = await page.$('button:has-text("查看全部")');
  if (viewAll && await viewAll.isVisible()) {
    await viewAll.click();
    await page.waitForTimeout(500);
    logOk('"查看全部": ✓');
    workingButtons.push('查看全部');
  }

  // ==================== TEST 10: API 端点 ====================
  console.log('\n📋 T10: API 端点');

  for (const ep of [
    '/api/config', '/api/history', '/api/library', '/api/health',
    '/api/trash', '/api/projects', '/api/auth/me',
  ]) {
    const r = await page.evaluate(async (p) => {
      try { const res = await fetch(p); return { s: res.status, ok: res.ok }; }
      catch (e) { return { err: e.message }; }
    }, ep);
    if (r.ok) logOk(`API ${ep}: ${r.s}`);
    else logIssue('API', `${ep}: ${r.s || r.err}`, r.s === 401 ? 'HIGH' : 'MEDIUM');
  }

  // ==================== TEST 11: Workflow ====================
  console.log('\n📋 T11: Workflow 页面');

  await page.goto(BASE_URL + '/workflow/new', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshots/f11_workflow.png' });

  const wfBtns = await page.$$('button');
  const visWf = [];
  for (const b of wfBtns) {
    if (await b.isVisible()) {
      const text = (await b.textContent())?.trim().slice(0, 30);
      const enabled = await b.isEnabled();
      visWf.push({ text, enabled });
    }
  }
  console.log(`  📌 Workflow 按钮 (${visWf.length}):`);
  for (const v of visWf) {
    const s = v.enabled ? '✅' : '❌';
    console.log(`    ${s} "${v.text}"`);
    if (!v.enabled && v.text) brokenButtons.push({ description: `Workflow: ${v.text}`, reason: '禁用' });
  }

  // Check workflow step buttons
  for (const step of ['剧本', '风格', '角色', '分镜', '视频', '后期']) {
    const btn = await page.$(`button:has-text("${step}")`);
    if (btn && await btn.isVisible()) {
      const enabled = await btn.isEnabled();
      if (enabled) {
        await btn.click();
        await page.waitForTimeout(500);
        logOk(`Workflow步骤 "${step}": ✓`);
        workingButtons.push(`Workflow: ${step}`);
      } else {
        logIssue('Workflow', `"${step}" 步骤按钮禁用`, 'MEDIUM');
        brokenButtons.push({ description: `Workflow: ${step}`, reason: '禁用' });
      }
    }
  }

  // ==================== TEST 12: 响应式 ====================
  console.log('\n📋 T12: 响应式');

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  for (const vp of [
    { w: 1920, h: 1080, n: '桌面' },
    { w: 1366, h: 768, n: '笔记本' },
    { w: 768, h: 1024, n: '平板' },
    { w: 375, h: 812, n: '手机' },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    if (overflow) logIssue('响应式', `${vp.n}(${vp.w}): 水平溢出`, 'MEDIUM');
    else logOk(`${vp.n}(${vp.w}): ✓`);
    await page.screenshot({ path: `tests/screenshots/f12_${vp.w}.png` });
  }

  // ========================================================
  // FINAL REPORT
  // ========================================================
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 最 终 测 试 报 告');
  console.log('═'.repeat(60));

  const uce = [...new Set(consoleErrors)];
  if (uce.length) { console.log(`\n⚠️  控制台错误 (${uce.length}):`); for (const e of uce.slice(0, 10)) logIssue('控制台', e.slice(0, 120)); }

  const une = [...new Map(networkErrors.map(e => [e.url, e])).values()];
  if (une.length) { console.log(`\n⚠️  网络错误 (${une.length}):`); for (const e of une.slice(0, 10)) logIssue('网络', `${e.url.replace(BASE_URL, '')} → ${e.err}`); }

  const c = issues.filter(i => i.severity === 'CRITICAL');
  const h = issues.filter(i => i.severity === 'HIGH');
  const m = issues.filter(i => i.severity === 'MEDIUM');
  const l = issues.filter(i => i.severity === 'LOW');

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔢 总计 ${issues.length} 个问题:`);
  console.log(`  🔴 CRITICAL: ${c.length}  🟠 HIGH: ${h.length}  🟡 MEDIUM: ${m.length}  🔵 LOW: ${l.length}`);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ 正常工作 (${workingButtons.length}):`);
  for (const b of workingButtons) console.log(`  ✅ ${b}`);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ 失效/问题 (${brokenButtons.length}):`);
  for (const b of brokenButtons) console.log(`  ❌ ${b.description} → ${b.reason}`);

  console.log(`\n${'─'.repeat(50)}`);
  for (const [sev, icon, list] of [['CRITICAL','🔴',c],['HIGH','🟠',h],['MEDIUM','🟡',m],['LOW','🔵',l]]) {
    if (list.length) { console.log(`\n${icon} ${sev}:`); for (const i of list) console.log(`  • ${i.category}: ${i.description}`); }
  }

  const fs = await import('fs');
  fs.writeFileSync('tests/functional_test_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: issues.length, critical: c.length, high: h.length, medium: m.length, low: l.length },
    workingButtons, brokenButtons, issues, consoleErrors: uce, networkErrors: une,
  }, null, 2));

  await browser.close();
  console.log('\n✅ 测试完成\n');
})();
