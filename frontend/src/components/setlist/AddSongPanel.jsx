import { useEffect, useRef, useState } from 'react';

import { fetchSuggestions, formatArtists } from '../../api.js';
import { keyLabel } from '../../camelot.js';
import { formatBpm } from '../../setlist.js';
import KeyDot from './KeyDot.jsx';

const DEBOUNCE_MS = 300;

const SECTIONS = {
  transition: 'Transitions you have logged',
  key: 'Fits the key',
  library: 'In your library',
  spotify: 'From Spotify',
};

/**
 * Search for a song to drop into the set list at one particular spot.
 *
 * With nothing typed it offers what you have already mixed out of the song
 * above, then anything that fits the key it lands in.
 */
export default function AddSongPanel({
  title,
  busy,
  setListId,
  afterItemId,
  onSelect,
  onCancel,
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [state, setState] = useState({ loading: true, error: null });
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const controller = new AbortController();
    setState({ loading: true, error: null });

    const timer = setTimeout(
      () => {
        fetchSuggestions(setListId, {
          afterItemId,
          query: trimmed,
          signal: controller.signal,
        })
          .then((data) => {
            setSuggestions(data);
            setState({ loading: false, error: null });
          })
          .catch((error) => {
            if (error.name === 'AbortError') return;
            setSuggestions([]);
            setState({ loading: false, error: error.message });
          });
      },
      trimmed ? DEBOUNCE_MS : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, setListId, afterItemId]);

  let lastSource = null;

  return (
    <div className="addsong">
      <div className="addsong__header">
        <span className="addsong__title">{title}</span>
        <button type="button" className="button button--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <input
        ref={inputRef}
        className="picker__input"
        type="text"
        value={query}
        placeholder="Search your library and Spotify…"
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />

      {state.error ? <p className="picker__error">{state.error}</p> : null}

      <div className="addsong__results">
        {state.loading ? <p className="picker__hint">Looking…</p> : null}

        {!state.loading && suggestions.length === 0 && !state.error ? (
          <p className="picker__hint">
            {query.trim()
              ? 'Nothing matches that, in your library or on Spotify.'
              : 'No suggestions here yet — search for a song instead.'}
          </p>
        ) : null}

        {suggestions.map((suggestion) => {
          const header = suggestion.source === lastSource ? null : (
            <p className="addsong__section">{SECTIONS[suggestion.source]}</p>
          );
          lastSource = suggestion.source;
          const track = suggestion.track;

          return (
            <div key={`${suggestion.source}-${track.id}`}>
              {header}
              <button
                type="button"
                className="picker__option"
                disabled={busy}
                onClick={() => onSelect(track)}
              >
                {track.album_art_url ? (
                  <img className="picker__art" src={track.album_art_url} alt="" />
                ) : (
                  <span className="picker__art picker__art--empty" />
                )}
                <span className="picker__labels">
                  <span className="picker__title">{track.name}</span>
                  <span className="picker__artist">{formatArtists(track)}</span>
                  {suggestion.transition_notes ? (
                    <span className="addsong__notes">{suggestion.transition_notes}</span>
                  ) : null}
                </span>
                <span className="addsong__tags">
                  {suggestion.source === 'key' ? (
                    <span className="picker__tag">{suggestion.reason}</span>
                  ) : null}
                  {suggestion.default_key ? (
                    <span className="picker__tag">
                      <KeyDot code={suggestion.default_key} />
                      {keyLabel(suggestion.default_key)}
                    </span>
                  ) : null}
                  {suggestion.default_bpm == null ? null : (
                    <span className="picker__tag">
                      {formatBpm(suggestion.default_bpm)}
                    </span>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
