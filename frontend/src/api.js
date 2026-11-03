async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.detail === 'string') {
        detail = payload.detail;
      } else if (Array.isArray(payload?.detail)) {
        // Validation errors arrive as a list of per-field problems.
        detail = payload.detail.map((item) => item.msg).join('; ');
      }
    } catch {
      // Error responses are not guaranteed to carry a JSON body.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function fetchGraphSongs(options) {
  return request('/api/graph/songs', options);
}

export function fetchGraph(trackId, depth, { includeUnconnected = false, signal } = {}) {
  const query = new URLSearchParams({
    depth: String(depth),
    include_unconnected: String(includeUnconnected),
  });
  return request(`/api/graph/${encodeURIComponent(trackId)}?${query}`, { signal });
}

export function searchSpotify(query, options) {
  return request(`/api/search?q=${encodeURIComponent(query)}&limit=10`, options);
}

export function createTransition(body) {
  return request('/api/transitions', { method: 'POST', body });
}

export function saveTrackDefaults(trackId, defaults) {
  return request(`/api/tracks/${encodeURIComponent(trackId)}/defaults`, {
    method: 'PATCH',
    body: defaults,
  });
}

/* ---------- track info ---------- */

export function searchTrackInfo(query, options) {
  return request(`/api/tracks/search?q=${encodeURIComponent(query)}&limit=8`, options);
}

export function fetchTrackInfo(trackId, options) {
  return request(`/api/tracks/${encodeURIComponent(trackId)}/info`, options);
}

export function createCustomTrack(body) {
  return request('/api/tracks/custom', { method: 'POST', body });
}

/* ---------- set lists ---------- */

const setListPath = (setListId, suffix = '') =>
  `/api/setlists/${encodeURIComponent(setListId)}${suffix}`;

export function fetchSetLists(options) {
  return request('/api/setlists', options);
}

export function createSetList(body) {
  return request('/api/setlists', { method: 'POST', body });
}

export function fetchSetList(setListId, options) {
  return request(setListPath(setListId), options);
}

export function updateSetList(setListId, body) {
  return request(setListPath(setListId), { method: 'PATCH', body });
}

export function deleteSetList(setListId) {
  return request(setListPath(setListId), { method: 'DELETE' });
}

export function addSetListItem(setListId, body) {
  return request(setListPath(setListId, '/items'), { method: 'POST', body });
}

export function deleteSetListItem(setListId, itemId) {
  return request(setListPath(setListId, `/items/${itemId}`), { method: 'DELETE' });
}

export function updateSetListItem(setListId, itemId, body) {
  return request(setListPath(setListId, `/items/${itemId}`), {
    method: 'PATCH',
    body,
  });
}

export function reorderSetListItems(setListId, itemIds) {
  return request(setListPath(setListId, '/items/reorder'), {
    method: 'POST',
    body: { item_ids: itemIds },
  });
}

export function saveSetListTransition(setListId, fromItemId, toItemId, body) {
  return request(setListPath(setListId, `/transitions/${fromItemId}/${toItemId}`), {
    method: 'PUT',
    body,
  });
}

export function addCoreTrack(setListId, trackId) {
  return request(setListPath(setListId, '/core-tracks'), {
    method: 'POST',
    body: { track_id: trackId },
  });
}

export function deleteCoreTrack(setListId, trackId) {
  return request(
    setListPath(setListId, `/core-tracks/${encodeURIComponent(trackId)}`),
    { method: 'DELETE' },
  );
}

export function reorderCoreTracks(setListId, trackIds) {
  return request(setListPath(setListId, '/core-tracks/reorder'), {
    method: 'POST',
    body: { track_ids: trackIds },
  });
}

export function fetchSuggestions(setListId, { afterItemId, query, signal } = {}) {
  const params = new URLSearchParams();
  if (afterItemId != null) params.set('after_item_id', String(afterItemId));
  if (query) params.set('q', query);
  return request(setListPath(setListId, `/suggestions?${params}`), { signal });
}

export function formatArtists(track) {
  return track.artists.join(', ');
}
