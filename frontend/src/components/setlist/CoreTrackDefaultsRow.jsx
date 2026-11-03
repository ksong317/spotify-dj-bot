import { useEffect, useState } from 'react';

import { formatArtists } from '../../api.js';
import { keyName, normalizeKey, transposeKey } from '../../camelot.js';
import { MAX_BPM, MIN_BPM, formatBpm, hasOwnDefaults } from '../../setlist.js';
import KeyDot from './KeyDot.jsx';

/**
 * One core track in fill mode: its own key and tempo, typed the same way as
 * on the track info page. Empty boxes keep whatever was already saved — this
 * pass is for filling in, not taking values off.
 */
export default function CoreTrackDefaultsRow({
  core,
  autoFocus,
  busy,
  onSave,
  onAdvance,
}) {
  const [keyText, setKeyText] = useState(core.default_key ?? '');
  const [bpmText, setBpmText] = useState(formatBpm(core.default_bpm));
  const [moved, setMoved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKeyText(core.default_key ?? '');
    setBpmText(formatBpm(core.default_bpm));
    setMoved(false);
  }, [core.default_key, core.default_bpm]);

  const typedKey = keyText.trim() ? normalizeKey(keyText) : null;
  const keyIsNonsense = Boolean(keyText.trim()) && !typedKey;
  const bpmTyped = bpmText.trim();
  const bpmValue = bpmTyped ? Number(bpmTyped) : null;
  const bpmIsNonsense =
    bpmValue != null &&
    (!Number.isFinite(bpmValue) || bpmValue < MIN_BPM || bpmValue > MAX_BPM);

  const nextKey = typedKey ?? core.default_key ?? null;
  const nextBpm = bpmTyped && !bpmIsNonsense ? bpmValue : core.default_bpm;
  const dirty =
    nextKey !== (core.default_key ?? null) || nextBpm !== (core.default_bpm ?? null);

  async function commit() {
    if (saving || busy || keyIsNonsense || bpmIsNonsense) {
      setMoved(true);
      return false;
    }
    if (!dirty) return true;
    setSaving(true);
    const ok = await onSave(core.track_id, {
      default_key: nextKey,
      default_bpm: nextBpm,
    });
    setSaving(false);
    return ok;
  }

  function handleKeyDown(event, field) {
    if (event.key === 'Escape') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (field === 'key') {
        event.currentTarget
          .closest('.core__defaults')
          ?.querySelector('input[inputmode="decimal"]')
          ?.select();
        return;
      }
      commit().then((ok) => {
        if (ok) onAdvance(core.track_id);
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (field === 'key') {
        const from = typedKey ?? core.default_key;
        if (from) setKeyText(transposeKey(from, 1));
      } else {
        const from = bpmTyped && Number.isFinite(bpmValue) ? bpmValue : core.default_bpm;
        if (from != null) setBpmText(formatBpm(Math.round((from + 1) * 100) / 100));
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (field === 'key') {
        const from = typedKey ?? core.default_key;
        if (from) setKeyText(transposeKey(from, -1));
      } else {
        const from = bpmTyped && Number.isFinite(bpmValue) ? bpmValue : core.default_bpm;
        if (from != null) setBpmText(formatBpm(Math.round((from - 1) * 100) / 100));
      }
    }
  }

  const track = core.track;
  const filled = hasOwnDefaults(core);
  const keyWrong = keyIsNonsense && moved;
  const bpmWrong = bpmIsNonsense && moved;

  return (
    <li className={filled ? 'core__item core__item--fill' : 'core__item core__item--fill is-missing'}>
      {track?.album_art_url ? (
        <img className="core__art" src={track.album_art_url} alt="" />
      ) : (
        <span className="core__art slot__art--empty" />
      )}

      <span className="core__text">
        <span className="core__title">{track?.name ?? core.track_id}</span>
        <span className="core__meta">
          {track ? formatArtists(track) : 'Details unavailable'}
        </span>
      </span>

      <span className={filled ? 'core__status' : 'core__status is-missing'}>
        {filled ? 'set' : 'needs a key'}
      </span>

      <div className="core__defaults">
        <label className="core__field">
          <span className="trackinfo__label">Key</span>
          <input
            data-fill-key={core.track_id}
            className="keybpm__input"
            value={keyText}
            placeholder="8B"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={saving || busy}
            aria-invalid={keyWrong}
            aria-label={`${track?.name ?? 'Song'} key`}
            onChange={(event) => {
              setKeyText(event.target.value);
              setMoved(false);
            }}
            onBlur={() => {
              setMoved(true);
              if (typedKey) setKeyText(typedKey);
              commit();
            }}
            onKeyDown={(event) => handleKeyDown(event, 'key')}
          />
        </label>
        <label className="core__field">
          <span className="trackinfo__label">BPM</span>
          <input
            className="keybpm__input"
            value={bpmText}
            placeholder="128"
            inputMode="decimal"
            autoComplete="off"
            disabled={saving || busy}
            aria-invalid={bpmWrong}
            aria-label={`${track?.name ?? 'Song'} BPM`}
            onChange={(event) => {
              setBpmText(event.target.value);
              setMoved(false);
            }}
            onBlur={() => {
              setMoved(true);
              commit();
            }}
            onKeyDown={(event) => handleKeyDown(event, 'bpm')}
          />
        </label>
        <span className="core__reading">
          <KeyDot code={typedKey ?? core.default_key} />
          {keyWrong
            ? 'not a key'
            : bpmWrong
              ? `between ${MIN_BPM} and ${MAX_BPM}`
              : typedKey || core.default_key
                ? keyName(typedKey ?? core.default_key)
                : ''}
        </span>
      </div>
    </li>
  );
}
