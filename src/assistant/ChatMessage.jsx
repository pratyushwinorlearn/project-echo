
import React from 'react';
import {
  Bot,
  User,
  Copy,
  Check
} from 'lucide-react';

import SourceReference from './SourceReference';

export default function ChatMessage({
  message
}) {
  const [copied, setCopied] = React.useState(false);

  const isUser = message.role === 'user';

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(
        message.content || ''
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error('Could not copy answer:', error);
    }
  };

  return (
    <article
      className={`assistant-message ${
        isUser ? 'user' : 'assistant'
      }`}
    >
      <div className="assistant-message-avatar">
        {isUser ? (
          <User size={15} />
        ) : (
          <Bot size={16} />
        )}
      </div>

      <div className="assistant-message-body">
        <div className="assistant-message-heading">
          <strong>
            {isUser ? 'You' : 'Echo'}
          </strong>

          {!isUser && message.provider && (
            <span>
              {message.provider}
              {message.model ? ` · ${message.model}` : ''}
            </span>
          )}
        </div>

        <div className="assistant-message-content">
          {message.content}
        </div>

        {!isUser &&
          Array.isArray(message.sources) &&
          message.sources.length > 0 && (
            <div className="assistant-message-sources">
              <div className="assistant-sources-heading">
                SOURCES USED
              </div>

              <div className="assistant-source-list">
                {message.sources.map((source, index) => (
                  <SourceReference
                    key={source.id || `${source.documentId}-${index}`}
                    source={source}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

        {!isUser && (
          <div className="assistant-message-actions">
            <button
              type="button"
              onClick={copyAnswer}
              title="Copy answer"
            >
              {copied ? (
                <Check size={13} />
              ) : (
                <Copy size={13} />
              )}

              {copied ? 'Copied' : 'Copy'}
            </button>

            {message.retrieval?.resultCount != null && (
              <span>
                {message.retrieval.resultCount} passages retrieved
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
