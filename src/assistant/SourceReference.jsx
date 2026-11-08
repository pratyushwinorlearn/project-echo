
import React from 'react';
import {
  FileText,
  FileCode,
  FileType
} from 'lucide-react';

function getIcon(name = '') {
  const extension = name.includes('.')
    ? name.split('.').pop().toLowerCase()
    : '';

  if (
    ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h'].includes(extension)
  ) {
    return FileCode;
  }

  if (['pdf', 'docx'].includes(extension)) {
    return FileType;
  }

  return FileText;
}

export default function SourceReference({
  source,
  index
}) {
  const Icon = getIcon(source.documentName);

  return (
    <div className="assistant-source-reference">
      <span className="assistant-source-number">
        {index + 1}
      </span>

      <Icon size={15} />

      <div className="assistant-source-info">
        <strong>{source.documentName}</strong>
        <small>
          {source.projectName}
          {source.heading
            ? ` · ${source.heading}`
            : ''}
        </small>
      </div>
    </div>
  );
}
