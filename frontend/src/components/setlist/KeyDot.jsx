import { keyColor } from '../../camelot.js';

/**
 * The colour of a key, to sit beside its name.
 *
 * Decoration only: every dot in the app is next to the key written out, so
 * nothing here is the sole carrier of meaning.
 */
export default function KeyDot({ code }) {
  if (!code) return null;
  return (
    <span className="keydot" style={{ background: keyColor(code) }} aria-hidden="true" />
  );
}
