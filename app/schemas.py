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

ENERGY_LEVELS = ("low", "medium", "high")
EnergyName = Literal["low", "medium", "high"]


def _parse_energy_levels(value: object) -> list[str] | None:
    """Keep the order they were ticked; each level at most once."""
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("Energy levels must be a list")
    levels: list[str] = []
    seen: set[str] = set()
    for item in value:
        if item not in ENERGY_LEVELS:
            raise ValueError("Energy must be low, medium or high")
        if item in seen:
            raise ValueError("Each energy level can only be chosen once")
        seen.add(item)
        levels.append(item)
    return levels or None


EnergyLevels = Annotated[list[EnergyName] | None, BeforeValidator(_parse_energy_levels)]


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
    # True when the song was typed in here and has no Spotify row.
    custom: bool = False


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


class TrackInfo(BaseModel):
    """A song together with the key and tempo kept for it, if any has been typed.

    `saved` is what tells a song you have filled in from one a search box merely
    returned, which is the difference the track info page is built around.
    """

    track: TrackSummary
    default_key: str | None = None
    default_bpm: float | None = None
    saved: bool = False


def _parse_artists(value: object) -> list[str]:
    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",")]
        return [part for part in parts if part]
    if isinstance(value, list):
        if not all(isinstance(item, str) for item in value):
            raise ValueError("Each artist must be text")
        return [item.strip() for item in value if item.strip()]
    raise ValueError("Artists must be a name, or names separated by commas")


def _strip_title(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Title must be text")
    stripped = value.strip()
    if not stripped:
        raise ValueError("Title is required")
    return stripped


class CustomTrackCreate(BaseModel):
    """A song that is not on Spotify: a title, artists, and optional key and BPM."""

    name: Annotated[str, BeforeValidator(_strip_title)] = Field(
        min_length=1, max_length=200
    )
    artists: Annotated[list[str], BeforeValidator(_parse_artists)] = Field(min_length=1)
    default_key: CamelotKey = None
    default_bpm: Bpm = None


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


# A day is far longer than any one song is played; it just keeps a mistype out.
MAX_DURATION_SECONDS = 24 * 60 * 60


class SetListItemUpdate(BaseModel):
    """Only the fields sent are changed. Duration is how long this slot is played.

    Energy is for the whole part this song sits in, in the order the levels were
    chosen — low then medium is not the same as medium then low.
    """

    duration_seconds: int | None = Field(
        default=None, ge=0, le=MAX_DURATION_SECONDS
    )
    energy_levels: EnergyLevels = None


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
    # Null until a play time is typed in; clients should treat that as zero.
    duration_seconds: int | None = None
    # Ordered energy tags for the part; empty or null means none set.
    energy_levels: list[EnergyName] | None = None


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
