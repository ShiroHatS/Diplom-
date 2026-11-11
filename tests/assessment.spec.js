import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lessonContent } from '../src/lessons.js';

async function selectLesson(page, course, index = 0, language = 'ru') {
  const picker = page.getByRole('group', { name: language === 'ru' ? 'Выбрать направление' : 'Choose a path', exact: true });
  await picker.getByRole('button', { name: course, exact: true }).click();
  await page.locator('.lesson-nav button').nth(index).click();
  await page.getByRole('button', { name: language === 'ru' ? 'Практика' : 'Practice', exact: true }).click();
  return page.getByRole('textbox', { name: language === 'ru' ? 'Твой ответ' : 'Your answer' });
}

async function check(page, language = 'ru') {
  await page.getByRole('button', { name: language === 'ru' ? 'Проверка' : 'Check', exact: true }).click();
  await page.getByRole('button', { name: language === 'ru' ? 'Проверить решение' : 'Check solution', exact: true }).click();
  await expect(page.locator('.assessment-status')).not.toHaveText(/^(Подготавливаем|Проверяем|Preparing|Checking)/, { timeout: 40000 });
}

for (const language of ['ru', 'en']) test(`all nine solutions and valid alternatives pass in ${language}`, async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/#learn');
  if (language === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
  for (const [course, id] of [['Python', 'python'], ['JavaScript', 'javascript'], ['HTML + CSS', 'web']]) {
    for (let index = 0; index < 3; index++) {
      const editor = await selectLesson(page, course, index, language);
      let code = lessonContent[language][id][index].solution;
      if (id === 'python' && index === 0) code = "# Another name and quotes\nprint('Самира')";
      if (id === 'javascript' && index === 1) code = "let name = 'Samira'\nconsole['log'](name)";
      if (id === 'web' && index === 1) code = '/* Equivalent colour */\np, h1 { color: rgb(40, 80, 200); }';
      if (id === 'web' && index === 2 && language === 'en') code = '@media (width <= 600px) { p { font-size: calc(1rem); } }';
      await editor.fill(code);
      await check(page, language);
      await expect(page.locator('.assessment-status'), `${course}, lesson ${index + 1}`).toHaveText(language === 'ru' ? 'Задание выполнено. Урок отмечен пройденным.' : 'Assignment complete. The lesson is marked completed.');
      await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', String(index + 1));
      await expect(page.locator('.runner-frame, .assessment-probe')).toHaveCount(0);
    }
  }
  await page.reload();
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '3');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lumo.learning.v1')));
  expect(saved.completed).toHaveLength(9);
});

for (const language of ['ru', 'en']) test(`blank output explains the result and links to immediate assignment feedback in ${language}`, async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/#learn');
  if (language === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
  const editor = await selectLesson(page, 'Python', 0, language);
  await editor.fill('print("")');
  await editor.press('Control+Enter');
  await expect(page.locator('.editor-status')).toContainText(language === 'ru' ? 'Выведены только пустые строки или пробелы.' : 'The output contains only blank lines or spaces.', { timeout: 40000 });
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: language === 'ru' ? 'Перейти к проверке' : 'Go to Check', exact: true }).click();
  await expect(page.locator('.check-answer')).toContainText('print("")');
  await page.getByRole('button', { name: language === 'ru' ? 'Проверить решение' : 'Check solution', exact: true }).click();
  await expect(page.locator('.assessment-status .assessment-explanation')).toContainText(language === 'ru' ? 'Впиши имя между кавычками' : 'Put a name between quotation marks', { timeout: 30000 });
  await expect(page.locator('.assessment-hints li')).toHaveCount(0);
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: language === 'ru' ? 'Исправить на практике' : 'Edit in Practice', exact: true }).click();
  await editor.fill('print("Alex")');
  await check(page, language);
  await expect(page.locator('.assessment-status')).toContainText(language === 'ru' ? 'Задание выполнено.' : 'Assignment complete.');
  await expect(page.locator('.assessment-explanation')).toHaveCount(0);
});

test('empty answers and all nine unmodified templates do not complete lessons', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/#learn');
  const editor = await selectLesson(page, 'Python');
  await editor.fill('');
  await check(page);
  await expect(page.locator('.assessment-results')).toContainText('В ответе есть код.');
  for (const [course, id] of [['Python', 'python'], ['JavaScript', 'javascript'], ['HTML + CSS', 'web']]) {
    for (let index = 0; index < 3; index++) {
      const field = await selectLesson(page, course, index);
      await field.fill(lessonContent.ru[id][index].starter);
      await check(page);
      await expect(page.locator('.assessment-status')).not.toContainText('Задание выполнено.');
      await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
    }
  }
});

test('variable tasks require using the variable, rather than printing the same literal', async ({ page }) => {
  await page.goto('/#learn');
  for (const [course, code] of [['Python', 'name = "Аня"\nprint("Аня")'], ['JavaScript', 'const name = "Аня"; console.log("Аня");']]) {
    const editor = await selectLesson(page, course, 1);
    await editor.fill(code);
    await check(page);
    await expect(page.locator('.assessment-results li').filter({ hasText: 'Команда вывода использует переменную name.' })).toContainText('Нужно дополнить.');
    await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
  }
});

test('condition tasks check the threshold and reject unconditional output', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/#learn');
  for (const [course, code, boundary] of [
    ['Python', 'points = 7\nif points > 5:\n    print("Ура!")', 'points = 5 и 6'],
    ['JavaScript', 'const age = 14; if (age > 14) { console.log("Можно начать"); }', 'age = 14 и 15'],
  ]) {
    const editor = await selectLesson(page, course, 2);
    await editor.fill(code);
    await check(page);
    await expect(page.locator('.assessment-results li').filter({ hasText: boundary })).toContainText('Нужно дополнить.');
    await page.getByRole('button', { name: 'Показать подсказку', exact: true }).click();
    await page.getByRole('button', { name: 'Следующая подсказка', exact: true }).click();
    await expect(page.locator('.assessment-hints ol li')).toHaveCount(2);
  }
  const editor = await selectLesson(page, 'Python', 2);
  await editor.fill('points = 7\n# if points >= 5:\nprint("Ура!")');
  await check(page);
  await expect(page.locator('.assessment-results li').filter({ hasText: 'При points = 4' })).toContainText('Нужно дополнить.');
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
});

test('HTML and CSS checks reject empty headings, wrong selectors and misleading media rules', async ({ page }) => {
  await page.goto('/#learn');
  for (const [index, code, criterion] of [
    [0, '<h1></h1><p>My page</p>', 'Заголовок h1 содержит текст'],
    [0, '<h2>A heading</h2>', 'На странице есть элемент h1.'],
    [0, '<div style="opacity:0"><h1>Hidden</h1></div>', 'Заголовок h1 содержит текст'],
    [1, 'h1 { color: #2850c8; }', 'Все проверяемые абзацы'],
    [1, 'p:first-of-type { color: red; }', 'Все проверяемые абзацы'],
    [2, '@media (max-width: 599px) { p { font-size: 1rem; } }', 'При ширине 360 и 600'],
    [2, 'p { font-size: 1rem; } @media(max-width:600px) { h1 {color:blue;} }', 'При ширине 601'],
    [2, '@media (max-width: 600px) { p { font-size: 16px; } }', 'Размер меняется вместе'],
  ]) {
    const editor = await selectLesson(page, 'HTML + CSS', index);
    await editor.fill(code);
    await check(page);
    await expect(page.locator('.assessment-results li').filter({ hasText: criterion })).toContainText('Нужно дополнить.');
    await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
  }
});

test('checking is cancellable and cannot complete a lesson after navigation', async ({ page }) => {
  await page.goto('/#learn');
  const editor = await selectLesson(page, 'JavaScript');
  await editor.fill('while (true) {}');
  await page.getByRole('button', { name: 'Проверка', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить проверку' }).click();
  await expect(page.locator('.assessment-status')).toContainText('Проверка остановлена.');
  await expect(page.locator('.runner-frame')).toHaveCount(0);
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await page.getByRole('button', { name: 'Исправить на практике' }).click();
  await expect(editor).toHaveValue('while (true) {}');
  await expect(page.locator('.runner-frame')).toHaveCount(0);
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
  await editor.fill('console.log("Аня");');
  await check(page);
  await expect(page.locator('.assessment-status')).toContainText('Задание выполнено.');
});

test('runtime failures and syntax errors do not become incorrect-answer judgements', async ({ page }) => {
  await page.goto('/#learn');
  let editor = await selectLesson(page, 'JavaScript');
  await editor.fill('console.log(;');
  await check(page);
  await expect(page.locator('.assessment-error')).toContainText('Проверь кавычки');
  await expect(page.locator('.assessment-error')).toContainText('Строка 1');
  await page.route('**/runtime/python/**', route => route.abort());
  editor = await selectLesson(page, 'Python');
  await editor.fill('print("Аня")');
  await check(page);
  await expect(page.locator('.assessment-status')).toContainText('Не удалось подготовить проверку.');
  await expect(page.locator('.assessment-error')).toHaveCount(0);
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '0');
});

test('results translate without rerunning and hints preserve keyboard focus; mobile passes axe', async ({ page }, testInfo) => {
  await page.goto('/#learn');
  const editor = await selectLesson(page, 'JavaScript', 2);
  await editor.fill('const age = 14; console.log("Можно начать");');
  await check(page);
  await page.getByRole('button', { name: 'Показать подсказку', exact: true }).focus();
  await page.keyboard.press('Enter');
  const nextHint = page.getByRole('button', { name: 'Следующая подсказка', exact: true });
  await expect(nextHint).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(nextHint).toBeFocused();
  await expect(nextHint).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.assessment-hints li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('.assessment-status')).toContainText('There is a little more to do.');
  await expect(page.locator('.assessment-results')).toContainText('age = 13 produces no message.');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.setViewportSize({ width: 320, height: 850 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: /Text size/ }).selectOption('150');
  await page.getByRole('dialog').getByRole('checkbox', { name: /High contrast/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
  // Снимок реального viewport: длинный компонент прокручивается обычным образом.
  await page.locator('.assignment-check').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('assessment-mobile.png') });
  await page.locator('.assessment-hints').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('assessment-hints-mobile.png') });
});
