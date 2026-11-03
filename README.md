# Crossfade

A personal database for DJ transitions — remember the mixes you discover. Store directional transitions (song A → song B) with notes, identified by Spotify track IDs. Then build gigs out of them: see [Set lists](#set-lists).

## Setup

1. **Spotify API credentials** — Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Client credentials flow is used (no user login required for search/track lookup).

2. **Environment variables** — Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. **Install dependencies**:
   ```bash
   make install
   ```

4. **Start PostgreSQL**:
   ```bash
   docker compose up -d
   ```

5. **Build the graph, set list and track info views** (needs Node 18+, one time and after any change under `frontend/`):
   ```bash
   make ui
   ```

6. **Run the app**:
   ```bash
   uvicorn app.main:app --reload
   ```

7. Open [http://localhost:8000](http://localhost:8000)

## Usage

- **Add a transition** — Search Spotify for starting and ending songs, add optional notes (key changes, cue points, etc.), and save.
- **Browse transitions** — View all stored transitions with album art and artist info fetched from Spotify.
- **Filter by song** — Search for a song in the browse panel to see all transitions that include it (as either the starting or ending track).
- **Set a song's key and tempo** — Type in the key and BPM a song sits at, which every set list then falls back to. See [Track info](#track-info).
- **Build a set list** — Turn what you have logged into a running order for a gig, then read it back mid-set. See [Set lists](#set-lists).

Transitions are directional (A→B), but can be marked bidirectional when the mix works both ways.

## Graph view

[http://localhost:8000/graph](http://localhost:8000/graph) is a focused (ego) graph for exploring what you have already logged. Pick a song and it becomes the center node, surrounded by every song one hop away — following transitions both into and out of it. Hover an edge to preview its notes, click to pin them in the side panel, and click any neighbor to re-center the graph on that song. Breadcrumbs track where you have been, and the current song is kept in the URL (`/graph?song=<track_id>`) so a view can be reloaded or bookmarked.

**Show** switches between one hop, two hops, and the whole connected chain. Each hop
distance gets its own ring around the center, so how far a song sits from the middle
is how many transitions away it is.

A song whose Spotify metadata has not loaded still appears, as a dashed
"Details unavailable" node, so the shape of the graph stays honest. Those nodes cannot
be centered; run `make warm-cache` to fill them in.

## Track info

[http://localhost:8000/tracks](http://localhost:8000/tracks) is where a song's own key
and tempo get typed in. Spotify closed its audio-features endpoint to apps like this
one, so this is the only place either comes from, and everything else reads them back:
a mix in a set list judges itself as soon as both its songs have a key.

The page is built to be worked straight through from the keyboard, a stack of songs in
one sitting. Search, **Enter** takes the highlighted song, and from there **Tab** goes
key, BPM, **Save** — three stops, with the results and the song itself kept out of the
tab order so Tab never lands anywhere else. Saving puts the cursor back in the search
box for the next song.

- **Songs you have already filled in** — Search one and it comes back with what you
  typed last time already in the boxes. Those songs also sort above the Spotify
  results, so going back to correct one is never a matter of finding it in the
  catalogue again.
- **What the boxes take** — The key box takes a Camelot code or a key name (`8B`,
  `C major`, `Ebm`), and the arrow keys move either box by a step: a half step for the
  key, which is seven places around the wheel, and one BPM for the tempo. Emptying both
  boxes takes the song's key and tempo off again.
- **Saved just now** — Everything saved since the page loaded stays listed below it.
  Click one to put it back in the boxes and correct it.
- **Custom songs** — **Custom song** is for anything that is not on Spotify. Title and
  artists, then the same key and BPM boxes; there is no cover art unless you add it
  later. Searching that title later brings it back like any other song you have filled
  in. Tab goes title, artists, key, BPM, **Save**.

`/tracks?song=<track_id>` opens with that song already taken, the way `/graph?song=`
centres the graph on one.

A set list can set a song's key and tempo without leaving it — that is what **Make
default** does on any mix — but filling in more than a song or two belongs here.

## Set lists

[http://localhost:8000/setlists](http://localhost:8000/setlists) is where a gig gets
built. A set list is a running order of slots; the same song can fill as many slots as
you like, and wherever two songs end up next to each other, any transition you have
logged for that pair shows up between them with its notes.

Each set list has two modes, kept in the URL so either can be bookmarked:

**Edit** (`/setlists/<id>`) is for building.

- **Adding songs** — Every song has **Add before** and **Add after**, so a song can go
  anywhere, the top of the set and the start of a part included. **Add a song** at the
  bottom appends to the end.
- **Parts and gaps** — A gap splits the running order into parts, which is how you
  build two halves of a set separately before deciding what order they go in. **Split**
  opens a gap after a song, **Join** closes one again.
- **Rearranging** — Drag a song by its handle to move it anywhere, across parts
  included. Drag a *part* by the handle on its header to move the whole block: parts
  trade places and the gaps stay where they are, so the halves of a set stay apart.
- **Key and BPM** — Set where a mix starts and where it lands, per set list. The box
  takes a Camelot code or a key name (`8B`, `C major`, `Ebm`) and the arrows move it by
  a half step, which is seven places around the wheel: 1B up one is 8B. **Default**
  fills in the song's own key and tempo; **Make default** saves what you typed as the
  song's own, for every set list. An ending you never set mirrors the start.
- **Core tracks** — The songs this set has to include. Whatever is still missing sorts
  to the top, since that is the part there is anything to do about; below that they sit
  either in key order or in an order you drag them into.
- **Set keys** — Off until you turn it on, so the editor stays as it was. On the core
  list it is a pass for typing each song's own key and tempo — the same values the
  [Track info](#track-info) page writes — without leaving the set. Songs that still
  need a key sit at the top; **Tab** walks key, BPM, next song, and **Enter** saves
  and jumps to the next blank one. A song that already has values comes back with
  them loaded, and skipping a row leaves them alone. Kept in the URL as
  `?fill=keys`.
- **Next song** — Adding a song below another one offers what you have already mixed
  out of it, then anything in a key that fits where the mix lands. Nothing is offered
  at the start of a part, since no mix reaches back across a gap. Start typing and
  your own library comes first — transitions you have logged ahead of everything, notes
  and all — then Spotify. "Your library" means songs on a transition, in a set list, or
  carrying a key you typed in; a song is not yours just because it once went past in a
  search box, even though its details are kept (see
  [Track metadata and Spotify limits](#track-metadata-and-spotify-limits)).

**Perform** (`/setlists/<id>?mode=perform`) is for playing. Nothing can be edited,
notes are set in type big enough to read at a glance, and each mix shows the key and
tempo it starts and ends at. Core tracks are hidden.

Every song carries the key and tempo it is actually played at, which the mixes either
side of it decide: the mix in lands on it, the mix out leaves from it. It is flagged
**pitched** when the key on the way in or the way out is a different key from the
one the song sits in, with that home key written out beside it. The tempo shown is
the speed the mix is running at. The flag belongs to the song rather than to a mix,
because a song pitched up stays pitched up for as long as it plays, whichever mix you
reach it by. In edit mode the song's key chip turns, so you can see the key is off.

One flag does stay on the mix: **tempo change**, when a mix does not land at the tempo
it began at — the mark of a cut rather than a blend.

### Key colours

Keys carry a colour whose hue follows the key's place on the wheel, so one step around
the wheel is one step around the colour circle: keys that mix together look alike, and
a clash looks plainly out of place. A minor key and its relative major share a hue and
differ only in weight, because they are the same place on the wheel. The colour is only
ever a dot beside the key written out, never the key itself — twenty four hues is well
past what anyone can tell apart, and the point is to be able to see a *relationship*
without reading.

The arrow on every mix says what that relationship is: green when the two keys hold
together, with **same key**, **energy up**, **energy down** or **mood switch** naming
which, and red with **keys clash** when they are not neighbours on the wheel. That
reads off the keys each end actually runs at, so a seam judges itself as soon as both
songs have a key of their own — nothing has to be typed into the set list for it to
start answering. Once you do pitch a song into place, the verdict follows what you set.

A song's own key and tempo are typed in by hand. Spotify closed its audio-features
endpoint to new apps, so there is nothing to read them from. See
[Track info](#track-info) for the page built for typing them in.

### Working on the React UI

`/graph`, `/setlists` and `/tracks` are one React app in `frontend/`, built by Vite into
`app/static/ui/` (gitignored) and served by FastAPI. The graph uses
[React Flow](https://reactflow.dev/); set list dragging uses
[dnd kit](https://dndkit.com/).

```bash
make ui       # install deps and build into app/static/ui/
make ui-dev   # Vite dev server on :5173, proxies /api to :8000
```

`make ui-dev` expects the FastAPI app to already be running on port 8000.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Search Spotify tracks |
| GET | `/api/tracks/{id}` | Get track metadata |
| GET | `/api/transitions` | List all transitions |
| GET | `/api/transitions?track_id=` | List transitions involving a track |
| POST | `/api/transitions` | Create a transition |
| GET | `/api/graph/songs` | Every track appearing on at least one transition |
| GET | `/api/graph/{track_id}?depth=` | The graph around a track: center, neighbors, edges. `depth` defaults to 1; `0` walks the whole connected chain |
| GET | `/api/graph/{track_id}?include_unconnected=true` | Also returns chains that never reach the track, as neighbors with a null `depth` |
| GET | `/api/tracks/search?q=` | Search Spotify, each song carrying the key and BPM already saved for it. Songs you have filled in come first, custom songs included |
| POST | `/api/tracks/custom` | Create a song that is not on Spotify: title, artists, optional key and BPM |
| GET | `/api/tracks/{id}/info` | One song with its own key and BPM |
| PATCH | `/api/tracks/{id}/defaults` | Set a song's own key and BPM. Sending both as null takes them off again |
| GET | `/api/setlists` | List set lists |
| POST | `/api/setlists` | Create a set list |
| GET | `/api/setlists/{id}` | One set list: slots in order, the mix at every seam, core tracks |
| PATCH | `/api/setlists/{id}` | Rename a set list or change its notes |
| DELETE | `/api/setlists/{id}` | Delete a set list |
| POST | `/api/setlists/{id}/items` | Add a song or a gap, at `position` or at the end |
| DELETE | `/api/setlists/{id}/items/{item_id}` | Remove one slot |
| POST | `/api/setlists/{id}/items/reorder` | Rewrite the whole running order from a list of slot IDs |
| PUT | `/api/setlists/{id}/transitions/{from_item_id}/{to_item_id}` | Set key, BPM and set-list notes for one seam |
| GET | `/api/setlists/{id}/suggestions?after_item_id=&q=` | What could come next: logged transitions, then keys that fit, then your library and Spotify |
| POST | `/api/setlists/{id}/core-tracks` | Pin a song the set has to include |
| DELETE | `/api/setlists/{id}/core-tracks/{track_id}` | Unpin one |
| POST | `/api/setlists/{id}/core-tracks/reorder` | Rewrite the manual order of core tracks |

Every set list write answers with the whole set list, so a client never has to stitch
a response into what it already had.

Key and BPM live on the seam between two *slots*, not on the transition itself, which
is why the same pair of songs can be mixed differently in two set lists. A seam is
keyed by the two slots it joins, so moving a block of songs carries its own mixes along
and leaves the new seams blank. A song's own key and BPM are a different thing again —
one value per song, under `/api/tracks`, which every seam falls back to.

`/api/graph/{track_id}` differs from `/api/transitions?track_id=` in that it also returns
one-way transitions pointing *into* the track, which the ego graph needs to draw both
incoming and outgoing edges.

## Track metadata and Spotify limits

Only track IDs are stored on a transition, so every title, artist and cover image has
to come from Spotify. To keep the app usable when Spotify is slow, throttled or
unreachable, metadata is looked up in three stages:

1. a six-hour in-memory cache,
2. the `tracks` table in Postgres, written whenever Spotify returns something new,
3. the Spotify API, batched 50 IDs per request.

Because of step 2, songs you have already looked at keep rendering with no Spotify
call at all. It also means the `tracks` table is a cache rather than a library: every
song a search has ever returned is written to it, so most of what it holds was never
chosen by anyone. Anything asking what songs are *yours* has to say so explicitly —
see `_library_track_ids` in `app/routers/setlists.py`. If Spotify does reject a lookup, the API answers `503` with an
explanation instead of hanging — spotify's `Retry-After` on a throttled app can be
many hours long, and spotipy will sleep through it if allowed to retry.

To fetch every song referenced by a transition in one batch:

```bash
make warm-cache
```

It reports how many songs it stored and exits non-zero if any are still missing,
which normally means Spotify is rate limiting the app and it is worth re-running later.
