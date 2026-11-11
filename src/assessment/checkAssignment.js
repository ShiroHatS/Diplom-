import { parse } from 'acorn';
import { executeCode } from '../runtime/execute.js';
import { checkWeb } from './checkWeb.js';

function nodes(root) {
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') result.push(node);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(root);
  return result;
}

const references = (node, name) => nodes(node).some(child => child.type === 'Identifier' && child.name === name);
const isLog = node => node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
  && node.callee.object.name === 'console'
  && (node.callee.computed ? node.callee.property.value === 'log' : node.callee.property.name === 'log');

// Каждый пробный запуск использует ту же изоляцию и кнопку отмены, что и редактор.
function runCode(course, code, signal, onProgress, options = {}) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    let stop = () => {};
    const output = [];
    let hasText = false;
    const abort = () => { stop(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    stop = executeCode(course, code, event => {
      if (event.type === 'output') { output.push(event.text); hasText ||= event.hasText; return; }
      if (event.type === 'running') { onProgress({ type: 'running' }); return; }
      signal.removeEventListener('abort', abort);
      if (event.type === 'done') resolve({ ...event, output, hasText });
      else reject(event);
    }, options);
  });
}

async function checkJavaScript(code, index, signal, onProgress) {
  let tree;
  try { tree = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }); }
  catch (error) { throw { type: 'error', name: 'SyntaxError', message: error.message, line: error.loc?.line }; }
  const all = nodes(tree);
  const calls = all.filter(isLog);
  function assignment(name) {
    for (const statement of tree.body) {
      if (statement.type === 'VariableDeclaration') {
        const declaration = statement.declarations.find(node => node.id.type === 'Identifier' && node.id.name === name && node.init);
        if (declaration) return declaration.init;
      }
      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
        && statement.expression.operator === '=' && statement.expression.left.type === 'Identifier' && statement.expression.left.name === name) return statement.expression.right;
    }
    return null;
  }
  const initial = await runCode('javascript', code, signal, onProgress, { inspect: index === 1 ? 'name' : index === 2 ? 'age' : undefined });
  const checks = [];
  const add = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  if (index === 0) add('textOutput', calls.length && initial.hasText && initial.output.join('').trim() && !initial.truncated);
  else if (index === 1) {
    const name = initial.inspected;
    add('nameStored', assignment('name') && typeof name === 'string' && name.trim());
    add('nameUsed', calls.some(call => call.arguments.some(arg => references(arg, 'name'))));
    add('nameOutput', typeof name === 'string' && name.trim() && initial.output.some(text => text.trim() === name.trim()) && !initial.truncated);
  } else {
    const initializer = assignment('age');
    add('ageSet', initializer && initial.inspected === 14);
    add('ageIf', all.some(node => node.type === 'IfStatement' && references(node.test, 'age') && nodes(node.consequent).some(isLog)));
    const accepted = ['Можно начать', 'Ready to begin'];
    add('initialMessage', accepted.includes(initial.output.join('\n').trim()) && !initial.truncated);
    const outcomes = new Map();
    if (initializer) for (const age of [13, 14, 15]) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const variant = code.slice(0, initializer.start) + age + code.slice(initializer.end);
      const trial = await runCode('javascript', variant, signal, onProgress);
      outcomes.set(age, trial.truncated ? null : trial.output.join('\n').trim());
    }
    add('ageBelow', outcomes.get(13) === '');
    add('ageBoundary', accepted.includes(outcomes.get(14)) && accepted.includes(outcomes.get(15)));
  }
  return checks;
}

export function checkAssignment({ course, index, code }, onEvent) {
  const controller = new AbortController();
  const { signal } = controller;
  (async () => {
    try {
      onEvent({ type: course === 'python' ? 'loading' : 'running' });
      let checks;
      if (!code.trim()) checks = [{ id: 'answer', passed: false }];
      else if (course === 'python') {
        const result = await runCode(course, code, signal, onEvent, { assessment: index });
        if (!result.assessment?.length) throw { type: 'load-error' };
        checks = result.assessment;
      } else if (course === 'javascript') checks = await checkJavaScript(code, index, signal, onEvent);
      else checks = await checkWeb(code, index, signal);
      if (!signal.aborted) onEvent({ type: 'result', checks, passed: checks.length > 0 && checks.every(check => check.passed) });
    } catch (error) {
      if (!signal.aborted) onEvent(error?.type ? error : { type: 'load-error' });
    }
  })();
  return () => controller.abort();
}
