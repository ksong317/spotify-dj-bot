import { useMemo, useState } from 'react';
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
import { formatBpm } from '../../setlist.js';
import AddSongPanel from './AddSongPanel.jsx';
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
export default function CoreTracks({ setListId, coreTracks, busy, actions }) {
  const [byKey, setByKey] = useState(false);
  const [adding, setAdding] = useState(false);

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

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const from = displayed.indexOf(active.id);
    const to = displayed.indexOf(over.id);
    if (from === -1 || to === -1) return;
    actions.reorderCoreTracks(arrayMove(displayed, from, to));
  }

  return (
    <aside className="core">
      <div className="core__header">
        <h2 className="core__heading">Core tracks</h2>
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

      {coreTracks.length === 0 ? (
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

      {adding ? (
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
