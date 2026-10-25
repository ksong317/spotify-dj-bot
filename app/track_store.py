"""Durable store of Spotify track metadata.

Every track detail the app shows comes from Spotify, so without a local copy a
throttled or unreachable Spotify API takes the whole UI down. Anything Spotify
hands back is written here and read again on later requests.
"""
from app.database import SessionLocal
from app.models import Track
from app.schemas import TrackSummary


def _to_summary(track: Track) -> TrackSummary:
    return TrackSummary(
        id=track.id,
        name=track.name,
        artists=list(track.artists),
        album=track.album,
        album_art_url=track.album_art_url,
        preview_url=track.preview_url,
        external_url=track.external_url,
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
        for summary in summaries:
            session.merge(
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
        session.commit()
