// Одинаковые правила в браузере и API: сервер принимает только известные уроки.
export const courses = ['python', 'javascript', 'web'];
export const lessonKeys = courses.flatMap(course => [0, 1, 2].map(index => `${course}-${index}`));
export const emptyProgress = () => ({ course: 'python', lesson: 0, step: 0, positions: { python: 0, javascript: 0, web: 0 }, completed: [], drafts: {} });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const lessonIndex = value => Number.isInteger(value) && value >= 0 && value < 3;

export function normalizeProgress(value) {
  const fallback = emptyProgress();
  if (!object(value)) return fallback;
  return {
    course: courses.includes(value.course) ? value.course : 'python',
    lesson: lessonIndex(value.lesson) ? value.lesson : 0,
    step: Number.isInteger(value.step) && value.step >= 0 && value.step < 4 ? value.step : 0,
    positions: Object.fromEntries(courses.map(course => [course, lessonIndex(value.positions?.[course]) ? value.positions[course] : 0])),
    completed: lessonKeys.filter(key => Array.isArray(value.completed) && value.completed.includes(key)),
    drafts: Object.fromEntries(lessonKeys.filter(key => typeof value.drafts?.[key] === 'string').map(key => [key, value.drafts[key].slice(0, 2000)])),
  };
}

export function validProgress(value) {
  return object(value) && Object.keys(value).length === 6
    && ['course', 'lesson', 'step', 'positions', 'completed', 'drafts'].every(key => Object.hasOwn(value, key))
    && courses.includes(value.course) && lessonIndex(value.lesson)
    && Number.isInteger(value.step) && value.step >= 0 && value.step < 4
    && object(value.positions) && Object.keys(value.positions).length === 3 && courses.every(course => lessonIndex(value.positions[course]))
    && Array.isArray(value.completed) && value.completed.length <= 9 && value.completed.every(key => lessonKeys.includes(key))
    && object(value.drafts) && Object.entries(value.drafts).every(([key, text]) => lessonKeys.includes(key) && typeof text === 'string' && text.length <= 2000);
}

export const equalProgress = (a, b) => JSON.stringify(normalizeProgress(a)) === JSON.stringify(normalizeProgress(b));
export const sameSyncContent = (a, b) => {
  const first = normalizeProgress(a), second = normalizeProgress(b);
  return JSON.stringify([first.completed, first.drafts]) === JSON.stringify([second.completed, second.drafts]);
};

// Трёхстороннее объединение: сравниваем обе версии с последней общей копией.
// Разные изменения одного черновика всегда требуют выбора пользователя.
export function mergeProgress(baseValue, localValue, remoteValue) {
  const base = normalizeProgress(baseValue), local = normalizeProgress(localValue), remote = normalizeProgress(remoteValue);
  const merged = normalizeProgress(local);
  const conflicts = [];
  merged.completed = lessonKeys.filter(key => local.completed.includes(key) || remote.completed.includes(key));
  for (const key of lessonKeys) {
    const before = base.drafts[key], here = local.drafts[key], there = remote.drafts[key];
    let chosen = here;
    if (here === before) chosen = there;
    else if (there !== before && here !== there) conflicts.push({ key, local: here ?? '', remote: there ?? '' });
    if (chosen === undefined) delete merged.drafts[key];
    else merged.drafts[key] = chosen;
  }
  // Фоновое обновление не переключает урок под курсором. Новое устройство начинает
  // с серверной копии; текущая навигация уже открытого устройства остаётся локальной.
  return { progress: merged, conflicts };
}
