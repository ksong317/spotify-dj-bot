import { Fragment } from 'react';

import { formatArtists } from '../../api.js';
import { keyLabel } from '../../camelot.js';
import { BREAK, buildGroups, formatBpm, junctionKey, trackOf } from '../../setlist.js';
import KeyDot from './KeyDot.jsx';
import MixSummary from './MixSummary.jsx';

function SongDefaults({ item }) {
  if (!item.default_key && item.default_bpm == null) return null;
  return (
    <span className="perform__own" title="The key and tempo the song sits at">
      <KeyDot code={item.default_key} />
      {[
        item.default_key ? keyLabel(item.default_key) : null,
        item.default_bpm == null ? null : `${formatBpm(item.default_bpm)} BPM`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

/**
 * The set list as it is read mid-set: nothing to edit, notes large enough to
 * catch at a glance, and the whole running order free to scroll.
 */
export default function PerformanceView({ detail, junctions, numbers }) {
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
                    <SongDefaults item={item} />
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
