
import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  Bot,
  ChevronDown,
  Folder,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles
} from 'lucide-react';

import ChatMessage from './ChatMessage';

import './assistant.css';

function getDesktop() {
  if (!window.echoDesktop) {
    throw new Error(
      'Echo desktop bridge is unavailable. Restart the application.'
    );
  }

  return window.echoDesktop;
}

function errorText(error) {
  return error?.message || 'Could not generate an answer.';
}

const SUGGESTED_QUESTIONS = [
  'Explain this project architecture.',
  'What technologies does this project use?',
  'What were the main technical challenges?',
  'How does the training or implementation work?'
];

export default function AIAssistant() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');

  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');

  const [answerStyle, setAnswerStyle] = useState('natural');

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState('');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const selectedProject = projects.find(
    (project) => project.id === projectId
  ) || null;

  /* =========================================
     LOAD PROJECTS
  ========================================= */

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);

    try {
      const result =
        await getDesktop().listKnowledgeProjects();

      const next = result || [];

      setProjects(next);

      // Default scope is all projects.
      // Do not automatically force an individual project.
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  /* =========================================
     SCROLL TO LATEST MESSAGE
  ========================================= */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    });
  }, [messages, sending]);

  /* =========================================
     SEND QUESTION
  ========================================= */

  const sendQuestion = async (overrideQuestion) => {
    const text = String(
      overrideQuestion ?? question
    ).trim();

    if (!text || sending) return;

    setQuestion('');
    setError('');

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text
    };

    const previousMessages = messages;

    setMessages((current) => [
      ...current,
      userMessage
    ]);

    setSending(true);

    try {
      const conversation = previousMessages
        .slice(-8)
        .map((message) => {
          const role = message.role === 'user'
            ? 'User'
            : 'Assistant';

          return `${role}: ${message.content}`;
        })
        .join('\n');

      const result =
        await getDesktop().askKnowledgeQuestion({
          question: text,
          projectId: projectId || null,
          conversation,
          answerStyle
        });

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result?.answer || 'No answer was returned.',
        provider: result?.provider,
        model: result?.model,
        sources: result?.sources || [],
        retrieval: result?.retrieval || null
      };

      setMessages((current) => [
        ...current,
        assistantMessage
      ]);
    } catch (requestError) {
      const errorMessage = errorText(requestError);

      setError(errorMessage);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I couldn't complete that request. ${errorMessage}`,
          sources: []
        }
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  /* =========================================
     NEW CONVERSATION
  ========================================= */

  const startNewConversation = () => {
    setMessages([]);
    setQuestion('');
    setError('');

    inputRef.current?.focus();
  };

  /* =========================================
     INPUT HANDLING
  ========================================= */

  const handleKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendQuestion();
    }
  };

  /* =========================================
     EMPTY STATE
  ========================================= */

  const hasIndexedDocuments = projects.some(
    (project) => project.indexedCount > 0
  );

  return (
    <section className="assistant-page">

      {/* HEADER */}

      <header className="assistant-page-header">
        <div>
          <div className="assistant-eyebrow">
            PROJECT-AWARE AI
          </div>

          <h1>AI Assistant</h1>

          <p>
            Ask questions about your projects using your
            own documentation and source files.
          </p>
        </div>

        <button
          type="button"
          className="assistant-new-chat-button"
          onClick={startNewConversation}
        >
          <Plus size={15} />
          New conversation
        </button>
      </header>

      {/* CONTROLS */}

      <div className="assistant-toolbar">

        <label className="assistant-scope-control">
          <Folder size={15} />

          <span>Knowledge scope</span>

          <div className="assistant-select-wrap">
            <select
              value={projectId}
              onChange={(event) =>
                setProjectId(event.target.value)
              }
              disabled={loadingProjects}
            >
              <option value="">All projects</option>

              {projects.map((project) => (
                <option
                  value={project.id}
                  key={project.id}
                >
                  {project.name}
                </option>
              ))}
            </select>

            <ChevronDown size={14} />
          </div>
        </label>

        <label className="assistant-style-control">
          <span>Answer style</span>

          <select
            value={answerStyle}
            onChange={(event) =>
              setAnswerStyle(event.target.value)
            }
          >
            <option value="natural">Natural</option>
            <option value="concise">Concise</option>
            <option value="technical">Technical</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>

      {/* CHAT AREA */}

      <div className="assistant-chat-panel">

        <div className="assistant-chat-scroll">

          {messages.length === 0 ? (
            <div className="assistant-welcome">
              <div className="assistant-welcome-icon">
                <Sparkles size={23} />
              </div>

              <h2>
                {selectedProject
                  ? `Let's explore ${selectedProject.name}.`
                  : 'Ask Echo about your projects.'}
              </h2>

              <p>
                {hasIndexedDocuments
                  ? 'Echo will search your indexed project documents and use relevant passages to prepare its answer.'
                  : 'Import and index your README files and project documentation in Knowledge Library to start asking project-specific questions.'}
              </p>

              {loadingProjects ? (
                <div className="assistant-empty-loading">
                  <Loader2
                    size={15}
                    className="assistant-spin"
                  />
                  Loading projects…
                </div>
              ) : (
                <>
                  <div className="assistant-suggestions">
                    {SUGGESTED_QUESTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setQuestion(item);
                          inputRef.current?.focus();
                        }}
                      >
                        <MessageSquare size={13} />
                        {item}
                      </button>
                    ))}
                  </div>

                  <div className="assistant-retrieval-note">
                    <Bot size={15} />
                    Answers can include references to your local documents.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="assistant-messages">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                />
              ))}

              {sending && (
                <div className="assistant-thinking">
                  <Loader2
                    size={16}
                    className="assistant-spin"
                  />

                  <span>
                    Searching project documents and preparing an answer…
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* INPUT */}

        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendQuestion();
          }}
        >
          {error && (
            <div className="assistant-error">
              {error}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="Ask something about your projects..."
            rows={2}
            disabled={sending}
          />

          <div className="assistant-composer-footer">
            <span>
              {projectId
                ? `Searching ${selectedProject?.name || 'selected project'}`
                : 'Searching all indexed projects'}
            </span>

            <button
              type="submit"
              className="assistant-send-button"
              disabled={!question.trim() || sending}
              aria-label="Send question"
            >
              {sending ? (
                <Loader2
                  size={15}
                  className="assistant-spin"
                />
              ) : (
                <>
                  <span>Ask Echo</span>
                  <Send size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <p className="assistant-disclaimer">
        Project answers are generated from retrieved local passages.
        Always verify important implementation details against their
        original source files.
      </p>

    </section>
  );
}
