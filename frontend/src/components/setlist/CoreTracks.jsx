import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { formatArtists } from '../../api.js';
import { keyLabel, keySortIndex } from '../../camelot.js';
import { formatBpm, hasOwnDefaults } from '../../setlist.js';
import AddSongPanel from './AddSongPanel.jsx';
import CoreTrackDefaultsRow from './CoreTrackDefaultsRow.jsx';
import KeyDot from './KeyDot.jsx';

function CoreTrackRow({ core, manual, busy, onRemove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: core.track_id, disabled: !manual });
  const track = core.track;

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'core__item is-dragging' : 'core__item'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {manual ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="grip"
          aria-label="Reorder"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      ) : null}

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
        {core.default_key || core.default_bpm != null ? (
          <span className="core__meta">
            <KeyDot code={core.default_key} />
            {[
              core.default_key ? keyLabel(core.default_key) : null,
              core.default_bpm == null ? null : `${formatBpm(core.default_bpm)} BPM`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </span>

      {core.uses > 1 ? <span className="core__uses">×{core.uses}</span> : null}

      <button
        type="button"
        className="button button--quiet"
        disabled={busy}
        onClick={onRemove}
        title="Stop tracking this one"
      >
        ✕
      </button>
    </li>
  );
}

/**
 * Songs that have to make it into the set.
 *
 * Whatever is still missing comes first, because that is the part of the list
 * there is anything to do about.
 */
export default function CoreTracks({
  setListId,
  coreTracks,
  busy,
  actions,
  filling,
  onToggleFill,
}) {
  const [byKey, setByKey] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fillOrder, setFillOrder] = useState(null);
  const focusOnOpen = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sections = useMemo(() => {
    const order = (list) =>
      [...list].sort((left, right) =>
        byKey
          ? keySortIndex(left.default_key) - keySortIndex(right.default_key)
          : left.position - right.position,
      );
    return [
      { id: 'missing', label: 'Not in the set yet', items: order(coreTracks.filter((core) => core.uses === 0)) },
      { id: 'placed', label: 'In the set', items: order(coreTracks.filter((core) => core.uses > 0)) },
    ].filter((section) => section.items.length > 0);
  }, [coreTracks, byKey]);

  const displayed = useMemo(
    () => sections.flatMap((section) => section.items.map((core) => core.track_id)),
    [sections],
  );

  const stillMissing = coreTracks.filter((core) => !hasOwnDefaults(core)).length;

  useEffect(() => {
    if (!filling) {
      setFillOrder(null);
      focusOnOpen.current = false;
      return;
    }
    setFillOrder((previous) => {
      const ids = coreTracks.map((core) => core.track_id);
      if (!previous) {
        return [
          ...coreTracks.filter((core) => !hasOwnDefaults(core)),
          ...coreTracks.filter((core) => hasOwnDefaults(core)),
        ].map((core) => core.track_id);
      }
      const known = new Set(previous);
      return [
        ...previous.filter((id) => ids.includes(id)),
        ...ids.filter((id) => !known.has(id)),
      ];
    });
  }, [filling, coreTracks]);

  const fillList = useMemo(() => {
    if (!fillOrder) return [];
    const byId = new Map(coreTracks.map((core) => [core.track_id, core]));
    return fillOrder.map((id) => byId.get(id)).filter(Boolean);
  }, [coreTracks, fillOrder]);

  useEffect(() => {
    if (!filling || !fillList.length || focusOnOpen.current) return undefined;
    focusOnOpen.current = true;
    const first =
      fillList.find((core) => !hasOwnDefaults(core)) ?? fillList[0];
    const timer = requestAnimationFrame(() => {
      document.querySelector(`[data-fill-key="${first.track_id}"]`)?.select();
    });
    return () => cancelAnimationFrame(timer);
  }, [filling, fillList]);

  function focusKey(trackId) {
    const input = document.querySelector(`[data-fill-key="${trackId}"]`);
    if (!input) return;
    input.focus();
    input.select();
  }

  function handleAdvance(fromTrackId) {
    const next = fillList.find(
      (core) => core.track_id !== fromTrackId && !hasOwnDefaults(core),
    );
    if (next) {
      requestAnimationFrame(() => focusKey(next.track_id));
      return;
    }
    document.querySelector('[data-fill-done]')?.focus();
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const from = displayed.indexOf(active.id);
    const to = displayed.indexOf(over.id);
    if (from === -1 || to === -1) return;
    actions.reorderCoreTracks(arrayMove(displayed, from, to));
  }

  return (
    <aside
      className={filling ? 'core core--fill' : 'core'}
      onKeyDown={(event) => {
        if (filling && event.key === 'Escape') {
          event.preventDefault();
          onToggleFill(false);
        }
      }}
    >
      <div className="core__header">
        <h2 className="core__heading">Core tracks</h2>
        {filling ? (
          <button
            type="button"
            className="button button--quiet"
            tabIndex={-1}
            onClick={() => onToggleFill(false)}
          >
            Done
          </button>
        ) : (
          <div className="core__tools">
            {coreTracks.length ? (
              <button
                type="button"
                className="button button--quiet"
                title="Type in each core track's own key and tempo"
                onClick={() => onToggleFill(true)}
              >
                Set keys
              </button>
            ) : null}
            <div className="mode mode--small">
              <button
                type="button"
                className={byKey ? 'mode__option' : 'mode__option is-active'}
                title="The order you put them in — drag to rearrange"
                onClick={() => setByKey(false)}
              >
                Mine
              </button>
              <button
                type="button"
                className={byKey ? 'mode__option is-active' : 'mode__option'}
                title="Grouped around the wheel, so neighbours mix together"
                onClick={() => setByKey(true)}
              >
                Key
              </button>
            </div>
          </div>
        )}
      </div>

      {filling ? (
        <>
          <p className="core__hint">
            {stillMissing
              ? `${stillMissing} ${stillMissing === 1 ? 'song still needs' : 'songs still need'} a key.`
              : 'Every core track has a key and tempo.'}{' '}
            Tab through key and BPM; Enter saves and jumps to the next blank one.
          </p>
          {fillList.length ? (
            <ul className="core__list">
              {fillList.map((core, index) => (
                <CoreTrackDefaultsRow
                  key={core.track_id}
                  core={core}
                  autoFocus={index === 0 && !hasOwnDefaults(core)}
                  busy={busy}
                  onSave={actions.saveCoreDefaults}
                  onAdvance={handleAdvance}
                />
              ))}
            </ul>
          ) : (
            <p className="junction__hint">Nothing pinned yet.</p>
          )}
          <button
            type="button"
            className="button"
            data-fill-done
            onClick={() => onToggleFill(false)}
          >
            Done
          </button>
        </>
      ) : coreTracks.length === 0 ? (
        <p className="junction__hint">
          Nothing pinned yet. Add the songs this set has to include and they will be
          tracked here until they land in the running order.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={displayed} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <div className="core__section" key={section.id}>
                <span className="core__label">{section.label}</span>
                <ul className="core__list">
                  {section.items.map((core) => (
                    <CoreTrackRow
                      key={core.track_id}
                      core={core}
                      manual={!byKey}
                      busy={busy}
                      onRemove={() => actions.removeCoreTrack(core.track_id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </SortableContext>
        </DndContext>
      )}

      {filling ? null : adding ? (
        <AddSongPanel
          title="Pin a song to this set"
          busy={busy}
          setListId={setListId}
          onSelect={(track) => {
            actions.addCoreTrack(track);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => setAdding(true)}
        >
          Add a core track
        </button>
      )}
    </aside>
  );
}
