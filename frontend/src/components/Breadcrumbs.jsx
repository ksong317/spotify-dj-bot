import { useEffect, useRef } from 'react';

export default function Breadcrumbs({ trail, onNavigate, onBack, onReset }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ inline: 'end', block: 'nearest' });
  }, [trail.length]);

  if (trail.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label="Visited songs">
      <button
        type="button"
        className="breadcrumbs__back"
        onClick={onBack}
        disabled={trail.length < 2}
      >
        ← Back
      </button>
      <ol className="breadcrumbs__trail">
        {trail.map((track, index) => (
          <li key={`${track.id}-${index}`}>
            {index > 0 ? <span className="breadcrumbs__sep">/</span> : null}
            <button
              type="button"
              className={
                index === trail.length - 1
                  ? 'breadcrumbs__crumb is-current'
                  : 'breadcrumbs__crumb'
              }
              aria-current={index === trail.length - 1 ? 'page' : undefined}
              onClick={() => onNavigate(index)}
            >
              {track.name}
            </button>
          </li>
        ))}
        <li ref={endRef} aria-hidden="true" />
      </ol>
      <button type="button" className="breadcrumbs__reset" onClick={onReset}>
        Clear
      </button>
    </nav>
  );
}
