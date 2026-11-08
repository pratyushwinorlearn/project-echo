
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import HighlightToolbar from './HighlightToolbar';

import {
  addPhraseHighlight,
  buildHighlightSegments,
  removePhraseHighlight
} from './highlightUtils';

/* =========================================
   HTML HELPERS
========================================= */

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHTML(value) {
  return escapeHTML(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<br>');
}

function segmentsToHTML(segments) {
  return segments.map((segment) => {
    const text = textToHTML(segment.text);

    if (!segment.color) {
      return text;
    }

    return (
      `<span class="script-highlight-${segment.color}">` +
      `${text}</span>`
    );
  }).join('');
}

function readEditorText(element) {
  if (!element) return '';

  return element.innerText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/* =========================================
   SELECTION HELPERS
========================================= */

function getSelectionState(root) {
  const selection = window.getSelection();

  if (
    !selection ||
    !selection.rangeCount ||
    !root
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  if (range.collapsed) return null;

  return {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
    text: selection.toString()
  };
}

/*
 * Preserve a selected phrase when highlight markup changes.
 * The selected DOM nodes may be replaced, so we store the
 * approximate text offsets and recreate the range afterwards.
 */

function getTextOffset(root, node, offset) {
  try {
    const range = document.createRange();

    range.selectNodeContents(root);
    range.setEnd(node, offset);

    return range.toString().length;
  } catch {
    return null;
  }
}

function findTextPosition(root, requestedOffset) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );

  let remaining = Math.max(0, requestedOffset);
  let current = walker.nextNode();

  let last = null;

  while (current) {
    last = current;

    const length = current.textContent.length;

    if (remaining <= length) {
      return {
        node: current,
        offset: remaining
      };
    }

    remaining -= length;

    current = walker.nextNode();
  }

  if (last) {
    return {
      node: last,
      offset: last.textContent.length
    };
  }

  return null;
}

function restoreSelection(root, saved) {
  if (!saved) return;

  const startPosition = findTextPosition(
    root,
    saved.start
  );

  const endPosition = findTextPosition(
    root,
    saved.end
  );

  if (!startPosition || !endPosition) return;

  try {
    const range = document.createRange();

    range.setStart(
      startPosition.node,
      startPosition.offset
    );

    range.setEnd(
      endPosition.node,
      endPosition.offset
    );

    const selection = window.getSelection();

    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Ignore selection restoration errors.
  }
}

/* =========================================
   SCRIPT EDITOR
========================================= */

export default function ScriptEditor({
  value = '',
  onChange,
  highlights = [],
  onHighlightsChange,
  placeholder = 'Paste or write your script here...',
  className = ''
}) {
  const editorRef = useRef(null);

  const lastHighlightSignatureRef = useRef('');

  const initializedRef = useRef(false);

  const [selectedText, setSelectedText] = useState('');

  const content = String(value ?? '');

  const segments = useMemo(
    () => buildHighlightSegments(content, highlights),
    [content, highlights]
  );

  const highlightSignature = useMemo(
    () => JSON.stringify(highlights || []),
    [highlights]
  );

  const nextHTML = useMemo(
    () => segmentsToHTML(segments),
    [segments]
  );

  /* =========================================
     INITIALISE / SYNCHRONISE EDITOR
  ========================================= */

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) return;

    const editorText = readEditorText(editor);

    const contentMatches =
      editorText === content;

    const highlightsChanged =
      lastHighlightSignatureRef.current !==
      highlightSignature;

    const needsInitialisation =
      !initializedRef.current;

    /*
     * During ordinary typing, the DOM already contains
     * the latest text. Do not replace it, because that
     * would move the caret and interrupt typing.
     */

    if (
      initializedRef.current &&
      contentMatches &&
      !highlightsChanged
    ) {
      return;
    }

    let savedSelection = null;

    if (document.activeElement === editor) {
      const current = getSelectionState(editor);

      if (current) {
        const start = getTextOffset(
          editor,
          current.startContainer,
          current.startOffset
        );

        const end = getTextOffset(
          editor,
          current.endContainer,
          current.endOffset
        );

        if (start !== null && end !== null) {
          savedSelection = {
            start,
            end
          };
        }
      }
    }

    /*
     * Replace markup only when:
     * - the script changes externally,
     * - highlight formatting changes, or
     * - the editor mounts for the first time.
     */

    if (
      needsInitialisation ||
      !contentMatches ||
      highlightsChanged
    ) {
      editor.innerHTML = nextHTML;
    }

    initializedRef.current = true;

    lastHighlightSignatureRef.current =
      highlightSignature;

    if (savedSelection) {
      restoreSelection(editor, savedSelection);
    }
  }, [
    content,
    highlightSignature,
    nextHTML
  ]);

  /* =========================================
     HANDLE INPUT
  ========================================= */

  const handleInput = useCallback(() => {
    const editor = editorRef.current;

    if (!editor) return;

    const nextValue = readEditorText(editor);

    onChange?.(nextValue);
  }, [onChange]);

  /* =========================================
     HANDLE SELECTION
  ========================================= */

  const updateSelection = useCallback(() => {
    const editor = editorRef.current;

    if (!editor) return;

    const selection = window.getSelection();

    if (
      !selection ||
      !selection.rangeCount ||
      !editor.contains(selection.anchorNode) ||
      !editor.contains(selection.focusNode)
    ) {
      setSelectedText('');
      return;
    }

    const text = selection.toString();

    setSelectedText(
      text.trim() ? text : ''
    );
  }, []);

  /* =========================================
     APPLY HIGHLIGHT
  ========================================= */

  const applyHighlight = (color) => {
    const phrase = selectedText.trim();

    if (!phrase) return;

    onHighlightsChange?.((current) =>
      addPhraseHighlight(
        current,
        phrase,
        color
      )
    );

    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  };

  /* =========================================
     REMOVE HIGHLIGHT
  ========================================= */

  const removeHighlight = () => {
    const phrase = selectedText.trim();

    if (!phrase) return;

    onHighlightsChange?.((current) =>
      removePhraseHighlight(
        current,
        phrase
      )
    );

    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  };

  /* =========================================
     PASTE AS PLAIN TEXT
  ========================================= */

  const handlePaste = (event) => {
    event.preventDefault();

    const text =
      event.clipboardData?.getData('text/plain') || '';

    if (!text) return;

    document.execCommand(
      'insertText',
      false,
      text
    );

    handleInput();
  };

  /* =========================================
     KEYBOARD HANDLING
  ========================================= */

  const handleKeyDown = (event) => {
    // Prevent browser shortcuts from changing application state.
    if (
      event.key === 'Escape'
    ) {
      setSelectedText('');
    }
  };

  return (
    <div
      className={`script-editor-component ${className}`}
    >
      <div className="echo-script-editor-frame">

        <div
          ref={editorRef}
          className="echo-script-rich-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Presentation script editor"
          aria-multiline="true"
          data-placeholder={placeholder}
          spellCheck="true"
          onInput={handleInput}
          onMouseUp={updateSelection}
          onKeyUp={updateSelection}
          onSelect={updateSelection}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            /*
             * Keep the selection while clicking the toolbar.
             * Otherwise clear the selection after focus leaves.
             */

            requestAnimationFrame(() => {
              const editor = editorRef.current;

              if (
                editor &&
                !editor.contains(document.activeElement)
              ) {
                const selection = window.getSelection();

                if (
                  !selection ||
                  !selection.rangeCount ||
                  !editor.contains(selection.anchorNode)
                ) {
                  setSelectedText('');
                }
              }
            });
          }}
        />

      </div>

      <HighlightToolbar
        selectedText={selectedText}
        onHighlight={applyHighlight}
        onRemove={removeHighlight}
      />
    </div>
  );
}
