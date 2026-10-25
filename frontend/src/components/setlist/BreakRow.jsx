/** A gap between two parts of the set, built separately and not yet joined. */
export default function BreakRow({ grip, busy, onRemove }) {
  return (
    <div className="gap">
      {grip}
      <span className="gap__rule" aria-hidden="true" />
      <span className="gap__label">gap</span>
      <button
        type="button"
        className="button button--quiet"
        disabled={busy}
        onClick={onRemove}
        title="Remove the gap and join these two parts of the set"
      >
        Join
      </button>
      <span className="gap__rule" aria-hidden="true" />
    </div>
  );
}
