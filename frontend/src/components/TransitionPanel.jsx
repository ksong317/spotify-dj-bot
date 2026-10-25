import { formatArtists } from '../api.js';

function TrackLine({ label, track }) {
  return (
    <div className="detail__track">
      <span className="detail__label">{label}</span>
      <span className="detail__name">{track.name}</span>
      <span className="detail__artist">{formatArtists(track)}</span>
    </div>
  );
}

export default function TransitionPanel({ detail, pinned, graph, onClear }) {
  if (!detail) {
    let hint = 'Pick a song to start exploring. Click any neighbor to travel to it.';
    if (graph && graph.edges.length > 0) {
      hint = 'Hover an edge to preview its notes, or click one to pin it here.';
    } else if (graph) {
      hint = `Nothing connects to “${graph.center.name}” yet. Log a transition on the library page and it will show up here.`;
    }
    return (
      <aside className="detail detail--empty">
        <h2 className="detail__heading">Transition</h2>
        <p className="detail__hint">{hint}</p>
      </aside>
    );
  }

  return (
    <aside className="detail">
      <div className="detail__header">
        <h2 className="detail__heading">
          Transition
          {detail.bidirectional ? <span className="detail__badge">both ways</span> : null}
        </h2>
        {pinned ? (
          <button type="button" className="detail__clear" onClick={onClear}>
            Unpin
          </button>
        ) : null}
      </div>

      <TrackLine label="From" track={detail.fromTrack} />
      <div className="detail__arrow" aria-hidden="true">
        {detail.bidirectional ? '↕' : '↓'}
      </div>
      <TrackLine label="To" track={detail.toTrack} />

      <div className="detail__notes">
        {detail.notes ? (
          <p>{detail.notes}</p>
        ) : (
          <p className="detail__hint">No notes written for this transition yet.</p>
        )}
      </div>
    </aside>
  );
}
