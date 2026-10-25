import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { createSetList, deleteSetList, fetchSetLists } from '../api.js';

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SetListsPage() {
  const [setLists, setSetLists] = useState([]);
  const [state, setState] = useState({ loading: true, error: null });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchSetLists({ signal: controller.signal })
      .then((data) => {
        setSetLists(data);
        setState({ loading: false, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ loading: false, error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await createSetList({ name: trimmed });
      setSetLists((previous) => [
        {
          id: created.id,
          name: created.name,
          notes: created.notes,
          track_count: 0,
          created_at: created.created_at,
          updated_at: created.updated_at,
        },
        ...previous,
      ]);
      setName('');
      setState((previous) => ({ ...previous, error: null }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: error.message }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(setList) {
    if (!window.confirm(`Delete “${setList.name}”? This cannot be undone.`)) return;
    try {
      await deleteSetList(setList.id);
      setSetLists((previous) => previous.filter((item) => item.id !== setList.id));
    } catch (error) {
      setState((previous) => ({ ...previous, error: error.message }));
    }
  }

  return (
    <div className="page page--scroll">
      <header className="page__header">
        <div>
          <h1>Set lists</h1>
          <p className="page__subtitle">
            Build a running order out of the transitions you have logged.
          </p>
        </div>
        <nav className="page__nav">
          <a className="page__link" href="/">
            Library
          </a>
          <Link className="page__link" to="/graph">
            Graph
          </Link>
        </nav>
      </header>

      <form className="setlists__new" onSubmit={handleCreate}>
        <input
          className="picker__input"
          type="text"
          value={name}
          placeholder="Name a set list — venue, date, anything…"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button" disabled={saving || !name.trim()}>
          {saving ? 'Creating…' : 'New set list'}
        </button>
      </form>

      {state.error ? <p className="picker__error">{state.error}</p> : null}

      {state.loading ? (
        <p className="page__subtitle">Loading set lists…</p>
      ) : setLists.length === 0 ? (
        <p className="page__subtitle">
          No set lists yet. Name one above and start dropping songs into it.
        </p>
      ) : (
        <ul className="setlists">
          {setLists.map((setList) => (
            <li className="setlists__item" key={setList.id}>
              <Link className="setlists__link" to={`/setlists/${setList.id}`}>
                <span className="setlists__name">{setList.name}</span>
                <span className="setlists__meta">
                  {setList.track_count} {setList.track_count === 1 ? 'song' : 'songs'} ·
                  updated {formatDate(setList.updated_at)}
                </span>
              </Link>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => handleDelete(setList)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
