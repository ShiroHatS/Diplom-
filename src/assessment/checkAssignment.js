import { parse } from 'acorn';
import { executeCode } from '../runtime/execute.js';
import { checkWeb } from './checkWeb.js';
import { curriculum } from '../../shared/curriculum.js';

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
  } else if (index === 2) {
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
  } else if (index === 3) {
    const price = assignment('price'), count = assignment('count'), total = assignment('total');
    add('costValues', price?.type === 'Literal' && price.value === 12 && count?.type === 'Literal' && count.value === 3);
    add('costExpression', total && references(total, 'price') && references(total, 'count') && nodes(total).some(node => node.type === 'BinaryExpression' && node.operator === '*'));
    add('costOutput', calls.some(call => call.arguments.some(arg => references(arg, 'total'))) && initial.output.join('\n').trim() === '36' && !initial.truncated);
    let changed = false;
    if (price && count) {
      let variant = code;
      for (const [node, value] of [[price, 5], [count, 4]].sort((a, b) => b[0].start - a[0].start)) variant = variant.slice(0, node.start) + value + variant.slice(node.end);
      const trial = await runCode('javascript', variant, signal, onProgress);
      changed = trial.output.join('\n').trim() === '20' && !trial.truncated;
    }
    add('costChanges', changed);
  } else if (index === 4) {
    const loop = all.find(node => ['ForStatement', 'ForOfStatement'].includes(node.type) && nodes(node.body).some(isLog));
    const variable = loop?.type === 'ForStatement' ? loop.init?.declarations?.[0]?.id?.name : loop?.left?.declarations?.[0]?.id?.name;
    add('loopUsed', variable && nodes(loop.body).filter(isLog).some(call => call.arguments.some(arg => references(arg, variable))));
    add('loopOutput', initial.output.join('\n').trim() === '1\n2\n3' && !initial.truncated);
    let variant;
    if (loop?.type === 'ForStatement' && loop.test?.type === 'BinaryExpression' && loop.test.right.type === 'Literal' && typeof loop.test.right.value === 'number') {
      const bound = loop.test.right;
      variant = code.slice(0, bound.start) + (bound.value + 1) + code.slice(bound.end);
    } else if (loop?.type === 'ForOfStatement') variant = code.slice(0, loop.right.start) + '[1,2,3,4]' + code.slice(loop.right.end);
    const trial = variant ? await runCode('javascript', variant, signal, onProgress) : null;
    add('loopChanges', trial && trial.output.join('\n').trim() === '1\n2\n3\n4' && !trial.truncated);
  } else if (index === 5) {
    const declaration = tree.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'double');
    const functionNode = declaration || assignment('double');
    add('functionDefined', ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(functionNode?.type) && functionNode.params.length === 1);
    add('functionOutput', initial.output.join('\n').trim() === '10' && !initial.truncated && calls.some(call => call.arguments.some(arg => nodes(arg).some(node => node.type === 'CallExpression' && node.callee.name === 'double'))));
    const trial = await runCode('javascript', `${code}\ntry { const values = [double(0), double(3), double(-2)]; console.log(values.every((value, i) => typeof value === 'number' && value === [0, 6, -4][i]) ? '__lumo_double_ok__' : '__lumo_probe_failed__'); } catch { console.log('__lumo_probe_failed__'); }`, signal, onProgress);
    add('functionValues', trial.output.at(-1) === '__lumo_double_ok__' && !trial.truncated);
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
      if (!curriculum[course]?.[index]) throw { type: 'load-error' };
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
