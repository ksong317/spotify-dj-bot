import { Fragment } from 'react';

import { formatArtists } from '../../api.js';
import { keyLabel } from '../../camelot.js';
import {
  BREAK,
  buildGroups,
  energyLevelsOf,
  formatBpm,
  formatDuration,
  junctionKey,
  sitsAt,
  trackOf,
} from '../../setlist.js';
import { EnergyTrail } from './EnergyPicker.jsx';
import KeyDot from './KeyDot.jsx';
import MixSummary from './MixSummary.jsx';

/**
 * What to set this song up at, and whether that means touching the pitch.
 *
 * Both numbers are here on purpose: mid-set the useful thing is the one to play
 * it at, with the one it sits at to work out which way the fader has to go.
 */
function SongPitch({ item, played }) {
  if (!played.key && played.bpm == null) return null;
  return (
    <span className="perform__pitch">
      <span
        className={played.pitched ? 'perform__own perform__own--pitched' : 'perform__own'}
        title={
          played.pitched
            ? 'Where this song runs in this set'
            : 'The key and tempo the song sits at'
        }
      >
        <KeyDot code={played.key} />
        {[
          played.key ? keyLabel(played.key) : null,
          played.bpm == null ? null : `${formatBpm(played.bpm)} BPM`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {played.pitched ? (
        <span className="perform__flag" title="Set the pitch before this one comes in">
          pitched from {sitsAt(item, played)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The set list as it is read mid-set: nothing to edit, notes large enough to
 * catch at a glance, and the whole running order free to scroll.
 */
export default function PerformanceView({ detail, junctions, numbers, played }) {
  const blocks = buildGroups(detail.items);

  return (
    <div className="perform">
      {detail.items.length === 0 ? (
        <p className="page__subtitle">This set list is empty.</p>
      ) : null}

      {blocks.map((block) =>
        block.kind === BREAK ? (
          <div className="perform__gap" key={block.id}>
            <span className="gap__rule" aria-hidden="true" />
            <span className="gap__label">gap</span>
            <span className="gap__rule" aria-hidden="true" />
          </div>
        ) : (
          <div className="perform__group" key={block.id}>
            <EnergyTrail levels={energyLevelsOf(block.items)} />
            {block.items.map((item, index) => {
              const previous = index > 0 ? block.items[index - 1] : null;
              const junction = previous
                ? junctions.get(junctionKey(previous.id, item.id))
                : null;
              const track = trackOf(item);

              return (
                <Fragment key={item.id}>
                  {junction ? (
                    <div className="perform__junction">
                      <MixSummary
                        junction={junction}
                        fromItem={previous}
                        toItem={item}
                        big
                      />
                      {junction.transition_notes ? (
                        <p className="perform__notes">{junction.transition_notes}</p>
                      ) : null}
                      {junction.notes ? (
                        <p className="perform__notes perform__notes--set">
                          <span className="junction__tag junction__tag--set">
                            this set
                          </span>
                          {junction.notes}
                        </p>
                      ) : null}
                      {!junction.transition_notes && !junction.notes ? (
                        <p className="perform__hint">No notes for this mix.</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="perform__slot">
                    <span className="perform__number">{numbers.get(item.id)}</span>
                    {track.album_art_url ? (
                      <img className="perform__art" src={track.album_art_url} alt="" />
                    ) : (
                      <span className="perform__art slot__art--empty" />
                    )}
                    <span className="perform__text">
                      <span className="perform__title">{track.name}</span>
                      <span className="perform__artist">{formatArtists(track)}</span>
                    </span>
                    <span className="perform__duration">
                      {formatDuration(item.duration_seconds)}
                    </span>
                    <SongPitch item={item} played={played.get(item.id)} />
                  </div>
                </Fragment>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}
