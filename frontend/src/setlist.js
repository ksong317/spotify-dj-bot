// Shapes the flat list of slots the API returns into what the views render.
import { keyLabel, keyRelation } from './camelot.js';

export const TRACK = 'track';
export const BREAK = 'break';

export const ENERGY_LEVELS = ['low', 'medium', 'high'];
export const ENERGY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

/** The energy tagged on this part, in the order it was chosen. */
export function energyLevelsOf(items) {
  for (const item of items ?? []) {
    if (item.energy_levels?.length) return item.energy_levels;
  }
  return [];
}

/** Tick adds a level at the end; ticking again takes it off. */
export function toggleEnergy(levels, level) {
  const current = levels ?? [];
  const index = current.indexOf(level);
  if (index >= 0) return current.filter((item) => item !== level);
  return [...current, level];
}

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

function artistsOf(track) {
  return (track.artists ?? []).filter(Boolean).join(', ');
}

/**
 * A plain-text running order: titles and artists, with gaps marked, and
 * nothing else — no keys, tempos, notes or play times.
 */
export function exportSetListText(detail) {
  const lines = [];
  if (detail?.name) {
    lines.push(detail.name, '');
  }

  let number = 0;
  for (const item of detail?.items ?? []) {
    if (item.kind === BREAK) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push('— gap —');
      lines.push('');
      continue;
    }
    number += 1;
    const track = trackOf(item);
    const artists = artistsOf(track);
    lines.push(
      artists ? `${number}. ${track.name} — ${artists}` : `${number}. ${track.name}`,
    );
  }

  return lines.join('\n').trimEnd();
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

/** Tempos that display the same are the same. */
function sameBpm(a, b) {
  if (a == null || b == null) return false;
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

/** Play time as minutes:seconds. Missing or empty is 0:00. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Minutes:seconds into a number of seconds.
 *
 * Empty is 0. A bare number is minutes. Seconds must be 0–59. Returns null
 * when the text is not a duration at all.
 */
export function parseDuration(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 60;
  }

  const match = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function durationSecondsOf(item) {
  return item?.kind === TRACK ? item.duration_seconds ?? 0 : 0;
}

export function totalDurationSeconds(items) {
  return (items ?? []).reduce((sum, item) => sum + durationSecondsOf(item), 0);
}

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export function hasOwnDefaults(row) {
  return Boolean(row?.default_key) || row?.default_bpm != null;
}

/** Apply a song's own key and tempo everywhere this set list already shows them. */
export function withTrackDefaults(detail, trackId, defaultKey, defaultBpm) {
  const patch = (row) =>
    row.track_id === trackId
      ? { ...row, default_key: defaultKey, default_bpm: defaultBpm }
      : row;
  return {
    ...detail,
    items: detail.items.map(patch),
    core_tracks: detail.core_tracks.map(patch),
  };
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
 * What is worth flagging about a mix itself.
 *
 * `bpmShift` means the mix does not land at the tempo it began at. `relation`
 * judges the two keys against each other, and reads off the keys each end
 * actually runs at — so a seam says whether it works as soon as both songs have
 * a key, with nothing typed into the set list at all. Whether either song is
 * being played off its own key belongs to that song: see `playedByItem`.
 */
export function mixFlags(junction, fromItem, toItem) {
  const { startKey, endKey, startBpm, endBpm } = effectiveMix(
    junction,
    fromItem,
    toItem,
  );

  return {
    bpmShift: startBpm != null && endBpm != null && startBpm !== endBpm,
    relation: keyRelation(startKey, endKey),
  };
}

/**
 * Where this song itself was set, rather than where the song before it was.
 *
 * The mix in lands on this song and the mix out leaves from it. An ending that
 * only repeats the start was copied forward from the song before — an empty end
 * is filled in from the start — so it is not this song being moved. Reading that
 * copy as this song's key or tempo flagged the next track whenever the one
 * before it was set.
 */
function valuePlayedAt(landed, began, leaves, same) {
  const copiedFromStart = landed != null && began != null && same(landed, began);
  if (copiedFromStart) return leaves ?? null;
  return landed ?? leaves ?? null;
}

/**
 * What each song in the running order is being played at, slot by slot.
 *
 * The mix in lands on a song and the mix out leaves from it. Pitched means the
 * key on the way in or the way out is a different key from the one the song
 * sits in. Tempo is how fast that mix is running, so a different tempo leaves
 * the flag alone.
 */
export function playedByItem(items, junctions) {
  const played = new Map();

  for (const [index, item] of items.entries()) {
    if (item.kind !== TRACK) continue;
    // Nothing joins two songs across a gap, so these lookups simply miss there.
    const into = junctions.get(junctionKey(items[index - 1]?.id, item.id));
    const outOf = junctions.get(junctionKey(item.id, items[index + 1]?.id));

    // A landing that only repeats the start was copied from the song before.
    const landedKey = into?.end_key ?? null;
    const beganKey = into?.start_key ?? null;
    const leavesKey = outOf?.start_key ?? null;
    const landedKeyCounts = Boolean(landedKey) && landedKey !== beganKey;
    const pitchedFromIn = Boolean(
      item.default_key && landedKeyCounts && landedKey !== item.default_key,
    );
    const pitchedFromOut = Boolean(
      item.default_key && leavesKey && leavesKey !== item.default_key,
    );
    const pitchedKey = pitchedFromIn || pitchedFromOut;
    const key = pitchedFromIn
      ? landedKey
      : pitchedFromOut
        ? leavesKey
        : landedKeyCounts
          ? landedKey
          : leavesKey;
    const bpm = valuePlayedAt(
      into?.end_bpm ?? null,
      into?.start_bpm ?? null,
      outOf?.start_bpm ?? null,
      sameBpm,
    );

    played.set(item.id, {
      key: key ?? item.default_key ?? null,
      bpm: bpm ?? item.default_bpm ?? null,
      pitchedKey,
      pitched: pitchedKey,
    });
  }

  return played;
}

/** The key a song sits in, for saying what it is being pitched off. */
export function sitsAt(item, played) {
  return played.pitchedKey ? keyLabel(item.default_key) : '';
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
