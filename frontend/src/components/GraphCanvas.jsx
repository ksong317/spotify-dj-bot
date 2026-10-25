import { useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useReactFlow,
} from 'reactflow';

import { buildEgoLayout } from '../layout.js';
import SongNode from './SongNode.jsx';
import TransitionEdge from './TransitionEdge.jsx';

const nodeTypes = { song: SongNode };
const edgeTypes = { transition: TransitionEdge };
const FIT_VIEW_OPTIONS = { padding: 0.14, maxZoom: 1.1 };

const EDGE_IDLE = '#454559';
const EDGE_ACTIVE = '#1ed760';

export default function GraphCanvas({
  graph,
  hoveredEdgeId,
  selectedEdgeId,
  onHoverEdge,
  onSelectEdge,
  onTravel,
}) {
  const { fitView } = useReactFlow();
  const layout = useMemo(() => buildEgoLayout(graph), [graph]);

  const edges = useMemo(
    () =>
      layout.edges.map((edge) => {
        const active = edge.id === selectedEdgeId || edge.id === hoveredEdgeId;
        const marker = {
          type: MarkerType.ArrowClosed,
          color: active ? EDGE_ACTIVE : EDGE_IDLE,
          width: 20,
          height: 20,
        };
        return {
          ...edge,
          data: { ...edge.data, active },
          markerEnd: marker,
          markerStart: edge.data.bidirectional ? marker : undefined,
          zIndex: active ? 10 : 0,
        };
      }),
    [layout.edges, hoveredEdgeId, selectedEdgeId],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      fitView({ ...FIT_VIEW_OPTIONS, duration: 480 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [layout, fitView]);

  return (
    <ReactFlow
      nodes={layout.nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.2}
      maxZoom={1.6}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      onNodeClick={(_, node) => {
        // Songs with no metadata cannot be centered, since the graph has no title
        // to show and the API would only fail on them again.
        if (!node.data.isCenter && node.data.track) {
          onTravel(node.data.track, { connected: !node.data.isUnconnected });
        }
      }}
      onEdgeMouseEnter={(_, edge) => onHoverEdge(edge.id)}
      onEdgeMouseLeave={() => onHoverEdge(null)}
      onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => onSelectEdge(null)}
    >
      <Background color="#2b2b38" gap={28} size={1.5} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
