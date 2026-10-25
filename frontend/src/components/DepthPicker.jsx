const OPTIONS = [
  { value: 1, label: '1 hop' },
  { value: 2, label: '2 hops' },
  { value: 0, label: 'Whole chain' },
];

export default function DepthPicker({ depth, onChange }) {
  return (
    <div className="depth" role="group" aria-label="How far to explore">
      <span className="depth__label">Show</span>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            option.value === depth ? 'depth__option is-active' : 'depth__option'
          }
          aria-pressed={option.value === depth}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
