"""Recover track metadata without the throttled ID-lookup endpoints.

Spotify rate limits `/v1/tracks` and `/v1/albums` separately from `/v1/search`, and the
public oEmbed endpoint needs no auth or quota at all. Those two together give a path
from a bare track ID back to full metadata while ID lookups are being refused: oEmbed
names the track, search finds candidates by that name, and the ID must match exactly
before the result is trusted.
"""
import json
import urllib.error
import urllib.request

from app.schemas import TrackSummary
from app.spotify import search_tracks

OEMBED_URL = "https://open.spotify.com/oembed?url=https://open.spotify.com/track/{}"
OEMBED_TIMEOUT_SECONDS = 15
# Spotify rejects larger limits for this app's credentials with "Invalid limit".
SEARCH_LIMIT = 10
# Generic titles ("ten", "After Hours") bury the wanted track under popular ones, so
# keep paging rather than giving up on the first page.
MAX_SEARCH_RESULTS = 200


def fetch_title(track_id: str) -> str | None:
    """The track's display title according to Spotify's public embed metadata."""
    try:
        with urllib.request.urlopen(
            OEMBED_URL.format(track_id), timeout=OEMBED_TIMEOUT_SECONDS
        ) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None

    title = payload.get("title")
    return title.strip() if isinstance(title, str) and title.strip() else None


def recover(track_id: str) -> TrackSummary | None:
    """Metadata for `track_id`, or None if it could not be identified.

    Lets SpotifyUnavailableError propagate: if search itself is throttled then every
    later call fails the same way, so the caller should stop rather than grind through.
    """
    title = fetch_title(track_id)
    if not title:
        return None

    for offset in range(0, MAX_SEARCH_RESULTS, SEARCH_LIMIT):
        # search_tracks writes everything it returns to the track store, so a match here
        # is already persisted. Titles are far from unique, so only an exact ID matches.
        candidates = search_tracks(title, limit=SEARCH_LIMIT, offset=offset)
        if not candidates:
            return None
        match = next((track for track in candidates if track.id == track_id), None)
        if match is not None:
            return match
    return None
