import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function practice(page, course = 'Python') {
  await page.goto('/#learn');
  await page.getByRole('group', { name: 'Выбрать направление', exact: true }).getByRole('button', { name: course, exact: true }).click();
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  return page.getByRole('textbox', { name: 'Твой ответ' });
}

test('real Python runs, reports line errors and restarts cleanly', async ({ page }) => {
  test.setTimeout(60000);
  const editor = await practice(page);
  await editor.fill('name = "Аня"\nprint(name)\nprint(2 + 3)');
  await page.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(page.locator('.editor-status')).toHaveText('Программа завершена.', { timeout: 40000 });
  await expect(page.locator('.editor-result pre')).toHaveText('Аня\n5\n');
  await editor.fill('if True\n    print("hi")');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-error')).toContainText('Проверь кавычки', { timeout: 20000 });
  await page.getByRole('button', { name: 'Перейти к строке 1' }).click();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  await editor.fill('print("Повторный запуск")');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-result pre')).toHaveText('Повторный запуск\n', { timeout: 20000 });
});

test('JavaScript runs and errors remain readable without colour', async ({ page }) => {
  const editor = await practice(page, 'JavaScript');
  await editor.fill('const points = 7;\nconsole.log(points + 1);');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-result pre')).toHaveText('8\n');
  await editor.fill('console.log(missingName);');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-error')).toContainText('Проверь имя переменной');
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
  await editor.fill('const broken = ;');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-error')).toContainText('Проверь кавычки');
  await page.getByRole('button', { name: 'Перейти к строке 1' }).click();
  await expect(editor).toBeFocused();
});

test('worker cannot access page storage or send network requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().startsWith('https://example.com')) requests.push(request.url()); });
  const editor = await practice(page, 'JavaScript');
  await editor.fill('console.log(typeof document, typeof localStorage);\ntry { indexedDB.open("escape"); } catch(e) { console.log(e.name); }\nawait fetch("https://example.com/escape").catch(() => console.log("network blocked"));');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toHaveText('Программа завершена.');
  await expect(page.locator('.editor-result pre')).toContainText('undefined undefined');
  await expect(page.locator('.editor-result pre')).toContainText('SecurityError');
  await expect(page.locator('.editor-result pre')).toContainText('network blocked');
  expect(requests).toEqual([]);
});

test('infinite loop can be stopped and rerun; automatic guard keeps UI usable', async ({ page }) => {
  const editor = await practice(page, 'JavaScript');
  await editor.fill('while (true) {}');
  await editor.press('Control+Enter');
  await page.getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect(page.locator('.editor-status')).toHaveText('Выполнение остановлено. Код сохранён.');
  await editor.fill('console.log("ok");');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-result pre')).toHaveText('ok\n');
  await editor.fill('while (true) {}');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toContainText('Проверь, заканчивается ли цикл.', { timeout: 10000 });
});

test('HTML and CSS previews work without scripts or external requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().startsWith('https://example.com')) requests.push(request.url()); });
  const editor = await practice(page, 'HTML + CSS');
  await editor.fill('<h1>Моя страница</h1><script>parent.document.body.innerHTML="bad"</script><img src="https://example.com/image"><a href="https://example.com/escape">go</a>');
  await page.getByRole('button', { name: 'Обновить предпросмотр' }).click();
  const preview = page.frameLocator('iframe[title="Предпросмотр HTML и CSS"]');
  await expect(preview.getByRole('heading', { name: 'Моя страница' })).toBeVisible();
  await expect(preview.locator('script, img, a')).toHaveCount(0);
  await expect(page.locator('#lesson-title')).toBeVisible();
  await page.locator('.lesson-nav button').nth(1).click();
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  await editor.fill('p { color: #2850c8; }');
  await page.getByRole('button', { name: 'Обновить предпросмотр' }).click();
  await expect(preview.locator('p')).toHaveCSS('color', 'rgb(40, 80, 200)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await editor.fill('p { animation: spin 2s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }');
  await page.getByRole('button', { name: 'Обновить предпросмотр' }).click();
  await expect(preview.locator('p')).toHaveCSS('animation-name', 'spin');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(preview.locator('p')).toHaveCSS('animation-name', 'none');
  await editor.fill('</style><h1 id="escaped-injection">Injected</h1><style>p { color: red; }');
  await page.getByRole('button', { name: 'Обновить предпросмотр' }).click();
  await expect(preview.locator('#escaped-injection')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('keyboard can leave the editor and edited drafts persist', async ({ page }) => {
  const editor = await practice(page, 'JavaScript');
  await editor.fill('console.log("keyboard");');
  await editor.press('Tab');
  await expect(page.getByRole('button', { name: 'Запустить', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-result pre')).toHaveText('keyboard\n');
  await page.reload();
  await expect(editor).toHaveValue('console.log("keyboard");');
});

test('output is capped and leaving practice removes the active runner', async ({ page }) => {
  const editor = await practice(page, 'JavaScript');
  await editor.fill('for (let i = 0; i < 1000; i++) console.log(i);');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toHaveText('Программа завершена.');
  await expect(page.locator('.editor-result')).toContainText('Показаны первые 100 сообщений');
  expect((await page.locator('.editor-result pre').textContent()).trim().split('\n')).toHaveLength(100);
  await editor.fill('while (true) {}');
  await editor.press('Control+Enter');
  await page.getByRole('button', { name: 'Теория', exact: true }).click();
  await expect(page.locator('.runner-frame')).toHaveCount(0);
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  await expect(editor).toHaveValue('while (true) {}');
});

test('Python has no host JS bridge and can be stopped', async ({ page }) => {
  const editor = await practice(page);
  await editor.fill('import js\nprint(hasattr(js, "fetch"))\nprint(hasattr(js, "localStorage"))');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-result pre')).toHaveText('False\nFalse\n', { timeout: 20000 });
  await editor.fill('while True:\n    pass');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toContainText('Программа выполняется', { timeout: 20000 });
  await page.getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect(page.locator('.editor-status')).toContainText('Выполнение остановлено.');
});

test('runtime loading failure is not reported as a code mistake', async ({ page }) => {
  await page.route('**/runtime/python/**', route => route.abort());
  const editor = await practice(page);
  await editor.fill('print(1)');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toContainText('Не удалось подготовить среду');
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
});

test('English editor works in dark theme and at mobile width', async ({ page }, testInfo) => {
  await practice(page, 'JavaScript');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.setViewportSize({ width: 375, height: 850 });
  const editor = page.getByRole('textbox', { name: 'Your answer' });
  await editor.fill('console.log("Hello, world!");');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toHaveText('Program finished.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.locator('.code-editor').screenshot({ path: testInfo.outputPath('editor-mobile.png') });
});
