"""SQLAlchemy models."""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Transition(Base):
    __tablename__ = "transitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_track_id: Mapped[str] = mapped_column(String(22), nullable=False)
    to_track_id: Mapped[str] = mapped_column(String(22), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    bidirectional: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_transitions_from_track_id", "from_track_id"),
        Index("ix_transitions_to_track_id", "to_track_id"),
    )


class Track(Base):
    """Spotify metadata kept locally so the app works when Spotify does not."""

    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String(22), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    artists: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    album: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    album_art_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_url: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # The song's own key and tempo, as typed in by hand: Spotify stopped serving
    # audio features to apps like this one. Blank until someone fills them in.
    default_key: Mapped[str | None] = mapped_column(String(3), nullable=True)
    default_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SetList(Base):
    """One gig's running order."""

    __tablename__ = "set_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    items: Mapped[list["SetListItem"]] = relationship(
        back_populates="set_list",
        cascade="all, delete-orphan",
        order_by="SetListItem.position",
    )
    core_tracks: Mapped[list["SetListCoreTrack"]] = relationship(
        back_populates="set_list",
        cascade="all, delete-orphan",
        order_by="SetListCoreTrack.position",
    )


class SetListItem(Base):
    """A slot in the running order: a song, or a gap between two parts of the set.

    The same song can fill several slots, so a slot — not a track ID — is what the
    rest of the set list points at.
    """

    __tablename__ = "set_list_items"

    KIND_TRACK = "track"
    KIND_BREAK = "break"

    id: Mapped[int] = mapped_column(primary_key=True)
    set_list_id: Mapped[int] = mapped_column(
        ForeignKey("set_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False, server_default="track")
    track_id: Mapped[str | None] = mapped_column(String(22), nullable=True)
    # How long this slot is played in this set, in seconds. Null until filled in,
    # which the rest of the app treats as zero.
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Ordered energy tags for the part this song belongs to, e.g. ["low", "medium"].
    # Copied onto every song in the part so moving the block keeps the tags.
    energy_levels: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    set_list: Mapped["SetList"] = relationship(back_populates="items")

    __table_args__ = (Index("ix_set_list_items_order", "set_list_id", "position"),)


class SetListTransition(Base):
    """The mix between two neighbouring slots, as played in this set list.

    Keyed by the pair of slots rather than by position, so moving a block of songs
    carries its own mixes along and leaves the new seams blank.
    """

    __tablename__ = "set_list_transitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    set_list_id: Mapped[int] = mapped_column(
        ForeignKey("set_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_item_id: Mapped[int] = mapped_column(
        ForeignKey("set_list_items.id", ondelete="CASCADE"), nullable=False
    )
    to_item_id: Mapped[int] = mapped_column(
        ForeignKey("set_list_items.id", ondelete="CASCADE"), nullable=False
    )
    start_key: Mapped[str | None] = mapped_column(String(3), nullable=True)
    start_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_key: Mapped[str | None] = mapped_column(String(3), nullable=True)
    end_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Notes for this set list only; the logged transition's own notes are read-only.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("from_item_id", "to_item_id", name="uq_set_list_transition"),
    )


class SetListCoreTrack(Base):
    """A song that has to make it into this set list."""

    __tablename__ = "set_list_core_tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    set_list_id: Mapped[int] = mapped_column(
        ForeignKey("set_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    track_id: Mapped[str] = mapped_column(String(22), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    set_list: Mapped["SetList"] = relationship(back_populates="core_tracks")

    __table_args__ = (
        UniqueConstraint("set_list_id", "track_id", name="uq_set_list_core_track"),
    )
