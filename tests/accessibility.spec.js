import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Автоматическая проверка не заменяет ручную работу с NVDA, JAWS, VoiceOver и TalkBack.
for (const language of ['ru', 'en']) {
  for (const theme of ['light', 'dark']) {
    test(`WCAG scan: ${language}, ${theme}`, async ({ page }) => {
      await page.addInitScript(({ language, theme }) => {
        localStorage.setItem('lumo.language', language);
        localStorage.setItem('lumo.theme', theme);
      }, { language, theme });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await page.locator('summary').first().click();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations).toEqual([]);
    });
  }
}

test('keyboard: skip link, example selector, native disclosure and focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Выбрать направление' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('group', { name: 'Язык примера кода' }).getByRole('button', { name: 'Python', exact: true })).toBeFocused();
  const focus = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(focus).toEqual({ width: '3px', style: 'solid' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Язык примера кода' }).getByRole('button', { name: 'JavaScript', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.code-sample')).toContainText('console.log');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('summary').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
});

test('language and theme persist; system theme follows OS changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 20, 30)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 252)');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  await expect(page).toHaveTitle('Lumo — coding at your pace');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 20, 30)');
});

test('blocked browser storage does not prevent rendering or preference changes', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your pace.');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 20, 30)');
});

test('reduced motion removes animated hover transforms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const button = page.getByRole('link', { name: 'Выбрать направление' });
  await button.hover();
  await expect(button).toHaveCSS('transition-duration', '0s');
  await expect(button).toHaveCSS('transform', 'none');
  const settings = page.getByRole('button', { name: 'Настройки' });
  await settings.hover();
  await expect(settings).toHaveCSS('transform', 'none');
});

test('mobile reflow, expanded outlines, and 200% text remain usable', async ({ page }) => {
  for (const language of ['ru', 'en']) {
    await page.addInitScript(language => localStorage.setItem('lumo.language', language), language);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      for (const summary of await page.locator('summary').all()) await summary.click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow, `Horizontal overflow at ${width}px (${language})`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your pace.');
  await page.getByRole('button', { name: 'Переключить на русский' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.addStyleTag({ content: 'html { font-size: 100%; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('screenshots and no client errors', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('Тема', { exact: true }).selectOption('dark');
  await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('Тема', { exact: true }).selectOption('light');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('accessibility settings persist independently and reset together', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удобство чтения' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: /Размер текста/ }).selectOption('125');
  await dialog.getByRole('combobox', { name: /Интервал между строками/ }).selectOption('spacious');
  await dialog.getByRole('checkbox', { name: /Высокий контраст/ }).check();
  await dialog.getByRole('checkbox', { name: /Шрифт OpenDyslexic/ }).check();
  await dialog.getByRole('checkbox', { name: /Отключить анимацию/ }).check();
  await dialog.getByRole('checkbox', { name: /Простой язык/ }).check();
  await dialog.getByRole('checkbox', { name: /Режим фокуса/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-font-size', '125');
  await expect(page.locator('html')).toHaveAttribute('data-line-spacing', 'spacious');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'on');
  await expect(page.locator('html')).toHaveAttribute('data-dyslexic', 'on');
  expect(await page.evaluate(async () => (await document.fonts.load('16px OpenDyslexic', 'Привет, мир!')).length)).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await dialog.getByRole('button', { name: 'Готово' }).hover();
  await expect(dialog.getByRole('button', { name: 'Готово' })).toHaveCSS('transform', 'none');
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'on');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.site-header nav')).toBeHidden();
  await expect(page.locator('.code-window')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('line-height', '45px');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Пиши код.');
  await expect(page.locator('.hero-intro')).toContainText('Здесь можно учиться писать код.');
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(dialog.getByRole('checkbox', { name: /Простой язык/ })).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: /Размер текста/ })).toHaveValue('125');
  await dialog.getByRole('button', { name: 'Сбросить настройки' }).click();
  await expect(dialog.getByRole('combobox', { name: /Размер текста/ })).toHaveValue('100');
  await expect(dialog.getByRole('checkbox', { name: /Режим фокуса/ })).not.toBeChecked();
  await expect(page.locator('.site-header nav')).toBeVisible();
  await expect(page.locator('.hero-intro')).not.toContainText('Здесь можно учиться писать код.');
});

test('settings dialog supports keyboard, Escape, and focus return', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Настройки' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Удобство чтения' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Закрыть настройки' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('combobox', { name: /Размер текста/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('contrast and dialog have no axe violations in both themes and languages', async ({ page }) => {
  for (const language of ['ru', 'en']) {
    for (const theme of ['light', 'dark']) {
      await page.goto('/');
      if (language === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
      await page.getByRole('button', { name: language === 'ru' ? 'Настройки' : 'Settings' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: language === 'ru' ? /Тема/ : /Theme/ }).selectOption(theme);
      await dialog.getByRole('checkbox', { name: language === 'ru' ? /Высокий контраст/ : /High contrast/ }).check();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations).toEqual([]);
      await dialog.getByRole('button', { name: language === 'ru' ? 'Готово' : 'Done' }).click();
      const pageResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(pageResult.violations).toEqual([]);
      await page.evaluate(() => localStorage.clear());
    }
  }
});

test('settings remain usable at mobile width and large text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /Размер текста/ }).selectOption('150');
  await dialog.getByRole('combobox', { name: /Интервал между строками/ }).selectOption('spacious');
  await expect(dialog.getByRole('button', { name: 'Готово' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: /Режим фокуса/ }).check();
  await dialog.getByRole('checkbox', { name: /Шрифт OpenDyslexic/ }).check();
  await dialog.getByRole('button', { name: 'Готово' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.locator('.code-window')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await dialog.getByRole('button', { name: 'Сбросить настройки' }).click();
  await expect(dialog.getByRole('checkbox', { name: /Шрифт OpenDyslexic/ })).not.toBeChecked();
});
