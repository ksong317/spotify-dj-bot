import { ENERGY_LABELS, ENERGY_LEVELS, toggleEnergy } from '../../setlist.js';

/**
 * Ordered multi-select for a part's energy.
 *
 * The buttons stay Low / Medium / High so they are easy to find. Selection
 * order is the number on a chosen button, and the thing that is saved.
 */
export default function EnergyPicker({ levels, busy, onChange }) {
  const selected = levels ?? [];

  return (
    <div className="energy" role="group" aria-label="Part energy">
      {ENERGY_LEVELS.map((level) => {
        const order = selected.indexOf(level);
        const on = order >= 0;
        return (
          <button
            type="button"
            key={level}
            className={
              on
                ? `energy__option energy__option--${level} is-active`
                : `energy__option energy__option--${level}`
            }
            aria-pressed={on}
            disabled={busy}
            title={
              on
                ? `${ENERGY_LABELS[level]} energy — click to remove`
                : `Add ${ENERGY_LABELS[level].toLowerCase()} energy`
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onChange(toggleEnergy(selected, level))}
          >
            {ENERGY_LABELS[level]}
            {on && selected.length > 1 ? (
              <span className="energy__order">{order + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function EnergyTrail({ levels }) {
  const selected = levels ?? [];
  if (!selected.length) return null;
  return (
    <span className="energy-trail">
      {selected.map((level, index) => (
        <span key={level} className="energy-trail__item">
          {index > 0 ? <span className="energy-trail__arrow">→</span> : null}
          <span className={`energy-trail__level energy-trail__level--${level}`}>
            {ENERGY_LABELS[level]}
          </span>
        </span>
      ))}
    </span>
  );
}
