import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';

import { fetchGraph, fetchGraphSongs, formatArtists } from '../api.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import DepthPicker from '../components/DepthPicker.jsx';
import GraphCanvas from '../components/GraphCanvas.jsx';
import SongPicker from '../components/SongPicker.jsx';
import TransitionPanel from '../components/TransitionPanel.jsx';

function initialTrail() {
  const songId = new URLSearchParams(window.location.search).get('song');
  return songId ? [songId] : [];
}

export default function GraphPage() {
  const [songs, setSongs] = useState([]);
  const [songsState, setSongsState] = useState({ loading: true, error: null });
  const [trail, setTrail] = useState(initialTrail);
  const [tracksById, setTracksById] = useState(() => new Map());
  const [graph, setGraph] = useState(null);
  const [graphState, setGraphState] = useState({ loading: false, error: null });
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [depth, setDepth] = useState(1);
  const [showUnconnected, setShowUnconnected] = useState(false);

  const currentId = trail.length ? trail[trail.length - 1] : null;

  useEffect(() => {
    const controller = new AbortController();
    fetchGraphSongs({ signal: controller.signal })
      .then((data) => {
        setSongs(data);
        setSongsState({ loading: false, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSongsState({ loading: false, error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentId) {
      url.searchParams.set('song', currentId);
    } else {
      url.searchParams.delete('song');
    }
    window.history.replaceState(null, '', url);
  }, [currentId]);

  useEffect(() => {
    if (!currentId) {
      setGraph(null);
      setGraphState({ loading: false, error: null });
      return undefined;
    }

    const controller = new AbortController();
    setGraphState({ loading: true, error: null });
    setHoveredEdgeId(null);
    setSelectedEdgeId(null);

    fetchGraph(currentId, depth, {
      includeUnconnected: showUnconnected,
      signal: controller.signal,
    })
      .then((data) => {
        setGraph(data);
        setGraphState({ loading: false, error: null });
        setTracksById((previous) => {
          const next = new Map(previous);
          next.set(data.center.id, data.center);
          for (const neighbor of data.neighbors) {
            if (neighbor.track) next.set(neighbor.id, neighbor.track);
          }
          return next;
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setGraph(null);
        setGraphState({ loading: false, error: error.message });
      });

    return () => controller.abort();
  }, [currentId, depth, showUnconnected, reloadToken]);

  const trailTracks = useMemo(
    () =>
      trail.map(
        (id) => tracksById.get(id) ?? { id, name: 'Loading…', artists: [] },
      ),
    [trail, tracksById],
  );

  const detail = useMemo(() => {
    const activeEdgeId = selectedEdgeId ?? hoveredEdgeId;
    if (!graph || !activeEdgeId) return null;
    const edge = graph.edges.find((item) => String(item.id) === activeEdgeId);
    if (!edge) return null;
    const byId = new Map([[graph.center.id, graph.center]]);
    for (const neighbor of graph.neighbors) {
      if (neighbor.track) byId.set(neighbor.id, neighbor.track);
    }
    // Notes stay readable even when one end of the edge has no metadata yet.
    const resolve = (id) =>
      byId.get(id) ?? { id, name: 'Details unavailable', artists: [] };

    return {
      notes: edge.notes,
      bidirectional: edge.bidirectional,
      fromTrack: resolve(edge.from_track_id),
      toTrack: resolve(edge.to_track_id),
    };
  }, [graph, hoveredEdgeId, selectedEdgeId]);

  const rememberTrack = useCallback((track) => {
    setTracksById((previous) => new Map(previous).set(track.id, track));
  }, []);

  const startFrom = useCallback(
    (track) => {
      rememberTrack(track);
      setTrail([track.id]);
    },
    [rememberTrack],
  );

  const travelTo = useCallback(
    (track, { connected = true } = {}) => {
      rememberTrack(track);
      // A song on another chain cannot be walked to, so it starts a fresh trail
      // instead of being tacked onto the path that led here.
      if (!connected) {
        setTrail([track.id]);
        return;
      }
      setTrail((previous) => {
        const index = previous.indexOf(track.id);
        return index === -1 ? [...previous, track.id] : previous.slice(0, index + 1);
      });
    },
    [rememberTrack],
  );

  const goBack = useCallback(() => {
    setTrail((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous));
  }, []);

  const goToCrumb = useCallback((index) => {
    setTrail((previous) => previous.slice(0, index + 1));
  }, []);

  const showGraph = Boolean(graph);
  const isEmptyGraph =
    showGraph && graph.neighbors.every((neighbor) => neighbor.depth === null);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Transition Graph</h1>
          <p className="page__subtitle">
            Pick a song, then click any neighbor to travel to it.
          </p>
        </div>
        <nav className="page__nav">
          <a className="page__link" href="/">
            Library
          </a>
          <Link className="page__link" to="/setlists">
            Set lists
          </Link>
        </nav>
      </header>

      <SongPicker
        songs={songs}
        loading={songsState.loading}
        error={songsState.error}
        onSelect={startFrom}
      />

      <div className="page__controls">
        <Breadcrumbs
          trail={trailTracks}
          onNavigate={goToCrumb}
          onBack={goBack}
          onReset={() => setTrail([])}
        />
        <DepthPicker depth={depth} onChange={setDepth} />
        <label className="chain-toggle">
          <input
            type="checkbox"
            checked={showUnconnected}
            onChange={(event) => setShowUnconnected(event.target.checked)}
          />
          Other chains
        </label>
      </div>

      <main className="page__body">
        <div className="canvas">
          {showGraph ? (
            <ReactFlowProvider>
              <GraphCanvas
                graph={graph}
                hoveredEdgeId={hoveredEdgeId}
                selectedEdgeId={selectedEdgeId}
                onHoverEdge={setHoveredEdgeId}
                onSelectEdge={setSelectedEdgeId}
                onTravel={travelTo}
              />
            </ReactFlowProvider>
          ) : null}

          {isEmptyGraph ? (
            <div className="canvas__notice">
              No transitions logged yet for “{graph.center.name}” by{' '}
              {formatArtists(graph.center)}.
            </div>
          ) : null}

          {graphState.loading ? (
            <div className="canvas__overlay">
              <span className="spinner" aria-hidden="true" />
              <span>Loading graph…</span>
            </div>
          ) : null}

          {graphState.error ? (
            <div className="canvas__overlay canvas__overlay--error">
              <p>{graphState.error}</p>
              <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
                Retry
              </button>
            </div>
          ) : null}

          {!showGraph && !graphState.loading && !graphState.error ? (
            <div className="canvas__placeholder">
              <p>Search for a song above to build its transition graph.</p>
            </div>
          ) : null}
        </div>

        <TransitionPanel
          detail={detail}
          pinned={Boolean(selectedEdgeId)}
          graph={graph}
          onClear={() => setSelectedEdgeId(null)}
        />
      </main>
    </div>
  );
}
