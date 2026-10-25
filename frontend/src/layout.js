export const CENTER_SIZE = { width: 248, height: 96 };
export const NEIGHBOR_SIZE = { width: 208, height: 78 };

const MIN_RADIUS = 320;
// Kept wider than a node so two rings can never collide, even where a node on one
// ring sits at the same angle as a node on the next.
const RING_GAP = 232;
const ARC_PER_NEIGHBOR = 260;
const PARALLEL_EDGE_GAP = 84;
const BORDER_PADDING = 10;
const ISLAND_GAP = 220;
// Islands are packed into a block this many times wider than tall, so that a long
// list of them stays close to the shape of a screen instead of a tall column.
const ISLAND_ASPECT = 1.7;

function adjacencyOf(edges) {
  const adjacency = new Map();
  const link = (a, b) => {
    const set = adjacency.get(a);
    if (set) set.add(b);
    else adjacency.set(a, new Set([b]));
  };
  for (const edge of edges) {
    link(edge.from_track_id, edge.to_track_id);
    link(edge.to_track_id, edge.from_track_id);
  }
  return adjacency;
}

/**
 * Reduce the graph to a tree by giving every node a single parent one hop closer
 * to the center, which is what lets a subtree claim one contiguous slice of the
 * circle. Ties go to the earliest parent in `order` so the result is stable, and
 * the extra edges a node has beyond its chosen parent are still drawn.
 */
function childrenByParent(centerId, neighbors, edges, order) {
  const adjacency = adjacencyOf(edges);
  const depths = new Map([[centerId, 0]]);
  for (const neighbor of neighbors) depths.set(neighbor.id, neighbor.depth);

  const rank = new Map(order.map((id, index) => [id, index]));
  const children = new Map(order.map((id) => [id, []]));

  for (const neighbor of neighbors) {
    let parent = centerId;
    let best = Number.POSITIVE_INFINITY;
    for (const other of adjacency.get(neighbor.id) ?? []) {
      const candidate = rank.get(other) ?? Number.POSITIVE_INFINITY;
      if (depths.get(other) === neighbor.depth - 1 && candidate < best) {
        best = candidate;
        parent = other;
      }
    }
    children.get(parent).push(neighbor.id);
  }
  return children;
}

/**
 * Leaves below each node, which is how much of the circle its subtree needs.
 * `order` runs from the center outward, so walking it backwards always reaches a
 * node's children before the node itself.
 */
function subtreeLeaves(order, children) {
  const leaves = new Map();
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const id = order[index];
    let total = 0;
    for (const child of children.get(id) ?? []) total += leaves.get(child) ?? 1;
    leaves.set(id, Math.max(total, 1));
  }
  return leaves;
}

/**
 * Place each hop distance on its own ring, expanding outward from the center.
 * A node sits at the middle of its parent's slice of the circle, so its own
 * children stay in the same direction instead of wrapping around the far side.
 */
function ringPositions(centerId, neighbors, edges) {
  const order = [centerId, ...neighbors.map((neighbor) => neighbor.id)];
  const children = childrenByParent(centerId, neighbors, edges, order);
  const leaves = subtreeLeaves(order, children);

  const angles = new Map();
  const wedges = new Map([[centerId, { start: -Math.PI / 2, width: 2 * Math.PI }]]);
  for (const id of order) {
    const wedge = wedges.get(id);
    if (!wedge) continue;
    let cursor = wedge.start;
    for (const child of children.get(id) ?? []) {
      const width = (wedge.width * leaves.get(child)) / leaves.get(id);
      wedges.set(child, { start: cursor, width });
      angles.set(child, cursor + width / 2);
      cursor += width;
    }
  }

  const byDepth = new Map();
  for (const neighbor of neighbors) {
    const ring = byDepth.get(neighbor.depth);
    if (ring) ring.push(neighbor);
    else byDepth.set(neighbor.depth, [neighbor]);
  }

  const points = new Map();
  let radius = 0;

  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const ring = byDepth.get(depth);

    // Slices are uneven, so the ring has to be wide enough for its tightest pair
    // rather than for an even spread of the same number of nodes.
    const sorted = ring.map((neighbor) => angles.get(neighbor.id)).sort((a, b) => a - b);
    let gap = 2 * Math.PI;
    for (let index = 0; index + 1 < sorted.length; index += 1) {
      gap = Math.min(gap, sorted[index + 1] - sorted[index]);
    }
    const needed = ARC_PER_NEIGHBOR / Math.max(gap, 1e-6);
    radius = Math.max(radius + RING_GAP, needed, MIN_RADIUS);

    for (const neighbor of ring) {
      const angle = angles.get(neighbor.id);
      points.set(neighbor.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }

  return points;
}

/** Every song reachable from `startId`, which is one whole chain. */
function collectIsland(startId, adjacency, seen) {
  const members = [startId];
  seen.add(startId);
  for (let index = 0; index < members.length; index += 1) {
    for (const next of adjacency.get(members[index]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      members.push(next);
    }
  }
  return members;
}

function hopsFrom(rootId, adjacency) {
  const depths = new Map([[rootId, 0]]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    for (const next of adjacency.get(id) ?? []) {
      if (depths.has(next)) continue;
      depths.set(next, depths.get(id) + 1);
      queue.push(next);
    }
  }
  return depths;
}

/**
 * Lay a chain out on rings the same way the center's graph is laid out, hanging it
 * off whichever of its songs has the most transitions so the rings stay shallow.
 */
function islandPoints(members, adjacency, rank, edges) {
  const degreeOf = (id) => (adjacency.get(id) ?? new Set()).size;
  const rootId = members.reduce((best, id) => {
    if (degreeOf(id) !== degreeOf(best)) return degreeOf(id) > degreeOf(best) ? id : best;
    return rank.get(id) < rank.get(best) ? id : best;
  });

  const hops = hopsFrom(rootId, adjacency);
  const neighbors = members
    .filter((id) => id !== rootId)
    .map((id) => ({ id, depth: hops.get(id) }))
    .sort((a, b) => a.depth - b.depth || rank.get(a.id) - rank.get(b.id));

  const memberIds = new Set(members);
  const points = ringPositions(
    rootId,
    neighbors,
    edges.filter((edge) => memberIds.has(edge.from_track_id)),
  );
  points.set(rootId, { x: 0, y: 0 });
  return points;
}

function boundsOf(placements) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const { point, size } of placements) {
    bounds.minX = Math.min(bounds.minX, point.x - size.width / 2);
    bounds.minY = Math.min(bounds.minY, point.y - size.height / 2);
    bounds.maxX = Math.max(bounds.maxX, point.x + size.width / 2);
    bounds.maxY = Math.max(bounds.maxY, point.y + size.height / 2);
  }
  return bounds;
}

/** Fit the islands into rows, each row centered under the graph above it. */
function packIslands(islands, top, centerX, minWidth) {
  const rowWidth = (island) => island.bounds.maxX - island.bounds.minX;

  // A row long enough that the finished block lands near ISLAND_ASPECT, given how
  // much width the islands need in total and how tall a typical one is.
  let total = 0;
  let heights = 0;
  for (const island of islands) {
    total += rowWidth(island) + ISLAND_GAP;
    heights += island.bounds.maxY - island.bounds.minY + ISLAND_GAP;
  }
  const limit = Math.max(
    minWidth,
    Math.sqrt((ISLAND_ASPECT * total * heights) / islands.length),
  );

  const rows = [];
  for (const island of islands) {
    const row = rows[rows.length - 1];
    if (row && row.width + ISLAND_GAP + rowWidth(island) <= limit) {
      row.width += ISLAND_GAP + rowWidth(island);
      row.items.push(island);
    } else {
      rows.push({ items: [island], width: rowWidth(island) });
    }
  }

  let y = top;
  for (const row of rows) {
    const height = Math.max(
      ...row.items.map((island) => island.bounds.maxY - island.bounds.minY),
    );
    let x = centerX - row.width / 2;
    for (const island of row.items) {
      // Islands in a row sit on a shared middle line rather than a shared top edge.
      const slack = (height - (island.bounds.maxY - island.bounds.minY)) / 2;
      island.offset = {
        x: x - island.bounds.minX,
        y: y - island.bounds.minY + slack,
      };
      x += rowWidth(island) + ISLAND_GAP;
    }
    y += height + ISLAND_GAP;
  }
}

/**
 * Place the songs that no path from the center reaches, below the center's graph.
 * Each separate chain is laid out on its own, then the chains are packed into rows.
 */
function unconnectedPlacements(neighbors, edges, mainBounds) {
  const memberIds = new Set(neighbors.map((neighbor) => neighbor.id));
  const islandEdges = edges.filter((edge) => memberIds.has(edge.from_track_id));
  const adjacency = adjacencyOf(islandEdges);
  const rank = new Map(neighbors.map((neighbor, index) => [neighbor.id, index]));

  const seen = new Set();
  const islands = [];
  for (const neighbor of neighbors) {
    if (seen.has(neighbor.id)) continue;
    const members = collectIsland(neighbor.id, adjacency, seen);
    const points = islandPoints(members, adjacency, rank, islandEdges);
    const placements = [...points.values()].map((point) => ({
      point,
      size: NEIGHBOR_SIZE,
    }));
    islands.push({ points, bounds: boundsOf(placements) });
  }

  packIslands(
    islands,
    mainBounds.maxY + ISLAND_GAP,
    (mainBounds.minX + mainBounds.maxX) / 2,
    mainBounds.maxX - mainBounds.minX,
  );

  const placements = new Map();
  for (const island of islands) {
    for (const [id, point] of island.points) {
      placements.set(id, {
        point: { x: point.x + island.offset.x, y: point.y + island.offset.y },
        size: NEIGHBOR_SIZE,
      });
    }
  }
  return placements;
}

/** Where a ray leaving `center` toward `toward` crosses the node's rectangle. */
function borderPoint(center, size, toward) {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { ...center };
  }
  const scale = 1 / Math.max(Math.abs(dx) / (size.width / 2), Math.abs(dy) / (size.height / 2));
  return {
    x: center.x + dx * scale + (dx / distance) * BORDER_PADDING,
    y: center.y + dy * scale + (dy / distance) * BORDER_PADDING,
  };
}

function quadraticPath(source, target, offset) {
  const dx = target.point.x - source.point.x;
  const dy = target.point.y - source.point.y;
  const distance = Math.hypot(dx, dy) || 1;
  // A quadratic curve peaks halfway to its control point, so double the offset.
  const control = {
    x: (source.point.x + target.point.x) / 2 + (-dy / distance) * offset * 2,
    y: (source.point.y + target.point.y) / 2 + (dx / distance) * offset * 2,
  };
  const start = borderPoint(source.point, source.size, control);
  const end = borderPoint(target.point, target.size, control);
  return {
    path: `M ${start.x},${start.y} Q ${control.x},${control.y} ${end.x},${end.y}`,
    labelX: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    labelY: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };
}

/**
 * Fan parallel edges apart. The sign flip keeps A->B and B->A on opposite
 * sides of the straight line rather than stacked on top of each other.
 */
function offsetsByEdgeId(edges) {
  const groups = new Map();
  for (const edge of edges) {
    const key = [edge.from_track_id, edge.to_track_id].sort().join('\u0000');
    const group = groups.get(key);
    if (group) {
      group.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  const offsets = new Map();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.id - b.id);
    ordered.forEach((edge, index) => {
      const slot = index - (ordered.length - 1) / 2;
      const direction = edge.from_track_id < edge.to_track_id ? 1 : -1;
      offsets.set(edge.id, slot * PARALLEL_EDGE_GAP * direction);
    });
  }
  return offsets;
}

export function buildEgoLayout(graph) {
  // Neighbors with no depth are on chains the center cannot reach, so they are laid
  // out separately and their edges are kept out of the center's rings.
  const connected = graph.neighbors.filter((neighbor) => neighbor.depth !== null);
  const unconnected = graph.neighbors.filter((neighbor) => neighbor.depth === null);
  const connectedIds = new Set([graph.center.id, ...connected.map(({ id }) => id)]);
  const connectedEdges = graph.edges.filter((edge) =>
    connectedIds.has(edge.from_track_id),
  );

  const placements = new Map([
    [graph.center.id, { point: { x: 0, y: 0 }, size: CENTER_SIZE }],
  ]);
  for (const [id, point] of ringPositions(graph.center.id, connected, connectedEdges)) {
    placements.set(id, { point, size: NEIGHBOR_SIZE });
  }

  if (unconnected.length) {
    const bounds = boundsOf(placements.values());
    for (const [id, placement] of unconnectedPlacements(
      unconnected,
      graph.edges,
      bounds,
    )) {
      placements.set(id, placement);
    }
  }

  const entries = [
    { id: graph.center.id, track: graph.center, depth: 0, isCenter: true },
    ...graph.neighbors.map((neighbor) => ({
      id: neighbor.id,
      track: neighbor.track,
      depth: neighbor.depth,
      isCenter: false,
    })),
  ];

  const nodes = entries.map(({ id, track, depth, isCenter }) => {
    const { point, size } = placements.get(id);
    return {
      id,
      type: 'song',
      position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
      style: { width: size.width, height: size.height },
      data: { track, isCenter, depth, isUnconnected: depth === null },
    };
  });

  const offsets = offsetsByEdgeId(graph.edges);
  const edges = graph.edges.map((edge) => {
    const source = placements.get(edge.from_track_id);
    const target = placements.get(edge.to_track_id);
    const geometry = quadraticPath(source, target, offsets.get(edge.id));
    return {
      id: String(edge.id),
      source: edge.from_track_id,
      target: edge.to_track_id,
      type: 'transition',
      data: {
        ...geometry,
        notes: edge.notes,
        bidirectional: edge.bidirectional,
      },
    };
  });

  return { nodes, edges };
}
