// The Camelot wheel, mirroring app/keys.py. A = minor, B = its relative major,
// and a semitone up is seven steps around the wheel (1B → 8B).
export const WHEEL_SIZE = 12;

const KEY_NAMES = {
  '1A': 'G♯ minor',
  '1B': 'B major',
  '2A': 'D♯ minor',
  '2B': 'F♯ major',
  '3A': 'B♭ minor',
  '3B': 'D♭ major',
  '4A': 'F minor',
  '4B': 'A♭ major',
  '5A': 'C minor',
  '5B': 'E♭ major',
  '6A': 'G minor',
  '6B': 'B♭ major',
  '7A': 'D minor',
  '7B': 'F major',
  '8A': 'A minor',
  '8B': 'C major',
  '9A': 'E minor',
  '9B': 'G major',
  '10A': 'B minor',
  '10B': 'D major',
  '11A': 'F♯ minor',
  '11B': 'A major',
  '12A': 'C♯ minor',
  '12B': 'E major',
};

export const CODES = Array.from({ length: WHEEL_SIZE }, (_, index) => index + 1).flatMap(
  (number) => [`${number}A`, `${number}B`],
);

const ENHARMONICS = [
  ['C'],
  ['C#', 'Db'],
  ['D'],
  ['D#', 'Eb'],
  ['E'],
  ['F'],
  ['F#', 'Gb'],
  ['G'],
  ['G#', 'Ab'],
  ['A'],
  ['A#', 'Bb'],
  ['B'],
];
const MODE_SUFFIXES = { major: ['', 'maj', 'major'], minor: ['m', 'min', 'minor'] };

const toAscii = (text) => text.replace(/♯/g, '#').replace(/♭/g, 'b');

const ALIASES = (() => {
  const spellings = new Map();
  for (const group of ENHARMONICS) {
    for (const spelling of group) spellings.set(spelling.toLowerCase(), group);
  }
  const aliases = new Map();
  for (const [code, name] of Object.entries(KEY_NAMES)) {
    aliases.set(code.toLowerCase(), code);
    const [tonic, mode] = toAscii(name).split(' ');
    for (const spelling of spellings.get(tonic.toLowerCase())) {
      for (const suffix of MODE_SUFFIXES[mode]) {
        aliases.set(`${spelling}${suffix}`.toLowerCase(), code);
      }
    }
  }
  return aliases;
})();

export function keyName(code) {
  return KEY_NAMES[code] ?? '';
}

export function keyLabel(code) {
  return code ? `${code} / ${KEY_NAMES[code] ?? ''}`.trim() : '';
}

/** A Camelot code for anything typed in, or null when it is not a key. */
export function normalizeKey(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  for (const part of [text, ...text.split('/')]) {
    const code = ALIASES.get(toAscii(part).replace(/\s+/g, '').toLowerCase());
    if (code) return code;
  }
  return null;
}

export function splitCode(code) {
  return [Number(code.slice(0, -1)), code.slice(-1)];
}

export function transposeKey(code, semitones) {
  if (!code) return code;
  const [number, letter] = splitCode(code);
  const shifted = ((((number - 1 + 7 * semitones) % WHEEL_SIZE) + WHEEL_SIZE) % WHEEL_SIZE) + 1;
  return `${shifted}${letter}`;
}

export function relativeKey(code) {
  const [number, letter] = splitCode(code);
  return `${number}${letter === 'A' ? 'B' : 'A'}`;
}

/** Orders keys around the wheel: 1A, 1B, 2A, 2B… Unset keys sort last. */
export function keySortIndex(code) {
  if (!code) return (WHEEL_SIZE + 1) * 2;
  const [number, letter] = splitCode(code);
  return number * 2 + (letter === 'A' ? 0 : 1);
}

/**
 * A colour for a key, with hue following its place on the wheel.
 *
 * One step around the wheel is one step around the colour circle, so keys that
 * mix together look alike and a clash looks plainly out of place. A minor key
 * and its relative major share a hue and differ only in weight, because they
 * are the same place on the wheel.
 */
export function keyColor(code) {
  if (!code) return 'transparent';
  const [number, letter] = splitCode(code);
  const hue = ((number - 1) * (360 / WHEEL_SIZE)) % 360;
  return letter === 'A' ? `hsl(${hue} 48% 46%)` : `hsl(${hue} 72% 62%)`;
}

/**
 * How two keys sit together: the same key, a step away on the wheel, or a clash.
 *
 * Null when either side is unknown — an unanswered question is not a verdict.
 */
export function keyRelation(from, to) {
  if (!from || !to) return null;
  // Wording matches the reasons app/keys.py gives for suggesting a song.
  if (from === to) return { kind: 'match', label: 'same key' };

  const [fromNumber, fromLetter] = splitCode(from);
  const [toNumber, toLetter] = splitCode(to);

  if (fromLetter === toLetter) {
    const step = (toNumber - fromNumber + WHEEL_SIZE) % WHEEL_SIZE;
    if (step === 1) return { kind: 'near', label: 'energy up' };
    if (step === WHEEL_SIZE - 1) return { kind: 'near', label: 'energy down' };
  } else if (fromNumber === toNumber) {
    return { kind: 'near', label: 'mood switch' };
  }
  return { kind: 'clash', label: 'keys clash' };
}
