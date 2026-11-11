// Версия схемы позволяет безопасно игнорировать устаревшие или повреждённые данные.
export const defaultPreferences = Object.freeze({
  fontSize: '100',
  lineSpacing: 'default',
  contrast: false,
  dyslexicFont: false,
  reduceMotion: false,
  simpleLanguage: false,
  focusMode: false,
});

export function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem('lumo.accessibility.v1') || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...defaultPreferences };
    return Object.fromEntries(Object.entries(defaultPreferences).map(([key, fallback]) => {
      const value = stored[key];
      const valid = key === 'fontSize'
        ? ['100', '112', '125', '150'].includes(value)
        : key === 'lineSpacing'
          ? ['default', 'relaxed', 'spacious'].includes(value)
          : typeof value === 'boolean';
      return [key, valid ? value : fallback];
    }));
  } catch { return { ...defaultPreferences }; }
}

export function savePreferences(preferences) {
  try { localStorage.setItem('lumo.accessibility.v1', JSON.stringify(preferences)); }
  catch { /* Настройки остаются активными в текущей вкладке. */ }
}

export function applyPreferences(preferences) {
  const root = document.documentElement;
  root.dataset.fontSize = preferences.fontSize;
  root.dataset.lineSpacing = preferences.lineSpacing;
  root.dataset.contrast = preferences.contrast ? 'on' : 'off';
  root.dataset.dyslexic = preferences.dyslexicFont ? 'on' : 'off';
  root.dataset.motion = preferences.reduceMotion ? 'off' : 'system';
  root.dataset.focus = preferences.focusMode ? 'on' : 'off';
}
