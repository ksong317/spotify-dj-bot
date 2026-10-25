import { formatArtists } from '../../api.js';
import { formatBpm, trackOf } from '../../setlist.js';
import { keyLabel } from '../../camelot.js';
import KeyDot from './KeyDot.jsx';

/** One song in the running order. */
export default function SlotRow({
  item,
  number,
  grip,
  busy,
  onRemove,
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
        <span className="slot__title">{track.name}</span>
        <span className="slot__artist">{formatArtists(track)}</span>
      </div>

      <div className="slot__defaults">
        {item.default_key ? (
          <span className="slot__chip" title="The song's own key">
            <KeyDot code={item.default_key} />
            {keyLabel(item.default_key)}
          </span>
        ) : null}
        {item.default_bpm != null ? (
          <span className="slot__chip" title="The song's own tempo">
            {formatBpm(item.default_bpm)} BPM
          </span>
        ) : null}
      </div>

      <div className="slot__actions">
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
