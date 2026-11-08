
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  FolderPlus,
  Folder,
  FilePlus2,
  FolderUp,
  Search,
  RefreshCw,
  Database,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Sparkles,
  FileText,
  MessageSquare,
  Trash2
} from 'lucide-react';

import ProjectCard from './ProjectCard';
import DocumentList from './DocumentList';

import './knowledge.css';


/* =========================================
   HELPERS
========================================= */

function getDesktop() {
  if (!window.echoDesktop) {
    throw new Error(
      'Echo desktop bridge is unavailable. Restart the application.'
    );
  }

  return window.echoDesktop;
}

function messageOf(error) {
  return error?.message || 'Something went wrong.';
}

function formatScore(value) {
  const score = Number(value);

  return Number.isFinite(score)
    ? score.toFixed(2)
    : '—';
}


/* =========================================
   PROJECT FORM
========================================= */

function ProjectForm({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onCancel,
  saving
}) {
  return (
    <form
      className="knowledge-create-form knowledge-create-inline"
      onSubmit={onSubmit}
    >
      <div className="knowledge-create-title">
        <strong>Create project collection</strong>

        <button
          type="button"
          className="knowledge-icon-button"
          onClick={onCancel}
          aria-label="Close project form"
          disabled={saving}
        >
          <X size={15} />
        </button>
      </div>

      <input
        autoFocus
        value={name}
        onChange={(event) =>
          onNameChange(event.target.value)
        }
        placeholder="Project name"
        maxLength={80}
        required
      />

      <textarea
        value={description}
        onChange={(event) =>
          onDescriptionChange(event.target.value)
        }
        placeholder="What is this project about?"
        rows={2}
        maxLength={500}
      />

      <div className="knowledge-form-actions">
        <button
          type="button"
          className="knowledge-button secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="knowledge-button primary"
          disabled={!name.trim() || saving}
        >
          {saving ? (
            <>
              <Loader2
                size={14}
                className="knowledge-spin"
              />
              Creating…
            </>
          ) : (
            <>
              <Plus size={14} />
              Create project
            </>
          )}
        </button>
      </div>
    </form>
  );
}


/* =========================================
   MAIN KNOWLEDGE LIBRARY
========================================= */

export default function KnowledgeLibrary() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [documents, setDocuments] = useState([]);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingProjectNow, setCreatingProjectNow] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const [importingKind, setImportingKind] = useState(null);
  const [reindexing, setReindexing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);

  const [status, setStatus] = useState(null);

  // Prevent delayed requests from a previous project from
  // overwriting the currently selected project's data.
  const selectedProjectIdRef = useRef(null);

  const documentsRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const answerRequestRef = useRef(0);

  selectedProjectIdRef.current = selectedProjectId;

  const selectedProject = useMemo(
    () => projects.find(
      (project) => project.id === selectedProjectId
    ) || null,
    [projects, selectedProjectId]
  );

  const isBusy = Boolean(
    creatingProjectNow ||
    importingKind ||
    reindexing
  );

  const showStatus = useCallback((type, text) => {
    setStatus({
      type,
      text
    });
  }, []);


  /* =========================================
     LOAD PROJECTS
  ========================================= */

  const loadProjects = useCallback(async ({
    preserveSelection = true
  } = {}) => {
    setLoadingProjects(true);

    try {
      const result =
        await getDesktop().listKnowledgeProjects();

      const nextProjects = Array.isArray(result)
        ? result
        : [];

      setProjects(nextProjects);

      setSelectedProjectId((currentId) => {
        if (!nextProjects.length) {
          return null;
        }

        const currentStillExists = nextProjects.some(
          (project) => project.id === currentId
        );

        if (
          preserveSelection &&
          currentStillExists
        ) {
          return currentId;
        }

        return nextProjects[0].id;
      });

      return nextProjects;

    } catch (error) {
      showStatus('error', messageOf(error));
      throw error;

    } finally {
      setLoadingProjects(false);
    }
  }, [showStatus]);


  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        await loadProjects({
          preserveSelection: false
        });
      } catch {
        // The status area already displays the error.
      }
    };

    if (active) {
      initialize();
    }

    return () => {
      active = false;
      documentsRequestRef.current += 1;
      searchRequestRef.current += 1;
      answerRequestRef.current += 1;
    };
  }, [loadProjects]);


  /* =========================================
     LOAD DOCUMENTS
  ========================================= */

  const loadDocuments = useCallback(async (projectId) => {
    const requestId = ++documentsRequestRef.current;

    if (!projectId) {
      setDocuments([]);
      setLoadingDocuments(false);
      return [];
    }

    setLoadingDocuments(true);

    try {
      const result =
        await getDesktop().listKnowledgeDocuments(
          projectId
        );

      const nextDocuments = Array.isArray(result)
        ? result
        : [];

      // Ignore stale responses.
      if (
        requestId !== documentsRequestRef.current ||
        selectedProjectIdRef.current !== projectId
      ) {
        return nextDocuments;
      }

      setDocuments(nextDocuments);

      return nextDocuments;

    } catch (error) {
      if (
        requestId === documentsRequestRef.current &&
        selectedProjectIdRef.current === projectId
      ) {
        showStatus('error', messageOf(error));
      }

      return [];

    } finally {
      if (
        requestId === documentsRequestRef.current &&
        selectedProjectIdRef.current === projectId
      ) {
        setLoadingDocuments(false);
      }
    }
  }, [showStatus]);


  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);

    setQuestion('');
    setAnswerResult(null);

    searchRequestRef.current += 1;
    answerRequestRef.current += 1;

    loadDocuments(selectedProjectId);
  }, [selectedProjectId, loadDocuments]);


  /* =========================================
     CREATE PROJECT
  ========================================= */

  const handleCreateProject = async (event) => {
    event.preventDefault();

    if (creatingProjectNow) return;

    const name = projectName.trim();

    if (!name) {
      showStatus('error', 'Enter a project name.');
      return;
    }

    setCreatingProjectNow(true);
    setStatus(null);

    try {
      const result =
        await getDesktop().createKnowledgeProject({
          name,
          description: projectDescription.trim()
        });

      setProjectName('');
      setProjectDescription('');
      setCreatingProject(false);

      await loadProjects({
        preserveSelection: false
      });

      setSelectedProjectId(result.id);

      showStatus(
        'success',
        `Project "${result.name}" created.`
      );

    } catch (error) {
      showStatus('error', messageOf(error));

    } finally {
      setCreatingProjectNow(false);
    }
  };


  /* =========================================
     REFRESH CURRENT PROJECT
  ========================================= */

  const refreshCurrentProject = async (projectId) => {
    await Promise.all([
      loadDocuments(projectId),
      loadProjects()
    ]);
  };


  /* =========================================
     IMPORT RESULT DISPLAY
  ========================================= */

  const processImportResult = async (
    result,
    projectId
  ) => {
    if (result?.canceled) return;

    await refreshCurrentProject(projectId);

    // Old search results must not represent newly changed data.
    searchRequestRef.current += 1;
    answerRequestRef.current += 1;

    setSearchResults([]);
    setHasSearched(false);
    setAnswerResult(null);

    const imported = result?.imported?.length || 0;
    const failed = result?.failed?.length || 0;

    const indexingError = result?.indexingError || null;
    const truncated = Boolean(result?.truncated);

    if (indexingError) {
      showStatus(
        'warning',
        `${imported} document(s) were imported, but indexing needs attention: ${indexingError}`
      );

      return;
    }

    if (truncated) {
      const summary = imported
        ? `${imported} document(s) imported. `
        : '';

      showStatus(
        'warning',
        `${summary}${result.message || 'Folder scan reached a safety limit.'}`
      );

      return;
    }

    if (imported && failed) {
      showStatus(
        'warning',
        `${imported} document(s) imported. ${failed} could not be imported.`
      );

    } else if (imported) {
      const indexedCount = result.imported.filter(
        (document) => document.status === 'indexed'
      ).length;

      showStatus(
        'success',
        `${imported} document(s) imported. ${indexedCount} indexed successfully.`
      );

    } else if (failed) {
      showStatus(
        'error',
        result.failed[0]?.error ||
        'The selected files could not be imported.'
      );

    } else {
      showStatus(
        'info',
        result?.message || 'No supported documents were found.'
      );
    }
  };


  /* =========================================
     IMPORT INDIVIDUAL FILES
  ========================================= */

  const handleImportFiles = async () => {
    const projectId = selectedProjectId;

    if (!projectId || importingKind) return;

    setImportingKind('files');
    setStatus(null);

    try {
      const result =
        await getDesktop().importKnowledgeFiles(
          projectId
        );

      await processImportResult(result, projectId);

    } catch (error) {
      showStatus('error', messageOf(error));

    } finally {
      setImportingKind(null);
    }
  };


  /* =========================================
     IMPORT PROJECT FOLDER
  ========================================= */

  const handleImportFolder = async () => {
    const projectId = selectedProjectId;

    if (!projectId || importingKind) return;

    setImportingKind('folder');
    setStatus(null);

    try {
      const result =
        await getDesktop().importKnowledgeFolder(
          projectId
        );

      await processImportResult(result, projectId);

    } catch (error) {
      showStatus('error', messageOf(error));

    } finally {
      setImportingKind(null);
    }
  };


  /* =========================================
     DELETE DOCUMENT
  ========================================= */

  const handleDeleteDocument = async (document) => {
    const projectId = selectedProjectId;

    if (!projectId) return;

    const confirmed = window.confirm(
      `Remove "${document.name}" from this project?`
    );

    if (!confirmed) return;

    setStatus(null);

    try {
      const result =
        await getDesktop().deleteKnowledgeDocument(
          projectId,
          document.id
        );

      await refreshCurrentProject(projectId);

      searchRequestRef.current += 1;
      answerRequestRef.current += 1;

      setSearchResults([]);
      setHasSearched(false);
      setAnswerResult(null);

      if (result?.indexingError) {
        showStatus(
          'warning',
          `Document removed, but the project index needs attention: ${result.indexingError}`
        );
      } else {
        showStatus(
          'success',
          'Document removed and project index refreshed.'
        );
      }

    } catch (error) {
      showStatus('error', messageOf(error));
    }
  };


  /* =========================================
     DELETE PROJECT
  ========================================= */

  const handleDeleteProject = async (project) => {
    const confirmed = window.confirm(
      `Delete "${project.name}" and all of its imported documents? This cannot be undone.`
    );

    if (!confirmed) return;

    setStatus(null);

    try {
      await getDesktop().deleteKnowledgeProject(
        project.id
      );

      if (selectedProjectIdRef.current === project.id) {
        setDocuments([]);
        setSearchResults([]);
        setAnswerResult(null);
      }

      searchRequestRef.current += 1;
      answerRequestRef.current += 1;

      await loadProjects({
        preserveSelection: false
      });

      showStatus(
        'success',
        `Project "${project.name}" deleted.`
      );

    } catch (error) {
      showStatus('error', messageOf(error));
    }
  };


  /* =========================================
     REINDEX PROJECT
  ========================================= */

  const handleReindex = async () => {
    const projectId = selectedProjectId;

    if (!projectId || reindexing) return;

    setReindexing(true);
    setStatus(null);

    try {
      const result =
        await getDesktop().reindexKnowledgeProject(
          projectId
        );

      await refreshCurrentProject(projectId);

      searchRequestRef.current += 1;
      answerRequestRef.current += 1;

      setSearchResults([]);
      setHasSearched(false);
      setAnswerResult(null);

      showStatus(
        'success',
        `Re-index complete. ${result?.chunkCount || 0} passages are searchable.`
      );

    } catch (error) {
      showStatus('error', messageOf(error));

    } finally {
      setReindexing(false);
    }
  };


  /* =========================================
     SEARCH PROJECT DOCUMENTS
  ========================================= */

  const handleSearch = async (event) => {
    event.preventDefault();

    const projectId = selectedProjectId;
    const query = searchQuery.trim();

    if (!query || !projectId) return;

    const requestId = ++searchRequestRef.current;

    setSearching(true);
    setStatus(null);
    setHasSearched(false);

    try {
      const result =
        await getDesktop().searchKnowledge({
          query,
          projectId,
          limit: 8
        });

      // Ignore results from an older project or query.
      if (
        requestId !== searchRequestRef.current ||
        selectedProjectIdRef.current !== projectId
      ) {
        return;
      }

      const nextResults = Array.isArray(result)
        ? result
        : [];

      setSearchResults(nextResults);
      setHasSearched(true);

      if (!nextResults.length) {
        showStatus(
          'info',
          'No matching passages were found in this project.'
        );
      }

    } catch (error) {
      if (requestId === searchRequestRef.current) {
        showStatus('error', messageOf(error));
      }

    } finally {
      if (requestId === searchRequestRef.current) {
        setSearching(false);
      }
    }
  };


  /* =========================================
     CLEAR SEARCH
  ========================================= */

  const clearSearch = () => {
    searchRequestRef.current += 1;

    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSearching(false);
  };


  /* =========================================
     ASK ECHO ABOUT THIS PROJECT
  ========================================= */

  const handleAskEcho = async (event) => {
    event.preventDefault();

    const projectId = selectedProjectId;
    const questionText = question.trim();

    if (!projectId || !questionText || asking) {
      return;
    }

    const requestId = ++answerRequestRef.current;

    setAsking(true);
    setAnswerResult(null);
    setStatus(null);

    try {
      const askKnowledgeQuestion =
        getDesktop().askKnowledgeQuestion;

      if (typeof askKnowledgeQuestion !== 'function') {
        throw new Error(
          'Knowledge Assistant bridge is missing. Update preload.cjs and restart Echo.'
        );
      }

      const result = await askKnowledgeQuestion({
        question: questionText,
        projectId,
        answerStyle: 'natural'
      });

      if (
        requestId !== answerRequestRef.current ||
        selectedProjectIdRef.current !== projectId
      ) {
        return;
      }

      if (!result?.answer) {
        throw new Error(
          'Echo did not return an answer.'
        );
      }

      setAnswerResult(result);

    } catch (error) {
      if (requestId === answerRequestRef.current) {
        showStatus('error', messageOf(error));
      }

    } finally {
      if (requestId === answerRequestRef.current) {
        setAsking(false);
      }
    }
  };


  /* =========================================
     LOADING STATE
  ========================================= */

  if (loadingProjects && !projects.length) {
    return (
      <div className="knowledge-page">
        <div className="knowledge-loading knowledge-page-loading">
          <Loader2
            size={20}
            className="knowledge-spin"
          />
          Loading your Knowledge Library…
        </div>
      </div>
    );
  }


  /* =========================================
     EMPTY LIBRARY
  ========================================= */

  if (
    !loadingProjects &&
    projects.length === 0
  ) {
    return (
      <div className="knowledge-page">
        <header className="knowledge-page-heading">
          <div>
            <div className="knowledge-eyebrow">
              YOUR LOCAL KNOWLEDGE
            </div>

            <h1>Knowledge Library</h1>

            <p>
              Organise project documentation so Echo can
              retrieve accurate answers from your own work.
            </p>
          </div>
        </header>

        <section className="knowledge-first-project">
          <div className="knowledge-empty-icon">
            <Database size={27} />
          </div>

          <h2>Create your first project</h2>

          <p>
            Start with a project such as ReceiptQA, Project Echo
            or AI Interviewer. Import its README and technical
            documentation so Echo can find relevant information.
          </p>

          {!creatingProject ? (
            <button
              type="button"
              className="knowledge-button primary"
              onClick={() => setCreatingProject(true)}
            >
              <Plus size={15} />
              Create project
            </button>
          ) : (
            <ProjectForm
              name={projectName}
              description={projectDescription}
              onNameChange={setProjectName}
              onDescriptionChange={setProjectDescription}
              onSubmit={handleCreateProject}
              onCancel={() => setCreatingProject(false)}
              saving={creatingProjectNow}
            />
          )}
        </section>

        {status && (
          <div
            className={`knowledge-status ${status.type}`}
            role="status"
          >
            <span>{status.text}</span>

            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setStatus(null)}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    );
  }


  /* =========================================
     MAIN KNOWLEDGE LIBRARY
  ========================================= */

  return (
    <div
      className="knowledge-page"
      aria-busy={isBusy}
    >
      <header className="knowledge-page-heading">
        <div>
          <div className="knowledge-eyebrow">
            YOUR LOCAL KNOWLEDGE
          </div>

          <h1>Knowledge Library</h1>

          <p>
            Import your project documentation and let Echo
            find the right information when you need it.
          </p>
        </div>

        <button
          type="button"
          className="knowledge-button primary"
          onClick={() => setCreatingProject(true)}
          disabled={creatingProjectNow}
        >
          <FolderPlus size={15} />
          New project
        </button>
      </header>


      {/* CREATE PROJECT */}

      {creatingProject && (
        <ProjectForm
          name={projectName}
          description={projectDescription}
          onNameChange={setProjectName}
          onDescriptionChange={setProjectDescription}
          onSubmit={handleCreateProject}
          onCancel={() => setCreatingProject(false)}
          saving={creatingProjectNow}
        />
      )}


      <div className="knowledge-workspace">

        {/* PROJECT SIDEBAR */}

        <aside className="knowledge-project-sidebar">
          <div className="knowledge-subheading">
            <span>PROJECTS</span>
            <span>{projects.length}</span>
          </div>

          {loadingProjects ? (
            <div className="knowledge-loading">
              <Loader2
                size={16}
                className="knowledge-spin"
              />
              Loading projects…
            </div>
          ) : (
            <div className="knowledge-project-list">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  selected={
                    selectedProjectId === project.id
                  }
                  onSelect={setSelectedProjectId}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </aside>


        {/* PROJECT CONTENT */}

        <main className="knowledge-main">

          {!selectedProject ? (
            <div className="knowledge-empty-state">
              <Folder size={28} />
              <strong>Select a project</strong>
              <span>
                Choose a project to view its documents.
              </span>
            </div>
          ) : (
            <>
              {/* PROJECT HEADER */}

              <section className="knowledge-project-header">
                <div className="knowledge-project-heading-main">
                  <div className="knowledge-large-folder-icon">
                    <Folder size={23} />
                  </div>

                  <div>
                    <h2>{selectedProject.name}</h2>

                    <p>
                      {selectedProject.description ||
                        'Project documentation and knowledge.'}
                    </p>

                    <div className="knowledge-project-counts">
                      {selectedProject.documentCount} documents
                      <span>·</span>
                      {selectedProject.indexedCount} indexed
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="knowledge-button secondary"
                  onClick={handleReindex}
                  disabled={reindexing || importingKind !== null}
                >
                  {reindexing ? (
                    <Loader2
                      size={14}
                      className="knowledge-spin"
                    />
                  ) : (
                    <RefreshCw size={14} />
                  )}

                  {reindexing ? 'Re-indexing…' : 'Re-index'}
                </button>
              </section>


              {/* IMPORT ACTIONS */}

              <section className="knowledge-import-section">
                <div>
                  <div className="knowledge-subheading">
                    <span>ADD DOCUMENTS</span>
                  </div>

                  <p>
                    Import READMEs, reports, notes, PDFs
                    or source-code files.
                  </p>
                </div>

                <div className="knowledge-import-actions">
                  <button
                    type="button"
                    className="knowledge-button primary"
                    onClick={handleImportFiles}
                    disabled={Boolean(importingKind) || reindexing}
                  >
                    {importingKind === 'files' ? (
                      <Loader2
                        size={14}
                        className="knowledge-spin"
                      />
                    ) : (
                      <FilePlus2 size={15} />
                    )}

                    {importingKind === 'files'
                      ? 'Importing files…'
                      : 'Import files'}
                  </button>

                  <button
                    type="button"
                    className="knowledge-button secondary"
                    onClick={handleImportFolder}
                    disabled={Boolean(importingKind) || reindexing}
                  >
                    {importingKind === 'folder' ? (
                      <Loader2
                        size={14}
                        className="knowledge-spin"
                      />
                    ) : (
                      <FolderUp size={15} />
                    )}

                    {importingKind === 'folder'
                      ? 'Scanning folder…'
                      : 'Import project folder'}
                  </button>
                </div>
              </section>


              {/* SEARCH */}

              <section className="knowledge-search-section">
                <div className="knowledge-subheading">
                  <span>SEARCH PROJECT KNOWLEDGE</span>
                </div>

                <form
                  className="knowledge-search-form"
                  onSubmit={handleSearch}
                >
                  <Search size={16} />

                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) =>
                      setSearchQuery(event.target.value)
                    }
                    placeholder="Search a concept, file, class or implementation detail..."
                    aria-label="Search project knowledge"
                  />

                  {searchQuery && (
                    <button
                      type="button"
                      className="knowledge-clear-search"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}

                  <button
                    type="submit"
                    className="knowledge-button primary"
                    disabled={
                      searching ||
                      !searchQuery.trim()
                    }
                  >
                    {searching ? (
                      <Loader2
                        size={14}
                        className="knowledge-spin"
                      />
                    ) : (
                      'Search'
                    )}
                  </button>
                </form>


                {/* SEARCH RESULTS */}

                {searching && (
                  <div className="knowledge-inline-loading">
                    <Loader2
                      size={15}
                      className="knowledge-spin"
                    />
                    Searching project documents…
                  </div>
                )}

                {!searching && hasSearched && searchResults.length === 0 && (
                  <div className="knowledge-no-results">
                    <Search size={17} />
                    <strong>No matching passages</strong>
                    <span>
                      Try a different phrase, class name,
                      function or technical term.
                    </span>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="knowledge-search-results">
                    <div className="knowledge-search-results-heading">
                      <strong>
                        {searchResults.length} matching passages
                      </strong>

                      <button
                        type="button"
                        onClick={clearSearch}
                      >
                        Clear results
                      </button>
                    </div>

                    {searchResults.map((result, index) => (
                      <article
                        key={result.id || `${result.documentId}-${index}`}
                        className="knowledge-result-card"
                      >
                        <div className="knowledge-result-meta">
                          <div className="knowledge-result-source">
                            <FileText size={13} />

                            <strong>
                              {result.documentName || 'Project document'}
                            </strong>
                          </div>

                          <span>
                            {result.heading || 'General'}
                          </span>
                        </div>

                        <p>{result.snippet || result.text}</p>

                        <div className="knowledge-result-footer">
                          <span>
                            Passage {Number(result.ordinal || 0) + 1}
                          </span>

                          <span>
                            Relevance score: {formatScore(result.score)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>


              {/* ASK ECHO */}

              <section className="knowledge-ask-section">
                <div className="knowledge-ask-heading">
                  <div className="knowledge-ask-icon">
                    <Sparkles size={17} />
                  </div>

                  <div>
                    <h3>Ask Echo about this project</h3>

                    <p>
                      Get answers grounded in this project's
                      imported documentation.
                    </p>
                  </div>
                </div>

                <form
                  className="knowledge-ask-form"
                  onSubmit={handleAskEcho}
                >
                  <textarea
                    value={question}
                    onChange={(event) =>
                      setQuestion(event.target.value)
                    }
                    placeholder="Ask something about this project's architecture, code, decisions or implementation..."
                    rows={3}
                    maxLength={3000}
                    disabled={asking}
                    aria-label="Ask Echo about this project"
                  />

                  <div className="knowledge-ask-footer">
                    <span>
                      {question.length}/3000 characters
                    </span>

                    <button
                      type="submit"
                      className="knowledge-button primary"
                      disabled={!question.trim() || asking}
                    >
                      {asking ? (
                        <>
                          <Loader2
                            size={14}
                            className="knowledge-spin"
                          />
                          Thinking…
                        </>
                      ) : (
                        <>
                          <MessageSquare size={14} />
                          Ask Echo
                        </>
                      )}
                    </button>
                  </div>
                </form>


                {/* AI ANSWER */}

                {asking && (
                  <div className="knowledge-inline-loading">
                    <Loader2
                      size={15}
                      className="knowledge-spin"
                    />
                    Searching project knowledge and generating an answer…
                  </div>
                )}

                {answerResult && (
                  <div className="knowledge-answer-card">
                    <div className="knowledge-answer-heading">
                      <div>
                        <Sparkles size={15} />
                        <strong>Echo's answer</strong>
                      </div>

                      <button
                        type="button"
                        className="knowledge-clear-answer"
                        onClick={() => setAnswerResult(null)}
                      >
                        <X size={14} />
                        Clear
                      </button>
                    </div>

                    <div className="knowledge-answer-text">
                      {answerResult.answer}
                    </div>

                    <div className="knowledge-answer-model">
                      {answerResult.provider || 'AI provider'}
                      {answerResult.model
                        ? ` · ${answerResult.model}`
                        : ''}
                    </div>

                    <div className="knowledge-answer-sources">
                      <div className="knowledge-answer-sources-heading">
                        <strong>
                          Sources used
                        </strong>

                        <span>
                          {answerResult.sources?.length || 0}
                        </span>
                      </div>

                      {answerResult.sources?.length ? (
                        answerResult.sources.map((source, index) => (
                          <article
                            className="knowledge-answer-source"
                            key={source.id || `${source.documentId}-${index}`}
                          >
                            <div>
                              <FileText size={13} />

                              <strong>
                                {source.documentName || 'Project document'}
                              </strong>
                            </div>

                            <span>
                              {source.heading || 'General'}
                            </span>

                            {source.snippet && (
                              <p>{source.snippet}</p>
                            )}
                          </article>
                        ))
                      ) : (
                        <div className="knowledge-no-sources">
                          No matching project passages were retrieved.
                          The answer should not be treated as verified
                          project documentation.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>


              {/* DOCUMENT LIST */}

              <section className="knowledge-documents-section">
                <div className="knowledge-subheading">
                  <span>PROJECT DOCUMENTS</span>
                  <span>{documents.length}</span>
                </div>

                <DocumentList
  documents={documents}
  loading={loadingDocuments}
  reindexing={reindexing}
  busy={isBusy}
  onDelete={handleDeleteDocument}
/>
              </section>
            </>
          )}
        </main>
      </div>


      {/* STATUS NOTIFICATION */}

      {status && (
        <div
          className={`knowledge-status ${status.type}`}
          role="status"
          aria-live="polite"
        >
          {status.type === 'success' ? (
            <CheckCircle2 size={15} />
          ) : status.type === 'error' ||
            status.type === 'warning' ? (
            <AlertCircle size={15} />
          ) : null}

          <span>{status.text}</span>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setStatus(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
