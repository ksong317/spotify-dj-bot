import { memo } from 'react';
import { EdgeLabelRenderer } from 'reactflow';

function TransitionEdge({ data, markerEnd, markerStart }) {
  const { path, labelX, labelY, notes, active } = data;
  return (
    <>
      <path className="transition-edge__hit" d={path} />
      <path
        className={active ? 'transition-edge__line is-active' : 'transition-edge__line'}
        d={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {notes ? (
        <EdgeLabelRenderer>
          <span
            className={active ? 'transition-edge__dot is-active' : 'transition-edge__dot'}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default memo(TransitionEdge);
