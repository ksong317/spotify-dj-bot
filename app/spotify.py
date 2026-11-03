"""Spotify API helpers using client credentials flow."""
from functools import lru_cache
from time import monotonic

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from app import config, track_store
from app.schemas import TrackSummary

MAX_TRACKS_PER_REQUEST = 50
REQUEST_TIMEOUT_SECONDS = 10
TRACK_CACHE_TTL_SECONDS = 6 * 60 * 60

_track_cache: dict[str, tuple[float, TrackSummary]] = {}

_UNAVAILABLE_STATUSES = frozenset({429, 500, 502, 503, 504})


class SpotifyUnavailableError(RuntimeError):
    """Spotify refused the request outright, as opposed to not knowing the track."""


@lru_cache
def get_spotify_client() -> spotipy.Spotify:
    credentials = SpotifyClientCredentials(
        client_id=config.SPOTIFY_CLIENT_ID,
        client_secret=config.SPOTIFY_CLIENT_SECRET,
    )
    # Spotify answers throttling with a Retry-After that spotipy sleeps through, and
    # that value can be hours long, so never let it retry a rejected request.
    return spotipy.Spotify(
        auth_manager=credentials,
        requests_timeout=REQUEST_TIMEOUT_SECONDS,
        retries=0,
        status_retries=0,
    )


def _raise_if_unavailable(error: spotipy.SpotifyException) -> None:
    if error.http_status in _UNAVAILABLE_STATUSES:
        raise SpotifyUnavailableError(
            "Spotify is currently rejecting requests from this app (rate limited). "
            "Songs already loaded still work; new lookups will resume once the "
            "limit resets."
        ) from error


def _cached_track(track_id: str) -> TrackSummary | None:
    entry = _track_cache.get(track_id)
    if entry is None:
        return None
    cached_at, summary = entry
    if monotonic() - cached_at > TRACK_CACHE_TTL_SECONDS:
        del _track_cache[track_id]
        return None
    return summary


def _remember(summary: TrackSummary) -> TrackSummary:
    _track_cache[summary.id] = (monotonic(), summary)
    return summary


def track_to_summary(track: dict) -> TrackSummary:
    images = track.get("album", {}).get("images", [])
    album_art_url = images[0]["url"] if images else None
    return TrackSummary(
        id=track["id"],
        name=track["name"],
        artists=[artist["name"] for artist in track.get("artists", [])],
        album=track.get("album", {}).get("name", ""),
        album_art_url=album_art_url,
        preview_url=track.get("preview_url"),
        external_url=track.get("external_urls", {}).get("spotify", ""),
    )


def search_tracks(query: str, limit: int = 10, offset: int = 0) -> list[TrackSummary]:
    if not query.strip():
        return []
    sp = get_spotify_client()
    try:
        results = sp.search(q=query, type="track", limit=limit, offset=offset)
    except spotipy.SpotifyException as error:
        _raise_if_unavailable(error)
        raise
    tracks = results.get("tracks", {}).get("items", [])
    summaries = [_remember(track_to_summary(track)) for track in tracks]
    track_store.save(summaries)
    return summaries


def get_track(track_id: str) -> TrackSummary | None:
    cached = _cached_track(track_id)
    if cached is not None:
        return cached

    stored = track_store.load([track_id]).get(track_id)
    if stored is not None:
        return _remember(stored)

    if track_store.is_custom(track_id):
        return None

    sp = get_spotify_client()
    try:
        track = sp.track(track_id)
    except spotipy.SpotifyException as error:
        _raise_if_unavailable(error)
        return None

    summary = _remember(track_to_summary(track))
    track_store.save([summary])
    return summary


def get_tracks(track_ids: list[str]) -> dict[str, TrackSummary]:
    if not track_ids:
        return {}

    tracks_by_id: dict[str, TrackSummary] = {}
    missing: list[str] = []
    for track_id in dict.fromkeys(track_ids):
        cached = _cached_track(track_id)
        if cached is None:
            missing.append(track_id)
        else:
            tracks_by_id[track_id] = cached

    if missing:
        stored = track_store.load(missing)
        for track_id, summary in stored.items():
            tracks_by_id[track_id] = _remember(summary)
        missing = [track_id for track_id in missing if track_id not in stored]
    missing = [track_id for track_id in missing if not track_store.is_custom(track_id)]
    if not missing:
        return tracks_by_id

    fetched: list[TrackSummary] = []
    sp = get_spotify_client()
    try:
        for start in range(0, len(missing), MAX_TRACKS_PER_REQUEST):
            batch = missing[start : start + MAX_TRACKS_PER_REQUEST]
            try:
                results = sp.tracks(batch).get("tracks", [])
            except spotipy.SpotifyException as error:
                _raise_if_unavailable(error)
                # A single malformed ID fails the whole batch, so retry one at a time.
                for track_id in batch:
                    track = get_track(track_id)
                    if track:
                        tracks_by_id[track.id] = track
                continue
            for track in results:
                if track:
                    summary = _remember(track_to_summary(track))
                    tracks_by_id[summary.id] = summary
                    fetched.append(summary)
    except SpotifyUnavailableError:
        # Show every track we already know rather than failing the whole view.
        pass
    finally:
        track_store.save(fetched)
    return tracks_by_id
