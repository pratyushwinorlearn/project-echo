
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  extractDocument,
  isSupportedFile
} = require('./documentExtractor.cjs');

const {
  chunkDocument
} = require('./documentChunker.cjs');

const {
  buildIndex,
  searchIndex,
  INDEX_VERSION
} = require('./bm25Engine.cjs');

const LIBRARY_DIRECTORY = 'knowledge-library';
const STATE_FILENAME = 'library.json';
const LIBRARY_VERSION = 1;

const MAX_IMPORT_FILES = 300;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function createEmptyState() {
  return {
    version: LIBRARY_VERSION,
    projects: []
  };
}

function makeId() {
  return crypto.randomUUID();
}

function cleanText(value, maxLength = 200) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isValidId(value) {
  return (
    typeof value === 'string' &&
    UUID_PATTERN.test(value)
  );
}

function publicProject(project) {
  const documents = Array.isArray(project.documents)
    ? project.documents
    : [];

  return {
    id: project.id,
    name: project.name,
    description: project.description || '',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    documentCount: documents.length,
    indexedCount: documents.filter(
      (document) => document.status === 'indexed'
    ).length
  };
}

function publicDocument(document) {
  return {
    id: document.id,
    projectId: document.projectId,
    name: document.name,
    extension: document.extension,
    size: document.size,
    importedAt: document.importedAt,
    wordCount: document.wordCount,
    characterCount: document.characterCount,
    pageCount: document.pageCount || null,
    status: document.status,
    warning: document.warning || null,
    error: document.error || null
  };
}

async function writeTextAtomically(filePath, content) {
  const directory = path.dirname(filePath);

  await fs.mkdir(directory, {
    recursive: true
  });

  const temporaryPath =
    `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(
      temporaryPath,
      content,
      {
        encoding: 'utf8',
        flag: 'wx'
      }
    );

    await fs.rename(
      temporaryPath,
      filePath
    );
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // Ignore temporary-file cleanup errors.
    }

    throw error;
  }
}


class KnowledgeManager {
  constructor({ appRef }) {
    if (!appRef) {
      throw new Error(
        'KnowledgeManager requires the Electron app object.'
      );
    }

    this.app = appRef;

    // Serializes all metadata writes.
    this.writeQueue = Promise.resolve();

    // Serializes changes to an individual project.
    this.projectQueues = new Map();
  }

  get libraryPath() {
    if (!this.app.isReady()) {
      throw new Error(
        'Electron must be ready before accessing the Knowledge Library.'
      );
    }

    return path.join(
      this.app.getPath('userData'),
      LIBRARY_DIRECTORY
    );
  }

  get statePath() {
    return path.join(
      this.libraryPath,
      STATE_FILENAME
    );
  }

  projectPath(projectId) {
    if (!isValidId(projectId)) {
      throw new Error('Invalid project ID.');
    }

    return path.join(
      this.libraryPath,
      'projects',
      projectId
    );
  }

  indexPath(projectId) {
    return path.join(
      this.projectPath(projectId),
      'index.json'
    );
  }

  resolveStoredPath(relativePath) {
    if (
      typeof relativePath !== 'string' ||
      !relativePath.trim()
    ) {
      throw new Error(
        'Invalid path in Knowledge Library metadata.'
      );
    }

    const root = path.resolve(this.libraryPath);
    const resolved = path.resolve(root, relativePath);
    const relative = path.relative(root, resolved);

    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        'Invalid path in Knowledge Library metadata.'
      );
    }

    return resolved;
  }

  validateState(state) {
    if (
      !state ||
      typeof state !== 'object' ||
      state.version !== LIBRARY_VERSION ||
      !Array.isArray(state.projects)
    ) {
      throw new Error(
        'The Knowledge Library database has an invalid format.'
      );
    }

    const projectIds = new Set();

    for (const project of state.projects) {
      if (
        !project ||
        typeof project !== 'object' ||
        !isValidId(project.id) ||
        typeof project.name !== 'string' ||
        !Array.isArray(project.documents)
      ) {
        throw new Error(
          'The Knowledge Library contains invalid project metadata.'
        );
      }

      if (projectIds.has(project.id)) {
        throw new Error(
          'The Knowledge Library contains duplicate project IDs.'
        );
      }

      projectIds.add(project.id);

      const documentIds = new Set();

      for (const document of project.documents) {
        if (
          !document ||
          typeof document !== 'object' ||
          !isValidId(document.id) ||
          document.projectId !== project.id ||
          typeof document.name !== 'string' ||
          typeof document.originalRelativePath !== 'string' ||
          typeof document.extractedRelativePath !== 'string'
        ) {
          throw new Error(
            'The Knowledge Library contains invalid document metadata.'
          );
        }

        if (documentIds.has(document.id)) {
          throw new Error(
            'The Knowledge Library contains duplicate document IDs.'
          );
        }

        documentIds.add(document.id);

        // Confirm that stored file paths remain inside
        // the Knowledge Library directory.
        this.resolveStoredPath(
          document.originalRelativePath
        );

        this.resolveStoredPath(
          document.extractedRelativePath
        );
      }
    }

    return state;
  }

  async ensureInitialized() {
    await fs.mkdir(
      path.join(this.libraryPath, 'projects'),
      { recursive: true }
    );

    try {
      await fs.writeFile(
        this.statePath,
        JSON.stringify(createEmptyState(), null, 2),
        {
          encoding: 'utf8',
          flag: 'wx'
        }
      );
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async readState() {
    await this.ensureInitialized();

    try {
      const raw = await fs.readFile(
        this.statePath,
        'utf8'
      );

      return this.validateState(
        JSON.parse(raw)
      );
    } catch (error) {
      throw new Error(
        `Could not read the Knowledge Library database: ${
          error?.message || error
        }`
      );
    }
  }

  async writeState(state) {
    await fs.mkdir(
      this.libraryPath,
      { recursive: true }
    );

    const safeState = this.validateState(state);

    await writeTextAtomically(
      this.statePath,
      JSON.stringify(safeState, null, 2)
    );
  }

  async updateState(updater) {
    const operation = this.writeQueue.then(
      async () => {
        const state = await this.readState();
        const updated = await updater(state);

        await this.writeState(updated);

        return updated;
      }
    );

    this.writeQueue = operation.catch(() => {});

    return operation;
  }

  async withProjectLock(projectId, callback) {
    const key = String(projectId || '');

    const previous =
      this.projectQueues.get(key) || Promise.resolve();

    const operation = previous
      .catch(() => {})
      .then(callback);

    this.projectQueues.set(key, operation);

    try {
      return await operation;
    } finally {
      if (this.projectQueues.get(key) === operation) {
        this.projectQueues.delete(key);
      }
    }
  }

  async removeStoredFile(relativePath) {
    if (!relativePath) return;

    try {
      await fs.unlink(
        this.resolveStoredPath(relativePath)
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /* =========================================
     PROJECTS
  ========================================= */

  async listProjects() {
    const state = await this.readState();

    return state.projects
      .map(publicProject)
      .sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
  }

  async createProject(input = {}) {
    const safeInput =
      input && typeof input === 'object'
        ? input
        : {};

    const name = cleanText(safeInput.name, 80);
    const description = cleanText(
      safeInput.description,
      500
    );

    if (!name) {
      throw new Error('Enter a project name.');
    }

    const now = new Date().toISOString();

    const project = {
      id: makeId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      documents: []
    };

    const directory = this.projectPath(project.id);

    try {
      await fs.mkdir(
        path.join(directory, 'documents'),
        { recursive: true }
      );

      await fs.mkdir(
        path.join(directory, 'extracted'),
        { recursive: true }
      );

      await this.updateState((state) => {
        state.projects.push(project);
        return state;
      });
    } catch (error) {
      await fs.rm(directory, {
        recursive: true,
        force: true
      }).catch(() => {});

      throw error;
    }

    return publicProject(project);
  }

  async deleteProject(projectId) {
    return this.withProjectLock(
      projectId,
      async () => {
        let removedProject = null;

        await this.updateState((state) => {
          const index = state.projects.findIndex(
            (project) => project.id === projectId
          );

          if (index < 0) {
            throw new Error('Project not found.');
          }

          [removedProject] = state.projects.splice(
            index,
            1
          );

          return state;
        });

        await fs.rm(
          this.projectPath(removedProject.id),
          {
            recursive: true,
            force: true
          }
        );

        return {
          deleted: true,
          projectId
        };
      }
    );
  }

  async findProject(projectId) {
    const state = await this.readState();

    const project = state.projects.find(
      (item) => item.id === projectId
    );

    if (!project) {
      throw new Error('Project not found.');
    }

    return project;
  }

  /* =========================================
     DOCUMENTS
  ========================================= */

  async listDocuments(projectId) {
    const project = await this.findProject(projectId);

    return project.documents
      .map(publicDocument)
      .sort((a, b) =>
        new Date(b.importedAt) - new Date(a.importedAt)
      );
  }

  async importFiles(projectId, filePaths = []) {
    if (
      !Array.isArray(filePaths) ||
      !filePaths.length
    ) {
      throw new Error('No files were selected.');
    }

    if (filePaths.length > MAX_IMPORT_FILES) {
      throw new Error(
        `You can import at most ${MAX_IMPORT_FILES} files at a time.`
      );
    }

    return this.withProjectLock(
      projectId,
      async () => {
        await this.findProject(projectId);

        const imported = [];
        const failed = [];

        for (const sourcePath of filePaths) {
          let originalRelativePath = null;
          let extractedRelativePath = null;

          try {
            if (
              typeof sourcePath !== 'string' ||
              !path.isAbsolute(sourcePath)
            ) {
              throw new Error('Invalid file path.');
            }

            if (!isSupportedFile(sourcePath)) {
              throw new Error('Unsupported file format.');
            }

            const extracted = await extractDocument(
              sourcePath
            );

            const stat = await fs.stat(sourcePath);

            const documentId = makeId();
            const extension = extracted.extension;
            const originalName = path.basename(sourcePath);
            const storedName = `${documentId}${extension}`;

            originalRelativePath = path.join(
              'projects',
              projectId,
              'documents',
              storedName
            );

            extractedRelativePath = path.join(
              'projects',
              projectId,
              'extracted',
              `${documentId}.txt`
            );

            const storedOriginal = this.resolveStoredPath(
              originalRelativePath
            );

            const storedExtracted = this.resolveStoredPath(
              extractedRelativePath
            );

            await fs.mkdir(
              path.dirname(storedOriginal),
              { recursive: true }
            );

            await fs.mkdir(
              path.dirname(storedExtracted),
              { recursive: true }
            );

            await fs.copyFile(
              sourcePath,
              storedOriginal
            );

            await fs.writeFile(
              storedExtracted,
              extracted.text,
              'utf8'
            );

            imported.push({
              id: documentId,
              projectId,
              name: originalName,
              extension,
              size: stat.size,
              importedAt: new Date().toISOString(),
              wordCount: extracted.wordCount,
              characterCount: extracted.characterCount,
              pageCount: extracted.pageCount,
              warning: extracted.warnings?.length
                ? extracted.warnings.join('; ').slice(0, 1500)
                : null,
              status: 'pending',
              error: null,
              originalRelativePath,
              extractedRelativePath
            });

          } catch (error) {
            for (const relativePath of [
              originalRelativePath,
              extractedRelativePath
            ]) {
              if (!relativePath) continue;

              try {
                await this.removeStoredFile(relativePath);
              } catch {
                // Ignore cleanup errors for failed imports.
              }
            }

            failed.push({
              name: path.basename(
                String(sourcePath || 'Unknown file')
              ),
              error: error?.message || 'Import failed.'
            });
          }
        }

        if (!imported.length) {
          return {
            imported: [],
            failed,
            project: publicProject(
              await this.findProject(projectId)
            )
          };
        }

        // Persist imported document metadata.
        try {
          await this.updateState((state) => {
            const target = state.projects.find(
              (item) => item.id === projectId
            );

            if (!target) {
              throw new Error(
                'Project was deleted during import.'
              );
            }

            target.documents.push(...imported);
            target.updatedAt = new Date().toISOString();

            return state;
          });
        } catch (error) {
          for (const document of imported) {
            await this.removeStoredFile(
              document.originalRelativePath
            ).catch(() => {});

            await this.removeStoredFile(
              document.extractedRelativePath
            ).catch(() => {});
          }

          throw error;
        }

        let indexingError = null;

        try {
          await this.reindexProjectUnlocked(projectId);
        } catch (error) {
          indexingError =
            error?.message || 'Project indexing failed.';

          try {
            const importedIds = new Set(
              imported.map((document) => document.id)
            );

            await this.updateState((state) => {
              const target = state.projects.find(
                (item) => item.id === projectId
              );

              if (!target) return state;

              for (const document of target.documents) {
                if (importedIds.has(document.id)) {
                  document.status = 'error';
                  document.error = indexingError;
                }
              }

              return state;
            });
          } catch (statusError) {
            console.error(
              '[Knowledge] Could not save indexing status:',
              statusError?.message || statusError
            );
          }

          console.error(
            '[Knowledge] Indexing failed after import:',
            indexingError
          );
        }

        const finalProject = await this.findProject(projectId);

        const finalDocuments = new Map(
          finalProject.documents.map(
            (document) => [document.id, document]
          )
        );

        return {
          imported: imported.map((document) =>
            publicDocument(
              finalDocuments.get(document.id) || document
            )
          ),
          failed,
          indexingError,
          project: publicProject(finalProject)
        };
      }
    );
  }

  async deleteDocument(projectId, documentId) {
    return this.withProjectLock(
      projectId,
      async () => {
        const project = await this.findProject(projectId);

        const document = project.documents.find(
          (item) => item.id === documentId
        );

        if (!document) {
          throw new Error('Document not found.');
        }

        await this.updateState((state) => {
          const target = state.projects.find(
            (item) => item.id === projectId
          );

          if (!target) {
            throw new Error('Project not found.');
          }

          target.documents = target.documents.filter(
            (item) => item.id !== documentId
          );

          target.updatedAt = new Date().toISOString();

          return state;
        });

        const cleanupWarnings = [];

        for (const relativePath of [
          document.originalRelativePath,
          document.extractedRelativePath
        ]) {
          try {
            await this.removeStoredFile(relativePath);
          } catch (error) {
            cleanupWarnings.push(
              error?.message || 'Could not remove a stored document file.'
            );
          }
        }

        let indexingError = null;

        try {
          await this.reindexProjectUnlocked(projectId);
        } catch (error) {
          indexingError =
            error?.message || 'Project reindexing failed.';

          // Never leave an old index searchable after a
          // document has been deleted.
          await fs.unlink(
            this.indexPath(projectId)
          ).catch(() => {});

          console.error(
            '[Knowledge] Reindexing failed after deletion:',
            indexingError
          );
        }

        return {
          deleted: true,
          documentId,
          indexingError,
          cleanupWarnings
        };
      }
    );
  }

  /* =========================================
     REINDEX PROJECT
  ========================================= */

  async reindexProject(projectId) {
    return this.withProjectLock(
      projectId,
      () => this.reindexProjectUnlocked(projectId)
    );
  }

  async reindexProjectUnlocked(projectId) {
    const project = await this.findProject(projectId);

    const allChunks = [];
    const documentStatus = new Map();

    for (const document of project.documents || []) {
      try {
        const extractedPath = this.resolveStoredPath(
          document.extractedRelativePath
        );

        const text = await fs.readFile(
          extractedPath,
          'utf8'
        );

        const chunks = chunkDocument(text, {
          documentId: document.id,
          documentName: document.name,
          projectId
        });

        allChunks.push(...chunks);

        documentStatus.set(document.id, {
          status: chunks.length ? 'indexed' : 'empty',
          error: null
        });

      } catch (error) {
        documentStatus.set(document.id, {
          status: 'error',
          error: error?.message || 'Could not index document.'
        });
      }
    }

    const index = buildIndex(allChunks);

    await writeTextAtomically(
      this.indexPath(projectId),
      JSON.stringify(index)
    );

    await this.updateState((state) => {
      const target = state.projects.find(
        (item) => item.id === projectId
      );

      if (!target) {
        throw new Error(
          'Project not found during reindexing.'
        );
      }

      for (const document of target.documents) {
        const result = documentStatus.get(document.id);

        if (!result) continue;

        document.status = result.status;
        document.error = result.error;
      }

      target.updatedAt = new Date().toISOString();

      return state;
    });

    return {
      projectId,
      documentCount: project.documents.length,
      chunkCount: allChunks.length,
      indexed: allChunks.length > 0
    };
  }

  /* =========================================
     SEARCH
  ========================================= */

  async search(query, projectId = null, options = {}) {
    const cleanQuery = cleanText(query, 2000);

    if (!cleanQuery) {
      return [];
    }

    const state = await this.readState();

    const projects = projectId
      ? state.projects.filter(
          (project) => project.id === projectId
        )
      : state.projects;

    if (projectId && !projects.length) {
      throw new Error('Selected project was not found.');
    }

    const allResults = [];

    for (const project of projects) {
      const indexPath = this.indexPath(project.id);

      let index = null;
      let needsReindex = false;

      try {
        const raw = await fs.readFile(
          indexPath,
          'utf8'
        );

        index = JSON.parse(raw);

        if (
          !index ||
          index.version !== INDEX_VERSION ||
          !Array.isArray(index.documents)
        ) {
          needsReindex = true;
        }
      } catch (error) {
        if (error?.code === 'ENOENT') {
          needsReindex = project.documents.length > 0;
        } else {
          needsReindex = true;
        }
      }

      // Rebuild old or damaged indexes from the original
      // extracted documents.
      if (needsReindex) {
        await this.reindexProject(project.id);

        try {
          const raw = await fs.readFile(
            indexPath,
            'utf8'
          );

          index = JSON.parse(raw);
        } catch {
          index = null;
        }
      }

      if (!index) continue;

      const results = searchIndex(
        index,
        cleanQuery,
        {
          limit: options.perProjectLimit || 12,
          minScore: options.minScore ?? 0
        }
      );

      for (const result of results) {
        allResults.push({
          ...result,
          projectName: project.name
        });
      }
    }

    allResults.sort(
      (a, b) => b.score - a.score
    );

    const requestedLimit = Number(options.limit);

    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(20, Math.trunc(requestedLimit)))
      : 8;

    return allResults.slice(0, safeLimit);
  }
}


function createKnowledgeManager({ appRef }) {
  return new KnowledgeManager({
    appRef
  });
}

module.exports = {
  createKnowledgeManager,
  KnowledgeManager,
  publicProject,
  publicDocument,
  MAX_IMPORT_FILES
};
