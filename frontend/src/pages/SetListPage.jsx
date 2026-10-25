import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  addCoreTrack,
  addSetListItem,
  createTransition,
  deleteCoreTrack,
  deleteSetListItem,
  fetchSetList,
  reorderCoreTracks,
  reorderSetListItems,
  saveSetListTransition,
  saveTrackDefaults,
  updateSetList,
} from '../api.js';
import CoreTracks from '../components/setlist/CoreTracks.jsx';
import PerformanceView from '../components/setlist/PerformanceView.jsx';
import SetListEditor from '../components/setlist/SetListEditor.jsx';
import { TRACK, junctionsByPair, reorderedLocally } from '../setlist.js';

export default function SetListPage() {
  const { setListId } = useParams();
  // Kept in the URL so a set list can be opened straight into performance mode.
  const [searchParams, setSearchParams] = useSearchParams();
  const performing = searchParams.get('mode') === 'perform';
  const [detail, setDetail] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null });
    fetchSetList(setListId, { signal: controller.signal })
      .then((data) => {
        setDetail(data);
        setName(data.name);
        setState({ loading: false, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ loading: false, error: error.message });
        }
      });
    return () => controller.abort();
  }, [setListId]);

  const run = useCallback(async (action) => {
    setBusy(true);
    try {
      const updated = await action();
      if (updated) setDetail(updated);
      setState((previous) => ({ ...previous, error: null }));
      return updated;
    } catch (error) {
      setState((previous) => ({ ...previous, error: error.message }));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const junctions = useMemo(
    () => junctionsByPair(detail?.transitions ?? []),
    [detail],
  );
  const numbers = useMemo(() => {
    const byItemId = new Map();
    let number = 0;
    for (const item of detail?.items ?? []) {
      if (item.kind === TRACK) byItemId.set(item.id, (number += 1));
    }
    return byItemId;
  }, [detail]);
  const itemsById = useMemo(
    () => new Map((detail?.items ?? []).map((item) => [item.id, item])),
    [detail],
  );

  const actions = useMemo(
    () => ({
      addSong: (track, position) =>
        run(() =>
          addSetListItem(setListId, { kind: TRACK, track_id: track.id, position }),
        ),

      addGap: (position) =>
        run(() => addSetListItem(setListId, { kind: 'break', position })),

      removeItem: (itemId) => run(() => deleteSetListItem(setListId, itemId)),

      // Shown in its new place straight away; the server only confirms the order.
      reorder: async (itemIds) => {
        const snapshot = detail;
        setDetail(reorderedLocally(detail, itemIds));
        const updated = await run(() => reorderSetListItems(setListId, itemIds));
        if (!updated) setDetail(snapshot);
      },

      logTransition: (junction, notes) =>
        run(async () => {
          await createTransition({
            from_track_id: itemsById.get(junction.from_item_id).track_id,
            to_track_id: itemsById.get(junction.to_item_id).track_id,
            notes: notes.trim() || null,
          });
          return fetchSetList(setListId);
        }),

      saveJunctionNotes: (junction, notes) =>
        run(() =>
          saveSetListTransition(setListId, junction.from_item_id, junction.to_item_id, {
            notes: notes.trim() || null,
          }),
        ),

      saveMix: (junction, patch) =>
        run(() =>
          saveSetListTransition(
            setListId,
            junction.from_item_id,
            junction.to_item_id,
            patch,
          ),
        ),

      // A song's own key and tempo live on the song, so every set list sees them.
      saveDefaults: (trackId, defaults) =>
        run(async () => {
          await saveTrackDefaults(trackId, defaults);
          return fetchSetList(setListId);
        }),

      addCoreTrack: (track) => run(() => addCoreTrack(setListId, track.id)),

      removeCoreTrack: (trackId) => run(() => deleteCoreTrack(setListId, trackId)),

      reorderCoreTracks: (trackIds) =>
        run(() => reorderCoreTracks(setListId, trackIds)),
    }),
    [detail, itemsById, run, setListId],
  );

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === detail?.name) {
      setName(detail?.name ?? '');
      return;
    }
    run(() => updateSetList(setListId, { name: trimmed }));
  };

  if (state.loading) {
    return (
      <div className="page page--scroll">
        <p className="page__subtitle">Loading set list…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page page--scroll">
        <p className="picker__error">{state.error ?? 'Set list not found.'}</p>
        <Link className="page__link" to="/setlists">
          ← All set lists
        </Link>
      </div>
    );
  }

  return (
    <div className="page page--scroll">
      <header className="page__header">
        <div>
          {performing ? (
            <h1>{detail.name}</h1>
          ) : (
            <input
              className="setlist__name"
              value={name}
              maxLength={120}
              aria-label="Set list name"
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.target.blur();
              }}
            />
          )}
          <p className="page__subtitle">
            {numbers.size} {numbers.size === 1 ? 'song' : 'songs'}
            {busy ? ' · saving…' : ''}
          </p>
        </div>
        <nav className="page__nav">
          <div className="mode">
            <button
              type="button"
              className={performing ? 'mode__option' : 'mode__option is-active'}
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Edit
            </button>
            <button
              type="button"
              className={performing ? 'mode__option is-active' : 'mode__option'}
              onClick={() => setSearchParams({ mode: 'perform' }, { replace: true })}
            >
              Perform
            </button>
          </div>
          <Link className="page__link" to="/setlists">
            All set lists
          </Link>
        </nav>
      </header>

      {state.error ? <p className="picker__error">{state.error}</p> : null}

      {performing ? (
        <PerformanceView detail={detail} junctions={junctions} numbers={numbers} />
      ) : (
        <div className="setlist__layout">
          <SetListEditor
            detail={detail}
            junctions={junctions}
            numbers={numbers}
            busy={busy}
            actions={actions}
          />
          <CoreTracks
            setListId={detail.id}
            coreTracks={detail.core_tracks}
            busy={busy}
            actions={actions}
          />
        </div>
      )}
    </div>
  );
}
