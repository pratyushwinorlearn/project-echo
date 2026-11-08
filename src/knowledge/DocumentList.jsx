
import React from 'react';

import {
  FileText,
  FileCode,
  FileType,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Loader2
} from 'lucide-react';


/* =========================================
   FILE TYPE ICONS
========================================= */

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.py', '.java',
  '.cpp', '.cc', '.c', '.h',
  '.hpp', '.cs', '.go', '.rs',
  '.php', '.rb', '.sql', '.css',
  '.scss', '.html', '.htm', '.xml',
  '.sh', '.bash', '.ps1', '.bat',
  '.json', '.jsonc', '.yaml', '.yml',
  '.toml', '.ini', '.config',
  '.dockerfile', '.gitignore',
  '.gitmodules', '.makefile'
]);

function normalizeExtension(extension) {
  const value = String(extension || '')
    .trim()
    .toLowerCase();

  if (!value) return '';

  return value.startsWith('.')
    ? value
    : `.${value}`;
}

function getFileIcon(extension) {
  const normalized = normalizeExtension(extension);

  if (CODE_EXTENSIONS.has(normalized)) {
    return FileCode;
  }

  if (
    normalized === '.pdf' ||
    normalized === '.docx'
  ) {
    return FileType;
  }

  return FileText;
}


/* =========================================
   FORMATTING
========================================= */

function formatBytes(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatImportedDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}


/* =========================================
   DOCUMENT STATUS
========================================= */

function getDocumentStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'indexed':
      return {
        label: 'Indexed',
        Icon: CheckCircle2,
        className: 'success'
      };

    case 'error':
      return {
        label: 'Index error',
        Icon: AlertCircle,
        className: 'error'
      };

    case 'empty':
      return {
        label: 'No searchable text',
        Icon: AlertCircle,
        className: 'warning'
      };

    case 'pending':
      return {
        label: 'Pending',
        Icon: Clock3,
        className: 'pending'
      };

    default:
      return {
        label: 'Unknown',
        Icon: Clock3,
        className: 'pending'
      };
  }
}

function StatusIcon({ status }) {
  const statusInfo = getDocumentStatus(status);
  const Icon = statusInfo.Icon;

  return (
    <Icon
      size={14}
      className={`document-status-icon ${statusInfo.className}`}
      aria-hidden="true"
    />
  );
}


/* =========================================
   EMPTY STATE
========================================= */

function EmptyDocuments() {
  return (
    <div
      className="knowledge-empty-state compact"
      role="status"
    >
      <FileText size={22} />

      <strong>No documents imported yet</strong>

      <span>
        Import READMEs, notes, reports or source-code files
        to build this project's searchable knowledge.
      </span>
    </div>
  );
}


/* =========================================
   DOCUMENT LIST
========================================= */

export default function DocumentList({
  documents = [],
  loading = false,
  reindexing = false,
  busy = false,
  onDelete
}) {
  if (loading) {
    return (
      <div
        className="knowledge-empty-state compact"
        role="status"
        aria-live="polite"
      >
        <Loader2
          size={18}
          className="knowledge-spin"
        />

        <strong>Loading documents…</strong>
      </div>
    );
  }

  if (!documents.length) {
    return <EmptyDocuments />;
  }

  return (
    <div
      className="knowledge-document-list"
      aria-busy={reindexing}
    >
      {reindexing && (
        <div className="knowledge-reindex-indicator">
          <Loader2
            size={14}
            className="knowledge-spin"
          />

          Rebuilding the project's searchable index…
        </div>
      )}

      {documents.map((document) => {
        const Icon = getFileIcon(document.extension);

        const statusInfo = getDocumentStatus(
          document.status
        );

        const importedDate = formatImportedDate(
          document.importedAt
        );

        const wordCount = Number(document.wordCount) || 0;

        return (
          <article
            className="knowledge-document-row"
            key={document.id}
          >
            {/* FILE ICON */}

            <div className="knowledge-document-icon">
              <Icon
                size={18}
                aria-hidden="true"
              />
            </div>


            {/* DOCUMENT INFORMATION */}

            <div className="knowledge-document-info">
              <strong
                title={document.name}
              >
                {document.name || 'Untitled document'}
              </strong>

              <small>
                {formatBytes(document.size)}

                <span aria-hidden="true">·</span>

                {wordCount.toLocaleString()} words

                {document.pageCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    {document.pageCount} pages
                  </>
                )}

                {importedDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    {importedDate}
                  </>
                )}
              </small>

              {document.error && (
                <span
                  className="knowledge-document-error"
                  title={document.error}
                >
                  {document.error}
                </span>
              )}

              {document.warning && (
                <span
                  className="knowledge-document-warning"
                  title={document.warning}
                >
                  {document.warning}
                </span>
              )}
            </div>


            {/* INDEXING STATUS */}

            <div
              className="knowledge-document-status"
              title={statusInfo.label}
              aria-label={`Indexing status: ${statusInfo.label}`}
            >
              <StatusIcon status={document.status} />

              <span>
                {statusInfo.label}
              </span>
            </div>


            {/* DELETE DOCUMENT */}

            <button
              type="button"
              className="knowledge-document-action danger"
              title={`Delete ${document.name}`}
              aria-label={`Delete document ${document.name}`}
              onClick={() => onDelete?.(document)}
              disabled={busy}
            >
              <Trash2 size={14} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
