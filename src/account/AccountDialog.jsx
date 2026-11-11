import { useLayoutEffect, useRef, useState } from 'react';
import { accountText } from './accountText.js';

export function AccountBar({ language, sync, onOpen }) {
  const t = accountText[language];
  return <div className="account-bar"><div><strong>{sync.user ? `${t.signedIn} ${sync.user.username}` : t.guestTitle}</strong><p className="account-sync-status" role="status">{t.statuses[sync.status]}</p></div>
    <button type="button" onClick={onOpen} aria-haspopup="dialog">{t.open}</button></div>;
}

export default function AccountDialog({ open, onClose, language, sync }) {
  const t = accountText[language];
  const dialog = useRef(null), errorBox = useRef(null), recovery = useRef(null);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [importGuest, setImportGuest] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [choices, setChoices] = useState({});
  const [copyStatus, setCopyStatus] = useState('');
  const error = localError || sync.error;
  const loginNeeded = !sync.user || sync.status === 'expired';

  useLayoutEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current.open) dialog.current.close();
    if (!open) { setPassword(''); setRecoveryInput(''); setCopyStatus(''); setLocalError(null); setShowPassword(false); }
  }, [open]);

  function changeMode(value) { setMode(value); setPassword(''); setRecoveryInput(''); setLocalError(null); sync.clearError(); }
  function focusError() { requestAnimationFrame(() => errorBox.current?.focus()); }
  async function submit(event) {
    event.preventDefault();
    if (sync.authBusy) return;
    setLocalError(null);
    const cleanName = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(cleanName)) { setLocalError('USERNAME_FORMAT'); focusError(); return; }
    if (mode !== 'login' && ([...password].length < 15 || [...password].length > 128)) { setLocalError('PASSWORD_LENGTH'); focusError(); return; }
    const success = await sync.authenticate(mode, { username: cleanName, password, ...(mode === 'recover' ? { recoveryCode: recoveryInput.trim() } : {}) }, mode !== 'recover' && importGuest);
    if (success) { setPassword(''); setRecoveryInput(''); setImportGuest(false); setChoices({}); requestAnimationFrame(() => (document.getElementById('recovery-title') || document.getElementById('account-signed-in'))?.focus()); }
    else focusError();
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(sync.recoveryCode); setCopyStatus('copied'); }
    catch { recovery.current?.focus(); recovery.current?.select(); setCopyStatus('copyFallback'); }
  }
  function resolve(event) {
    event.preventDefault();
    if (sync.conflicts.some(conflict => !choices[conflict.key])) { setLocalError('CHOOSE_CONFLICT'); focusError(); return; }
    setLocalError(null); sync.resolveConflicts(choices); setChoices({});
    // Форма исчезает после выбора. Переносим фокус к результату этого действия.
    requestAnimationFrame(() => document.getElementById('account-sync-message')?.focus());
  }

  return <dialog className="settings-dialog account-dialog" ref={dialog} aria-labelledby="account-title" aria-describedby="account-intro" onClose={() => { sync.clearRecovery(); onClose(); }}>
    <div className="settings-head"><h2 id="account-title">{t.title}</h2><button className="dialog-close" type="button" aria-label={t.close} onClick={() => dialog.current.close()}>×</button></div>
    <p id="account-intro">{t.intro}</p>
    <div className="account-scroll">
      {error && <p className="account-error" id="account-error" ref={errorBox} tabIndex={-1} role="alert">{t.errors[error] || t.errors.SERVER_ERROR}</p>}
      {loginNeeded ? <>
        <div className="account-modes" role="group" aria-label={t.title}>{[['login', t.signIn], ['register', t.register], ['recover', t.recover]].map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => changeMode(value)} disabled={sync.authBusy}>{label}</button>)}</div>
        <form className="account-form" onSubmit={submit} noValidate>
          <label htmlFor="account-username">{t.username}</label>
          <input id="account-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32} required aria-invalid={['USERNAME_FORMAT', 'USERNAME_TAKEN'].includes(error) || undefined} aria-describedby={`username-help${['USERNAME_FORMAT', 'USERNAME_TAKEN'].includes(error) ? ' account-error' : ''}`} />
          <p className="lesson-help" id="username-help">{t.usernameHelp}</p>
          {mode === 'recover' && <><label htmlFor="account-recovery-input">{t.recoveryCode}</label><input id="account-recovery-input" value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} required aria-invalid={error === 'INVALID_RECOVERY' || undefined} aria-describedby={`recovery-help${error === 'INVALID_RECOVERY' ? ' account-error' : ''}`} /><p className="lesson-help" id="recovery-help">{t.recoveryNotice}</p></>}
          <label htmlFor="account-password">{mode === 'recover' ? t.newPassword : t.password}</label>
          <div className="password-control"><input id="account-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={256} required aria-invalid={error === 'PASSWORD_LENGTH' || undefined} aria-describedby={`password-help${error === 'PASSWORD_LENGTH' ? ' account-error' : ''}`} /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? t.hidePassword : t.showPassword}</button></div>
          <p className="lesson-help" id="password-help">{t.passwordHelp}</p>
          {mode !== 'recover' && <><label className="account-import"><input type="checkbox" checked={importGuest} onChange={event => setImportGuest(event.target.checked)} />{t.importGuest}</label><p className="lesson-help">{t.importHelp}</p></>}
          <button className="account-primary" type="submit" aria-disabled={sync.authBusy}>{sync.authBusy ? t.submitting : mode === 'login' ? t.signIn : mode === 'register' ? t.register : t.recover}</button>
        </form>
      </> : <>
        <p className="signed-in" id="account-signed-in" tabIndex={-1}><strong>{t.signedIn}</strong> {sync.user.username}</p>
        <p id="account-sync-message" role="status" tabIndex={-1}>{t.statuses[sync.status]}</p><p className="lesson-help">{t.storageHelp}</p>
        <div className="account-actions"><button type="button" onClick={() => sync.syncNow()} aria-disabled={sync.status === 'syncing' || sync.authBusy}>{t.sync}</button><button type="button" onClick={async () => { if (await sync.logout()) requestAnimationFrame(() => document.getElementById('account-username')?.focus()); }} aria-disabled={sync.authBusy}>{sync.authBusy ? t.submitting : t.logout}</button></div>
      </>}
      {sync.recoveryCode && <section className="recovery-box" aria-labelledby="recovery-title"><h3 id="recovery-title" tabIndex={-1}>{t.recoveryTitle}</h3><p>{t.recoveryHelp}</p><label htmlFor="account-recovery-code">{t.recoveryCode}</label><input id="account-recovery-code" ref={recovery} value={sync.recoveryCode} readOnly autoComplete="off" spellCheck={false} /><button type="button" onClick={copyCode}>{t.copy}</button><p role="status">{copyStatus ? t[copyStatus] : ''}</p></section>}
      {sync.conflicts.length > 0 && <form className="conflict-form" onSubmit={resolve} noValidate><h3>{t.conflictsTitle}</h3><p>{t.conflictsHelp}</p>{sync.conflicts.map(conflict => <fieldset key={conflict.key}><legend>{({ python: 'Python', javascript: 'JavaScript', web: 'HTML + CSS' })[conflict.key.split('-')[0]]} · {t.lesson} {Number(conflict.key.split('-')[1]) + 1}</legend>{['local', 'remote', ...(conflict.guest === undefined ? [] : ['guest'])].map(version => <div className="conflict-version" key={version}><label><input type="radio" name={`conflict-${conflict.key}`} value={version} checked={choices[conflict.key] === version} onChange={() => setChoices(value => ({ ...value, [conflict.key]: version }))} />{t[version]}</label><pre tabIndex={0}>{conflict[version] || t.empty}</pre></div>)}</fieldset>)}<button className="account-primary" type="submit">{t.resolve}</button></form>}
    </div>
    <div className="settings-actions"><button type="button" className="settings-done" onClick={() => dialog.current.close()}>{t.done}</button></div>
  </dialog>;
}
