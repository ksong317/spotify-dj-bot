"""Set list routes: running orders built out of logged transitions."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import Text, and_, cast, func, or_, select, union
from sqlalchemy.orm import Session

from app import keys
from app.database import get_db
from app.models import (
    SetList,
    SetListCoreTrack,
    SetListItem,
    SetListTransition,
    Track,
    Transition,
)
from app.schemas import (
    CoreTrackCreate,
    CoreTrackReorder,
    CoreTrackResponse,
    SetListCreate,
    SetListDetail,
    SetListItemCreate,
    SetListItemResponse,
    SetListItemUpdate,
    SetListReorder,
    SetListSummary,
    SetListTransitionResponse,
    SetListTransitionUpdate,
    SetListUpdate,
    SuggestionResponse,
    TrackSummary,
)
from app.spotify import (
    SpotifyUnavailableError,
    get_track,
    get_tracks,
    search_tracks,
)
from app.track_store import CUSTOM_PREFIX

router = APIRouter(prefix="/api/setlists")

TrackDefaults = dict[str, tuple[str | None, float | None]]
MAX_SUGGESTIONS_PER_SOURCE = 10


def _load(db: Session, set_list_id: int) -> SetList:
    set_list = db.get(SetList, set_list_id)
    if set_list is None:
        raise HTTPException(status_code=404, detail="Set list not found")
    return set_list


def _touch(set_list: SetList) -> None:
    """Mark the set list changed, even when only its slots moved."""
    set_list.updated_at = func.now()


def _renumber(items: list[SetListItem]) -> None:
    for position, item in enumerate(items):
        item.position = position


def _ordered_items(db: Session, set_list_id: int) -> list[SetListItem]:
    return (
        db.query(SetListItem)
        .filter(SetListItem.set_list_id == set_list_id)
        .order_by(SetListItem.position, SetListItem.id)
        .all()
    )


def _defaults(db: Session, track_ids: set[str]) -> TrackDefaults:
    """Each song's own key and tempo, which key and BPM fields fall back to."""
    if not track_ids:
        return {}
    rows = (
        db.query(Track.id, Track.default_key, Track.default_bpm)
        .filter(Track.id.in_(track_ids))
        .all()
    )
    return {row.id: (row.default_key, row.default_bpm) for row in rows}


def _logged_transitions(
    db: Session, track_ids: set[str]
) -> dict[tuple[str, str], Transition]:
    """Library transitions between these songs, keyed by the direction they cover."""
    if not track_ids:
        return {}
    rows = (
        db.query(Transition)
        .filter(
            Transition.from_track_id.in_(track_ids),
            Transition.to_track_id.in_(track_ids),
        )
        .order_by(Transition.bidirectional.desc(), Transition.created_at.desc())
        .all()
    )
    by_direction: dict[tuple[str, str], Transition] = {}
    for transition in rows:
        pair = (transition.from_track_id, transition.to_track_id)
        by_direction.setdefault(pair, transition)
        if transition.bidirectional:
            by_direction.setdefault((pair[1], pair[0]), transition)
    return by_direction


def _junctions(items: list[SetListItem]) -> list[tuple[SetListItem, SetListItem]]:
    """Neighbouring songs. A gap ends a group, so no mix reaches across one."""
    return [
        (current, following)
        for current, following in zip(items, items[1:])
        if current.kind == SetListItem.KIND_TRACK
        and following.kind == SetListItem.KIND_TRACK
    ]


def _part_mates(items: list[SetListItem], item: SetListItem) -> list[SetListItem]:
    """The contiguous run of songs this slot belongs to — one part of the set."""
    if item.kind != SetListItem.KIND_TRACK:
        return []
    try:
        index = items.index(item)
    except ValueError:
        index = next(i for i, candidate in enumerate(items) if candidate.id == item.id)
    start = index
    while start > 0 and items[start - 1].kind == SetListItem.KIND_TRACK:
        start -= 1
    end = index + 1
    while end < len(items) and items[end].kind == SetListItem.KIND_TRACK:
        end += 1
    return items[start:end]


def _inherit_part_energy(items: list[SetListItem], item: SetListItem) -> None:
    """A song added into a tagged part picks up that part's energy."""
    for mate in _part_mates(items, item):
        if mate is not item and mate.energy_levels:
            item.energy_levels = list(mate.energy_levels)
            return


def _detail(db: Session, set_list: SetList) -> SetListDetail:
    items = _ordered_items(db, set_list.id)
    core_rows = (
        db.query(SetListCoreTrack)
        .filter(SetListCoreTrack.set_list_id == set_list.id)
        .order_by(SetListCoreTrack.position, SetListCoreTrack.id)
        .all()
    )

    item_track_ids = {item.track_id for item in items if item.track_id}
    track_ids = item_track_ids | {row.track_id for row in core_rows}
    tracks_by_id: dict[str, TrackSummary] = get_tracks(sorted(track_ids))
    defaults = _defaults(db, track_ids)
    logged = _logged_transitions(db, item_track_ids)

    stored = {
        (row.from_item_id, row.to_item_id): row
        for row in db.query(SetListTransition).filter(
            SetListTransition.set_list_id == set_list.id
        )
    }

    transitions = []
    for current, following in _junctions(items):
        row = stored.get((current.id, following.id))
        transition = logged.get((current.track_id, following.track_id))
        transitions.append(
            SetListTransitionResponse(
                from_item_id=current.id,
                to_item_id=following.id,
                start_key=row.start_key if row else None,
                start_bpm=row.start_bpm if row else None,
                end_key=row.end_key if row else None,
                end_bpm=row.end_bpm if row else None,
                notes=row.notes if row else None,
                transition_id=transition.id if transition else None,
                transition_notes=transition.notes if transition else None,
                bidirectional=bool(transition and transition.bidirectional),
            )
        )

    uses: dict[str, int] = {}
    for item in items:
        if item.track_id:
            uses[item.track_id] = uses.get(item.track_id, 0) + 1

    return SetListDetail(
        id=set_list.id,
        name=set_list.name,
        notes=set_list.notes,
        created_at=set_list.created_at,
        updated_at=set_list.updated_at,
        items=[
            SetListItemResponse(
                id=item.id,
                kind=item.kind,
                position=item.position,
                track_id=item.track_id,
                track=tracks_by_id.get(item.track_id) if item.track_id else None,
                default_key=defaults.get(item.track_id, (None, None))[0],
                default_bpm=defaults.get(item.track_id, (None, None))[1],
                duration_seconds=item.duration_seconds,
                energy_levels=item.energy_levels,
            )
            for item in items
        ],
        transitions=transitions,
        core_tracks=[
            CoreTrackResponse(
                track_id=row.track_id,
                position=row.position,
                track=tracks_by_id.get(row.track_id),
                default_key=defaults.get(row.track_id, (None, None))[0],
                default_bpm=defaults.get(row.track_id, (None, None))[1],
                uses=uses.get(row.track_id, 0),
            )
            for row in core_rows
        ],
    )


def _saved(db: Session, set_list: SetList) -> SetListDetail:
    """Commit a change and hand back the whole set list, so the UI stays in step."""
    _touch(set_list)
    db.commit()
    db.refresh(set_list)
    return _detail(db, set_list)


@router.get("", response_model=list[SetListSummary])
def list_set_lists(db: Session = Depends(get_db)) -> list[SetListSummary]:
    counts = dict(
        db.query(SetListItem.set_list_id, func.count(SetListItem.id))
        .filter(SetListItem.kind == SetListItem.KIND_TRACK)
        .group_by(SetListItem.set_list_id)
        .all()
    )
    return [
        SetListSummary(
            id=set_list.id,
            name=set_list.name,
            notes=set_list.notes,
            track_count=counts.get(set_list.id, 0),
            created_at=set_list.created_at,
            updated_at=set_list.updated_at,
        )
        for set_list in db.query(SetList).order_by(SetList.updated_at.desc()).all()
    ]


@router.post("", response_model=SetListDetail, status_code=201)
def create_set_list(
    payload: SetListCreate, db: Session = Depends(get_db)
) -> SetListDetail:
    set_list = SetList(
        name=payload.name.strip(),
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(set_list)
    db.commit()
    db.refresh(set_list)
    return _detail(db, set_list)


@router.get("/{set_list_id}", response_model=SetListDetail)
def get_set_list(set_list_id: int, db: Session = Depends(get_db)) -> SetListDetail:
    return _detail(db, _load(db, set_list_id))


@router.patch("/{set_list_id}", response_model=SetListDetail)
def update_set_list(
    set_list_id: int, payload: SetListUpdate, db: Session = Depends(get_db)
) -> SetListDetail:
    set_list = _load(db, set_list_id)
    if payload.name is not None:
        set_list.name = payload.name.strip()
    if payload.notes is not None:
        set_list.notes = payload.notes.strip() or None
    return _saved(db, set_list)


@router.delete("/{set_list_id}", status_code=204)
def delete_set_list(set_list_id: int, db: Session = Depends(get_db)) -> Response:
    db.delete(_load(db, set_list_id))
    db.commit()
    return Response(status_code=204)


@router.post("/{set_list_id}/items", response_model=SetListDetail, status_code=201)
def add_item(
    set_list_id: int, payload: SetListItemCreate, db: Session = Depends(get_db)
) -> SetListDetail:
    """Add a song or a gap. The same song may fill as many slots as you like."""
    set_list = _load(db, set_list_id)

    if payload.kind == SetListItem.KIND_TRACK:
        if not payload.track_id:
            raise HTTPException(status_code=400, detail="A song needs a track ID")
        if not get_track(payload.track_id):
            raise HTTPException(status_code=400, detail="Invalid Spotify track ID")
        track_id = payload.track_id
    else:
        track_id = None

    items = _ordered_items(db, set_list_id)
    item = SetListItem(
        set_list_id=set_list_id, kind=payload.kind, track_id=track_id, position=0
    )
    index = len(items) if payload.position is None else min(payload.position, len(items))
    items.insert(index, item)
    db.add(item)
    _renumber(items)
    if item.kind == SetListItem.KIND_TRACK:
        _inherit_part_energy(items, item)
    return _saved(db, set_list)


@router.patch("/{set_list_id}/items/{item_id}", response_model=SetListDetail)
def update_item(
    set_list_id: int,
    item_id: int,
    payload: SetListItemUpdate,
    db: Session = Depends(get_db),
) -> SetListDetail:
    """Set a song's play time, or the energy of the part it sits in."""
    set_list = _load(db, set_list_id)
    item = db.get(SetListItem, item_id)
    if item is None or item.set_list_id != set_list_id:
        raise HTTPException(status_code=404, detail="Set list slot not found")
    if item.kind != SetListItem.KIND_TRACK:
        raise HTTPException(status_code=400, detail="A gap has no duration or energy")

    sent = payload.model_dump(exclude_unset=True)
    if "duration_seconds" in sent:
        item.duration_seconds = sent["duration_seconds"]
    if "energy_levels" in sent:
        levels = sent["energy_levels"]
        for mate in _part_mates(_ordered_items(db, set_list_id), item):
            mate.energy_levels = list(levels) if levels else None
    return _saved(db, set_list)


@router.delete("/{set_list_id}/items/{item_id}", response_model=SetListDetail)
def delete_item(
    set_list_id: int, item_id: int, db: Session = Depends(get_db)
) -> SetListDetail:
    """Remove a slot. Mixes that touched it go with it; the rest are untouched."""
    set_list = _load(db, set_list_id)
    item = db.get(SetListItem, item_id)
    if item is None or item.set_list_id != set_list_id:
        raise HTTPException(status_code=404, detail="Set list slot not found")
    db.delete(item)
    db.flush()
    _renumber(_ordered_items(db, set_list_id))
    return _saved(db, set_list)


@router.post("/{set_list_id}/items/reorder", response_model=SetListDetail)
def reorder_items(
    set_list_id: int, payload: SetListReorder, db: Session = Depends(get_db)
) -> SetListDetail:
    """Take the whole running order at once, which covers every kind of move."""
    set_list = _load(db, set_list_id)
    items = _ordered_items(db, set_list_id)
    by_id = {item.id: item for item in items}

    if sorted(payload.item_ids) != sorted(by_id):
        raise HTTPException(
            status_code=400,
            detail="Reordering must list every slot of the set list exactly once",
        )

    _renumber([by_id[item_id] for item_id in payload.item_ids])
    return _saved(db, set_list)


@router.put(
    "/{set_list_id}/transitions/{from_item_id}/{to_item_id}",
    response_model=SetListDetail,
)
def set_transition(
    set_list_id: int,
    from_item_id: int,
    to_item_id: int,
    payload: SetListTransitionUpdate,
    db: Session = Depends(get_db),
) -> SetListDetail:
    """Set the key, BPM and set-list notes for one seam between two songs."""
    set_list = _load(db, set_list_id)
    items = {item.id: item for item in _ordered_items(db, set_list_id)}
    pair = [items.get(from_item_id), items.get(to_item_id)]
    if any(item is None for item in pair):
        raise HTTPException(status_code=404, detail="Set list slot not found")
    if any(item.kind != SetListItem.KIND_TRACK for item in pair):
        raise HTTPException(status_code=400, detail="A gap has no transition")
    # A seam runs forwards. Stored the other way round nothing would ever read it,
    # because the running order only ever asks about a song and the one after it.
    if pair[1].position - pair[0].position != 1:
        raise HTTPException(
            status_code=400,
            detail="Those two songs do not run one after the other",
        )

    row = (
        db.query(SetListTransition)
        .filter(
            SetListTransition.from_item_id == from_item_id,
            SetListTransition.to_item_id == to_item_id,
        )
        .one_or_none()
    )
    if row is None:
        row = SetListTransition(
            set_list_id=set_list_id,
            from_item_id=from_item_id,
            to_item_id=to_item_id,
        )
        db.add(row)

    sent = payload.model_dump(exclude_unset=True)
    for field, value in sent.items():
        setattr(row, field, value.strip() or None if field == "notes" else value)

    # An ending that was never given matches the start: most mixes land in the same
    # key and tempo they began in, and a basic cut can be told apart by editing it.
    if "end_key" not in sent and row.start_key and not row.end_key:
        row.end_key = row.start_key
    if "end_bpm" not in sent and row.start_bpm and not row.end_bpm:
        row.end_bpm = row.start_bpm

    return _saved(db, set_list)


def _anchor(
    db: Session, set_list_id: int, after_item_id: int | None
) -> tuple[str | None, str | None]:
    """The song a new slot would follow, and the key it is being played in.

    The key the mix into that song lands in beats the song's own key: if the set
    list says it is pitched somewhere else, that is what the next song has to meet.
    """
    if after_item_id is None:
        return None, None
    item = db.get(SetListItem, after_item_id)
    if item is None or item.set_list_id != set_list_id or not item.track_id:
        return None, None

    # Only the mix actually leading into this slot counts. Rows for pairs that have
    # since been pulled apart stay in the table, dormant, and must be ignored here.
    before = (
        db.query(SetListItem)
        .filter(
            SetListItem.set_list_id == set_list_id,
            SetListItem.position == item.position - 1,
            SetListItem.kind == SetListItem.KIND_TRACK,
        )
        .one_or_none()
    )
    if before is not None:
        landed = (
            db.query(SetListTransition.end_key)
            .filter(
                SetListTransition.from_item_id == before.id,
                SetListTransition.to_item_id == item.id,
            )
            .scalar()
        )
        if landed:
            return item.track_id, landed

    own_key = db.query(Track.default_key).filter(Track.id == item.track_id).scalar()
    return item.track_id, own_key


def _library_track_ids():
    """Songs you have actually done something with.

    The `tracks` table is a metadata cache, not a library: every song Spotify has
    ever handed back in a search box is written to it, which is why it holds
    thousands of songs nobody ever chose. Yours are the ones on a transition, in a
    set list, carrying a key you typed in, or a custom song you created because it
    is not on Spotify. The rest still turn up when searching Spotify, just not as
    though you already owned them.
    """
    return union(
        select(Transition.from_track_id),
        select(Transition.to_track_id),
        select(SetListItem.track_id).where(SetListItem.track_id.isnot(None)),
        select(SetListCoreTrack.track_id),
        select(Track.id).where(
            or_(
                Track.default_key.isnot(None),
                Track.default_bpm.isnot(None),
                Track.id.startswith(CUSTOM_PREFIX),
            )
        ),
    )


def _transitions_from(db: Session, track_id: str) -> list[tuple[str, Transition]]:
    """Songs reachable from this one, with the transition that gets you there."""
    rows = (
        db.query(Transition)
        .filter(
            or_(
                Transition.from_track_id == track_id,
                and_(
                    Transition.to_track_id == track_id,
                    Transition.bidirectional.is_(True),
                ),
            )
        )
        .order_by(Transition.created_at.desc())
        .all()
    )
    reachable: list[tuple[str, Transition]] = []
    for transition in rows:
        other = (
            transition.to_track_id
            if transition.from_track_id == track_id
            else transition.from_track_id
        )
        if other != track_id:
            reachable.append((other, transition))
    return reachable


@router.get("/{set_list_id}/suggestions", response_model=list[SuggestionResponse])
def suggest_next(
    set_list_id: int,
    after_item_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
) -> list[SuggestionResponse]:
    """What could come next: what you have already mixed, then what fits the key.

    With a search term, songs you have logged come before anything from Spotify, so
    a transition you already know about is never buried under a search result.
    """
    _load(db, set_list_id)
    anchor_id, anchor_key = _anchor(db, set_list_id, after_item_id)
    needle = (q or "").strip()

    # (track_id, source, reason, transition)
    picks: list[tuple[str, str, str, Transition | None]] = []
    seen: set[str] = {anchor_id} if anchor_id else set()

    def take(track_id: str, source: str, reason: str, transition: Transition | None):
        if track_id in seen:
            return
        seen.add(track_id)
        picks.append((track_id, source, reason, transition))

    by_other = dict(_transitions_from(db, anchor_id)) if anchor_id else {}

    if not needle:
        for other, transition in by_other.items():
            take(other, "transition", "already mixed out of this song", transition)

        if anchor_key:
            reasons = keys.compatible(anchor_key)
            rows = (
                db.query(Track.id, Track.default_key, Track.name)
                .filter(Track.default_key.in_(list(reasons)))
                .order_by(Track.name)
                .all()
            )
            ranked = sorted(
                rows, key=lambda row: list(reasons).index(row.default_key)
            )
            for row in ranked[:MAX_SUGGESTIONS_PER_SOURCE]:
                take(row.id, "key", reasons[row.default_key], None)
    else:
        pattern = f"%{needle}%"
        matches = (
            db.query(Track.id)
            .filter(
                Track.id.in_(_library_track_ids()),
                or_(
                    Track.name.ilike(pattern),
                    cast(Track.artists, Text).ilike(pattern),
                ),
            )
            # Songs whose title opens with what was typed read as the closer match.
            .order_by(Track.name.ilike(f"{needle}%").desc(), Track.name)
        )

        # A song you have already mixed out of this one must never be buried, so it
        # is looked up on its own rather than taken from the capped list below.
        if by_other:
            for row in matches.filter(Track.id.in_(by_other)).all():
                take(
                    row.id,
                    "transition",
                    "already mixed out of this song",
                    by_other[row.id],
                )

        for row in matches.limit(MAX_SUGGESTIONS_PER_SOURCE).all():
            take(row.id, "library", "in your library", None)

        try:
            for track in search_tracks(needle, limit=MAX_SUGGESTIONS_PER_SOURCE):
                take(track.id, "spotify", "from Spotify", None)
        except SpotifyUnavailableError:
            # Songs of your own are still worth offering. With none to offer, the
            # 503 explaining why is more use than an empty list.
            if not picks:
                raise

    tracks_by_id = get_tracks([track_id for track_id, *_ in picks])
    defaults = _defaults(db, {track_id for track_id, *_ in picks})

    suggestions = []
    for track_id, source, reason, transition in picks:
        track = tracks_by_id.get(track_id)
        if track is None:
            continue
        key, bpm = defaults.get(track_id, (None, None))
        suggestions.append(
            SuggestionResponse(
                track=track,
                default_key=key,
                default_bpm=bpm,
                source=source,
                reason=reason,
                transition_id=transition.id if transition else None,
                transition_notes=transition.notes if transition else None,
                bidirectional=bool(transition and transition.bidirectional),
            )
        )
    return suggestions


@router.post("/{set_list_id}/core-tracks", response_model=SetListDetail, status_code=201)
def add_core_track(
    set_list_id: int, payload: CoreTrackCreate, db: Session = Depends(get_db)
) -> SetListDetail:
    """Pin a song that has to make it into this set."""
    set_list = _load(db, set_list_id)
    if not get_track(payload.track_id):
        raise HTTPException(status_code=400, detail="Invalid Spotify track ID")

    existing = (
        db.query(SetListCoreTrack)
        .filter(
            SetListCoreTrack.set_list_id == set_list_id,
            SetListCoreTrack.track_id == payload.track_id,
        )
        .one_or_none()
    )
    if existing is None:
        last = (
            db.query(func.max(SetListCoreTrack.position))
            .filter(SetListCoreTrack.set_list_id == set_list_id)
            .scalar()
        )
        db.add(
            SetListCoreTrack(
                set_list_id=set_list_id,
                track_id=payload.track_id,
                position=0 if last is None else last + 1,
            )
        )
    return _saved(db, set_list)


@router.delete("/{set_list_id}/core-tracks/{track_id}", response_model=SetListDetail)
def delete_core_track(
    set_list_id: int, track_id: str, db: Session = Depends(get_db)
) -> SetListDetail:
    set_list = _load(db, set_list_id)
    row = (
        db.query(SetListCoreTrack)
        .filter(
            SetListCoreTrack.set_list_id == set_list_id,
            SetListCoreTrack.track_id == track_id,
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="That song is not a core track")
    db.delete(row)
    return _saved(db, set_list)


@router.post("/{set_list_id}/core-tracks/reorder", response_model=SetListDetail)
def reorder_core_tracks(
    set_list_id: int, payload: CoreTrackReorder, db: Session = Depends(get_db)
) -> SetListDetail:
    set_list = _load(db, set_list_id)
    rows = {
        row.track_id: row
        for row in db.query(SetListCoreTrack).filter(
            SetListCoreTrack.set_list_id == set_list_id
        )
    }
    if sorted(payload.track_ids) != sorted(rows):
        raise HTTPException(
            status_code=400,
            detail="Reordering must list every core track exactly once",
        )
    for position, track_id in enumerate(payload.track_ids):
        rows[track_id].position = position
    return _saved(db, set_list)
