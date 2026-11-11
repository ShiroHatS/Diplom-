import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, mergeProgress, sameSyncContent } from '../../shared/progress.js';

test('independent drafts and completed lessons merge, while the current screen stays put', () => {
  const base = emptyProgress(), local = emptyProgress(), remote = emptyProgress();
  local.course = 'javascript'; local.step = 2; local.drafts['javascript-0'] = 'console.log("A")'; local.completed = ['javascript-0'];
  remote.drafts['python-0'] = 'print("B")'; remote.completed = ['python-0'];
  const result = mergeProgress(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.progress.drafts, { 'javascript-0': 'console.log("A")', 'python-0': 'print("B")' });
  assert.deepEqual(result.progress.completed, ['python-0', 'javascript-0']);
  assert.equal(result.progress.course, 'javascript'); assert.equal(result.progress.step, 2);
});

test('two changed versions of one draft require a choice, including an intentional empty answer', () => {
  const base = emptyProgress(); base.drafts['python-0'] = 'original';
  const local = structuredClone(base), remote = structuredClone(base);
  local.drafts['python-0'] = ''; remote.drafts['python-0'] = 'remote';
  const result = mergeProgress(base, local, remote);
  assert.deepEqual(result.conflicts, [{ key: 'python-0', local: '', remote: 'remote' }]);
  assert.equal(result.progress.drafts['python-0'], '');
});

test('an unchanged device accepts remote updates and an upload acknowledgement preserves later typing', () => {
  const base = emptyProgress(), sent = emptyProgress(); sent.drafts['python-0'] = 'sent';
  assert.equal(mergeProgress(base, base, sent).progress.drafts['python-0'], 'sent');
  const typing = structuredClone(sent); typing.drafts['python-0'] = 'typed while saving';
  const merged = mergeProgress(sent, typing, sent);
  assert.equal(merged.progress.drafts['python-0'], 'typed while saving');
  assert.equal(merged.conflicts.length, 0);
  assert.equal(sameSyncContent(merged.progress, sent), false);
  const navigation = structuredClone(sent); navigation.step = 3;
  assert.equal(sameSyncContent(sent, navigation), true);
});
