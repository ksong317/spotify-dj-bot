import { Fragment, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
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

import {
  BREAK,
  TRACK,
  buildGroups,
  energyLevelsOf,
  junctionKey,
  orderWithGroupMoved,
  trackOf,
} from '../../setlist.js';
import AddSongPanel from './AddSongPanel.jsx';
import BreakRow from './BreakRow.jsx';
import EnergyPicker from './EnergyPicker.jsx';
import JunctionRow from './JunctionRow.jsx';
import SlotRow from './SlotRow.jsx';

const slotId = (itemId) => `slot-${itemId}`;
const itemIdOf = (sortableId) => Number(String(sortableId).replace('slot-', ''));

/**
 * Where a song can be dropped in, named after the slot it sits against.
 *
 * Several spots share a position — the start of a part and the end of the part
 * above it are the same gap in the running order — so naming them is what keeps
 * one click from opening two search boxes.
 */
const END = 'end';
const spotId = (side, itemId) => `${side}-${itemId}`;

function addSpot(item, side) {
  return {
    id: spotId(side, item.id),
    title: `Add a song ${side} “${item.track?.name ?? 'this slot'}”`,
  };
}

function Grip({ label, attributes, listeners, setRef }) {
  return (
    <button
      type="button"
      ref={setRef}
      className="grip"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

function SortableSlot({ item, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slotId(item.id), data: { type: 'slot', itemId: item.id } });

  const grip = (
    <Grip
      label="Reorder this slot"
      attributes={attributes}
      listeners={listeners}
      setRef={setActivatorNodeRef}
    />
  );

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'sortable is-dragging' : 'sortable'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children({ grip, dragging: isDragging })}
    </div>
  );
}

function GroupHeader({ index, count, songs, isTarget, energy, busy, onEnergy }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: `group-${index}`, data: { type: 'group', groupIndex: index } });

  const classes = ['group__header'];
  if (isDragging) classes.push('is-dragging');
  if (isTarget) classes.push('is-target');

  return (
    <div className={classes.join(' ')} ref={setNodeRef}>
      <Grip
        label={`Move part ${index + 1} of the set`}
        attributes={attributes}
        listeners={listeners}
        setRef={setActivatorNodeRef}
      />
      <span className="group__label">
        {count > 1 ? `Part ${index + 1}` : 'Running order'}
      </span>
      <span className="group__count">
        {songs} {songs === 1 ? 'song' : 'songs'}
      </span>
      <EnergyPicker levels={energy} busy={busy} onChange={onEnergy} />
    </div>
  );
}

export default function SetListEditor({
  detail,
  junctions,
  numbers,
  played,
  busy,
  actions,
}) {
  const [addAt, setAddAt] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [targetGroup, setTargetGroup] = useState(null);

  const sensors = useSensors(
    // A small threshold keeps a click on the grip from counting as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const blocks = useMemo(() => buildGroups(detail.items), [detail.items]);
  const itemsById = useMemo(
    () => new Map(detail.items.map((item) => [item.id, item])),
    [detail.items],
  );
  const sortableIds = useMemo(
    () => detail.items.map((item) => slotId(item.id)),
    [detail.items],
  );
  const groupIndexBySlot = useMemo(() => {
    const byItemId = new Map();
    let groupIndex = -1;
    for (const block of blocks) {
      if (block.kind === BREAK) continue;
      groupIndex += 1;
      for (const item of block.items) byItemId.set(item.id, groupIndex);
    }
    return byItemId;
  }, [blocks]);

  const groupCount = blocks.filter((block) => block.kind === TRACK).length;

  function groupIndexOf(over) {
    if (over.data.current?.type === 'group') return over.data.current.groupIndex;
    return groupIndexBySlot.get(itemIdOf(over.id)) ?? null;
  }

  function handleDragOver({ active, over }) {
    if (!over || active.data.current?.type !== 'group') {
      setTargetGroup(null);
      return;
    }
    const target = groupIndexOf(over);
    setTargetGroup(target === active.data.current.groupIndex ? null : target);
  }

  function handleDragEnd({ active, over }) {
    setDragging(null);
    setTargetGroup(null);
    if (!over) return;

    if (active.data.current?.type === 'group') {
      const from = active.data.current.groupIndex;
      const to = groupIndexOf(over);
      if (to == null || to === from) return;
      actions.reorder(orderWithGroupMoved(blocks, from, to));
      return;
    }

    if (active.id === over.id) return;
    const from = sortableIds.indexOf(active.id);
    const to = sortableIds.indexOf(over.id);
    if (from === -1 || to === -1) return;
    actions.reorder(arrayMove(sortableIds, from, to).map(itemIdOf));
  }

  /** Read off when the song is added, so a move while the panel sits open is safe. */
  function spotPosition(id) {
    if (id === END) return detail.items.length;
    const [side, itemId] = id.split('-');
    const item = itemsById.get(Number(itemId));
    if (!item) return detail.items.length;
    return side === 'before' ? item.position : item.position + 1;
  }

  function addPanel(id) {
    if (addAt?.id !== id) return null;
    const position = spotPosition(id);
    const previous = detail.items[position - 1];
    return (
      <AddSongPanel
        title={addAt.title}
        busy={busy}
        setListId={detail.id}
        // No mix reaches across a gap, so nothing above one is the song before.
        afterItemId={previous?.kind === TRACK ? previous.id : null}
        onSelect={(track) => {
          actions.addSong(track, position);
          setAddAt(null);
        }}
        onCancel={() => setAddAt(null)}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={({ active }) => setDragging(active.data.current ?? null)}
      onDragOver={handleDragOver}
      onDragCancel={() => {
        setDragging(null);
        setTargetGroup(null);
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="setlist">
          {detail.items.length === 0 ? (
            <p className="page__subtitle">
              Nothing here yet. Add the first song and build outwards.
            </p>
          ) : null}

          {blocks.map((block, blockIndex) =>
            block.kind === BREAK ? (
              // Adding below a gap is the first song of the part under it, so the
              // gap itself offers nothing: that would be the same spot twice.
              <SortableSlot key={block.id} item={block.item}>
                {({ grip }) => (
                  <BreakRow
                    grip={grip}
                    busy={busy}
                    onRemove={() => actions.removeItem(block.item.id)}
                  />
                )}
              </SortableSlot>
            ) : (
              <div
                className={
                  targetGroup === groupIndexBySlot.get(block.items[0].id)
                    ? 'group is-target'
                    : 'group'
                }
                key={block.id}
              >
                <GroupHeader
                  index={groupIndexBySlot.get(block.items[0].id)}
                  count={groupCount}
                  songs={block.items.length}
                  isTarget={targetGroup === groupIndexBySlot.get(block.items[0].id)}
                  energy={energyLevelsOf(block.items)}
                  busy={busy}
                  onEnergy={(levels) =>
                    actions.savePartEnergy(block.items[0].id, levels)
                  }
                />

                {block.items.map((item, index) => {
                  const previous = index > 0 ? block.items[index - 1] : null;
                  const junction = previous
                    ? junctions.get(junctionKey(previous.id, item.id))
                    : null;
                  return (
                    <Fragment key={item.id}>
                      {addPanel(spotId('before', item.id))}

                      {junction ? (
                        <JunctionRow
                          junction={junction}
                          fromItem={previous}
                          toItem={item}
                          busy={busy}
                          onLogTransition={(notes) =>
                            actions.logTransition(junction, notes)
                          }
                          onSaveNotes={(notes) =>
                            actions.saveJunctionNotes(junction, notes)
                          }
                          onSaveMix={(patch) => actions.saveMix(junction, patch)}
                          onSaveDefaults={actions.saveDefaults}
                        />
                      ) : null}

                      <SortableSlot item={item}>
                        {({ grip }) => (
                          <SlotRow
                            item={item}
                            played={played.get(item.id)}
                            number={numbers.get(item.id)}
                            grip={grip}
                            busy={busy}
                            onSaveDuration={(seconds) =>
                              actions.saveDuration(item.id, seconds)
                            }
                            onRemove={() => actions.removeItem(item.id)}
                            onAddBefore={() => setAddAt(addSpot(item, 'before'))}
                            onAddAfter={() => setAddAt(addSpot(item, 'after'))}
                            onSplitAfter={() => actions.addGap(item.position + 1)}
                          />
                        )}
                      </SortableSlot>

                      {addPanel(spotId('after', item.id))}
                    </Fragment>
                  );
                })}

                {blockIndex === blocks.length - 1 ? null : (
                  <div className="group__footer">
                    <button
                      type="button"
                      className="button button--quiet"
                      disabled={busy}
                      onClick={() =>
                        setAddAt(addSpot(block.items[block.items.length - 1], 'after'))
                      }
                    >
                      Add to this part
                    </button>
                  </div>
                )}
              </div>
            ),
          )}

          <div className="setlist__footer">
            {addAt?.id === END ? null : (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setAddAt({ id: END, title: 'Add a song to the end' })}
              >
                Add a song
              </button>
            )}
            <button
              type="button"
              className="button button--quiet"
              disabled={busy || detail.items.length === 0}
              onClick={() => actions.addGap(detail.items.length)}
              title="Start a separate part of the set after everything above"
            >
              Add a gap
            </button>
          </div>
          {addPanel(END)}
        </div>
      </SortableContext>

      <DragOverlay modifiers={[restrictToVerticalAxis]}>
        {dragging?.type === 'slot' ? (
          <DragPreview detail={detail} itemId={dragging.itemId} />
        ) : dragging?.type === 'group' ? (
          <div className="drag-preview drag-preview--group">
            Part {dragging.groupIndex + 1}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DragPreview({ detail, itemId }) {
  const item = detail.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  if (item.kind === BREAK) return <div className="drag-preview">Gap</div>;
  return <div className="drag-preview">{trackOf(item).name}</div>;
}
