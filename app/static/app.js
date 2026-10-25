const state = {
  fromTrack: null,
  toTrack: null,
  filterTrackId: null,
  editingTransitionId: null,
};

let searchTimeout = null;
let existingLookupToken = 0;

function debounceSearch(fn, delay = 300) {
  return (...args) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fn(...args), delay);
  };
}

function formatArtists(artists) {
  return artists.join(", ");
}

function renderArtwork(url, className = "") {
  if (url) {
    return `<img src="${url}" alt="" class="${className}">`;
  }
  return `<div class="no-art ${className}"></div>`;
}

function renderTrackSummary(track) {
  return `
    ${renderArtwork(track.album_art_url)}
    <div class="track-details">
      <div class="track-name">${escapeHtml(track.name)}</div>
      <div class="track-meta">${escapeHtml(formatArtists(track.artists))} · ${escapeHtml(track.album)}</div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function searchTracks(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

async function loadTransitions(trackId = null) {
  const url = trackId
    ? `/api/transitions?track_id=${encodeURIComponent(trackId)}`
    : "/api/transitions";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load transitions");
  return res.json();
}

function updateSubmitButton() {
  const btn = document.getElementById("submit-btn");
  btn.disabled = !(state.fromTrack && state.toTrack);
  btn.textContent = state.editingTransitionId ? "Update transition" : "Save transition";
}

function findMatchingTransition(transitions, fromId, toId) {
  return (
    transitions.find(
      (t) => t.from_track_id === fromId && t.to_track_id === toId
    ) ||
    transitions.find(
      (t) =>
        t.bidirectional &&
        t.from_track_id === toId &&
        t.to_track_id === fromId
    ) ||
    null
  );
}

function applyExistingTransition(match) {
  const notesEl = document.getElementById("notes");
  const bidirEl = document.getElementById("bidirectional");

  if (match) {
    state.editingTransitionId = match.id;
    notesEl.value = match.notes || "";
    bidirEl.checked = match.bidirectional;
    document.getElementById("direction-arrow").textContent = match.bidirectional
      ? "↔"
      : "→";
  } else if (state.editingTransitionId) {
    state.editingTransitionId = null;
    notesEl.value = "";
    bidirEl.checked = false;
    document.getElementById("direction-arrow").textContent = "→";
  }

  updateSubmitButton();
}

async function syncExistingTransition() {
  if (!state.fromTrack || !state.toTrack) {
    if (state.editingTransitionId) {
      applyExistingTransition(null);
    } else {
      updateSubmitButton();
    }
    return;
  }

  const token = ++existingLookupToken;
  const fromId = state.fromTrack.id;
  const toId = state.toTrack.id;

  try {
    const transitions = await loadTransitions(fromId);
    if (token !== existingLookupToken) return;
    applyExistingTransition(findMatchingTransition(transitions, fromId, toId));
  } catch {
    if (token !== existingLookupToken) return;
    applyExistingTransition(null);
  }
}

function setupTrackPicker(role) {
  const searchField = document.querySelector(`.search-field[data-role="${role}"]`);
  const input = searchField.querySelector("input");
  const resultsEl = searchField.querySelector(".search-results");
  const selectedEl = document.querySelector(`.selected-track[data-role="${role}"]`);

  const showResults = (tracks) => {
    if (!tracks.length) {
      resultsEl.innerHTML = '<div class="search-result"><span class="track-meta">No results</span></div>';
    } else {
      resultsEl.innerHTML = tracks
        .map(
          (track) => `
          <div class="search-result" data-track-id="${track.id}">
            ${renderArtwork(track.album_art_url)}
            <div class="track-info">
              <div class="track-name">${escapeHtml(track.name)}</div>
              <div class="track-meta">${escapeHtml(formatArtists(track.artists))} · ${escapeHtml(track.album)}</div>
            </div>
          </div>`
        )
        .join("");
    }
    resultsEl.classList.remove("hidden");
  };

  const selectTrack = (track) => {
    state[role === "from" ? "fromTrack" : "toTrack"] = track;
    selectedEl.innerHTML = `
      ${renderTrackSummary(track)}
      <button type="button" class="clear-btn" title="Clear">×</button>
    `;
    selectedEl.classList.remove("hidden");
    searchField.classList.add("hidden");
    resultsEl.classList.add("hidden");
    input.value = "";
    updateSubmitButton();
    syncExistingTransition();

    selectedEl.querySelector(".clear-btn").addEventListener("click", () => {
      state[role === "from" ? "fromTrack" : "toTrack"] = null;
      selectedEl.classList.add("hidden");
      searchField.classList.remove("hidden");
      syncExistingTransition();
    });
  };

  const doSearch = debounceSearch(async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      resultsEl.classList.add("hidden");
      return;
    }
    try {
      const tracks = await searchTracks(query);
      showResults(tracks);
    } catch {
      resultsEl.innerHTML = '<div class="search-result"><span class="track-meta">Search error</span></div>';
      resultsEl.classList.remove("hidden");
    }
  });

  input.addEventListener("input", doSearch);
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) doSearch();
  });

  resultsEl.addEventListener("click", (e) => {
    const result = e.target.closest(".search-result");
    if (!result?.dataset.trackId) return;
    const trackId = result.dataset.trackId;
    const trackName = result.querySelector(".track-name")?.textContent;
    const trackMeta = result.querySelector(".track-meta")?.textContent;
    const img = result.querySelector("img");
    const [artistsPart, albumPart] = (trackMeta || "").split(" · ");
    selectTrack({
      id: trackId,
      name: trackName,
      artists: artistsPart ? artistsPart.split(", ") : [],
      album: albumPart || "",
      album_art_url: img?.src || null,
    });
  });

  document.addEventListener("click", (e) => {
    if (!searchField.contains(e.target)) {
      resultsEl.classList.add("hidden");
    }
  });
}

function orientTransition(t) {
  const filtered = state.filterTrackId;
  if (filtered && t.bidirectional && t.to_track_id === filtered) {
    return {
      from: t.to_track,
      to: t.from_track,
      bidirectional: true,
      symmetric: false,
      notes: t.notes,
    };
  }
  return {
    from: t.from_track,
    to: t.to_track,
    bidirectional: t.bidirectional,
    symmetric: t.bidirectional && !filtered,
    notes: t.notes,
  };
}

const UNKNOWN_TRACK = {
  name: "Details unavailable",
  artists: ["Not loaded from Spotify yet"],
  album_art_url: null,
};

function renderTrackDisplay(track, position) {
  const shown = track || UNKNOWN_TRACK;
  return `
      <div class="track-display ${position}${track ? "" : " unknown"}">
        ${renderArtwork(shown.album_art_url)}
        <div>
          <div class="track-name">${escapeHtml(shown.name)}</div>
          <div class="track-meta">${escapeHtml(formatArtists(shown.artists))}</div>
        </div>
      </div>`;
}

function renderTransitions(transitions) {
  const listEl = document.getElementById("transitions-list");
  if (!transitions.length) {
    const emptyMessage = state.filterTrackId
      ? "No transitions from this song."
      : "No transitions yet. Add your first one above.";
    listEl.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  listEl.innerHTML = transitions
    .map((t) => {
      const view = orientTransition(t);
      return `
    <div class="transition-card${view.symmetric ? " bidirectional" : ""}">
      ${renderTrackDisplay(view.from, "from")}
      <div class="arrow-col">${view.bidirectional ? "↔" : "→"}</div>
      ${renderTrackDisplay(view.to, "to")}
      <button class="delete-btn" type="button" data-id="${t.id}"
              title="Delete transition" aria-label="Delete transition">&times;</button>
      ${view.notes ? `<div class="notes">${escapeHtml(view.notes)}</div>` : ""}
    </div>`;
    })
    .join("");
}

async function refreshTransitions() {
  const listEl = document.getElementById("transitions-list");
  listEl.innerHTML = '<p class="empty-state">Loading transitions...</p>';
  try {
    const transitions = await loadTransitions(state.filterTrackId);
    renderTransitions(transitions);
  } catch {
    listEl.innerHTML = '<p class="empty-state">Failed to load transitions.</p>';
  }
}

// Deleting loses a note that only exists here, so the first click only arms the
// button and a second one within this window actually removes the transition.
const DELETE_CONFIRM_MS = 4000;

function disarmDelete(btn) {
  clearTimeout(Number(btn.dataset.timer));
  delete btn.dataset.confirming;
  delete btn.dataset.timer;
  btn.classList.remove("confirming");
  btn.innerHTML = "&times;";
  btn.setAttribute("aria-label", "Delete transition");
}

function armDelete(btn) {
  document.querySelectorAll(".delete-btn.confirming").forEach(disarmDelete);
  btn.dataset.confirming = "true";
  btn.dataset.timer = String(setTimeout(() => disarmDelete(btn), DELETE_CONFIRM_MS));
  btn.classList.add("confirming");
  btn.textContent = "Delete?";
  btn.setAttribute("aria-label", "Confirm delete");
}

document.getElementById("transitions-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;

  if (btn.dataset.confirming !== "true") {
    armDelete(btn);
    return;
  }

  clearTimeout(Number(btn.dataset.timer));
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const res = await fetch(`/api/transitions/${btn.dataset.id}`, { method: "DELETE" });
    // A 404 means it is already gone, which is the outcome we wanted anyway.
    if (!res.ok && res.status !== 404) throw new Error("failed");
    await refreshTransitions();
  } catch {
    btn.disabled = false;
    btn.textContent = "Failed";
    setTimeout(() => disarmDelete(btn), DELETE_CONFIRM_MS);
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".delete-btn")) {
    document.querySelectorAll(".delete-btn.confirming").forEach(disarmDelete);
  }
});

function showFormMessage(text, type) {
  const el = document.getElementById("form-message");
  el.textContent = text;
  el.className = `form-message ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

function resetForm() {
  existingLookupToken += 1;
  state.fromTrack = null;
  state.toTrack = null;
  state.editingTransitionId = null;
  document.getElementById("notes").value = "";
  document.getElementById("bidirectional").checked = false;
  document.getElementById("direction-arrow").textContent = "→";
  document.querySelectorAll(".selected-track").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".search-field").forEach((el) => el.classList.remove("hidden"));
  updateSubmitButton();
}

document.getElementById("bidirectional").addEventListener("change", (e) => {
  document.getElementById("direction-arrow").textContent = e.target.checked ? "↔" : "→";
});

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.fromTrack || !state.toTrack) return;

  const btn = document.getElementById("submit-btn");
  const wasUpdate = Boolean(state.editingTransitionId);
  btn.disabled = true;
  try {
    const res = await fetch("/api/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_track_id: state.fromTrack.id,
        to_track_id: state.toTrack.id,
        notes: document.getElementById("notes").value || null,
        bidirectional: document.getElementById("bidirectional").checked,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to save");
    }
    showFormMessage(
      wasUpdate ? "Transition updated!" : "Transition saved!",
      "success"
    );
    resetForm();
    await refreshTransitions();
  } catch (err) {
    showFormMessage(err.message, "error");
  } finally {
    updateSubmitButton();
  }
});

const filterInput = document.getElementById("filter-input");
const filterResults = document.getElementById("filter-results");
const clearFilterBtn = document.getElementById("clear-filter");
const filterActive = document.getElementById("filter-active");

function setFilter(track) {
  state.filterTrackId = track.id;
  filterInput.value = track.name;
  filterResults.classList.add("hidden");
  clearFilterBtn.classList.remove("hidden");
  filterActive.textContent = `Showing transitions from "${track.name}" by ${formatArtists(track.artists)}`;
  filterActive.classList.remove("hidden");
  refreshTransitions();
}

const doFilterSearch = debounceSearch(async () => {
  const query = filterInput.value.trim();
  if (state.filterTrackId && query !== filterInput.dataset.selectedName) {
    state.filterTrackId = null;
    filterActive.classList.add("hidden");
    clearFilterBtn.classList.add("hidden");
  }
  if (query.length < 2) {
    filterResults.classList.add("hidden");
    if (!state.filterTrackId) {
      await refreshTransitions();
    }
    return;
  }
  try {
    const tracks = await searchTracks(query);
    if (!tracks.length) {
      filterResults.innerHTML = '<div class="search-result"><span class="track-meta">No results</span></div>';
    } else {
      filterResults.innerHTML = tracks
        .map(
          (track) => `
          <div class="search-result" data-track-id="${track.id}">
            ${renderArtwork(track.album_art_url)}
            <div class="track-info">
              <div class="track-name">${escapeHtml(track.name)}</div>
              <div class="track-meta">${escapeHtml(formatArtists(track.artists))} · ${escapeHtml(track.album)}</div>
            </div>
          </div>`
        )
        .join("");
    }
    filterResults.classList.remove("hidden");
  } catch {
    filterResults.classList.add("hidden");
  }
}, 300);

filterInput.addEventListener("input", doFilterSearch);
filterInput.addEventListener("focus", () => {
  if (filterInput.value.trim().length >= 2 && !state.filterTrackId) doFilterSearch();
});

filterResults.addEventListener("click", async (e) => {
  const result = e.target.closest(".search-result");
  if (!result?.dataset.trackId) return;
  const trackName = result.querySelector(".track-name")?.textContent;
  const trackMeta = result.querySelector(".track-meta")?.textContent;
  const img = result.querySelector("img");
  const [artistsPart, albumPart] = (trackMeta || "").split(" · ");
  const track = {
    id: result.dataset.trackId,
    name: trackName,
    artists: artistsPart ? artistsPart.split(", ") : [],
    album: albumPart || "",
    album_art_url: img?.src || null,
  };
  filterInput.dataset.selectedName = track.name;
  setFilter(track);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".filter-search")) {
    filterResults.classList.add("hidden");
  }
});

clearFilterBtn.addEventListener("click", async () => {
  filterInput.value = "";
  delete filterInput.dataset.selectedName;
  state.filterTrackId = null;
  clearFilterBtn.classList.add("hidden");
  filterActive.classList.add("hidden");
  filterResults.classList.add("hidden");
  await refreshTransitions();
});

setupTrackPicker("from");
setupTrackPicker("to");
refreshTransitions();
