"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field

from app import keys

MIN_BPM = 20.0
MAX_BPM = 400.0


def _parse_key(value: object) -> str | None:
    """Accept a Camelot code or a key name, store the code."""
    if value is None or isinstance(value, str):
        return keys.normalize(value)
    raise ValueError("Key must be text, like 8B or C major")


def _parse_bpm(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        bpm = round(float(value), 2)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ValueError("BPM must be a number") from None
    if not MIN_BPM <= bpm <= MAX_BPM:
        raise ValueError(f"BPM must be between {MIN_BPM:g} and {MAX_BPM:g}")
    return bpm


CamelotKey = Annotated[str | None, BeforeValidator(_parse_key)]
Bpm = Annotated[float | None, BeforeValidator(_parse_bpm)]


class TransitionCreate(BaseModel):
    from_track_id: str = Field(min_length=1, max_length=22)
    to_track_id: str = Field(min_length=1, max_length=22)
    notes: str | None = None
    bidirectional: bool = False


class TrackSummary(BaseModel):
    id: str
    name: str
    artists: list[str]
    album: str
    album_art_url: str | None
    preview_url: str | None
    external_url: str


class TransitionResponse(BaseModel):
    id: int
    from_track_id: str
    to_track_id: str
    # Null when Spotify metadata could not be loaded. The IDs above are always
    # present, so a transition is still listed with its notes either way.
    from_track: TrackSummary | None
    to_track: TrackSummary | None
    notes: str | None
    bidirectional: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class GraphEdge(BaseModel):
    id: int
    from_track_id: str
    to_track_id: str
    notes: str | None
    bidirectional: bool


class GraphNeighbor(BaseModel):
    """A song on the graph alongside the center.

    `track` is null when Spotify metadata could not be loaded, which lets the graph
    still show that the connection exists. `depth` is null for songs that belong to
    a separate chain and so have no hop count from the center.
    """

    id: str
    depth: int | None
    track: TrackSummary | None = None


class GraphResponse(BaseModel):
    """The transition graph around a single track, walked out to a given depth."""

    center: TrackSummary
    neighbors: list[GraphNeighbor]
    edges: list[GraphEdge]


class TrackDefaultsUpdate(BaseModel):
    """A song's own key and tempo, shared by every set list it appears in."""

    default_key: CamelotKey = None
    default_bpm: Bpm = None


class TrackDefaultsResponse(BaseModel):
    track_id: str
    default_key: str | None
    default_bpm: float | None


class SetListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    notes: str | None = None


class SetListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = None


class SetListSummary(BaseModel):
    id: int
    name: str
    notes: str | None
    track_count: int
    created_at: datetime
    updated_at: datetime


class SetListItemCreate(BaseModel):
    kind: Literal["track", "break"] = "track"
    track_id: str | None = Field(default=None, min_length=1, max_length=22)
    # Where in the running order to insert; the end of the list when left out.
    position: int | None = Field(default=None, ge=0)


class SetListReorder(BaseModel):
    """Every slot of the set list, in its new order."""

    item_ids: list[int]


class SetListItemResponse(BaseModel):
    id: int
    kind: Literal["track", "break"]
    position: int
    track_id: str | None
    # Null when Spotify metadata could not be loaded; the slot still holds its place.
    track: TrackSummary | None = None
    default_key: str | None = None
    default_bpm: float | None = None


class SetListTransitionUpdate(BaseModel):
    """Only the fields sent are changed; an unsent end key or BPM mirrors the start."""

    start_key: CamelotKey = None
    start_bpm: Bpm = None
    end_key: CamelotKey = None
    end_bpm: Bpm = None
    notes: str | None = None


class SetListTransitionResponse(BaseModel):
    """One seam between neighbouring songs, whether or not anything is set on it."""

    from_item_id: int
    to_item_id: int
    start_key: str | None = None
    start_bpm: float | None = None
    end_key: str | None = None
    end_bpm: float | None = None
    notes: str | None = None
    # The transition logged in the library, if this pair of songs has one.
    transition_id: int | None = None
    transition_notes: str | None = None
    bidirectional: bool = False


class CoreTrackCreate(BaseModel):
    track_id: str = Field(min_length=1, max_length=22)


class CoreTrackReorder(BaseModel):
    track_ids: list[str]


class CoreTrackResponse(BaseModel):
    track_id: str
    position: int
    track: TrackSummary | None = None
    default_key: str | None = None
    default_bpm: float | None = None
    # How many slots of the set list this song currently fills.
    uses: int = 0


class SetListDetail(BaseModel):
    id: int
    name: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    items: list[SetListItemResponse]
    transitions: list[SetListTransitionResponse]
    core_tracks: list[CoreTrackResponse]


class SuggestionResponse(BaseModel):
    """A candidate for the next song, and why it is being suggested."""

    track: TrackSummary
    default_key: str | None = None
    default_bpm: float | None = None
    source: Literal["transition", "key", "library", "spotify"]
    reason: str
    transition_id: int | None = None
    transition_notes: str | None = None
    bidirectional: bool = False
