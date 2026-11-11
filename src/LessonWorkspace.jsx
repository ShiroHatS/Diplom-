import { lessonContent, courseIds } from './lessons.js';
import CodeEditor from './CodeEditor.jsx';
import AssignmentCheck from './AssignmentCheck.jsx';
import { curriculum } from '../shared/curriculum.js';

const ui = {
  ru: {
    eyebrow: 'НАЧНИ УЧИТЬСЯ', title: 'Первый урок — уже здесь', intro: 'Выбери направление и проходи короткие уроки в своём темпе.',
    choose: 'Выбрать направление', lessonList: 'Список уроков', lessonNumber: 'Урок', completed: 'Пройден', current: 'Текущий',
    progress: 'Пройдено уроков', of: 'из', stages: ['Теория', 'Пример', 'Практика', 'Проверка'], stageNav: 'Шаги урока',
    goal: 'Цель', newTerm: 'Новое слово', exampleLabel: 'Код', exampleHelp: 'На шаге «Практика» можно изменить и запустить свой код.',
    checkTitle: 'Проверь своё решение', yourAnswer: 'Ты написал', emptyAnswer: 'Ответ пока пустой. Можно вернуться к практике.',
    showSolution: 'Показать пример ответа', solutionNote: 'Твой вариант может отличаться от примера. Проверка принимает разные решения, которые выполняют цель задания.',
    previous: 'Назад', next: 'Дальше', nextLesson: 'Следующий урок', backCatalog: 'К направлениям',
    saved: 'Прогресс и черновик сохраняются в этом браузере без регистрации.', completeNotice: 'Урок отмечен пройденным. Выбери следующий урок.',
  },
  en: {
    eyebrow: 'START LEARNING', title: 'Your first lesson is here', intro: 'Choose a path and take short lessons at your own pace.',
    choose: 'Choose a path', lessonList: 'Lesson list', lessonNumber: 'Lesson', completed: 'Completed', current: 'Current',
    progress: 'Lessons completed', of: 'of', stages: ['Theory', 'Example', 'Practice', 'Check'], stageNav: 'Lesson steps',
    goal: 'Goal', newTerm: 'New term', exampleLabel: 'Code', exampleHelp: 'On the Practice step, you can edit and run your own code.',
    checkTitle: 'Check your solution', yourAnswer: 'You wrote', emptyAnswer: 'Your answer is empty. You can return to practice.',
    showSolution: 'Show a sample answer', solutionNote: 'Your answer may differ from this example. The check accepts different solutions that meet the assignment goal.',
    previous: 'Back', next: 'Continue', nextLesson: 'Next lesson', backCatalog: 'Back to paths',
    saved: 'Progress and drafts are saved in this browser without an account.', completeNotice: 'Lesson marked completed. Choose the next lesson.',
  },
};

function focusAfterUpdate(id) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export default function LessonWorkspace({ language, simpleLanguage, learning, setLearning, courseNames, reduceMotion, accountBar }) {
  const t = ui[language];
  const course = learning.course;
  const lessons = lessonContent[language][course];
  const lesson = lessons[learning.lesson];
  const key = `${course}-${learning.lesson}`;
  const completedCount = learning.completed.filter(id => id.startsWith(`${course}-`)).length;
  const isComplete = learning.completed.includes(key);
  const draft = learning.drafts[key] ?? lesson.starter;
  const hasDraft = typeof learning.drafts[key] === 'string' && learning.drafts[key].trim().length > 0;

  function selectCourse(id) {
    setLearning(current => ({ ...current, course: id, lesson: current.positions[id], step: 0 }));
    focusAfterUpdate('lesson-title');
  }

  function selectLesson(index) {
    setLearning(current => ({ ...current, lesson: index, step: 0, positions: { ...current.positions, [course]: index } }));
    focusAfterUpdate('lesson-title');
  }

  function selectStep(index) {
    setLearning(current => ({ ...current, step: index }));
    focusAfterUpdate('lesson-step-title');
  }

  function saveDraft(value) {
    setLearning(current => ({ ...current, drafts: { ...current.drafts, [key]: value } }));
  }

  function recordPassed() {
    setLearning(current => current.completed.includes(key) ? current : ({ ...current, completed: [...current.completed, key] }));
  }

  const step = learning.step;
  return <section className="learn-section container" id="learn" aria-labelledby="learn-title">
    <div className="learn-heading"><p className="section-label">{t.eyebrow}</p><h2 id="learn-title" tabIndex={-1}>{t.title}</h2><p>{t.intro}</p></div>
    {accountBar}
    <div className="learning-shell">
      <div className="course-picker" role="group" aria-label={t.choose}>
        {courseIds.map(id => <button type="button" key={id} aria-pressed={course === id} onClick={() => selectCourse(id)}>{courseNames[id]}</button>)}
      </div>
      <div className="learning-layout">
        <aside className="lesson-sidebar">
          <div className="progress-copy"><strong>{t.progress}</strong><span>{completedCount} {t.of} {lessons.length}</span></div>
          <progress value={completedCount} max={lessons.length} aria-label={`${t.progress}: ${completedCount} ${t.of} ${lessons.length}`} />
          <nav className="lesson-nav" aria-label={t.lessonList}><ol>{lessons.map((item, index) => {
            const done = learning.completed.includes(`${course}-${index}`);
            return <li key={index}><button type="button" aria-current={learning.lesson === index ? 'true' : undefined} onClick={() => selectLesson(index)}><span className="lesson-index">{String(index + 1).padStart(2, '0')}</span><span className="lesson-nav-label"><strong>{item.title}</strong><small>{done ? t.completed : learning.lesson === index ? t.current : `${t.lessonNumber} ${index + 1}`}</small></span>{done && <span className="lesson-check" aria-hidden="true">✓</span>}</button></li>;
          })}</ol></nav>
          <p className="progress-note">{t.saved}</p>
        </aside>
        <article className="lesson-card" aria-labelledby="lesson-title">
          <div className="lesson-card-head"><p className="lesson-counter">{courseNames[course]} · {t.lessonNumber} {learning.lesson + 1} {t.of} {lessons.length}</p><h3 id="lesson-title" tabIndex={-1}>{lesson.title}</h3><p><strong>{t.goal}:</strong> {lesson.goal}</p></div>
          <nav className="lesson-steps" aria-label={t.stageNav}><ol>{t.stages.map((name, index) => <li key={name}><button type="button" aria-current={step === index ? 'step' : undefined} onClick={() => selectStep(index)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{name}</button></li>)}</ol></nav>
          <div className="lesson-stage" key={`${key}-${step}`}>
            <h4 id="lesson-step-title" tabIndex={-1}>{t.stages[step]}</h4>
            {step === 0 && <div className="lesson-reading">
              {(simpleLanguage ? [lesson.shortTheory || lesson.theory[0]] : lesson.theory).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              <dl className="term-definition"><dt>{t.newTerm}: <strong>{lesson.term}</strong></dt><dd>{lesson.definition}</dd></dl>
            </div>}
            {step === 1 && <div className="lesson-reading"><p>{t.exampleLabel}</p><pre className="lesson-code"><code>{lesson.example}</code></pre><p>{lesson.explanation}</p><p className="lesson-help">{t.exampleHelp}</p></div>}
            {step === 2 && <div className="lesson-reading"><p>{lesson.task}</p><CodeEditor value={draft} onChange={saveDraft} mode={curriculum[course][learning.lesson].mode} previewKind={curriculum[course][learning.lesson].kind} language={language} reduceMotion={reduceMotion} onCheck={() => { saveDraft(draft); selectStep(3); }} /></div>}
            {step === 3 && <div className="lesson-reading"><p>{t.checkTitle}</p><p>{lesson.task}</p><div className="check-answer"><strong>{t.yourAnswer}</strong><pre><code>{hasDraft ? draft : t.emptyAnswer}</code></pre></div><AssignmentCheck course={course} index={learning.lesson} code={hasDraft ? draft : ''} language={language} lessonHint={lesson.hint} lessonStrategy={lesson.strategy} onPassed={recordPassed} onEdit={() => selectStep(2)} /><details className="solution-details"><summary>{t.showSolution}<span aria-hidden="true">+</span></summary><pre className="lesson-code"><code>{lesson.solution}</code></pre><p>{t.solutionNote}</p></details></div>}
          </div>
          <div className="lesson-actions">
            {step > 0 && <button type="button" className="lesson-back" onClick={() => selectStep(step - 1)}>{t.previous}</button>}
            {step < 3 && <button type="button" className="lesson-forward" onClick={() => selectStep(step + 1)}>{t.next} <span aria-hidden="true">→</span></button>}
            {step === 3 && isComplete && learning.lesson < lessons.length - 1 && <button type="button" className="lesson-forward" onClick={() => selectLesson(learning.lesson + 1)}>{t.nextLesson} <span aria-hidden="true">→</span></button>}
            {step === 3 && isComplete && learning.lesson === lessons.length - 1 && <a className="lesson-forward" href="#paths">{t.backCatalog}</a>}
          </div>
          {isComplete && <p className="completion-message" id="completion-message" tabIndex={-1}>✓ {t.completeNotice}</p>}
        </article>
      </div>
    </div>
  </section>;
}
