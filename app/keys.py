"""The Camelot wheel: key codes, the keys they name, and the moves between them.

Keys are stored as Camelot codes ("8B") because the code carries both the musical
key and its place on the wheel, which turns transposing and harmonic matching into
arithmetic: a semitone up is seven steps around the wheel, so 1B becomes 8B.
"""

WHEEL_SIZE = 12

# A = minor, B = its relative major. Spellings follow the conventional DJ naming
# (D flat major rather than C sharp major); `normalize` accepts either.
_KEY_NAMES: dict[str, str] = {
    "1A": "G\u266f minor",
    "1B": "B major",
    "2A": "D\u266f minor",
    "2B": "F\u266f major",
    "3A": "B\u266d minor",
    "3B": "D\u266d major",
    "4A": "F minor",
    "4B": "A\u266d major",
    "5A": "C minor",
    "5B": "E\u266d major",
    "6A": "G minor",
    "6B": "B\u266d major",
    "7A": "D minor",
    "7B": "F major",
    "8A": "A minor",
    "8B": "C major",
    "9A": "E minor",
    "9B": "G major",
    "10A": "B minor",
    "10B": "D major",
    "11A": "F\u266f minor",
    "11B": "A major",
    "12A": "C\u266f minor",
    "12B": "E major",
}

CODES = tuple(
    f"{number}{letter}" for number in range(1, WHEEL_SIZE + 1) for letter in "AB"
)

# Notes that sound the same, so "Ebm" and "D#m" both find 2A.
_ENHARMONICS = (
    ("C",),
    ("C#", "Db"),
    ("D",),
    ("D#", "Eb"),
    ("E",),
    ("F",),
    ("F#", "Gb"),
    ("G",),
    ("G#", "Ab"),
    ("A",),
    ("A#", "Bb"),
    ("B",),
)
_SPELLINGS = {
    spelling.lower(): group for group in _ENHARMONICS for spelling in group
}
_MODE_SUFFIXES = {"major": ("", "maj", "major"), "minor": ("m", "min", "minor")}


def _ascii(name: str) -> str:
    return name.replace("\u266f", "#").replace("\u266d", "b")


def _build_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for code, name in _KEY_NAMES.items():
        aliases[code.lower()] = code
        tonic, mode = _ascii(name).split(" ")
        for spelling in _SPELLINGS[tonic.lower()]:
            for suffix in _MODE_SUFFIXES[mode]:
                aliases[f"{spelling}{suffix}".lower()] = code
    return aliases


_ALIASES = _build_aliases()


def label(code: str) -> str:
    """How a key is written in the UI, e.g. "8B / C major"."""
    return f"{code} / {_KEY_NAMES[code]}"


def key_name(code: str) -> str:
    return _KEY_NAMES[code]


def normalize(value: str | None) -> str | None:
    """Turn anything the user might type into a Camelot code, or None if blank.

    Accepts codes ("8b"), key names ("c major", "Ebm", "F# minor") and the labels
    this app prints ("8B / C major").
    """
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    for part in (text, *text.split("/")):
        candidate = _ascii(part).replace(" ", "").lower()
        code = _ALIASES.get(candidate)
        if code:
            return code
    raise ValueError(
        f"\u201c{text}\u201d is not a key. Use a Camelot code like 8B, or a key "
        "name like C major or Ebm."
    )


def split(code: str) -> tuple[int, str]:
    return int(code[:-1]), code[-1]


def transpose(code: str, semitones: int) -> str:
    """The same mode, `semitones` higher: each semitone is 7 steps on the wheel."""
    number, letter = split(code)
    shifted = (number - 1 + 7 * semitones) % WHEEL_SIZE + 1
    return f"{shifted}{letter}"


def relative(code: str) -> str:
    """The relative major of a minor key, or the other way round."""
    number, letter = split(code)
    return f"{number}{'B' if letter == 'A' else 'A'}"


def sort_index(code: str | None) -> tuple[int, int]:
    """Orders keys around the wheel: 1A, 1B, 2A, 2B… Unset keys sort last."""
    if code is None:
        return (WHEEL_SIZE + 1, 0)
    number, letter = split(code)
    return (number, 0 if letter == "A" else 1)


def compatible(code: str) -> dict[str, str]:
    """Keys that mix with `code`, mapped to why, in the order a DJ would try them.

    The reasons are the same words `keyRelation` in frontend/src/camelot.js prints
    on a mix, so one relationship is never called two things.
    """
    number, letter = split(code)
    up = f"{number % WHEEL_SIZE + 1}{letter}"
    down = f"{(number - 2) % WHEEL_SIZE + 1}{letter}"
    return {
        code: "same key",
        up: "energy up",
        down: "energy down",
        relative(code): "mood switch",
    }
