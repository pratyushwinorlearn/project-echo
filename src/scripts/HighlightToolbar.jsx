
import React from 'react';

import {
  Highlighter,
  Eraser
} from 'lucide-react';

import { HIGHLIGHT_COLORS } from './highlightUtils';

export default function HighlightToolbar({
  selectedText,
  onHighlight,
  onRemove
}) {
  const hasSelection = Boolean(
    String(selectedText || '').trim()
  );

  return (
    <div className="script-highlight-toolbar">
      <div className="script-highlight-toolbar-label">
        <Highlighter size={14} />

        <span>
          {hasSelection
            ? 'Highlight selected text'
            : 'Select a word or phrase to highlight'}
        </span>
      </div>

      <div className="script-highlight-colors">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            className="script-highlight-color"
            style={{
              '--highlight-color': color.hex
            }}
            disabled={!hasSelection}
            onMouseDown={(event) => {
              // Preserve textarea selection until onClick.
              event.preventDefault();
            }}
            onClick={() => onHighlight(color.id)}
            title={`Highlight ${color.label}`}
            aria-label={`Highlight ${color.label}`}
          />
        ))}

        <button
          type="button"
          className="script-highlight-remove"
          disabled={!hasSelection}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
          title="Remove selected phrase highlight"
          aria-label="Remove selected phrase highlight"
        >
          <Eraser size={14} />
        </button>
      </div>
    </div>
  );
}
