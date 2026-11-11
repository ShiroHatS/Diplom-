import { test, expect } from '@playwright/test';

// Проверяем то, что axe не измеряет: реальную видимость фокуса,
// контраст границ, крупные зоны нажатия и работу при малой высоте окна.
const spacing = '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';

async function keyboardDialog(page, trigger, selector) {
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator(selector);
  await expect(dialog).toBeVisible();
  const count = await dialog.locator('button:not(:disabled), input, select').count();
  const seen = new Set();
  for (let step = 0; step < count; step++) {
    const item = await dialog.evaluate(root => {
      const active = document.activeElement;
      const controls = [...root.querySelectorAll('button:not(:disabled), input, select')];
      const rect = active.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
      // Учитываем не только viewport, но и обрезание вложенной прокруткой.
      for (let parent = active.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      }
      return { index: controls.indexOf(active), name: active.id || active.textContent?.slice(0, 100) || active.tagName,
        width: right - left, height: bottom - top, overflow: root.scrollWidth > root.clientWidth + 1 };
    });
    expect(item.index, `Focus escaped ${selector}: ${item.name}`).toBeGreaterThanOrEqual(0);
    expect(item.overflow, `Dialog scrolls horizontally: ${item.name}`).toBe(false);
    expect(item.width, `Focus clipped horizontally: ${item.name}`).toBeGreaterThan(10);
    expect(item.height, `Focus clipped vertically: ${item.name}`).toBeGreaterThan(10);
    seen.add(item.index);
    await page.keyboard.press('Tab');
  }
  expect(seen.size, 'Every control remains reachable').toBe(count);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
}

for (const language of ['ru', 'en']) {
  test(`audit: dialogs at 400% equivalent viewport, 200% text and spacing (${language})`, async ({ page }, info) => {
    await page.addInitScript(language => localStorage.setItem('lumo.language', language), language);
    for (const size of [{ width: 320, height: 256 }, { width: 640, height: 320 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(size);
      await page.goto('/');
      // 320 × 256 соответствует окну 1280 × 1024 при масштабе 400%.
      // Отдельно увеличиваем только текст и применяем пользовательские интервалы.
      if (size.height === 640) await page.addStyleTag({ content: `html { font-size: 200%; } ${spacing}` });
      await keyboardDialog(page, page.locator('.settings-trigger'), '.settings-dialog:not(.account-dialog)');
      await keyboardDialog(page, page.locator('.account-bar button'), '.account-dialog');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await page.locator('.account-bar button').click();
    await page.screenshot({ path: info.outputPath(`account-large-text-${language}.png`) });
  });
}

function luminance(rgb) {
  const values = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

for (const theme of ['light', 'dark']) {
  test(`audit: field boundaries and focus contrast (${theme})`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('lumo.theme', theme), theme);
    await page.goto('/');
    await page.locator('.account-bar button').click();
    const colors = await page.locator('#account-username').evaluate(element => {
      const style = getComputedStyle(element), surface = getComputedStyle(element.closest('dialog'));
      return { border: style.borderTopColor, inside: style.backgroundColor, outside: surface.backgroundColor };
    });
    expect(ratio(colors.border, colors.inside), JSON.stringify(colors)).toBeGreaterThanOrEqual(3);
    expect(ratio(colors.border, colors.outside)).toBeGreaterThanOrEqual(3);
    await page.locator('#account-username').focus();
    const focus = await page.locator('#account-username').evaluate(element => getComputedStyle(element).outlineColor);
    expect(ratio(focus, colors.outside)).toBeGreaterThanOrEqual(3);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Практика', exact: true }).click();
    const editor = await page.locator('.editor-input').evaluate(element => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, background: style.backgroundColor };
    });
    expect(ratio(editor.border, editor.background)).toBeGreaterThanOrEqual(3);
    await page.locator('.course-picker').getByRole('button', { name: 'JavaScript' }).click();
    await page.getByRole('button', { name: 'Практика', exact: true }).click();
    await page.locator('#practice-answer').fill('console.log(');
    await page.locator('.editor-run').click();
    await expect(page.locator('#practice-answer')).toHaveAttribute('aria-invalid', 'true');
    const errorBorder = await page.locator('.editor-input').evaluate(element => getComputedStyle(element).borderTopColor);
    expect(ratio(errorBorder, editor.background)).toBeGreaterThanOrEqual(3);
  });
}

test('audit: stopping execution keeps keyboard focus on the stop control', async ({ page }) => {
  await page.goto('/#learn');
  await page.locator('.course-picker').getByRole('button', { name: 'JavaScript' }).click();
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  await page.locator('#practice-answer').fill('while (true) {}');
  await page.locator('.editor-run').click();
  const stop = page.getByRole('button', { name: 'Остановить', exact: true });
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-status')).toContainText('остановлен');
  await expect(stop).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Вставить отступ' })).toBeFocused();
});

test('audit: language control name includes its visible label for voice commands', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.language-control')).toHaveAccessibleName('EN — Switch to English');
  await page.locator('.language-control').click();
  await expect(page.locator('.language-control')).toHaveAccessibleName('RU — Переключить на русский');
  await expect(page.locator('.language-control')).toHaveAttribute('lang', 'ru');
});

test('audit: selection stays visible without color in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  await page.locator('.account-bar button').click();
  const selected = page.locator('.account-modes [aria-pressed="true"]');
  await expect(selected).toHaveCSS('text-decoration-line', 'underline');
  await expect(selected).toHaveCSS('border-top-color', await page.evaluate(() => {
    const probe = document.createElement('span'); probe.style.color = 'Highlight'; document.body.append(probe);
    const color = getComputedStyle(probe).color; probe.remove(); return color;
  }));
  await page.keyboard.press('Escape');
  await expect(page.locator('.course-picker [aria-pressed="true"]')).toHaveCSS('text-decoration-line', 'underline');
});

test('audit: controls have at least 44 by 44 CSS pixel activation areas', async ({ page }) => {
  async function checkTargets(root) {
    const small = await root.locator('button, a, select, summary, input').evaluateAll(elements => elements.flatMap(element => {
      if (!element.getClientRects().length || element.closest('dialog:not([open])') || element.closest('[inert]') || element.matches('.skip-link')) return [];
      const target = element.matches('[type="checkbox"], [type="radio"]') ? element.closest('label') || element : element;
      const bounds = target.getBoundingClientRect();
      return bounds.width < 43.9 || bounds.height < 43.9 ? [{ name: element.id || element.textContent.trim(), width: bounds.width, height: bounds.height }] : [];
    }));
    expect(small).toEqual([]);
  }
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await checkTargets(page.locator('body'));
    await page.locator('.settings-trigger').click();
    await checkTargets(page.locator('dialog[open]'));
    await page.keyboard.press('Escape');
    await page.locator('.account-bar button').click();
    await checkTargets(page.locator('dialog[open]'));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Практика', exact: true }).click();
    await checkTargets(page.locator('#learn'));
  }
});
