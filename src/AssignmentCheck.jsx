import { useEffect, useRef, useState } from 'react';
import { checkAssignment } from './assessment/checkAssignment.js';
import { assessmentText } from './assessment/assessmentText.js';
import { editorText } from './editorText.js';

export default function AssignmentCheck({ course, index, code, language, lessonHint, lessonStrategy, onPassed, onEdit }) {
  const t = assessmentText[language];
  const cancel = useRef(null);
  const [status, setStatus] = useState('ready');
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState(null);
  const [hintCount, setHintCount] = useState(0);
  const busy = status === 'loading' || status === 'running';
  const missing = checks.find(check => !check.passed)?.id;
  const hints = [lessonHint, t.fallbackHint, lessonStrategy || t.strategies[course][index]];

  // Уход на практику или в другой урок останавливает проверку, а не оставляет её в фоне.
  useEffect(() => () => cancel.current?.(), []);

  function check() {
    cancel.current?.();
    setChecks([]);
    setError(null);
    cancel.current = checkAssignment({ course, index, code }, event => {
      if (event.type === 'result') {
        setChecks(event.checks);
        setStatus(event.passed ? 'passed' : 'failed');
        if (event.passed) onPassed();
      } else if (event.type === 'error') { setError(event); setStatus('error'); }
      else setStatus(event.type);
    });
  }

  return <section className="assignment-check" aria-labelledby="assignment-check-title">
    <h5 id="assignment-check-title">{t.title}</h5>
    <p className="lesson-help">{t.intro}</p>
    <div className="assessment-actions">
      {/* aria-disabled оставляет нажатую кнопку в порядке фокуса во время проверки. */}
      <button type="button" className="assessment-run" aria-disabled={busy} onClick={() => { if (!busy) check(); }}>{t.check}</button>
      <button type="button" aria-disabled={!busy} onClick={() => { if (busy) { cancel.current?.(); setStatus('stopped'); } }}>{t.stop}</button>
      <button type="button" onClick={onEdit}>{t.edit}</button>
    </div>
    {/* Причина непринятого ответа видна сразу и объявляется вместе с результатом. */}
    <div className="assessment-status" role="status" aria-atomic="true"><p>{t[status]}</p>
      {status === 'failed' && missing && <p className="assessment-explanation">{t.hints[missing] || t.fallbackHint}</p>}
    </div>
    {checks.length > 0 && <div className="assessment-results"><h6>{t.results}</h6><ul>{checks.map(item => <li key={item.id}>
      <span className="criterion-mark" aria-hidden="true">{item.passed ? '✓' : '○'}</span>
      <span><strong>{item.passed ? t.yes : t.no}.</strong> {t.criteria[item.id]}</span>
    </li>)}</ul></div>}
    {error && <div className="assessment-error"><p>{editorText[language].hints[error.name] || editorText[language].hints.Error}</p>
      {Number.isInteger(error.line) && error.line > 0 && <p>{t.line} {error.line}</p>}
      <details><summary>{t.details}</summary><pre>{error.message}</pre></details>
    </div>}
    <div className="assessment-hints">
      <button type="button" aria-disabled={hintCount >= hints.length} onClick={() => { if (hintCount < hints.length) setHintCount(count => count + 1); }}>{hintCount ? t.nextHint : t.hint}</button>
      {hintCount >= hints.length && <p className="lesson-help">{t.hintsEnd}</p>}
      <ol aria-live="polite" aria-relevant="additions">{hints.slice(0, hintCount).map((hint, index) => <li key={index}>{hint}</li>)}</ol>
    </div>
  </section>;
}
