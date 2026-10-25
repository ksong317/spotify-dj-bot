import { useEffect, useState } from 'react';

import { keyName, normalizeKey, transposeKey } from '../../camelot.js';
import { formatBpm } from '../../setlist.js';
import KeyDot from './KeyDot.jsx';

/**
 * One end of a mix: the key and tempo a song is being played at right there.
 *
 * The key box takes a Camelot code or a key name, and the arrows move it by a
 * half step, which is seven places around the wheel: 1B up one is 8B.
 */
export default function KeyBpmField({
  label,
  songName,
  keyCode,
  bpm,
  defaultKey,
  defaultBpm,
  busy,
  onChange,
  onSaveDefault,
}) {
  const [keyText, setKeyText] = useState(keyCode ?? '');
  const [bpmText, setBpmText] = useState(formatBpm(bpm));
  const [error, setError] = useState(null);

  useEffect(() => {
    setKeyText(keyCode ?? '');
    setError(null);
  }, [keyCode]);

  useEffect(() => {
    setBpmText(formatBpm(bpm));
  }, [bpm]);

  function commitKey() {
    const text = keyText.trim();
    if (!text) {
      setError(null);
      if (keyCode) onChange({ key: null });
      return;
    }
    const code = normalizeKey(text);
    if (!code) {
      setError('Not a key — try 8B, C major or Ebm.');
      return;
    }
    setError(null);
    setKeyText(code);
    if (code !== keyCode) onChange({ key: code });
  }

  function stepKey(semitones) {
    const from = keyCode ?? defaultKey;
    if (!from) return;
    onChange({ key: transposeKey(from, semitones) });
  }

  function commitBpm() {
    const text = bpmText.trim();
    if (!text) {
      if (bpm != null) onChange({ bpm: null });
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      setError('BPM has to be a number.');
      return;
    }
    setError(null);
    if (value !== bpm) onChange({ bpm: value });
  }

  function stepBpm(delta) {
    const from = bpm ?? defaultBpm;
    if (from == null) return;
    onChange({ bpm: Math.round((from + delta) * 100) / 100 });
  }

  const hasDefault = Boolean(defaultKey) || defaultBpm != null;
  const matchesDefault = keyCode === defaultKey && bpm === defaultBpm;
  const canMakeDefault = (keyCode || bpm != null) && !matchesDefault;

  return (
    <div className="keybpm">
      <span className="keybpm__label">
        {label}
        <span className="keybpm__song">{songName}</span>
      </span>

      <div className="keybpm__row">
        <input
          className="keybpm__input"
          value={keyText}
          placeholder={defaultKey ?? 'key'}
          aria-label={`${label} key`}
          disabled={busy}
          onChange={(event) => setKeyText(event.target.value)}
          onBlur={commitKey}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitKey();
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              stepKey(1);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              stepKey(-1);
            }
          }}
        />
        <span className="keybpm__steps">
          <button
            type="button"
            disabled={busy || !(keyCode ?? defaultKey)}
            title="Up a half step"
            onClick={() => stepKey(1)}
          >
            ▲
          </button>
          <button
            type="button"
            disabled={busy || !(keyCode ?? defaultKey)}
            title="Down a half step"
            onClick={() => stepKey(-1)}
          >
            ▼
          </button>
        </span>
        <span className="keybpm__name">
          <KeyDot code={keyCode} />
          {keyCode ? keyName(keyCode) : ''}
        </span>
      </div>

      <div className="keybpm__row">
        <input
          className="keybpm__input"
          value={bpmText}
          placeholder={defaultBpm == null ? 'bpm' : formatBpm(defaultBpm)}
          aria-label={`${label} BPM`}
          inputMode="decimal"
          disabled={busy}
          onChange={(event) => setBpmText(event.target.value)}
          onBlur={commitBpm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitBpm();
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              stepBpm(1);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              stepBpm(-1);
            }
          }}
        />
        <span className="keybpm__steps">
          <button
            type="button"
            disabled={busy || (bpm ?? defaultBpm) == null}
            title="One BPM faster"
            onClick={() => stepBpm(1)}
          >
            ▲
          </button>
          <button
            type="button"
            disabled={busy || (bpm ?? defaultBpm) == null}
            title="One BPM slower"
            onClick={() => stepBpm(-1)}
          >
            ▼
          </button>
        </span>
        <span className="keybpm__name">BPM</span>
      </div>

      {error ? <span className="keybpm__error">{error}</span> : null}

      <div className="keybpm__actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={busy || !hasDefault || matchesDefault}
          title={
            hasDefault
              ? `Play it as the song sits: ${defaultKey ?? 'no key'}${
                  defaultBpm == null ? '' : `, ${formatBpm(defaultBpm)} BPM`
                }`
              : 'This song has no key or tempo of its own yet'
          }
          onClick={() => onChange({ key: defaultKey, bpm: defaultBpm })}
        >
          Default
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={busy || !canMakeDefault}
          title="Remember this as the song's own key and tempo, for every set list"
          onClick={() => onSaveDefault({ default_key: keyCode, default_bpm: bpm })}
        >
          Make default
        </button>
      </div>
    </div>
  );
}
