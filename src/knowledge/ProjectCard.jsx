
import React from 'react';

import {
  Folder,
  FileText,
  ChevronRight,
  Trash2
} from 'lucide-react';

export default function ProjectCard({
  project,
  selected,
  onSelect,
  onDelete
}) {
  const documentCount = Number(project?.documentCount) || 0;
  const indexedCount = Number(project?.indexedCount) || 0;

  const projectName = project?.name || 'Untitled project';

  return (
    <article
      className={`knowledge-project-card ${
        selected ? 'selected' : ''
      }`}
    >
      <button
        type="button"
        className="knowledge-project-main"
        onClick={() => onSelect?.(project.id)}
        aria-pressed={Boolean(selected)}
        aria-label={`Select project ${projectName}`}
      >
        <div className="knowledge-project-icon">
          <Folder size={21} />
        </div>

        <div className="knowledge-project-info">
          <strong title={projectName}>
            {projectName}
          </strong>

          <span title={project?.description || 'No project description'}>
            {project?.description || 'No project description'}
          </span>

          <small>
            <FileText size={12} />

            {documentCount} documents

            <span aria-hidden="true">·</span>

            {indexedCount} indexed
          </small>
        </div>

        <ChevronRight
          size={16}
          className="knowledge-project-arrow"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        className="knowledge-project-delete"
        title={`Delete ${projectName}`}
        aria-label={`Delete project ${projectName}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(project);
        }}
      >
        <Trash2 size={14} />
      </button>
    </article>
  );
}
