import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  createCustomTrack,
  fetchTrackInfo,
  formatArtists,
  saveTrackDefaults,
  searchTrackInfo,
} from '../api.js';
import { keyLabel, keyName, normalizeKey, transposeKey } from '../camelot.js';
import KeyDot from '../components/setlist/KeyDot.jsx';
import { formatBpm } from '../setlist.js';

const DEBOUNCE_MS = 300;
const MIN_BPM = 20;
const MAX_BPM = 400;
const RECENT_LIMIT = 8;

/** What a saved song reads as in a tag: "8B / C major · 128 BPM". */
function describe(info) {
  const parts = [
    info.default_key ? keyLabel(info.default_key) : null,
    info.default_bpm == null ? null : `${formatBpm(info.default_bpm)} BPM`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Where a song's own key and tempo get typed in, one song after another.
 *
 * Built to be driven from the keyboard without pause: search, Enter to take a
 * song, then Tab from key to BPM to Save. Everything in between — the results,
 * the song you have taken — stays out of the tab order, so those three are the
 * only stops Tab makes. A song you have filled in before comes back with what
 * you typed last time already in the boxes.
 */
export default function TrackInfoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState({ loading: false, error: null });
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [artistsText, setArtistsText] = useState('');
  const [keyText, setKeyText] = useState('');
  const [bpmText, setBpmText] = useState('');
  // A half-typed key is not a wrong key: the boxes only object once moved on from.
  const [moved, setMoved] = useState(false);
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);

  const pickerRef = useRef(null);
  const searchRef = useRef(null);
  const titleRef = useRef(null);
  const artistsRef = useRef(null);
  const keyRef = useRef(null);
  const bpmRef = useRef(null);
  const saveRef = useRef(null);

  /** Take a song into the boxes, with whatever was typed for it last time. */
  function take(info) {
    setCreating(false);
    setChosen(info);
    setTitleText('');
    setArtistsText('');
    setKeyText(info.default_key ?? '');
    setBpmText(formatBpm(info.default_bpm));
    setMoved(false);
    setQuery('');
    setResults([]);
    setOpen(false);
    setProblem(null);
    setSaved(null);
  }

  function startCustom(title = '') {
    setCreating(true);
    setChosen(null);
    setTitleText(title);
    setArtistsText('');
    setKeyText('');
    setBpmText('');
    setMoved(false);
    setQuery('');
    setResults([]);
    setOpen(false);
    setProblem(null);
    setSaved(null);
  }

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Taking a song lands in the key box with the old value selected: typing
  // replaces it, Tab moves on, and nothing ever has to be cleared by hand.
  useEffect(() => {
    if (chosen) keyRef.current?.select();
  }, [chosen]);

  useEffect(() => {
    if (!creating) return;
    const target = titleText.trim() ? artistsRef.current : titleRef.current;
    target?.focus();
    target?.select();
    // Only when the custom form opens; titleText is read once on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating]);

  // A song can be named in the URL, the way /graph names the song it centres on.
  const linkedSongId = searchParams.get('song');
  useEffect(() => {
    if (!linkedSongId) return undefined;
    const controller = new AbortController();
    fetchTrackInfo(linkedSongId, { signal: controller.signal })
      .then(take)
      .catch((error) => {
        if (error.name !== 'AbortError') setProblem(error.message);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedSongId]);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setSearch({ loading: false, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setSearch({ loading: true, error: null });
    const timer = setTimeout(() => {
      searchTrackInfo(trimmed, { signal: controller.signal })
        .then((data) => {
          setResults(data);
          setHighlight(0);
          setSearch({ loading: false, error: null });
        })
        .catch((error) => {
          if (error.name === 'AbortError') return;
          setResults([]);
          setSearch({ loading: false, error: error.message });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  function backToSearch() {
    setChosen(null);
    setCreating(false);
    setTitleText('');
    setArtistsText('');
    setKeyText('');
    setBpmText('');
    setMoved(false);
    setProblem(null);
    if (linkedSongId) setSearchParams({}, { replace: true });
    searchRef.current?.focus();
  }

  /** Tab stays inside the form. Search results and the rest of the page are out. */
  function handleCycleTab(event) {
    if (event.key !== 'Tab') return;
    const stops = (
      creating
        ? [titleRef.current, artistsRef.current, keyRef.current, bpmRef.current, saveRef.current]
        : [keyRef.current, bpmRef.current, saveRef.current]
    ).filter((element) => element && !element.disabled);
    if (stops.length < 2) return;
    const index = stops.indexOf(event.currentTarget);
    if (index < 0) return;
    event.preventDefault();
    const next = event.shiftKey
      ? stops[(index - 1 + stops.length) % stops.length]
      : stops[(index + 1) % stops.length];
    next.focus();
    next.select?.();
  }

  function handleSearchKeyDown(event) {
    if (event.key === 'Escape') {
      setQuery('');
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((index) => (index + step + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter') {
      // Never a form submission: in this box Enter means "take this song".
      event.preventDefault();
      if (results[highlight]) take(results[highlight]);
    }
  }

  const typedKey = normalizeKey(keyText);
  const keyIsNonsense = Boolean(keyText.trim()) && !typedKey;
  const bpmTyped = bpmText.trim();
  const bpmValue = bpmTyped ? Number(bpmTyped) : null;
  const bpmIsNonsense =
    bpmValue != null &&
    (!Number.isFinite(bpmValue) || bpmValue < MIN_BPM || bpmValue > MAX_BPM);

  function stepKey(semitones) {
    const from = typedKey ?? chosen?.default_key;
    if (!from) return;
    setKeyText(transposeKey(from, semitones));
    setProblem(null);
  }

  function stepBpm(delta) {
    const from = bpmTyped ? bpmValue : chosen?.default_bpm;
    if (from == null || !Number.isFinite(from)) return;
    setBpmText(formatBpm(Math.round((from + delta) * 100) / 100));
    setProblem(null);
  }

  const identityReady = creating
    ? Boolean(titleText.trim() && artistsText.trim())
    : Boolean(chosen);
  const canSave =
    identityReady &&
    !saving &&
    !keyIsNonsense &&
    !bpmIsNonsense &&
    // Blanking both boxes is how a song's key and tempo come off again, which is
    // only worth a request when it had some to begin with. A custom song can be
    // created with just a title and artists.
    (creating || Boolean(typedKey) || bpmValue != null || Boolean(chosen?.saved));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!identityReady || saving) return;
    if (keyIsNonsense || bpmIsNonsense) {
      setMoved(true);
      if (keyIsNonsense) keyRef.current?.select();
      return;
    }

    setSaving(true);
    setProblem(null);
    try {
      const stored = creating
        ? await createCustomTrack({
            name: titleText.trim(),
            artists: artistsText.trim(),
            default_key: typedKey,
            default_bpm: bpmValue,
          })
        : await (async () => {
            const response = await saveTrackDefaults(chosen.track.id, {
              default_key: typedKey,
              default_bpm: bpmValue,
            });
            return {
              track: chosen.track,
              default_key: response.default_key,
              default_bpm: response.default_bpm,
              saved: Boolean(response.default_key) || response.default_bpm != null,
            };
          })();
      setRecent((previous) =>
        [stored, ...previous.filter((item) => item.track.id !== stored.track.id)].slice(
          0,
          RECENT_LIMIT,
        ),
      );
      setSaved(stored);
      // Straight back to the search box: the next song is the next thing to do.
      backToSearch();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSaving(false);
    }
  }

  const keyWrong = keyIsNonsense && moved;
  const bpmWrong = bpmIsNonsense && moved;
  const keyReading = typedKey
    ? keyName(typedKey)
    : keyWrong
      ? 'not a key'
      : 'Camelot code or key name';
  const showResults = open && Boolean(trimmed);

  return (
    <div className="page page--scroll">
      <header className="page__header">
        <div>
          <h1>Track info</h1>
          <p className="page__subtitle">
            The key and tempo a song sits at, for every set list it turns up in.
          </p>
        </div>
        <nav className="page__nav">
          <a className="page__link" href="/">
            Library
          </a>
          <Link className="page__link" to="/graph">
            Graph
          </Link>
          <Link className="page__link" to="/setlists">
            Set lists
          </Link>
        </nav>
      </header>

      <div className="trackinfo">
        <div className="trackinfo__search">
          <div className="picker" ref={pickerRef}>
            <input
              ref={searchRef}
              className="picker__input"
              type="text"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="trackinfo-results"
              autoComplete="off"
              placeholder="Search Spotify for a song…"
              tabIndex={chosen || creating ? -1 : 0}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleSearchKeyDown}
            />

            {showResults ? (
              <div className="picker__dropdown" id="trackinfo-results" role="listbox">
                {search.loading ? <p className="picker__hint">Looking…</p> : null}
                {search.error ? <p className="picker__error">{search.error}</p> : null}
                {!search.loading && !search.error && results.length === 0 ? (
                  <>
                    <p className="picker__hint">Nothing on Spotify matches that.</p>
                    <button
                      type="button"
                      className="picker__option"
                      tabIndex={-1}
                      onClick={() => startCustom(trimmed)}
                    >
                      <span className="picker__art picker__art--empty" />
                      <span className="picker__labels">
                        <span className="picker__title">Create “{trimmed}”</span>
                        <span className="picker__artist">Custom song, not on Spotify</span>
                      </span>
                    </button>
                  </>
                ) : null}

                {results.map((info, index) => (
                  <button
                    key={info.track.id}
                    type="button"
                    role="option"
                    // Out of the tab order on purpose: Tab belongs to the form,
                    // and the arrow keys pick from this list.
                    tabIndex={-1}
                    aria-selected={index === highlight}
                    className={
                      index === highlight ? 'picker__option is-active' : 'picker__option'
                    }
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => take(info)}
                  >
                    {info.track.album_art_url ? (
                      <img className="picker__art" src={info.track.album_art_url} alt="" />
                    ) : (
                      <span className="picker__art picker__art--empty" />
                    )}
                    <span className="picker__labels">
                      <span className="picker__title">{info.track.name}</span>
                      <span className="picker__artist">{formatArtists(info.track)}</span>
                    </span>
                    {info.track.custom || info.saved ? (
                      <span className="picker__tag">
                        {info.track.custom ? 'custom' : null}
                        {info.track.custom && info.saved ? ' · ' : null}
                        {info.saved ? (
                          <>
                            <KeyDot code={info.default_key} />
                            {describe(info)}
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {chosen || creating ? null : (
            <button
              type="button"
              className="button button--quiet"
              tabIndex={-1}
              onClick={() => startCustom(trimmed)}
            >
              Custom song
            </button>
          )}
        </div>

        {creating || chosen ? (
          <div className="trackinfo__card">
            {creating ? (
              <p className="trackinfo__custom-label">Custom song — not on Spotify</p>
            ) : (
              <div className="trackinfo__chosen">
                {chosen.track.album_art_url ? (
                  <img className="trackinfo__art" src={chosen.track.album_art_url} alt="" />
                ) : (
                  <span className="trackinfo__art picker__art--empty" />
                )}
                <span className="picker__labels">
                  <span className="trackinfo__name">{chosen.track.name}</span>
                  <span className="picker__artist">
                    {formatArtists(chosen.track)}
                    {chosen.track.album ? ` · ${chosen.track.album}` : ''}
                    {chosen.track.custom ? ' · custom' : ''}
                  </span>
                </span>
                {chosen.saved ? (
                  <span className="picker__tag">as you had it: {describe(chosen)}</span>
                ) : chosen.track.custom ? (
                  <span className="picker__tag">custom</span>
                ) : null}
              </div>
            )}

            <form className="trackinfo__form" onSubmit={handleSubmit}>
              {creating ? (
                <div className="trackinfo__identity">
                  <label className="trackinfo__field trackinfo__field--stack">
                    <span className="trackinfo__label">Title</span>
                    <input
                      ref={titleRef}
                      className="picker__input"
                      value={titleText}
                      placeholder="Song title"
                      autoComplete="off"
                      disabled={saving}
                      onChange={(event) => {
                        setTitleText(event.target.value);
                        setProblem(null);
                      }}
                      onKeyDown={(event) => {
                        handleCycleTab(event);
                        if (event.key === 'Escape') backToSearch();
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          artistsRef.current?.focus();
                        }
                      }}
                    />
                  </label>
                  <label className="trackinfo__field trackinfo__field--stack">
                    <span className="trackinfo__label">Artists</span>
                    <input
                      ref={artistsRef}
                      className="picker__input"
                      value={artistsText}
                      placeholder="Artist, another artist"
                      autoComplete="off"
                      disabled={saving}
                      onChange={(event) => {
                        setArtistsText(event.target.value);
                        setProblem(null);
                      }}
                      onKeyDown={(event) => {
                        handleCycleTab(event);
                        if (event.key === 'Escape') backToSearch();
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          keyRef.current?.focus();
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <label className="trackinfo__field">
                <span className="trackinfo__label">Key</span>
                <input
                  ref={keyRef}
                  className="keybpm__input"
                  value={keyText}
                  placeholder="8B"
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={keyWrong}
                  onChange={(event) => {
                    setKeyText(event.target.value);
                    setMoved(false);
                    setProblem(null);
                  }}
                  onBlur={() => {
                    setMoved(true);
                    if (typedKey) setKeyText(typedKey);
                  }}
                  onKeyDown={(event) => {
                    handleCycleTab(event);
                    if (event.key === 'Escape') backToSearch();
                    // Enter would otherwise save, which a disabled Save silently
                    // refuses to do; say why instead.
                    if (event.key === 'Enter') setMoved(true);
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      stepKey(1);
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      stepKey(-1);
                    }
                  }}
                />
                <span
                  className={
                    keyWrong ? 'trackinfo__reading is-wrong' : 'trackinfo__reading'
                  }
                >
                  <KeyDot code={typedKey} />
                  {keyReading}
                </span>
              </label>

              <label className="trackinfo__field">
                <span className="trackinfo__label">BPM</span>
                <input
                  ref={bpmRef}
                  className="keybpm__input"
                  value={bpmText}
                  placeholder="128"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={bpmWrong}
                  onChange={(event) => {
                    setBpmText(event.target.value);
                    setMoved(false);
                    setProblem(null);
                  }}
                  onBlur={() => setMoved(true)}
                  onKeyDown={(event) => {
                    handleCycleTab(event);
                    if (event.key === 'Escape') backToSearch();
                    if (event.key === 'Enter') setMoved(true);
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      stepBpm(1);
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      stepBpm(-1);
                    }
                  }}
                />
                {bpmWrong ? (
                  <span className="trackinfo__reading is-wrong">
                    between {MIN_BPM} and {MAX_BPM}
                  </span>
                ) : null}
              </label>

              <button
                ref={saveRef}
                type="submit"
                className="button"
                disabled={!canSave}
                onKeyDown={handleCycleTab}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              {chosen?.track.external_url ? (
                <a
                  className="page__link"
                  href={chosen.track.external_url}
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={-1}
                >
                  Spotify ↗
                </a>
              ) : null}
            </form>

            {problem ? <p className="picker__error">{problem}</p> : null}

            <p className="trackinfo__keys">
              {creating
                ? 'Tab from title to artists to key to BPM to Save. Esc goes back to the search.'
                : 'Tab from key to BPM to Save, then Enter. Arrow keys nudge either box a step; Esc goes back to the search.'}
            </p>
          </div>
        ) : (
          <p className="picker__hint trackinfo__empty">
            {saved ? (
              <>
                Saved <strong>{saved.track.name}</strong> —{' '}
                {describe(saved) || 'key and tempo cleared'}. Search for the next song.
              </>
            ) : (
              'Search a song and press Enter to take it, then Tab from key to BPM to Save. Custom song is for anything that is not on Spotify.'
            )}
          </p>
        )}

        {recent.length ? (
          <div className="trackinfo__recent">
            <p className="trackinfo__label">Saved just now</p>
            <ul className="trackinfo__list">
              {recent.map((info) => (
                <li key={info.track.id}>
                  <button
                    type="button"
                    className="trackinfo__again"
                    title="Put this song back in the boxes"
                    tabIndex={-1}
                    onClick={() => take(info)}
                  >
                    <span className="picker__labels">
                      <span className="picker__title">{info.track.name}</span>
                      <span className="picker__artist">{formatArtists(info.track)}</span>
                    </span>
                    <span className="picker__tag">
                      {info.track.custom ? 'custom' : null}
                      {info.track.custom && describe(info) ? ' · ' : null}
                      {describe(info) ? (
                        <>
                          <KeyDot code={info.default_key} />
                          {describe(info)}
                        </>
                      ) : info.track.custom ? null : (
                        'cleared'
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
