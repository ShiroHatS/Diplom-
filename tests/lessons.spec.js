import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const language of ['ru', 'en']) {
  test(`all three paths have complete first lessons in ${language}`, async ({ page }) => {
    await page.goto('/');
    if (language === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
    const labels = language === 'ru'
      ? { start: 'Начать урок', stages: ['Теория', 'Пример', 'Практика', 'Проверка'], answer: 'Твой ответ', next: 'Следующий урок' }
      : { start: 'Start a lesson', stages: ['Theory', 'Example', 'Practice', 'Check'], answer: 'Your answer', next: 'Next lesson' };
    for (const course of ['Python', 'JavaScript', 'HTML + CSS']) {
      await page.getByRole('link', { name: `${labels.start}: ${course}` }).click();
      await expect(page.locator('#learn-title')).toBeFocused();
      await expect(page.locator('.lesson-counter')).toContainText(course);
      await expect(page.locator('.term-definition')).toBeVisible();
      await page.getByRole('button', { name: labels.stages[1], exact: true }).click();
      await expect(page.locator('.lesson-code')).toBeVisible();
      await page.getByRole('button', { name: labels.stages[2], exact: true }).click();
      const answer = course === 'Python' ? 'print("Alex")' : course === 'JavaScript' ? 'console.log("Alex");' : '<h1>My page</h1>';
      await page.getByRole('textbox', { name: labels.answer }).fill(answer);
      await page.getByRole('button', { name: labels.stages[3], exact: true }).click();
      await expect(page.locator('.check-answer')).toContainText(answer);
      await page.locator('.solution-details summary').click();
      await expect(page.locator('.solution-details .lesson-code')).toBeVisible();
      await page.getByRole('button', { name: language === 'ru' ? 'Проверить решение' : 'Check solution', exact: true }).click();
      await expect(page.locator('.assessment-status')).toContainText(language === 'ru' ? 'Задание выполнено.' : 'Assignment complete.', { timeout: 40000 });
      await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '1');
      await page.getByRole('button', { name: labels.next }).click();
      await expect(page.locator('.lesson-counter')).toContainText('2');
    }
  });
}

test('draft, current lesson, completion and language switch survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  await page.getByRole('textbox', { name: 'Твой ответ' }).fill('print("Мой ответ")');
  await page.getByRole('button', { name: 'Проверка', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await expect(page.locator('.assessment-status')).toContainText('Задание выполнено.', { timeout: 40000 });
  await page.getByRole('button', { name: 'Следующий урок' }).click();
  await expect(page.locator('#lesson-title')).toContainText('Храним значение');
  await page.reload();
  await expect(page.locator('#lesson-title')).toContainText('Храним значение');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('#lesson-title')).toContainText('Store a value');
  await expect(page.locator('.lesson-sidebar progress')).toHaveAttribute('value', '1');
  await page.locator('.lesson-nav button').first().click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveValue('print("Мой ответ")');
  await page.getByRole('button', { name: 'Переключить на русский' }).click();
  await page.getByRole('button', { name: 'JavaScript', exact: true }).last().click();
  await page.getByRole('button', { name: 'Python', exact: true }).last().click();
  await expect(page.locator('#lesson-title')).toContainText('Первая строка кода');
});

test('lesson steps and examples pass axe in both themes and focus mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /Тема/ }).selectOption('dark');
  await dialog.getByRole('checkbox', { name: /Высокий контраст/ }).check();
  await dialog.getByRole('checkbox', { name: /Режим фокуса/ }).check();
  await dialog.getByRole('button', { name: 'Готово' }).click();
  for (const step of ['Теория', 'Пример', 'Практика', 'Проверка']) {
    await page.getByRole('button', { name: step, exact: true }).click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
  }
  await expect(page.locator('.lesson-card')).toBeVisible();
});

test('lessons reflow on mobile and with larger text', async ({ page }, testInfo) => {
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#learn');
    await page.getByRole('button', { name: 'Практика', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}px`).toBe(false);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: /Размер текста/ }).selectOption('150');
  await page.getByRole('dialog').getByRole('button', { name: 'Готово' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('lesson-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('broken or unavailable local storage does not block a lesson', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lumo.learning.v1', '{broken'));
  await page.goto('/#learn');
  await expect(page.locator('#lesson-title')).toContainText('Первая строка кода');
  await page.getByRole('button', { name: 'Практика', exact: true }).click();
  await page.getByRole('textbox', { name: 'Твой ответ' }).fill('print("Тест")');
  await expect(page.getByRole('textbox', { name: 'Твой ответ' })).toHaveValue('print("Тест")');
});
