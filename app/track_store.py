"""Durable store of Spotify track metadata.

Every track detail the app shows comes from Spotify, so without a local copy a
throttled or unreachable Spotify API takes the whole UI down. Anything Spotify
hands back is written here and read again on later requests.

Custom songs — ones that are not on Spotify — live here too. Their IDs start
with `c.` so they can never be mistaken for a Spotify ID and never get sent
to Spotify for lookup.
"""
from uuid import uuid4

from app.database import SessionLocal
from app.models import Track
from app.schemas import TrackSummary

# Spotify IDs are 22 characters of base62. A leading "c." is not that, and
# still fits the existing VARCHAR(22) columns, so nothing else has to widen.
CUSTOM_PREFIX = "c."


def is_custom(track_id: str) -> bool:
    return track_id.startswith(CUSTOM_PREFIX)


def new_custom_id() -> str:
    return CUSTOM_PREFIX + uuid4().hex[:20]


def _to_summary(track: Track) -> TrackSummary:
    return TrackSummary(
        id=track.id,
        name=track.name,
        artists=list(track.artists),
        album=track.album,
        album_art_url=track.album_art_url,
        preview_url=track.preview_url,
        external_url=track.external_url,
        custom=is_custom(track.id),
    )


def load(track_ids: list[str]) -> dict[str, TrackSummary]:
    if not track_ids:
        return {}
    with SessionLocal() as session:
        rows = session.query(Track).filter(Track.id.in_(track_ids)).all()
        return {row.id: _to_summary(row) for row in rows}


def save(summaries: list[TrackSummary]) -> None:
    if not summaries:
        return
    with SessionLocal() as session:
        existing = {
            row.id: row
            for row in session.query(Track)
            .filter(Track.id.in_([summary.id for summary in summaries]))
            .all()
        }
        for summary in summaries:
            row = existing.get(summary.id)
            if row is None:
                session.add(
                    Track(
                        id=summary.id,
                        name=summary.name,
                        artists=list(summary.artists),
                        album=summary.album,
                        album_art_url=summary.album_art_url,
                        preview_url=summary.preview_url,
                        external_url=summary.external_url,
                    )
                )
                continue
            # Refresh artwork and titles only. A song's own key and tempo are
            # typed in by hand and must survive every metadata write — search
            # itself used to wipe them via merge().
            row.name = summary.name
            row.artists = list(summary.artists)
            row.album = summary.album
            row.album_art_url = summary.album_art_url
            row.preview_url = summary.preview_url
            row.external_url = summary.external_url
        session.commit()


def create_custom(
    *,
    name: str,
    artists: list[str],
    default_key: str | None,
    default_bpm: float | None,
) -> Track:
    """A song that exists only here, with no Spotify row to hang off."""
    with SessionLocal() as session:
        track_id = new_custom_id()
        while session.get(Track, track_id) is not None:
            track_id = new_custom_id()
        track = Track(
            id=track_id,
            name=name,
            artists=list(artists),
            album="",
            album_art_url=None,
            preview_url=None,
            external_url="",
            default_key=default_key,
            default_bpm=default_bpm,
        )
        session.add(track)
        session.commit()
        session.refresh(track)
        return track
