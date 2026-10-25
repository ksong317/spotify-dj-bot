import { useState } from 'react';

import { hasMixValues, trackOf } from '../../setlist.js';
import KeyBpmField from './KeyBpmField.jsx';
import MixSummary from './MixSummary.jsx';

/** The seam between two neighbouring songs: what is logged, and what is planned. */
export default function JunctionRow({
  junction,
  fromItem,
  toItem,
  busy,
  onLogTransition,
  onSaveNotes,
  onSaveMix,
  onSaveDefaults,
}) {
  const [logging, setLogging] = useState(false);
  const [logNotes, setLogNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(junction.notes ?? '');
  const [editingMix, setEditingMix] = useState(false);

  const logged = junction.transition_id != null;

  function startEditingNotes() {
    setNotes(junction.notes ?? '');
    setEditingNotes(true);
  }

  async function handleLog(event) {
    event.preventDefault();
    await onLogTransition(logNotes);
    setLogging(false);
    setLogNotes('');
  }

  async function handleSaveNotes(event) {
    event.preventDefault();
    await onSaveNotes(notes);
    setEditingNotes(false);
  }

  // The field names differ per end; the field itself only knows key and tempo.
  const patchFor = (prefix) => (change) => {
    const patch = {};
    if ('key' in change) patch[`${prefix}_key`] = change.key;
    if ('bpm' in change) patch[`${prefix}_bpm`] = change.bpm;
    return onSaveMix(patch);
  };

  return (
    <div className={logged ? 'junction' : 'junction junction--unlogged'}>
      <span className="junction__arrow" aria-hidden="true">
        ↓
      </span>

      <div className="junction__body">
        {logged ? (
          <>
            <span className="junction__tags">
              <span className="junction__tag">logged</span>
              {junction.bidirectional ? (
                <span className="junction__tag">both ways</span>
              ) : null}
            </span>
            {junction.transition_notes ? (
              <p className="junction__notes">{junction.transition_notes}</p>
            ) : (
              <p className="junction__hint">
                Logged, but no notes were written for this mix.
              </p>
            )}
          </>
        ) : logging ? (
          <form className="junction__form" onSubmit={handleLog}>
            <textarea
              className="junction__input"
              rows={2}
              value={logNotes}
              placeholder="How does this mix work? Cue points, key moves, timing…"
              onChange={(event) => setLogNotes(event.target.value)}
            />
            <div className="junction__actions">
              <button type="submit" className="button" disabled={busy}>
                Save to library
              </button>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setLogging(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="junction__actions">
            <span className="junction__hint">No transition logged for this pair.</span>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setLogging(true)}
            >
              Log it
            </button>
          </div>
        )}

        {editingNotes ? (
          <form className="junction__form" onSubmit={handleSaveNotes}>
            <textarea
              className="junction__input"
              rows={2}
              value={notes}
              placeholder="Notes for this set only — energy, crowd, what follows…"
              onChange={(event) => setNotes(event.target.value)}
            />
            <div className="junction__actions">
              <button type="submit" className="button" disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  setNotes(junction.notes ?? '');
                  setEditingNotes(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : junction.notes ? (
          <button
            type="button"
            className="junction__setnote"
            onClick={startEditingNotes}
          >
            <span className="junction__tag junction__tag--set">this set</span>
            <span className="junction__notes">{junction.notes}</span>
          </button>
        ) : (
          <button
            type="button"
            className="button button--quiet junction__addnote"
            onClick={startEditingNotes}
          >
            Add a note for this set
          </button>
        )}

        <div className="junction__actions">
          <MixSummary junction={junction} fromItem={fromItem} toItem={toItem} />
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setEditingMix((open) => !open)}
          >
            {editingMix
              ? 'Done'
              : hasMixValues(junction)
                ? 'Edit key & BPM'
                : 'Set key & BPM'}
          </button>
        </div>

        {editingMix ? (
          <div className="junction__mix">
            <KeyBpmField
              label="Starts at"
              songName={trackOf(fromItem).name}
              keyCode={junction.start_key}
              bpm={junction.start_bpm}
              defaultKey={fromItem?.default_key}
              defaultBpm={fromItem?.default_bpm}
              busy={busy}
              onChange={patchFor('start')}
              onSaveDefault={(defaults) =>
                onSaveDefaults(fromItem.track_id, defaults)
              }
            />
            <KeyBpmField
              label="Lands at"
              songName={trackOf(toItem).name}
              keyCode={junction.end_key}
              bpm={junction.end_bpm}
              defaultKey={toItem?.default_key}
              defaultBpm={toItem?.default_bpm}
              busy={busy}
              onChange={patchFor('end')}
              onSaveDefault={(defaults) => onSaveDefaults(toItem.track_id, defaults)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
