import { useLayoutEffect, useState } from 'react';
import { content } from './content.js';
import { simpleContent } from './content.js';
import AccessibilityDialog from './AccessibilityDialog.jsx';
import { applyPreferences, defaultPreferences, loadPreferences, savePreferences } from './preferences.js';
import LessonWorkspace from './LessonWorkspace.jsx';
import { useLearningSync } from './account/useLearningSync.js';
import AccountDialog, { AccountBar } from './account/AccountDialog.jsx';
import { lessonContent } from './lessons.js';

// Хранилище может быть недоступно в приватном режиме. Это не мешает пользоваться сайтом.
function readPreference(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch { return fallback; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Настройка действует в текущей вкладке. */ }
}

function Icon({ name, className = '' }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    person: <><circle cx="12" cy="5" r="2" /><path d="M4 10h16m-8 0v5m0 0-5 7m5-7 5 7" /></>,
    up: <path d="M12 19V5m-6 6 6-6 6 6" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="var(--surface)" /><circle cx="16" cy="17" r="2" fill="var(--surface)" /></>,
  };
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.code}</svg>;
}

function CodePreview({ t }) {
  const [example, setExample] = useState('python');
  const samples = {
    python: <><span className="syntax-function">print</span>(<span className="syntax-string">"{t.hello}"</span>)</>,
    javascript: <>console.<span className="syntax-function">log</span>(<span className="syntax-string">"{t.hello}"</span>);</>,
    web: <><span className="syntax-function">&lt;h1&gt;</span>{t.hello}<span className="syntax-function">&lt;/h1&gt;</span></>,
  };
  return <div className="preview-scene">
    <div className="glass-orbit orbit-one" aria-hidden="true" />
    <div className="glass-orbit orbit-two" aria-hidden="true" />
    <section className="code-window" aria-labelledby="preview-title">
      <div className="window-bar"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>{t.example}</span><Icon name="code" /></div>
      <div className="window-body">
        <h2 id="preview-title">{t.preview}</h2>
        <div className="example-options" role="group" aria-label={t.exampleNav}>
          {['python', 'javascript', 'web'].map((key, index) => <button key={key} type="button" aria-pressed={example === key} onClick={() => setExample(key)}>{['Python', 'JavaScript', 'HTML'][index]}</button>)}
        </div>
        {/* Это читаемый пример, а не неработающий макет редактора. */}
        <div className="sample-content" aria-live="polite" aria-atomic="true">
          <pre className="code-sample"><code>{samples[example]}</code></pre>
          <div className="output"><span className="output-label"><Icon name="check" />{t.result}</span><p>{t.hello}</p></div>
        </div>
        <p className="preview-note">{t.previewNote}</p>
      </div>
    </section>
    <div className="scene-caption"><span aria-hidden="true">✳</span>{t.smallNote}</div>
  </div>;
}

export default function App() {
  const [language, setLanguage] = useState(() => readPreference('lumo.language', ['ru', 'en'], 'ru'));
  const [theme, setTheme] = useState(() => readPreference('lumo.theme', ['system', 'light', 'dark'], 'system'));
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sync = useLearningSync();
  const { learning, setLearning } = sync;
  const [accountOpen, setAccountOpen] = useState(false);
  const base = content[language];
  const simple = simpleContent[language];
  const t = preferences.simpleLanguage ? {
    ...base, ...simple,
    steps: base.steps.map(([title], index) => [title, simple.stepDescriptions[index]]),
    courseData: base.courseData.map((course, index) => ({ ...course, description: simple.courseDescriptions[index] })),
  } : base;

  function changePreference(key, value) {
    setPreferences(current => ({ ...current, [key]: value }));
  }

  function resetPreferences() {
    setPreferences({ ...defaultPreferences });
    setTheme('system');
  }

  function startCourse(id) {
    setLearning(current => ({ ...current, course: id, lesson: current.positions[id], step: 0 }));
    requestAnimationFrame(() => document.getElementById('learn-title')?.focus());
  }

  // Атрибут lang нужен для правильного произношения скринридером.
  useLayoutEffect(() => {
    document.documentElement.lang = language;
    document.title = t.title;
    document.querySelector('meta[name="description"]').content = t.description;
    savePreference('lumo.language', language);
  }, [language, t]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreference('lumo.theme', theme);
  }, [theme]);

  useLayoutEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <div className="page-aura" aria-hidden="true" />
    <header className="site-header container" id="top">
      <a href="#top" className="brand" aria-label={t.home}><span className="brand-icon"><Icon name="code" /></span>lumo<span className="brand-dot">.</span></a>
      <nav aria-label={t.nav}><a href="#paths">{t.courses}</a><a href="#learn">{t.lessonsNav}</a><a href="#how">{t.how}</a><a href="#accessibility">{t.access}</a></nav>
      <div className="header-settings">
        <button className="language-control" type="button" aria-label={`${language === 'ru' ? 'EN' : 'RU'} — ${t.language}`} lang={language === 'ru' ? 'en' : 'ru'} onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}><span aria-hidden="true">◎</span>{language === 'ru' ? 'EN' : 'RU'}</button>
        <div className="theme-control"><Icon name="sun" /><label className="sr-only" htmlFor="theme">{t.theme}</label><select id="theme" value={theme} onChange={event => setTheme(event.target.value)}><option value="system">{t.system}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option></select></div>
        <button className="settings-trigger" type="button" aria-label={t.settingsButton} aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><Icon name="settings" /><span aria-hidden="true">{t.settingsButton}</span></button>
      </div>
    </header>

    <AccessibilityDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} preferences={preferences} onChange={changePreference} onReset={resetPreferences} theme={theme} onThemeChange={setTheme} t={t} />
    <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} language={language} sync={sync} />

    <main id="main" tabIndex={-1}>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true" />{t.eyebrow}</p>
          <h1 id="hero-title">{t.heading.map((line, index) => <span key={index}>{line}</span>)}</h1>
          <p className="hero-intro">{t.intro}</p>
          <div className="hero-actions"><a className="button button-primary" href="#paths">{t.choose}<Icon name="arrow" /></a><a className="text-link" href="#how">{t.learn}<span aria-hidden="true">↗</span></a></div>
          <p className="hero-note"><Icon name="check" />{t.note}</p>
        </div>
        <CodePreview t={t} />
      </section>

      <section className="paths-section container" id="paths" aria-labelledby="paths-title">
        <div className="section-heading"><div><p className="section-label">{t.pathsLabel}</p><h2 id="paths-title">{t.pathsTitle}</h2></div><p>{t.pathsIntro}</p></div>
        <div className="course-grid">
          {t.courseData.map(course => <article className={`course-card course-${course.id}`} key={course.id}>
            <div className="course-card-top"><span className="course-icon" aria-hidden="true">{course.icon === 'python' ? 'Py' : course.icon === 'js' ? 'JS' : <Icon name="code" />}</span><span className="level">{t.beginner}</span></div>
            <h3>{course.name}</h3><p className="course-tag">{course.tag}</p><p className="course-description">{course.description}</p>
            {/* details даёт встроенные клавиатурное управление и объявление состояния. */}
            <details><summary>{t.syllabus}<span className="details-plus" aria-hidden="true">+</span></summary><ol>{lessonContent[language][course.id].map(lesson => <li key={lesson.title}>{lesson.title}</li>)}</ol></details>
            <a className="course-start" href="#learn" onClick={() => startCourse(course.id)} aria-label={`${t.startCourse}: ${course.name}`}>{t.startCourse}<Icon name="arrow" /></a>
          </article>)}
        </div>
      </section>

      <section className="how-section container" id="how" aria-labelledby="how-title">
        <p className="section-label">{t.howLabel}</p><h2 id="how-title">{t.howTitle}</h2><p className="section-intro">{t.howIntro}</p>
        <ol className="steps">{t.steps.map(([title, text], index) => <li key={index}><span className="step-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </section>

      <LessonWorkspace language={language} simpleLanguage={preferences.simpleLanguage} reduceMotion={preferences.reduceMotion} learning={learning} setLearning={setLearning} courseNames={Object.fromEntries(t.courseData.map(course => [course.id, course.name]))} accountBar={<AccountBar language={language} sync={sync} onOpen={() => setAccountOpen(true)} />} />

      <section className="access-section container" id="accessibility" aria-labelledby="access-title">
        <div className="access-illustration" aria-hidden="true"><div className="access-orb"><Icon name="person" /></div><span className="keycap">Tab ↹</span><span className="typecap">Aa</span></div>
        <div className="access-copy"><p className="section-label">{t.accessLabel}</p><h2 id="access-title">{t.accessTitle}</h2><p>{t.accessIntro}</p><ul>{t.accessItems.map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul><p className="access-next">{t.accessNext}</p><p className="keyboard-tip">{t.keyboard} <kbd>Tab</kbd>{language === 'en' ? ' key.' : '.'}</p></div>
      </section>
    </main>
    <footer className="site-footer container"><div><a className="brand" href="#top" aria-label={t.home}>lumo<span className="brand-dot">.</span></a><p>{t.footer}</p></div><p className="stage-label">{t.stage}</p><a className="top-link" href="#top">{t.top}<Icon name="up" /></a></footer>
  </>;
}
