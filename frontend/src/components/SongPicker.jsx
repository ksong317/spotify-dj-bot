import { useEffect, useMemo, useRef, useState } from 'react';

import { formatArtists, searchSpotify } from '../api.js';

const MAX_RESULTS = 8;

export default function SongPicker({ songs, loading, error, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [remote, setRemote] = useState({ status: 'idle', results: [], error: null });
  const containerRef = useRef(null);

  useEffect(() => {
    setRemote({ status: 'idle', results: [], error: null });
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const trimmed = query.trim();

  const options = useMemo(() => {
    const needle = trimmed.toLowerCase();
    const local = (needle
      ? songs.filter((song) =>
          `${song.name} ${formatArtists(song)}`.toLowerCase().includes(needle),
        )
      : songs
    )
      .slice(0, MAX_RESULTS)
      .map((track) => ({ track, known: true }));

    const seen = new Set(local.map((option) => option.track.id));
    const external = remote.results
      .filter((track) => !seen.has(track.id))
      .slice(0, MAX_RESULTS)
      .map((track) => ({ track, known: false }));

    return [...local, ...external];
  }, [songs, trimmed, remote.results]);

  useEffect(() => {
    setHighlight(0);
  }, [options.length]);

  async function runSpotifySearch() {
    if (!trimmed) return;
    setRemote({ status: 'loading', results: [], error: null });
    try {
      const results = await searchSpotify(trimmed);
      setRemote({ status: 'done', results, error: null });
    } catch (searchError) {
      setRemote({ status: 'error', results: [], error: searchError.message });
    }
  }

  function choose(track) {
    setQuery('');
    setOpen(false);
    setRemote({ status: 'idle', results: [], error: null });
    onSelect(track);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (!options.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((index) => (index + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (options[highlight]) {
        choose(options[highlight].track);
      } else if (trimmed) {
        runSpotifySearch();
      }
    }
  }

  const showDropdown = open && !loading && !error;

  return (
    <div className="picker" ref={containerRef}>
      <input
        className="picker__input"
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="picker-listbox"
        autoComplete="off"
        placeholder={
          loading ? 'Loading your songs…' : 'Search your songs by title or artist…'
        }
        value={query}
        disabled={loading || Boolean(error)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {error ? <p className="picker__error">{error}</p> : null}

      {showDropdown ? (
        <div className="picker__dropdown" id="picker-listbox" role="listbox">
          {options.length === 0 ? (
            <p className="picker__empty">
              {songs.length === 0
                ? 'No transitions logged yet. Add one on the main page first.'
                : 'Nothing in your transitions matches that.'}
            </p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.track.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={
                  index === highlight ? 'picker__option is-active' : 'picker__option'
                }
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option.track)}
              >
                {option.track.album_art_url ? (
                  <img className="picker__art" src={option.track.album_art_url} alt="" />
                ) : (
                  <span className="picker__art picker__art--empty" />
                )}
                <span className="picker__labels">
                  <span className="picker__title">{option.track.name}</span>
                  <span className="picker__artist">{formatArtists(option.track)}</span>
                </span>
                {option.known ? null : <span className="picker__tag">no transitions</span>}
              </button>
            ))
          )}

          <div className="picker__footer">
            {remote.status === 'error' ? (
              <span className="picker__error">{remote.error}</span>
            ) : (
              <button
                type="button"
                className="picker__wider"
                disabled={!trimmed || remote.status === 'loading'}
                onClick={runSpotifySearch}
              >
                {remote.status === 'loading'
                  ? 'Searching Spotify…'
                  : 'Search all of Spotify'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
