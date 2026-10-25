"""Transition and Spotify API routes."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Track, Transition
from app.schemas import (
    GraphEdge,
    GraphNeighbor,
    GraphResponse,
    TrackDefaultsResponse,
    TrackDefaultsUpdate,
    TrackSummary,
    TransitionCreate,
    TransitionResponse,
)
from app.spotify import get_track, get_tracks, search_tracks

router = APIRouter(prefix="/api")

MAX_GRAPH_DEPTH = 6


def _build_transition_response(
    transition: Transition, tracks_by_id: dict[str, TrackSummary]
) -> TransitionResponse:
    return TransitionResponse(
        id=transition.id,
        from_track_id=transition.from_track_id,
        to_track_id=transition.to_track_id,
        from_track=tracks_by_id.get(transition.from_track_id),
        to_track=tracks_by_id.get(transition.to_track_id),
        notes=transition.notes,
        bidirectional=transition.bidirectional,
        created_at=transition.created_at,
    )


@router.get("/search", response_model=list[TrackSummary])
def search_spotify_tracks(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=20),
) -> list[TrackSummary]:
    return search_tracks(q, limit=limit)


@router.get("/tracks/{track_id}", response_model=TrackSummary)
def get_spotify_track(track_id: str) -> TrackSummary:
    track = get_track(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


@router.patch("/tracks/{track_id}/defaults", response_model=TrackDefaultsResponse)
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


def _dedupe_transitions(transitions: list[Transition]) -> list[Transition]:
    """Collapse duplicate rows for the same track pair into one entry."""
    bidir_pairs: set[frozenset[str]] = {
        frozenset({t.from_track_id, t.to_track_id})
        for t in transitions
        if t.bidirectional
    }

    best_by_key: dict[tuple[str, str], Transition] = {}
    for transition in transitions:
        pair = frozenset({transition.from_track_id, transition.to_track_id})
        if not transition.bidirectional and pair in bidir_pairs:
            continue

        key = (transition.from_track_id, transition.to_track_id)
        existing = best_by_key.get(key)
        if existing is None:
            best_by_key[key] = transition
        elif transition.bidirectional and not existing.bidirectional:
            best_by_key[key] = transition
        elif transition.bidirectional == existing.bidirectional:
            if transition.created_at > existing.created_at:
                best_by_key[key] = transition

    kept_ids = {t.id for t in best_by_key.values()}
    return [t for t in transitions if t.id in kept_ids]


@router.post("/transitions", response_model=TransitionResponse, status_code=201)
def create_transition(
    payload: TransitionCreate, db: Session = Depends(get_db)
) -> TransitionResponse:
    if payload.from_track_id == payload.to_track_id:
        raise HTTPException(
            status_code=400, detail="Starting and ending songs must be different"
        )

    from_track = get_track(payload.from_track_id)
    to_track = get_track(payload.to_track_id)
    if not from_track or not to_track:
        raise HTTPException(status_code=400, detail="Invalid Spotify track ID")

    notes = payload.notes.strip() if payload.notes else None
    from_id, to_id = payload.from_track_id, payload.to_track_id

    related = (
        db.query(Transition)
        .filter(
            or_(
                and_(
                    Transition.from_track_id == from_id,
                    Transition.to_track_id == to_id,
                ),
                and_(
                    Transition.from_track_id == to_id,
                    Transition.to_track_id == from_id,
                ),
            )
        )
        .order_by(Transition.bidirectional.desc(), Transition.created_at.desc())
        .all()
    )

    if payload.bidirectional:
        if related:
            transition = related[0]
            for duplicate in related[1:]:
                db.delete(duplicate)
            transition.from_track_id = from_id
            transition.to_track_id = to_id
            transition.notes = notes
            transition.bidirectional = True
        else:
            transition = Transition(
                from_track_id=from_id,
                to_track_id=to_id,
                notes=notes,
                bidirectional=True,
            )
            db.add(transition)
    else:
        bidirectional = next((t for t in related if t.bidirectional), None)
        if bidirectional:
            raise HTTPException(
                status_code=400,
                detail="A bidirectional transition between these songs already exists",
            )

        same_direction = [
            t for t in related if t.from_track_id == from_id and t.to_track_id == to_id
        ]
        if same_direction:
            transition = same_direction[0]
            for duplicate in same_direction[1:]:
                db.delete(duplicate)
            transition.notes = notes
        else:
            transition = Transition(
                from_track_id=from_id,
                to_track_id=to_id,
                notes=notes,
                bidirectional=False,
            )
            db.add(transition)

    db.commit()
    db.refresh(transition)

    return _build_transition_response(
        transition, {from_track.id: from_track, to_track.id: to_track}
    )


@router.get("/transitions", response_model=list[TransitionResponse])
def list_transitions(
    track_id: str | None = Query(default=None, min_length=1, max_length=22),
    db: Session = Depends(get_db),
) -> list[TransitionResponse]:
    query = db.query(Transition).order_by(Transition.created_at.desc())
    if track_id:
        query = query.filter(
            or_(
                Transition.from_track_id == track_id,
                and_(
                    Transition.to_track_id == track_id,
                    Transition.bidirectional.is_(True),
                ),
            )
        )
    transitions = _dedupe_transitions(query.all())
    if not transitions:
        return []

    track_ids = [
        track_id
        for transition in transitions
        for track_id in (transition.from_track_id, transition.to_track_id)
    ]
    tracks_by_id = get_tracks(track_ids)

    return [
        _build_transition_response(transition, tracks_by_id)
        for transition in transitions
    ]


@router.delete("/transitions/{transition_id}", status_code=204)
def delete_transition(transition_id: int, db: Session = Depends(get_db)) -> Response:
    """Remove a single transition. Cached track metadata is left alone."""
    transition = db.get(Transition, transition_id)
    if transition is None:
        raise HTTPException(status_code=404, detail="Transition not found")
    db.delete(transition)
    db.commit()
    return Response(status_code=204)


def _sort_key(track: TrackSummary) -> tuple[str, str]:
    return (track.name.casefold(), ", ".join(track.artists).casefold())


@router.get("/graph/songs", response_model=list[TrackSummary])
def list_graph_songs(db: Session = Depends(get_db)) -> list[TrackSummary]:
    """Every track that appears on at least one stored transition."""
    rows = db.query(Transition.from_track_id, Transition.to_track_id).all()
    track_ids = {track_id for row in rows for track_id in row}
    if not track_ids:
        return []

    tracks_by_id = get_tracks(sorted(track_ids))
    if not tracks_by_id:
        # An empty list here would read as "you have no transitions", which is wrong.
        raise HTTPException(
            status_code=503,
            detail=(
                "Your transitions are stored, but song details could not be loaded "
                "from Spotify. They will appear once Spotify responds again."
            ),
        )
    return sorted(tracks_by_id.values(), key=_sort_key)


def _chain_depths(db: Session, center_id: str, max_depth: int | None) -> dict[str, int]:
    """Breadth-first walk from the center, returning hop counts per song reached."""
    depth_by_id = {center_id: 0}
    frontier = {center_id}
    level = 0

    while frontier and (max_depth is None or level < max_depth):
        level += 1
        rows = (
            db.query(Transition.from_track_id, Transition.to_track_id)
            .filter(
                or_(
                    Transition.from_track_id.in_(frontier),
                    Transition.to_track_id.in_(frontier),
                )
            )
            .all()
        )
        next_frontier: set[str] = set()
        for from_id, to_id in rows:
            for node_id in (from_id, to_id):
                if node_id not in depth_by_id:
                    depth_by_id[node_id] = level
                    next_frontier.add(node_id)
        frontier = next_frontier

    return depth_by_id


def _walk_graph(
    db: Session, center_id: str, max_depth: int | None
) -> tuple[list[Transition], dict[str, int]]:
    """The center's transitions out to `max_depth` hops, plus those hop counts."""
    depth_by_id = _chain_depths(db, center_id, max_depth)

    # Re-query for edges rather than reusing the walk, so that connections between
    # two included songs are drawn even when neither was reached through the other.
    node_ids = set(depth_by_id)
    transitions = (
        db.query(Transition)
        .filter(
            Transition.from_track_id.in_(node_ids),
            Transition.to_track_id.in_(node_ids),
        )
        .order_by(Transition.created_at.desc())
        .all()
    )
    return _dedupe_transitions(transitions), depth_by_id


def _unconnected_transitions(db: Session, center_id: str) -> list[Transition]:
    """Every transition in a chain that never reaches the center track."""
    # The full walk, not the depth-limited one: a song two hops past the horizon is
    # still part of this chain and must not be mistaken for a separate one.
    chain_ids = set(_chain_depths(db, center_id, None))
    rows = (
        db.query(Transition)
        # A chain contains both ends of each of its transitions, so one end decides it.
        .filter(Transition.from_track_id.notin_(chain_ids))
        .order_by(Transition.created_at.desc())
        .all()
    )
    return _dedupe_transitions(rows)


def _neighbor_sort_key(neighbor: GraphNeighbor) -> tuple[int, int, int, str, str]:
    # Separate chains sort after everything connected to the center, and songs whose
    # metadata is missing sort to the end of their ring.
    unconnected = 1 if neighbor.depth is None else 0
    depth = neighbor.depth or 0
    if neighbor.track is None:
        return (unconnected, depth, 1, "", neighbor.id)
    name, artists = _sort_key(neighbor.track)
    return (unconnected, depth, 0, name, artists)


@router.get("/graph/{track_id}", response_model=GraphResponse)
def get_transition_graph(
    track_id: str,
    depth: int = Query(
        default=1,
        ge=0,
        le=MAX_GRAPH_DEPTH,
        description="Hops out from the center; 0 walks the whole connected chain.",
    ),
    include_unconnected: bool = Query(
        default=False,
        description="Also return chains that never reach the center track.",
    ),
    db: Session = Depends(get_db),
) -> GraphResponse:
    """The center track plus everything within `depth` hops, in both directions."""
    center = get_track(track_id)
    if not center:
        raise HTTPException(status_code=404, detail="Track not found")

    transitions, depth_by_id = _walk_graph(db, track_id, depth or None)
    elsewhere = _unconnected_transitions(db, track_id) if include_unconnected else []

    unconnected_ids = {
        node_id
        for transition in elsewhere
        for node_id in (transition.from_track_id, transition.to_track_id)
    }
    neighbor_ids = [
        node_id for node_id in depth_by_id if node_id != track_id
    ] + sorted(unconnected_ids)
    tracks_by_id = get_tracks(sorted(neighbor_ids))

    edges = [
        GraphEdge(
            id=transition.id,
            from_track_id=transition.from_track_id,
            to_track_id=transition.to_track_id,
            notes=transition.notes,
            bidirectional=transition.bidirectional,
        )
        for transition in [*transitions, *elsewhere]
    ]
    neighbors = sorted(
        (
            GraphNeighbor(
                id=node_id,
                depth=depth_by_id.get(node_id),
                track=tracks_by_id.get(node_id),
            )
            for node_id in neighbor_ids
        ),
        key=_neighbor_sort_key,
    )
    return GraphResponse(center=center, neighbors=neighbors, edges=edges)
