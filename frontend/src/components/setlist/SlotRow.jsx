import { useEffect, useState } from 'react';

import { formatArtists } from '../../api.js';
import { formatBpm, formatDuration, parseDuration, sitsAt, trackOf } from '../../setlist.js';
import { keyLabel } from '../../camelot.js';
import KeyDot from './KeyDot.jsx';

function DurationField({ seconds, busy, onSave }) {
  const [text, setText] = useState(formatDuration(seconds));
  const [error, setError] = useState(null);

  useEffect(() => {
    setText(formatDuration(seconds));
    setError(null);
  }, [seconds]);

  function commit() {
    const parsed = parseDuration(text);
    if (parsed == null) {
      setError('Use minutes:seconds, like 3:30.');
      return;
    }
    setError(null);
    setText(formatDuration(parsed));
    if (parsed !== (seconds ?? 0)) onSave(parsed);
  }

  return (
    <label className={error ? 'slot__duration is-invalid' : 'slot__duration'}>
      <input
        className="slot__duration-input"
        value={text}
        placeholder="0:00"
        inputMode="text"
        aria-label="How long this song is played"
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.target.blur();
        }}
      />
      {error ? <span className="slot__duration-error">{error}</span> : null}
    </label>
  );
}

/** One song in the running order. */
export default function SlotRow({
  item,
  played,
  number,
  grip,
  busy,
  onSaveDuration,
  onRemove,
  onAddBefore,
  onAddAfter,
  onSplitAfter,
}) {
  const track = trackOf(item);
  const unknown = !item.track;

  return (
    <div className={unknown ? 'slot slot--unknown' : 'slot'}>
      {grip}
      <span className="slot__number">{number}</span>

      {track.album_art_url ? (
        <img className="slot__art" src={track.album_art_url} alt="" />
      ) : (
        <span className="slot__art slot__art--empty" />
      )}

      <div className="slot__text">
        <div className="slot__headline">
          <span className="slot__title">{track.name}</span>
          <DurationField
            seconds={item.duration_seconds}
            busy={busy}
            onSave={onSaveDuration}
          />
        </div>
        <span className="slot__artist">{formatArtists(track)}</span>
      </div>

      <div className="slot__defaults">
        {played.key ? (
          <span
            className={played.pitchedKey ? 'slot__chip slot__chip--pitched' : 'slot__chip'}
            title={
              played.pitchedKey
                ? `Played in ${keyLabel(played.key)}, not the ${keyLabel(
                    item.default_key,
                  )} it sits in`
                : "The song's own key"
            }
          >
            <KeyDot code={played.key} />
            {keyLabel(played.key)}
          </span>
        ) : null}
        {played.bpm == null ? null : (
          <span className="slot__chip" title="The tempo this song is played at">
            {formatBpm(played.bpm)} BPM
          </span>
        )}
        {played.pitched ? (
          <span
            className="slot__chip slot__chip--pitched slot__chip--flag"
            title={`Pitched for this set — the song itself sits at ${sitsAt(
              item,
              played,
            )}`}
          >
            pitched
          </span>
        ) : null}
      </div>

      <div className="slot__actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={onAddBefore}
          title="Add a song before this one"
        >
          Add before
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={onAddAfter}
          title="Add a song after this one"
        >
          Add after
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={onSplitAfter}
          title="Start a separate part of the set after this song"
        >
          Split
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={onRemove}
          title="Take this song out of the set list"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
