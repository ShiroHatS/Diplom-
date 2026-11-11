// Порядок первых трёх уроков сохранён: старые черновики и достижения
// остаются привязаны к тем же ключам python-0, javascript-1 и так далее.
export const curriculum = {
  python: ['output', 'variable', 'condition', 'arithmetic', 'loop', 'function'].map(kind => ({ kind, mode: 'python' })),
  javascript: ['output', 'variable', 'condition', 'arithmetic', 'loop', 'function'].map(kind => ({ kind, mode: 'javascript' })),
  web: [
    { kind: 'heading', mode: 'html' }, { kind: 'colour', mode: 'css' },
    { kind: 'media', mode: 'css' }, { kind: 'structure', mode: 'html' },
    { kind: 'spacing', mode: 'css' }, { kind: 'flex', mode: 'css' },
  ],
};
export const courses = Object.keys(curriculum);
export const lessonKeys = courses.flatMap(course => curriculum[course].map((_, index) => `${course}-${index}`));
