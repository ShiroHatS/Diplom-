import { emptyProgress, normalizeProgress } from '../shared/progress.js';

export function loadLearningState() {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem('lumo.learning.v1') || '{}'));
  } catch { return emptyProgress(); }
}

export function saveLearningState(state) {
  try { localStorage.setItem('lumo.learning.v1', JSON.stringify(state)); }
  catch { /* Работа продолжается в текущей вкладке. */ }
}

export function readAccountCache(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(`lumo.account.${userId}`) || 'null');
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) return null;
    return { learning: normalizeProgress(value.learning), base: normalizeProgress(value.base), revision: value.revision };
  } catch { return null; }
}

export function saveAccountCache(userId, value) {
  try { localStorage.setItem(`lumo.account.${userId}`, JSON.stringify({ learning: value.learning, base: value.base, revision: value.revision })); }
  catch { /* При недоступном хранилище синхронизация продолжает работать в памяти. */ }
}
