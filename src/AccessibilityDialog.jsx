import { useLayoutEffect, useRef } from 'react';

export default function AccessibilityDialog({ open, onClose, preferences, onChange, onReset, theme, onThemeChange, t }) {
  const dialogRef = useRef(null);

  // Нативный dialog удерживает фокус внутри и возвращает его кнопке после закрытия.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const toggle = (key, label, description) => <label className="setting-switch" key={key}>
    <span><strong>{label}</strong><small>{description}</small></span>
    <input type="checkbox" checked={preferences[key]} onChange={event => onChange(key, event.target.checked)} />
  </label>;

  return <dialog className="settings-dialog" ref={dialogRef} aria-labelledby="settings-title" aria-describedby="settings-intro" onClose={onClose}>
    <div className="settings-head">
      <div><p className="section-label">{t.settingsEyebrow}</p><h2 id="settings-title">{t.settingsTitle}</h2></div>
      <button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()} aria-label={t.settingsClose}>×</button>
    </div>
    <p id="settings-intro" className="settings-intro">{t.settingsIntro}</p>
    <div className="settings-scroll">
      <div className="settings-grid">
        <label className="setting-select"><span><strong>{t.fontSize}</strong><small>{t.fontSizeHelp}</small></span><select value={preferences.fontSize} onChange={event => onChange('fontSize', event.target.value)}>{['100', '112', '125', '150'].map(value => <option value={value} key={value}>{value}%</option>)}</select></label>
        <label className="setting-select"><span><strong>{t.lineSpacing}</strong><small>{t.lineSpacingHelp}</small></span><select value={preferences.lineSpacing} onChange={event => onChange('lineSpacing', event.target.value)}><option value="default">{t.spacingDefault}</option><option value="relaxed">{t.spacingRelaxed}</option><option value="spacious">{t.spacingSpacious}</option></select></label>
        <label className="setting-select"><span><strong>{t.theme}</strong><small>{t.themeHelp}</small></span><select value={theme} onChange={event => onThemeChange(event.target.value)}><option value="system">{t.system}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option></select></label>
      </div>
      <div className="settings-toggles">
        {toggle('contrast', t.contrast, t.contrastHelp)}
        {toggle('dyslexicFont', t.dyslexicFont, t.dyslexicFontHelp)}
        {toggle('reduceMotion', t.reduceMotion, t.reduceMotionHelp)}
        {toggle('simpleLanguage', t.simpleLanguage, t.simpleLanguageHelp)}
        {toggle('focusMode', t.focusMode, t.focusModeHelp)}
      </div>
    </div>
    <div className="settings-actions"><button type="button" className="reset-button" aria-label={t.settingsReset} onClick={onReset}><span className="reset-full" aria-hidden="true">{t.settingsReset}</span><span className="reset-short" aria-hidden="true">{t.settingsResetShort}</span></button><button type="button" className="settings-done" onClick={() => dialogRef.current?.close()}>{t.settingsDone}</button></div>
  </dialog>;
}
