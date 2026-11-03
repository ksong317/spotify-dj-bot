import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import { useSearchParams, Link, MemoryRouter } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
async function request(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== void 0) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.detail === "string") {
        detail = payload.detail;
      } else if (Array.isArray(payload == null ? void 0 : payload.detail)) {
        detail = payload.detail.map((item) => item.msg).join("; ");
      }
    } catch {
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}
function saveTrackDefaults(trackId, defaults) {
  return request(`/api/tracks/${encodeURIComponent(trackId)}/defaults`, {
    method: "PATCH",
    body: defaults
  });
}
function searchTrackInfo(query, options) {
  return request(`/api/tracks/search?q=${encodeURIComponent(query)}&limit=8`, options);
}
function fetchTrackInfo(trackId, options) {
  return request(`/api/tracks/${encodeURIComponent(trackId)}/info`, options);
}
function formatArtists(track) {
  return track.artists.join(", ");
}
const WHEEL_SIZE = 12;
const KEY_NAMES = {
  "1A": "G♯ minor",
  "1B": "B major",
  "2A": "D♯ minor",
  "2B": "F♯ major",
  "3A": "B♭ minor",
  "3B": "D♭ major",
  "4A": "F minor",
  "4B": "A♭ major",
  "5A": "C minor",
  "5B": "E♭ major",
  "6A": "G minor",
  "6B": "B♭ major",
  "7A": "D minor",
  "7B": "F major",
  "8A": "A minor",
  "8B": "C major",
  "9A": "E minor",
  "9B": "G major",
  "10A": "B minor",
  "10B": "D major",
  "11A": "F♯ minor",
  "11B": "A major",
  "12A": "C♯ minor",
  "12B": "E major"
};
Array.from({ length: WHEEL_SIZE }, (_, index) => index + 1).flatMap(
  (number) => [`${number}A`, `${number}B`]
);
const ENHARMONICS = [
  ["C"],
  ["C#", "Db"],
  ["D"],
  ["D#", "Eb"],
  ["E"],
  ["F"],
  ["F#", "Gb"],
  ["G"],
  ["G#", "Ab"],
  ["A"],
  ["A#", "Bb"],
  ["B"]
];
const MODE_SUFFIXES = { major: ["", "maj", "major"], minor: ["m", "min", "minor"] };
const toAscii = (text) => text.replace(/♯/g, "#").replace(/♭/g, "b");
const ALIASES = (() => {
  const spellings = /* @__PURE__ */ new Map();
  for (const group of ENHARMONICS) {
    for (const spelling of group) spellings.set(spelling.toLowerCase(), group);
  }
  const aliases = /* @__PURE__ */ new Map();
  for (const [code, name] of Object.entries(KEY_NAMES)) {
    aliases.set(code.toLowerCase(), code);
    const [tonic, mode] = toAscii(name).split(" ");
    for (const spelling of spellings.get(tonic.toLowerCase())) {
      for (const suffix of MODE_SUFFIXES[mode]) {
        aliases.set(`${spelling}${suffix}`.toLowerCase(), code);
      }
    }
  }
  return aliases;
})();
function keyName(code) {
  return KEY_NAMES[code] ?? "";
}
function keyLabel(code) {
  return code ? `${code} / ${KEY_NAMES[code] ?? ""}`.trim() : "";
}
function normalizeKey(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  for (const part of [text, ...text.split("/")]) {
    const code = ALIASES.get(toAscii(part).replace(/\s+/g, "").toLowerCase());
    if (code) return code;
  }
  return null;
}
function splitCode(code) {
  return [Number(code.slice(0, -1)), code.slice(-1)];
}
function transposeKey(code, semitones) {
  if (!code) return code;
  const [number, letter] = splitCode(code);
  const shifted = ((number - 1 + 7 * semitones) % WHEEL_SIZE + WHEEL_SIZE) % WHEEL_SIZE + 1;
  return `${shifted}${letter}`;
}
function keyColor(code) {
  if (!code) return "transparent";
  const [number, letter] = splitCode(code);
  const hue = (number - 1) * (360 / WHEEL_SIZE) % 360;
  return letter === "A" ? `hsl(${hue} 48% 46%)` : `hsl(${hue} 72% 62%)`;
}
function KeyDot({ code }) {
  if (!code) return null;
  return /* @__PURE__ */ jsx("span", { className: "keydot", style: { background: keyColor(code) }, "aria-hidden": "true" });
}
function formatBpm(bpm) {
  if (bpm == null) return "";
  return Number.isInteger(bpm) ? String(bpm) : String(Number(bpm.toFixed(2)));
}
const DEBOUNCE_MS = 300;
const MIN_BPM = 20;
const MAX_BPM = 400;
const RECENT_LIMIT = 8;
function describe(info) {
  const parts = [
    info.default_key ? keyLabel(info.default_key) : null,
    info.default_bpm == null ? null : `${formatBpm(info.default_bpm)} BPM`
  ].filter(Boolean);
  return parts.join(" · ");
}
function TrackInfoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState({ loading: false, error: null });
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [keyText, setKeyText] = useState("");
  const [bpmText, setBpmText] = useState("");
  const [moved, setMoved] = useState(false);
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const pickerRef = useRef(null);
  const searchRef = useRef(null);
  const keyRef = useRef(null);
  function take(info) {
    setChosen(info);
    setKeyText(info.default_key ?? "");
    setBpmText(formatBpm(info.default_bpm));
    setMoved(false);
    setQuery("");
    setResults([]);
    setOpen(false);
    setProblem(null);
    setSaved(null);
  }
  useEffect(() => {
    var _a;
    (_a = searchRef.current) == null ? void 0 : _a.focus();
  }, []);
  useEffect(() => {
    function handlePointerDown(event) {
      var _a;
      if (!((_a = pickerRef.current) == null ? void 0 : _a.contains(event.target))) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);
  useEffect(() => {
    var _a;
    if (chosen) (_a = keyRef.current) == null ? void 0 : _a.select();
  }, [chosen]);
  const linkedSongId = searchParams.get("song");
  useEffect(() => {
    if (!linkedSongId) return void 0;
    const controller = new AbortController();
    fetchTrackInfo(linkedSongId, { signal: controller.signal }).then(take).catch((error) => {
      if (error.name !== "AbortError") setProblem(error.message);
    });
    return () => controller.abort();
  }, [linkedSongId]);
  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setSearch({ loading: false, error: null });
      return void 0;
    }
    const controller = new AbortController();
    setSearch({ loading: true, error: null });
    const timer = setTimeout(() => {
      searchTrackInfo(trimmed, { signal: controller.signal }).then((data) => {
        setResults(data);
        setHighlight(0);
        setSearch({ loading: false, error: null });
      }).catch((error) => {
        if (error.name === "AbortError") return;
        setResults([]);
        setSearch({ loading: false, error: error.message });
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);
  function backToSearch() {
    var _a;
    setChosen(null);
    setKeyText("");
    setBpmText("");
    setMoved(false);
    setProblem(null);
    if (linkedSongId) setSearchParams({}, { replace: true });
    (_a = searchRef.current) == null ? void 0 : _a.focus();
  }
  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + step + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (results[highlight]) take(results[highlight]);
    }
  }
  const typedKey = normalizeKey(keyText);
  const keyIsNonsense = Boolean(keyText.trim()) && !typedKey;
  const bpmTyped = bpmText.trim();
  const bpmValue = bpmTyped ? Number(bpmTyped) : null;
  const bpmIsNonsense = bpmValue != null && (!Number.isFinite(bpmValue) || bpmValue < MIN_BPM || bpmValue > MAX_BPM);
  function stepKey(semitones) {
    const from = typedKey ?? (chosen == null ? void 0 : chosen.default_key);
    if (!from) return;
    setKeyText(transposeKey(from, semitones));
    setProblem(null);
  }
  function stepBpm(delta) {
    const from = bpmTyped ? bpmValue : chosen == null ? void 0 : chosen.default_bpm;
    if (from == null || !Number.isFinite(from)) return;
    setBpmText(formatBpm(Math.round((from + delta) * 100) / 100));
    setProblem(null);
  }
  const canSave = Boolean(chosen) && !saving && !keyIsNonsense && !bpmIsNonsense && // Blanking both boxes is how a song's key and tempo come off again, which is
  // only worth a request when it had some to begin with.
  (Boolean(typedKey) || bpmValue != null || Boolean(chosen == null ? void 0 : chosen.saved));
  async function handleSubmit(event) {
    var _a;
    event.preventDefault();
    if (!chosen || saving) return;
    if (keyIsNonsense || bpmIsNonsense) {
      setMoved(true);
      if (keyIsNonsense) (_a = keyRef.current) == null ? void 0 : _a.select();
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const response = await saveTrackDefaults(chosen.track.id, {
        default_key: typedKey,
        default_bpm: bpmValue
      });
      const stored = {
        track: chosen.track,
        default_key: response.default_key,
        default_bpm: response.default_bpm,
        saved: Boolean(response.default_key) || response.default_bpm != null
      };
      setRecent(
        (previous) => [stored, ...previous.filter((item) => item.track.id !== stored.track.id)].slice(
          0,
          RECENT_LIMIT
        )
      );
      setSaved(stored);
      backToSearch();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSaving(false);
    }
  }
  const keyWrong = keyIsNonsense && moved;
  const bpmWrong = bpmIsNonsense && moved;
  const keyReading = typedKey ? keyName(typedKey) : keyWrong ? "not a key" : "Camelot code or key name";
  const showResults = open && Boolean(trimmed);
  return /* @__PURE__ */ jsxs("div", { className: "page page--scroll", children: [
    /* @__PURE__ */ jsxs("header", { className: "page__header", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: "Track info" }),
        /* @__PURE__ */ jsx("p", { className: "page__subtitle", children: "The key and tempo a song sits at, for every set list it turns up in." })
      ] }),
      /* @__PURE__ */ jsxs("nav", { className: "page__nav", children: [
        /* @__PURE__ */ jsx("a", { className: "page__link", href: "/", children: "Library" }),
        /* @__PURE__ */ jsx(Link, { className: "page__link", to: "/graph", children: "Graph" }),
        /* @__PURE__ */ jsx(Link, { className: "page__link", to: "/setlists", children: "Set lists" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "trackinfo", children: [
      /* @__PURE__ */ jsxs("div", { className: "picker", ref: pickerRef, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            ref: searchRef,
            className: "picker__input",
            type: "text",
            role: "combobox",
            "aria-expanded": showResults,
            "aria-controls": "trackinfo-results",
            autoComplete: "off",
            placeholder: "Search Spotify for a song…",
            value: query,
            onChange: (event) => {
              setQuery(event.target.value);
              setOpen(true);
            },
            onFocus: () => setOpen(true),
            onKeyDown: handleSearchKeyDown
          }
        ),
        showResults ? /* @__PURE__ */ jsxs("div", { className: "picker__dropdown", id: "trackinfo-results", role: "listbox", children: [
          search.loading ? /* @__PURE__ */ jsx("p", { className: "picker__hint", children: "Looking…" }) : null,
          search.error ? /* @__PURE__ */ jsx("p", { className: "picker__error", children: search.error }) : null,
          !search.loading && !search.error && results.length === 0 ? /* @__PURE__ */ jsx("p", { className: "picker__hint", children: "Nothing on Spotify matches that." }) : null,
          results.map((info, index) => /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              role: "option",
              tabIndex: -1,
              "aria-selected": index === highlight,
              className: index === highlight ? "picker__option is-active" : "picker__option",
              onMouseEnter: () => setHighlight(index),
              onClick: () => take(info),
              children: [
                info.track.album_art_url ? /* @__PURE__ */ jsx("img", { className: "picker__art", src: info.track.album_art_url, alt: "" }) : /* @__PURE__ */ jsx("span", { className: "picker__art picker__art--empty" }),
                /* @__PURE__ */ jsxs("span", { className: "picker__labels", children: [
                  /* @__PURE__ */ jsx("span", { className: "picker__title", children: info.track.name }),
                  /* @__PURE__ */ jsx("span", { className: "picker__artist", children: formatArtists(info.track) })
                ] }),
                info.saved ? /* @__PURE__ */ jsxs("span", { className: "picker__tag", children: [
                  /* @__PURE__ */ jsx(KeyDot, { code: info.default_key }),
                  describe(info)
                ] }) : null
              ]
            },
            info.track.id
          ))
        ] }) : null
      ] }),
      chosen ? /* @__PURE__ */ jsxs("div", { className: "trackinfo__card", children: [
        /* @__PURE__ */ jsxs("div", { className: "trackinfo__chosen", children: [
          chosen.track.album_art_url ? /* @__PURE__ */ jsx("img", { className: "trackinfo__art", src: chosen.track.album_art_url, alt: "" }) : /* @__PURE__ */ jsx("span", { className: "trackinfo__art picker__art--empty" }),
          /* @__PURE__ */ jsxs("span", { className: "picker__labels", children: [
            /* @__PURE__ */ jsx("span", { className: "trackinfo__name", children: chosen.track.name }),
            /* @__PURE__ */ jsxs("span", { className: "picker__artist", children: [
              formatArtists(chosen.track),
              chosen.track.album ? ` · ${chosen.track.album}` : ""
            ] })
          ] }),
          chosen.saved ? /* @__PURE__ */ jsxs("span", { className: "picker__tag", children: [
            "as you had it: ",
            describe(chosen)
          ] }) : null
        ] }),
        /* @__PURE__ */ jsxs("form", { className: "trackinfo__form", onSubmit: handleSubmit, children: [
          /* @__PURE__ */ jsxs("label", { className: "trackinfo__field", children: [
            /* @__PURE__ */ jsx("span", { className: "trackinfo__label", children: "Key" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                ref: keyRef,
                className: "keybpm__input",
                value: keyText,
                placeholder: "8B",
                autoComplete: "off",
                disabled: saving,
                "aria-invalid": keyWrong,
                onChange: (event) => {
                  setKeyText(event.target.value);
                  setMoved(false);
                  setProblem(null);
                },
                onBlur: () => {
                  setMoved(true);
                  if (typedKey) setKeyText(typedKey);
                },
                onKeyDown: (event) => {
                  if (event.key === "Escape") backToSearch();
                  if (event.key === "Enter") setMoved(true);
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    stepKey(1);
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    stepKey(-1);
                  }
                }
              }
            ),
            /* @__PURE__ */ jsxs(
              "span",
              {
                className: keyWrong ? "trackinfo__reading is-wrong" : "trackinfo__reading",
                children: [
                  /* @__PURE__ */ jsx(KeyDot, { code: typedKey }),
                  keyReading
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "trackinfo__field", children: [
            /* @__PURE__ */ jsx("span", { className: "trackinfo__label", children: "BPM" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "keybpm__input",
                value: bpmText,
                placeholder: "128",
                inputMode: "decimal",
                autoComplete: "off",
                disabled: saving,
                "aria-invalid": bpmWrong,
                onChange: (event) => {
                  setBpmText(event.target.value);
                  setMoved(false);
                  setProblem(null);
                },
                onBlur: () => setMoved(true),
                onKeyDown: (event) => {
                  if (event.key === "Escape") backToSearch();
                  if (event.key === "Enter") setMoved(true);
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    stepBpm(1);
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    stepBpm(-1);
                  }
                }
              }
            ),
            bpmWrong ? /* @__PURE__ */ jsxs("span", { className: "trackinfo__reading is-wrong", children: [
              "between ",
              MIN_BPM,
              " and ",
              MAX_BPM
            ] }) : null
          ] }),
          /* @__PURE__ */ jsx("button", { type: "submit", className: "button", disabled: !canSave, children: saving ? "Saving…" : "Save" }),
          chosen.track.external_url ? /* @__PURE__ */ jsx(
            "a",
            {
              className: "page__link",
              href: chosen.track.external_url,
              target: "_blank",
              rel: "noreferrer",
              children: "Spotify ↗"
            }
          ) : null
        ] }),
        problem ? /* @__PURE__ */ jsx("p", { className: "picker__error", children: problem }) : null,
        /* @__PURE__ */ jsx("p", { className: "trackinfo__keys", children: "Tab from key to BPM to Save, then Enter. Arrow keys nudge either box a step; Esc goes back to the search." })
      ] }) : /* @__PURE__ */ jsx("p", { className: "picker__hint trackinfo__empty", children: saved ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Saved ",
        /* @__PURE__ */ jsx("strong", { children: saved.track.name }),
        " —",
        " ",
        describe(saved) || "key and tempo cleared",
        ". Search for the next song."
      ] }) : "Search a song and press Enter to take it, then Tab from key to BPM to Save." }),
      recent.length ? /* @__PURE__ */ jsxs("div", { className: "trackinfo__recent", children: [
        /* @__PURE__ */ jsx("p", { className: "trackinfo__label", children: "Saved just now" }),
        /* @__PURE__ */ jsx("ul", { className: "trackinfo__list", children: recent.map((info) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: "trackinfo__again",
            title: "Put this song back in the boxes",
            onClick: () => take(info),
            children: [
              /* @__PURE__ */ jsxs("span", { className: "picker__labels", children: [
                /* @__PURE__ */ jsx("span", { className: "picker__title", children: info.track.name }),
                /* @__PURE__ */ jsx("span", { className: "picker__artist", children: formatArtists(info.track) })
              ] }),
              /* @__PURE__ */ jsxs("span", { className: "picker__tag", children: [
                /* @__PURE__ */ jsx(KeyDot, { code: info.default_key }),
                describe(info) || "cleared"
              ] })
            ]
          }
        ) }, info.track.id)) })
      ] }) : null
    ] })
  ] });
}
const html = renderToString(
  /* @__PURE__ */ jsx(MemoryRouter, { initialEntries: ["/tracks"], children: /* @__PURE__ */ jsx(TrackInfoPage, {}) })
);
const stops = [...html.matchAll(/<(input|button|a)\b[^>]*/g)].map(([tag]) => {
  var _a;
  const name = tag.match(/<(\w+)/)[1];
  const label = (_a = tag.match(/(?:placeholder|aria-label)="([^"]*)"/)) == null ? void 0 : _a[1];
  const untabbable = tag.includes('tabindex="-1"') || tag.includes("disabled");
  return `${untabbable ? "  (skipped) " : "  tab stop: "}${name}${label ? ` — ${label}` : ""}`;
});
console.log("rendered ok, tab stops in document order:");
console.log(stops.join("\n"));
