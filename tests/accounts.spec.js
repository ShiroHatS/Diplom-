import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

const password = 'Browser test long passphrase 2026';
const username = () => `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
async function account(page) { await page.getByRole('button', { name: 'Аккаунт', exact: true }).click(); return page.getByRole('dialog', { name: 'Аккаунт и прогресс' }); }
async function authenticate(page, name, mode = 'register', importGuest = false, pass = password) {
  const dialog = await account(page);
  await dialog.locator('.account-modes').getByRole('button', { name: mode === 'register' ? 'Создать аккаунт' : 'Войти', exact: true }).click();
  await dialog.getByLabel('Логин', { exact: true }).fill(name);
  await dialog.getByLabel('Пароль', { exact: true }).fill(pass);
  if (importGuest) await dialog.getByRole('checkbox').check();
  await dialog.locator('.account-form button[type="submit"]').click();
  await expect(dialog.locator('.signed-in')).toContainText(name, { timeout: 20000 });
  const recoveryCode = mode === 'register' ? await dialog.getByLabel('Код восстановления', { exact: true }).inputValue() : null;
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  return recoveryCode;
}
async function practice(page, course = 'Python') {
  await page.getByRole('group', { name: 'Выбрать направление', exact: true }).getByRole('button', { name: course, exact: true }).click();
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  return page.getByRole('textbox', { name: 'Твой ответ' });
}
async function saved(page) { await expect(page.locator('.account-sync-status')).toHaveText('Прогресс синхронизирован.', { timeout: 20000 }); }
async function synchronize(page) {
  const dialog = await account(page);
  await dialog.getByRole('button', { name: 'Синхронизировать сейчас' }).click();
  return dialog;
}

test('guest learning still works when the API is unavailable', async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  await page.goto('/#learn');
  await expect(page.locator('.account-sync-status')).toContainText('сервер синхронизации', { ignoreCase: true });
  const editor = await practice(page);
  await editor.fill('print("Guest")');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Твой ответ' })).toHaveValue('print("Guest")');
});

test('registration imports guest progress only by choice and a second device receives it', async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto('/#learn');
  const editor = await practice(page);
  await editor.fill('print("Guest lesson")');
  await page.getByRole('button', { name: 'Проверка', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await expect(page.locator('.assessment-status')).toContainText('Задание выполнено.', { timeout: 40000 });
  const name = username();
  await authenticate(page, name, 'register', true);
  await saved(page);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const second = await context.newPage();
    await second.goto('/#learn');
    await authenticate(second, name, 'login');
    const field = await practice(second);
    await expect(field).toHaveValue('print("Guest lesson")');
    await expect(second.locator('.lesson-sidebar progress')).toHaveAttribute('value', '1');
    const js = await practice(second, 'JavaScript');
    await js.fill('console.log("Other device");');
    await second.getByRole('button', { name: 'Проверка', exact: true }).click();
    await second.getByRole('button', { name: 'Проверить решение', exact: true }).click();
    await expect(second.locator('.assessment-status')).toContainText('Задание выполнено.');
    await saved(second);
    const dialog = await synchronize(page);
    await expect.poll(async () => (await (await page.request.get('/api/session')).json()).snapshot.progress.completed.length).toBe(2);
    await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
    await expect(await practice(page, 'JavaScript')).toHaveValue('console.log("Other device");');
    await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '1');
    await page.reload();
    await expect(page.locator('.account-bar')).toContainText(name);
  } finally { await context.close(); }
});

test('offline edits survive reload and conflicting drafts require an explicit choice', async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto('/#learn');
  const name = username(); await authenticate(page, name);
  let editor = await practice(page); await editor.fill('print("base")'); await saved(page);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const second = await context.newPage(); await second.goto('/#learn'); await authenticate(second, name, 'login');
    await page.route('**/api/progress', route => route.abort());
    await editor.fill('print("local edit")');
    await expect(page.locator('.account-sync-status')).toContainText('Не удалось связаться');
    const otherEditor = await practice(second); await otherEditor.fill('print("remote edit")'); await saved(second);
    await page.unroute('**/api/progress');
    await page.reload();
    await expect(page.locator('.account-sync-status')).toContainText('разные версии');
    editor = page.getByRole('textbox', { name: 'Твой ответ' });
    await expect(editor).toHaveValue('print("local edit")');
    const dialog = await account(page);
    await expect(dialog.locator('.conflict-form')).toContainText('print("local edit")');
    await expect(dialog.locator('.conflict-form')).toContainText('print("remote edit")');
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations).toEqual([]);
    await dialog.getByRole('radio', { name: 'На сервере', exact: true }).check();
    await dialog.getByRole('button', { name: 'Сохранить выбранные версии' }).click();
    await expect(dialog.locator('.conflict-form')).toHaveCount(0);
    await expect(dialog.locator('#account-sync-message')).toBeFocused();
    await expect(dialog.locator('#account-sync-message')).toHaveAttribute('role', 'status');
    await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
    await saved(page); await expect(editor).toHaveValue('print("remote edit")');
  } finally { await context.close(); }
});

test('typing during an upload remains in the editor and reaches the server', async ({ page }) => {
  await page.goto('/#learn'); await authenticate(page, username());
  const editor = await practice(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  await page.route('**/api/progress', async route => {
    if (route.request().method() === 'PUT' && !held) { held = true; await gate; }
    await route.continue();
  });
  await editor.fill('print("first")');
  await expect.poll(() => held).toBe(true);
  await editor.fill('print("later typing")');
  release();
  await saved(page);
  await expect(editor).toHaveValue('print("later typing")');
  await expect.poll(async () => (await (await page.request.get('/api/session')).json()).snapshot.progress.drafts['python-0']).toBe('print("later typing")');
});

test('logout restores the separate guest workspace and another account gets no private drafts', async ({ page }) => {
  await page.goto('/#learn');
  let editor = await practice(page); await editor.fill('print("guest draft")');
  await authenticate(page, username());
  editor = await practice(page); await expect(editor).toHaveValue('print("")');
  await editor.fill('print("private account draft")'); await saved(page);
  let dialog = await account(page); await dialog.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(dialog.locator('.account-form')).toBeVisible();
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Твой ответ' })).toHaveValue('print("guest draft")');
  const second = username(); await authenticate(page, second);
  await expect(await practice(page)).toHaveValue('print("")');
  const snapshot = await (await page.request.get('/api/session')).json();
  expect(snapshot.snapshot.progress.drafts).toEqual({});
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain(password);
  expect(storage).not.toContain('recoveryCode');
});

test('password recovery restores the same progress and invalid sign-in shows an accessible error', async ({ page }) => {
  await page.goto('/#learn'); const name = username(); const code = await authenticate(page, name);
  const editor = await practice(page); await editor.fill('print("saved before recovery")'); await saved(page);
  let dialog = await account(page); await dialog.getByRole('button', { name: 'Выйти', exact: true }).click();
  await dialog.locator('.account-modes').getByRole('button', { name: 'Войти', exact: true }).click();
  await dialog.getByLabel('Логин', { exact: true }).fill(name);
  await dialog.getByLabel('Пароль', { exact: true }).fill('wrong password');
  await dialog.locator('.account-form button[type="submit"]').click();
  await expect(dialog.getByRole('alert')).toContainText('Логин или пароль не подошёл');
  await expect(dialog.getByRole('alert')).toBeFocused();
  await dialog.locator('.account-modes').getByRole('button', { name: 'Восстановить доступ', exact: true }).click();
  await dialog.getByLabel('Код восстановления', { exact: true }).fill(code);
  await dialog.getByLabel('Новый пароль', { exact: true }).fill('New test recovery passphrase 2026');
  await dialog.locator('.account-form button[type="submit"]').click();
  await expect(dialog.locator('.signed-in')).toContainText(name);
  await expect(dialog.getByLabel('Код восстановления', { exact: true })).not.toHaveValue(code);
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(await practice(page)).toHaveValue('print("saved before recovery")');
});

for (const language of ['ru', 'en']) test(`account dialog supports keyboard, mobile large text and axe in ${language}`, async ({ page }, testInfo) => {
  await page.goto('/#learn');
  if (language === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByRole('button', { name: language === 'ru' ? 'Настройки' : 'Settings', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: language === 'ru' ? /Размер текста/ : /Text size/ }).selectOption('150');
  await dialog.getByRole('combobox', { name: language === 'ru' ? /Тема/ : /Theme/ }).selectOption('dark');
  await dialog.getByRole('checkbox', { name: language === 'ru' ? /Высокий контраст/ : /High contrast/ }).check();
  await dialog.getByRole('button', { name: language === 'ru' ? 'Готово' : 'Done', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  const trigger = page.getByRole('button', { name: language === 'ru' ? 'Аккаунт' : 'Account', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  dialog = page.getByRole('dialog');
  await dialog.locator('.account-modes').getByRole('button', { name: language === 'ru' ? 'Создать аккаунт' : 'Create account', exact: true }).click();
  await dialog.getByLabel(language === 'ru' ? 'Логин' : 'Username', { exact: true }).fill('ab');
  await dialog.locator('.account-form button[type="submit"]').click();
  await expect(dialog.getByRole('alert')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`account-${language}-mobile.png`) });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
