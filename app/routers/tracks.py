"""Track info routes: the key and tempo a song is kept at.

Spotify closed its audio-features endpoint to apps like this one, so a song's own
key and tempo are typed in by hand and live here. Set lists, the graph and the
transition log all read them back rather than asking Spotify for them.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, cast, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Track
from app.schemas import (
    CustomTrackCreate,
    TrackDefaultsResponse,
    TrackDefaultsUpdate,
    TrackInfo,
    TrackSummary,
)
from app.spotify import (
    SpotifyUnavailableError,
    get_track,
    get_tracks,
    search_tracks,
)
from app.track_store import CUSTOM_PREFIX, _to_summary, create_custom

router = APIRouter(prefix="/api/tracks")


def _saved_defaults(
    db: Session, track_ids: set[str]
) -> dict[str, tuple[str | None, float | None]]:
    if not track_ids:
        return {}
    rows = (
        db.query(Track.id, Track.default_key, Track.default_bpm)
        .filter(Track.id.in_(track_ids))
        .all()
    )
    return {row.id: (row.default_key, row.default_bpm) for row in rows}


def _info(
    track: TrackSummary, default_key: str | None, default_bpm: float | None
) -> TrackInfo:
    return TrackInfo(
        track=track,
        default_key=default_key,
        default_bpm=default_bpm,
        saved=bool(default_key) or default_bpm is not None,
    )


@router.get("/search", response_model=list[TrackInfo])
def search_track_info(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[TrackInfo]:
    """Search Spotify, carrying whatever key and tempo each song already has.

    Songs you have already filled in come first, so going back to correct one
    never means picking it out of the Spotify catalogue again.
    """
    needle = q.strip()
    pattern = f"%{needle}%"
    filled_in = (
        db.query(Track.id)
        .filter(
            or_(
                Track.default_key.isnot(None),
                Track.default_bpm.isnot(None),
                Track.id.startswith(CUSTOM_PREFIX),
            ),
            or_(Track.name.ilike(pattern), cast(Track.artists, Text).ilike(pattern)),
        )
        # Songs whose title opens with what was typed read as the closer match.
        .order_by(Track.name.ilike(f"{needle}%").desc(), Track.name)
        .limit(limit)
        .all()
    )
    track_ids = [row.id for row in filled_in]

    try:
        from_spotify = [track.id for track in search_tracks(needle, limit=limit)]
    except SpotifyUnavailableError:
        # Songs already filled in are still worth offering. With none to offer,
        # the 503 explaining why is more use than an empty list.
        if not track_ids:
            raise
        from_spotify = []

    track_ids = list(dict.fromkeys([*track_ids, *from_spotify]))
    tracks_by_id = get_tracks(track_ids)
    defaults = _saved_defaults(db, set(track_ids))

    return [
        _info(tracks_by_id[track_id], *defaults.get(track_id, (None, None)))
        for track_id in track_ids
        if track_id in tracks_by_id
    ]


@router.post("/custom", response_model=TrackInfo, status_code=201)
def create_custom_track(payload: CustomTrackCreate) -> TrackInfo:
    """A song that is not on Spotify, kept with whatever key and tempo you type."""
    track = create_custom(
        name=payload.name.strip(),
        artists=payload.artists,
        default_key=payload.default_key,
        default_bpm=payload.default_bpm,
    )
    return _info(_to_summary(track), track.default_key, track.default_bpm)


@router.get("/{track_id}/info", response_model=TrackInfo)
def get_track_info(track_id: str, db: Session = Depends(get_db)) -> TrackInfo:
    """One song and its key and tempo, for arriving at the page with it chosen."""
    track = get_track(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    default_key, default_bpm = _saved_defaults(db, {track_id}).get(
        track_id, (None, None)
    )
    return _info(track, default_key, default_bpm)


@router.patch("/{track_id}/defaults", response_model=TrackDefaultsResponse)
def set_track_defaults(
    track_id: str, payload: TrackDefaultsUpdate, db: Session = Depends(get_db)
) -> TrackDefaultsResponse:
    """The song's own key and tempo, which every set list falls back to."""
    # Looking the track up also writes its metadata row, which the defaults hang off.
    if not get_track(track_id):
        raise HTTPException(status_code=404, detail="Track not found")
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(
            status_code=503,
            detail="That song's details are not stored yet, so its key cannot be set.",
        )

    sent = payload.model_dump(exclude_unset=True)
    for field, value in sent.items():
        setattr(track, field, value)
    db.commit()
    db.refresh(track)
    return TrackDefaultsResponse(
        track_id=track.id,
        default_key=track.default_key,
        default_bpm=track.default_bpm,
    )


@router.get("/{track_id}", response_model=TrackSummary)
def get_spotify_track(track_id: str) -> TrackSummary:
    track = get_track(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track
