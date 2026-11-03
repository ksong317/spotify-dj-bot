"""Store Spotify metadata for every song referenced by a transition.

Run with `make warm-cache`. The graph and the transition list can only name songs whose
metadata is held locally, so this backfills anything Spotify has not told us about yet.

Tries the cheap batch ID lookup first. Whatever that leaves behind - usually because
Spotify is rate limiting `/v1/tracks` - is retried through track_recovery, which does
not depend on the throttled endpoints.
"""
from time import sleep

from app import track_recovery
from app.database import SessionLocal
from app.models import Transition
from app.spotify import SpotifyUnavailableError, get_tracks
from app.track_store import is_custom

# Small courtesy gap so a long backfill does not get search throttled too.
RECOVERY_PAUSE_SECONDS = 0.2


def _transition_track_ids() -> list[str]:
    with SessionLocal() as session:
        rows = session.query(Transition.from_track_id, Transition.to_track_id).all()
    return sorted({track_id for row in rows for track_id in row})


def _recover_all(track_ids: list[str]) -> list[str]:
    """Recover what it can, returning the IDs that are still unidentified."""
    unresolved: list[str] = []
    for index, track_id in enumerate(track_ids):
        if index:
            sleep(RECOVERY_PAUSE_SECONDS)
        try:
            summary = track_recovery.recover(track_id)
        except SpotifyUnavailableError as error:
            print(f"  stopped: {error}")
            return unresolved + track_ids[index:]

        if summary is None:
            unresolved.append(track_id)
            print(f"  ....  {track_id}")
        else:
            print(f"  ok    {track_id}  {summary.name} - {', '.join(summary.artists)}")
    return unresolved


def main() -> None:
    track_ids = _transition_track_ids()
    if not track_ids:
        print("No transitions stored yet, nothing to warm.")
        return

    tracks = get_tracks(track_ids)
    missing = [
        track_id
        for track_id in track_ids
        if track_id not in tracks and not is_custom(track_id)
    ]
    print(f"Resolved by ID lookup: {len(tracks)} of {len(track_ids)} songs.")

    if missing:
        print(f"\nRecovering the remaining {len(missing)} via oEmbed + search:")
        missing = _recover_all(missing)

    print(f"\n{len(track_ids) - len(missing)} of {len(track_ids)} songs stored locally.")

    if missing:
        print(f"\n{len(missing)} still unidentified:")
        for track_id in missing:
            print(f"  {track_id}")
        raise SystemExit(1)

    print("Every song in your transitions is now stored locally.")


if __name__ == "__main__":
    main()
