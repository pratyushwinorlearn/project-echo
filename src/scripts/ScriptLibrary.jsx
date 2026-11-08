
import React, {
  useMemo,
  useState
} from 'react';

import {
  BookOpen,
  FileText,
  Plus,
  Search,
  Copy,
  Pencil,
  Trash2,
  Clock3,
  ArrowLeft,
  Check,
  X
} from 'lucide-react';

function formatDate(value) {
  if (!value) return 'Not saved yet';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not saved yet';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getWordCount(content) {
  return String(content || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export default function ScriptLibrary({
  scripts = [],
  activeScriptId,
  onSelectScript,
  onCreateScript,
  onRenameScript,
  onDuplicateScript,
  onDeleteScript,
  onBackToEditor
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeScript = scripts.find(
    (script) => script.id === activeScriptId
  ) || null;

  const filteredScripts = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return scripts;

    return scripts.filter((script) => {
      return (
        script.title.toLowerCase().includes(search) ||
        script.content.toLowerCase().includes(search)
      );
    });
  }, [scripts, query]);

  const createScript = async (event) => {
    event.preventDefault();

    const title = newTitle.trim();

    if (!title || busy) return;

    setBusy(true);
    setError('');

    try {
      await onCreateScript?.(title);

      setNewTitle('');
      setCreating(false);
    } catch (createError) {
      setError(
        createError?.message || 'Could not create the script.'
      );
    } finally {
      setBusy(false);
    }
  };

  const renameScript = async (script) => {
    const nextTitle = window.prompt(
      'Enter a new script title:',
      script.title
    );

    if (nextTitle === null) return;

    if (!nextTitle.trim()) {
      setError('A script title cannot be empty.');
      return;
    }

    try {
      setError('');
      await onRenameScript?.(script.id, nextTitle.trim());
    } catch (renameError) {
      setError(
        renameError?.message || 'Could not rename the script.'
      );
    }
  };

  const duplicateScript = async (script) => {
    try {
      setError('');
      await onDuplicateScript?.(script.id);
    } catch (duplicateError) {
      setError(
        duplicateError?.message || 'Could not duplicate the script.'
      );
    }
  };

  const deleteScript = async (script) => {
    const confirmed = window.confirm(
      `Delete "${script.title}" permanently? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setError('');
      await onDeleteScript?.(script.id);
    } catch (deleteError) {
      setError(
        deleteError?.message || 'Could not delete the script.'
      );
    }
  };

  return (
    <section className="scripts-page">

      {/* PAGE HEADER */}

      <header className="scripts-page-header">
        <div>
          <div className="scripts-eyebrow">
            YOUR SPEAKING WORKSPACE
          </div>

          <h1>My scripts</h1>

          <p>
            Create, organise and prepare your presentation scripts.
          </p>
        </div>

        <button
          type="button"
          className="scripts-primary-button"
          onClick={() => setCreating((current) => !current)}
        >
          <Plus size={15} />
          New script
        </button>
      </header>

      {/* CREATE FORM */}

      {creating && (
        <form
          className="scripts-create-form"
          onSubmit={createScript}
        >
          <div className="scripts-create-heading">
            <strong>Create a new script</strong>

            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
            >
              <X size={15} />
            </button>
          </div>

          <input
            autoFocus
            value={newTitle}
            onChange={(event) =>
              setNewTitle(event.target.value)
            }
            placeholder="Give your script a title..."
            maxLength={120}
          />

          <div className="scripts-create-actions">
            <button
              type="button"
              className="scripts-secondary-button"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="scripts-primary-button"
              disabled={!newTitle.trim() || busy}
            >
              <Plus size={14} />
              Create script
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="scripts-error">
          {error}
        </div>
      )}

      {/* MAIN GRID */}

      <div className="scripts-layout">

        <div className="scripts-list-panel">

          <div className="scripts-list-heading">
            <div>
              <strong>Saved scripts</strong>
              <span>{scripts.length}</span>
            </div>
          </div>

          <div className="scripts-search">
            <Search size={15} />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search your scripts..."
            />

            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="scripts-list">
            {filteredScripts.length === 0 ? (
              <div className="scripts-empty-list">
                <FileText size={24} />

                <strong>
                  {scripts.length
                    ? 'No matching scripts'
                    : 'No saved scripts'}
                </strong>

                <span>
                  {scripts.length
                    ? 'Try a different search.'
                    : 'Create your first script to get started.'}
                </span>
              </div>
            ) : (
              filteredScripts.map((script) => {
                const selected =
                  script.id === activeScriptId;

                const words = getWordCount(script.content);

                return (
                  <article
                    key={script.id}
                    className={`scripts-list-item ${
                      selected ? 'selected' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="scripts-item-main"
                      onClick={() =>
                        onSelectScript?.(script)
                      }
                    >
                      <div className="scripts-item-icon">
                        <FileText size={18} />
                      </div>

                      <div className="scripts-item-copy">
                        <strong>{script.title}</strong>

                        <span>
                          {words} words
                          {' · '}
                          {formatDate(script.updatedAt)}
                        </span>
                      </div>

                      {selected && (
                        <Check
                          size={15}
                          className="scripts-selected-icon"
                        />
                      )}
                    </button>

                    <div className="scripts-item-actions">
                      <button
                        type="button"
                        title="Rename script"
                        aria-label={`Rename ${script.title}`}
                        onClick={() => renameScript(script)}
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        type="button"
                        title="Duplicate script"
                        aria-label={`Duplicate ${script.title}`}
                        onClick={() => duplicateScript(script)}
                      >
                        <Copy size={13} />
                      </button>

                      <button
                        type="button"
                        title="Delete script"
                        aria-label={`Delete ${script.title}`}
                        className="danger"
                        onClick={() => deleteScript(script)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* SELECTED SCRIPT PREVIEW */}

        <aside className="scripts-detail-panel">
          {activeScript ? (
            <>
              <div className="scripts-detail-icon">
                <BookOpen size={23} />
              </div>

              <div className="scripts-detail-label">
                CURRENT SCRIPT
              </div>

              <h2>{activeScript.title}</h2>

              <p>
                {activeScript.content.trim()
                  ? activeScript.content.slice(0, 360)
                  : 'This script is empty. Open the editor to start writing.'}
                {activeScript.content.length > 360 ? '…' : ''}
              </p>

              <div className="scripts-detail-stats">
                <div>
                  <strong>
                    {getWordCount(activeScript.content)}
                  </strong>
                  <span>Words</span>
                </div>

                <div>
                  <strong>
                    {activeScript.highlights?.length || 0}
                  </strong>
                  <span>Highlights</span>
                </div>

                <div>
                  <strong>
                    {Math.max(
                      1,
                      Math.ceil(getWordCount(activeScript.content) / 130)
                    )}
                  </strong>
                  <span>Minutes</span>
                </div>
              </div>

              <div className="scripts-detail-updated">
                <Clock3 size={13} />
                Updated {formatDate(activeScript.updatedAt)}
              </div>

              <button
                type="button"
                className="scripts-primary-button scripts-open-button"
                onClick={onBackToEditor}
              >
                Open in editor
                <ArrowLeft
                  size={14}
                  style={{ transform: 'rotate(180deg)' }}
                />
              </button>
            </>
          ) : (
            <div className="scripts-detail-empty">
              <BookOpen size={28} />

              <strong>Select a script</strong>

              <span>
                Choose a saved script to see its details.
              </span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
