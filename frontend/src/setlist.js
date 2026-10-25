// Shapes the flat list of slots the API returns into what the views render.
import { keyRelation } from './camelot.js';

export const TRACK = 'track';
export const BREAK = 'break';

/** Contiguous runs of songs, split by the gaps between parts of the set. */
export function buildGroups(items) {
  const blocks = [];
  let group = null;
  for (const item of items) {
    if (item.kind === BREAK) {
      blocks.push({ kind: BREAK, id: `break-${item.id}`, item });
      group = null;
      continue;
    }
    if (!group) {
      group = { kind: TRACK, id: `group-${item.id}`, items: [] };
      blocks.push(group);
    }
    group.items.push(item);
  }
  return blocks;
}

export const junctionKey = (fromItemId, toItemId) => `${fromItemId}:${toItemId}`;

export function junctionsByPair(transitions) {
  return new Map(
    transitions.map((row) => [junctionKey(row.from_item_id, row.to_item_id), row]),
  );
}

/** A slot whose Spotify details never loaded still has to render as something. */
export function trackOf(item) {
  return (
    item.track ?? {
      id: item.track_id ?? '',
      name: 'Details unavailable',
      artists: [],
      album: '',
      album_art_url: null,
      preview_url: null,
      external_url: '',
    }
  );
}

/** The set list as it will look once a reorder lands, for an instant preview. */
export function reorderedLocally(detail, itemIds) {
  const byId = new Map(detail.items.map((item) => [item.id, item]));
  return {
    ...detail,
    items: itemIds.map((id, index) => ({ ...byId.get(id), position: index })),
  };
}

/**
 * The running order with one group of songs moved to another group's place.
 *
 * Groups sit in the slots the gaps carve out, and moving one swaps those slots:
 * the gaps stay where they are, so parts of the set keep standing apart.
 */
export function orderWithGroupMoved(blocks, fromIndex, toIndex) {
  const groups = blocks.filter((block) => block.kind === TRACK);
  const moved = groups.splice(fromIndex, 1);
  groups.splice(toIndex, 0, ...moved);

  const order = [];
  let next = 0;
  for (const block of blocks) {
    if (block.kind === BREAK) {
      order.push(block.item.id);
    } else {
      order.push(...groups[next++].items.map((item) => item.id));
    }
  }
  return order;
}

export function formatBpm(bpm) {
  if (bpm == null) return '';
  return Number.isInteger(bpm) ? String(bpm) : String(Number(bpm.toFixed(2)));
}

/**
 * The key and tempo each end of a mix actually runs at.
 *
 * What the set list says wins; failing that, where the song sits.
 */
export function effectiveMix(junction, fromItem, toItem) {
  return {
    startKey: junction?.start_key ?? fromItem?.default_key ?? null,
    startBpm: junction?.start_bpm ?? fromItem?.default_bpm ?? null,
    endKey: junction?.end_key ?? toItem?.default_key ?? null,
    endBpm: junction?.end_bpm ?? toItem?.default_bpm ?? null,
  };
}

/**
 * What is worth flagging about a mix while playing it.
 *
 * `pitched` means a song is not being played where it sits, so it has to be
 * pitched by hand. `bpmShift` means the mix does not land at the tempo it began
 * at. `relation` judges the two keys against each other, and reads off the keys
 * each end actually runs at — so a seam says whether it works as soon as both
 * songs have a key, with nothing typed into the set list at all.
 */
export function mixFlags(junction, fromItem, toItem) {
  const off = (value, fallback) =>
    value != null && fallback != null && value !== fallback;

  const pitched =
    off(junction?.start_key, fromItem?.default_key) ||
    off(junction?.start_bpm, fromItem?.default_bpm) ||
    off(junction?.end_key, toItem?.default_key) ||
    off(junction?.end_bpm, toItem?.default_bpm);

  const { startKey, endKey, startBpm, endBpm } = effectiveMix(
    junction,
    fromItem,
    toItem,
  );

  return {
    pitched: Boolean(pitched),
    bpmShift: off(endBpm, startBpm),
    relation: keyRelation(startKey, endKey),
  };
}

export function hasMixValues(junction) {
  return Boolean(
    junction &&
      (junction.start_key ||
        junction.end_key ||
        junction.start_bpm != null ||
        junction.end_bpm != null),
  );
}
