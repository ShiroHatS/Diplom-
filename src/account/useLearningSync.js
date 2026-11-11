import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyProgress, lessonKeys, normalizeProgress, mergeProgress, sameSyncContent } from '../../shared/progress.js';
import { loadLearningState, saveLearningState, readAccountCache, saveAccountCache } from '../learningState.js';
import { api } from './api.js';

export function useLearningSync() {
  const [state, setState] = useState(() => ({ user: null, learning: loadLearningState(), base: emptyProgress(), revision: 0, status: 'checking', conflicts: [], remote: null, authBusy: false, error: null, recoveryCode: null }));
  const current = useRef(state);
  const generation = useRef(0);
  const requests = useRef(new AbortController());
  const syncing = useRef(null);

  const commit = useCallback(change => {
    const next = typeof change === 'function' ? change(current.current) : change;
    current.current = next;
    if (next.user) saveAccountCache(next.user.id, next);
    else saveLearningState(next.learning);
    setState(next);
  }, []);

  const acceptAccount = useCallback((result, importGuest = false) => {
    const remote = result.snapshot;
    const cache = readAccountCache(result.user.id);
    const base = cache?.base || remote.progress;
    const merged = mergeProgress(base, cache?.learning || remote.progress, remote.progress);
    if (importGuest) {
      const guest = loadLearningState();
      merged.progress.completed = lessonKeys.filter(key => merged.progress.completed.includes(key) || guest.completed.includes(key));
      for (const [key, text] of Object.entries(guest.drafts)) {
        if (merged.progress.drafts[key] === undefined) merged.progress.drafts[key] = text;
        else if (merged.progress.drafts[key] !== text) {
          const existing = merged.conflicts.find(conflict => conflict.key === key);
          if (existing) existing.guest = text;
          else merged.conflicts.push({ key, local: merged.progress.drafts[key], remote: remote.progress.drafts[key] ?? '', guest: text });
        }
      }
    }
    commit({ user: result.user, learning: merged.progress, base: merged.conflicts.length ? base : remote.progress, revision: merged.conflicts.length ? (cache?.revision || remote.revision) : remote.revision,
      status: merged.conflicts.length ? 'conflict' : sameSyncContent(merged.progress, remote.progress) ? 'synced' : 'pending',
      conflicts: merged.conflicts, remote, authBusy: false, error: null, recoveryCode: result.recoveryCode || null });
  }, [commit]);

  const syncNow = useCallback(() => {
    const initial = current.current;
    if (!initial.user || initial.authBusy || initial.conflicts.length || initial.status === 'expired') return Promise.resolve();
    const version = generation.current;
    if (syncing.current?.version === version) return syncing.current.promise;
    const entry = { version, promise: null };
    entry.promise = (async () => {
      commit(value => ({ ...value, status: sameSyncContent(value.learning, value.base) ? value.status : 'syncing', error: null }));
      try {
        let remote = await api('/progress', { signal: requests.current.signal, accountId: initial.user.id });
        for (let attempt = 0; attempt < 3; attempt++) {
          if (generation.current !== version) return;
          const merged = mergeProgress(current.current.base, current.current.learning, remote.progress);
          if (merged.conflicts.length) { commit(value => ({ ...value, learning: merged.progress, conflicts: merged.conflicts, remote, status: 'conflict' })); return; }
          commit(value => ({ ...value, learning: merged.progress, base: remote.progress, revision: remote.revision, remote }));
          if (sameSyncContent(merged.progress, remote.progress)) { commit(value => ({ ...value, status: 'synced' })); return; }
          const sent = merged.progress;
          try {
            const saved = await api('/progress', { method: 'PUT', data: { revision: remote.revision, progress: sent }, signal: requests.current.signal, accountId: initial.user.id });
            if (generation.current !== version) return;
            // Правки, сделанные во время запроса, сохраняются поверх подтверждённой копии.
            const latest = mergeProgress(sent, current.current.learning, saved.progress).progress;
            commit(value => ({ ...value, learning: latest, base: saved.progress, revision: saved.revision, remote: saved, status: sameSyncContent(latest, saved.progress) ? 'synced' : 'pending' }));
            return;
          } catch (error) {
            if (error.code !== 'VERSION_CONFLICT') throw error;
            remote = error.data;
          }
        }
        commit(value => ({ ...value, status: 'pending' }));
      } catch (error) {
        if (generation.current !== version || error.name === 'AbortError') return;
        commit(value => ({ ...value, status: ['SESSION_EXPIRED', 'SESSION_CHANGED'].includes(error.code) ? 'expired' : 'offline', error: error.code }));
      }
    })().finally(() => { if (syncing.current === entry) syncing.current = null; });
    syncing.current = entry;
    return entry.promise;
  }, [commit]);

  const setLearning = useCallback(change => {
    commit(value => {
      const learning = normalizeProgress(typeof change === 'function' ? change(value.learning) : change);
      return { ...value, learning,
        conflicts: value.conflicts.map(conflict => ({ ...conflict, local: learning.drafts[conflict.key] ?? '' })),
        status: value.user && !['conflict', 'expired'].includes(value.status) ? sameSyncContent(learning, value.base) ? 'synced' : 'pending' : value.status };
    });
  }, [commit]);

  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    const version = ++generation.current;
    api('/session', { signal: controller.signal }).then(result => {
      if (generation.current !== version) return;
      if (result.user) acceptAccount(result);
      else commit(value => ({ ...value, status: 'guest' }));
    }).catch(error => {
      if (generation.current === version && error.name !== 'AbortError') commit(value => ({ ...value, status: 'unavailable' }));
    });
    return () => { generation.current++; controller.abort(); requests.current.abort(); };
  }, [acceptAccount, commit]);

  useEffect(() => {
    if (state.status !== 'pending' || state.authBusy) return;
    const timer = setTimeout(syncNow, 1000);
    return () => clearTimeout(timer);
  }, [state.learning, state.status, state.authBusy, syncNow]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') syncNow(); };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); clearInterval(timer); };
  }, [syncNow]);

  async function authenticate(mode, credentials, importGuest) {
    if (current.current.authBusy) return false;
    const version = ++generation.current;
    requests.current.abort();
    requests.current = new AbortController();
    commit(value => ({ ...value, authBusy: true, error: null }));
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', data: credentials, signal: requests.current.signal });
      if (generation.current !== version) return false;
      acceptAccount(result, importGuest);
      return true;
    } catch (error) {
      if (generation.current === version) commit(value => ({ ...value, authBusy: false, error: error.code || 'NETWORK' }));
      return false;
    }
  }

  async function logout() {
    if (current.current.authBusy) return;
    const accountId = current.current.user?.id;
    ++generation.current;
    requests.current.abort(); requests.current = new AbortController();
    commit(value => ({ ...value, authBusy: true, error: null }));
    try {
      await api('/auth/logout', { method: 'POST', accountId, signal: requests.current.signal });
      commit({ user: null, learning: loadLearningState(), base: emptyProgress(), revision: 0, status: 'guest', conflicts: [], remote: null, authBusy: false, error: null, recoveryCode: null });
      return true;
    } catch (error) { commit(value => ({ ...value, authBusy: false, error: error.code || 'NETWORK' })); return false; }
  }

  function resolveConflicts(choices) {
    const value = current.current;
    if (!value.remote || !value.conflicts.length || value.conflicts.some(conflict => !['local', 'remote', ...(conflict.guest === undefined ? [] : ['guest'])].includes(choices[conflict.key]))) return;
    const learning = normalizeProgress(value.learning);
    for (const conflict of value.conflicts) learning.drafts[conflict.key] = conflict[choices[conflict.key]];
    commit({ ...value, learning, base: value.remote.progress, revision: value.remote.revision, conflicts: [], status: 'pending' });
  }

  return { ...state, setLearning, authenticate, logout, syncNow, resolveConflicts,
    clearRecovery: () => commit(value => ({ ...value, recoveryCode: null })), clearError: () => commit(value => ({ ...value, error: null })) };
}
