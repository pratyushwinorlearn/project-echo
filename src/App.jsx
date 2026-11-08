
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  Headphones,
  Loader2,
  Maximize2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';

import { createSpeechProvider } from './speech/SpeechProvider';

import {
  alignTranscriptToScript,
  extractKeyterms,
  tokenizeScript
} from './speech/alignmentEngine';

import {
  QuestionCaptureProvider
} from './meeting/QuestionCaptureProvider';

import {
  extractQuestionCandidate
} from './meeting/questionDetector';

import './meeting/oneQuestion.css';

import SettingsPanel from './settings/SettingsPanel';

import KnowledgeLibrary from './knowledge/KnowledgeLibrary';

import AIAssistant from './assistant/AIAssistant';

import ScriptLibrary from './scripts/ScriptLibrary';

import ScriptEditor from './scripts/ScriptEditor';

import {
  getHighlightRanges,
  highlightAtRange
} from './scripts/highlightUtils';

import './scripts/scripts.css';

const DEFAULT_SETTINGS = {
  opacity: 94,
  fontSize: 18,
  lineHeight: 1.5,
  windowWidth: 520,
  windowHeight: 155
};

const STARTER_SCRIPT = `Hello everyone. Thanks for joining me today.

I am going to walk you through the project, explain the problem we wanted to solve, and share the key decisions behind our approach.

The most important thing to remember is that the system is designed to be practical, reliable, and easy to use.`;

/* =========================================
   STORAGE HELPERS
========================================= */

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch {
    return fallback;
  }
}

function readBoolean(key, fallback = false) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === 'true';
  } catch {
    return fallback;
  }
}

function readScript() {
  try {
    return localStorage.getItem('echo-script') ?? STARTER_SCRIPT;
  } catch {
    return STARTER_SCRIPT;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Storage error (${key}):`, error);
  }
}

/* =========================================
   SETTINGS COMPONENTS
========================================= */

function RangeSetting({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange
}) {
  return (
    <label className="setting-control">
      <div className="setting-label">
        <span>{label}</span>
        <strong>{value}{suffix}</strong>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
      />
    </label>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange
}) {
  return (
    <div className="setting-toggle-row">
      <div className="setting-toggle-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </div>

      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

/* =========================================
   TOKEN-ALIGNED TEXT RENDERING
========================================= */

/*
 * Render visible words using the same token offsets returned by
 * alignmentEngine.js. This guarantees that DOM word indexes exactly
 * match the indexes used by the speech alignment engine.
 */

function buildTrackedWordNodes({
  text,
  tokens,
  dataAttribute,
  keyPrefix,
  getClassName
}) {
  const source = String(text || '');
  const words = Array.isArray(tokens) ? tokens : [];
  const nodes = [];

  let cursor = 0;

  words.forEach((token, index) => {
    const rawStart = Number(token?.start);
    const rawEnd = Number(token?.end);

    const start = Number.isFinite(rawStart)
      ? Math.max(cursor, Math.min(source.length, rawStart))
      : cursor;

    const end = Number.isFinite(rawEnd)
      ? Math.max(start, Math.min(source.length, rawEnd))
      : start;

    if (start > cursor) {
      nodes.push(source.slice(cursor, start));
    }

    const visibleText =
      source.slice(start, end) || String(token?.text || '');

    const classes = getClassName
      ? getClassName(index, token) || ''
      : '';

    nodes.push(
      <span
        key={`${keyPrefix}-word-${index}`}
        {...{ [dataAttribute]: index }}
        className={classes}
      >
        {visibleText}
      </span>
    );

    cursor = end;
  });

  if (cursor < source.length) {
    nodes.push(source.slice(cursor));
  }

  return nodes;
}

/* =========================================
   FLOATING TELEPROMPTER
========================================= */

function CompactView({
  script,
  scriptHighlights = [],
  settings,
  updateSettings,
  isActive,
  setIsActive,
  alwaysOnTop,
  toggleAlwaysOnTop,
  captureProtection,
  toggleCaptureProtection
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [speechStatus, setSpeechStatus] = useState('idle');

  const [speechError, setSpeechError] = useState('');

  const [language, setLanguage] = useState(() =>
    readStorage('echo-speech-language', 'en-IN')
  );

  // Keep the floating window in sync when language changes in dashboard Settings.

  useEffect(() => {
    const handleSpeechLanguageChange = (event) => {
      if (event.key !== 'echo-speech-language') return;

      try {
        const nextLanguage = event.newValue
          ? JSON.parse(event.newValue)
          : 'en-IN';

        if (typeof nextLanguage === 'string' && nextLanguage) {
          setLanguage(nextLanguage);
        }
      } catch {
        setLanguage('en-IN');
      }
    };

    window.addEventListener('storage', handleSpeechLanguageChange);

    return () => {
      window.removeEventListener('storage', handleSpeechLanguageChange);
    };
  }, []);

  // System-audio question capture.

  const [systemAudioSupport, setSystemAudioSupport] = useState(null);

  const [askStatus, setAskStatus] = useState('idle');

  const [askError, setAskError] = useState('');

  // Script and answer views.

  const [viewMode, setViewMode] = useState('script');

  const [detectedQuestion, setDetectedQuestion] = useState('');

  const [answerText, setAnswerText] = useState('');

  const [answerError, setAnswerError] = useState('');

  // Both script and answer have separate token lists.

  const scriptTokens = useMemo(
    () => tokenizeScript(script),
    [script]
  );

  const scriptHighlightRanges = useMemo(
    () => getHighlightRanges(script, scriptHighlights),
    [script, scriptHighlights]
  );

  const answerTokens = useMemo(
    () => tokenizeScript(answerText),
    [answerText]
  );

  const wordCount = scriptTokens.length;

  // Script alignment state.

  const [confirmedWordIndex, setConfirmedWordIndex] = useState(-1);

  const [interimWordIndex, setInterimWordIndex] = useState(null);

  // Answer alignment state.

  const [answerConfirmedWordIndex, setAnswerConfirmedWordIndex] = useState(-1);

  const [answerInterimWordIndex, setAnswerInterimWordIndex] = useState(null);

  const activeWordIndex =
    interimWordIndex ?? confirmedWordIndex;

  const activeAnswerWordIndex =
    answerInterimWordIndex ?? answerConfirmedWordIndex;

  // Providers and DOM references.

  const providerRef = useRef(null);

  const questionProviderRef = useRef(null);

  const scrollRef = useRef(null);

  const answerScrollRef = useRef(null);

  const scriptTokensRef = useRef(scriptTokens);

  const confirmedIndexRef = useRef(-1);

  const answerConfirmedIndexRef = useRef(-1);

  // Prevent duplicate final Deepgram results from advancing twice.
  const lastFinalTranscriptRef = useRef({
    script: '',
    answer: ''
  });

  const scriptScrollTopRef = useRef(0);

  const previousViewModeRef = useRef('script');

  /*
   * The microphone provider is independent of the target text.
   * It can continue running while we switch between script and answer.
   */

  const trackingTargetRef = useRef({
    mode: 'script',
    text: script,
    tokens: scriptTokens
  });

  // Was the microphone already running before answer mode began?

  const wasTrackingBeforeAnswerRef = useRef(false);

  // Question capture buffers.

  const questionPartsRef = useRef([]);

  const capturedUtterancesRef = useRef([]);

  const capturedQuestionRef = useRef('');

  const capturedConversationRef = useRef('');

  // Timers and processing locks.

  const finalizeTimerRef = useRef(null);

  const askTimeoutRef = useRef(null);

  const processingQuestionRef = useRef(false);

  const finishUtteranceRef = useRef(null);

  const scheduleFinalizeRef = useRef(null);

  scriptTokensRef.current = scriptTokens;

  /*
   * Update the active alignment target on every render.
   * Incoming Deepgram results will always use the current target.
   */

  trackingTargetRef.current = viewMode === 'answer'
    ? {
        mode: 'answer',
        text: answerText,
        tokens: answerTokens
      }
    : {
        mode: 'script',
        text: script,
        tokens: scriptTokens
      };

  const isTracking =
    isActive ||
    [
      'connecting',
      'connected',
      'listening',
      'network-backpressure',
      'speech-started',
      'utterance-end',
      'stopping'
    ].includes(speechStatus);

  const isQuestionCapturing =
    askStatus === 'connecting' ||
    askStatus === 'capturing';

  const isQuestionGenerating =
    askStatus === 'generating';

  /* =========================================
     LOAD SYSTEM-AUDIO SUPPORT
  ========================================= */

  useEffect(() => {
    let cancelled = false;

    const loadSupport = async () => {
      try {
        const support =
          await window.echoDesktop?.getMeetingAudioSupport?.();

        if (!cancelled) {
          setSystemAudioSupport(support || {
            supported: false,
            message: 'System-audio support is unavailable.'
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSystemAudioSupport({
            supported: false,
            message:
              error?.message ||
              'Could not initialise system audio.'
          });
        }
      }
    };

    loadSupport();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================
     WINDOW SETTINGS
  ========================================= */

  useEffect(() => {
    window.echoDesktop?.setWindowOpacity?.(
      settings.opacity / 100
    );
  }, [settings.opacity]);

  useEffect(() => {
    window.echoDesktop?.setCompactSettingsOpen?.(
      settingsOpen
    );
  }, [settingsOpen]);

  useEffect(() => {
    const unsubscribe =
      window.echoDesktop?.onCompactSizeChanged?.((size) => {
        if (
          !size ||
          typeof size.width !== 'number' ||
          typeof size.height !== 'number'
        ) {
          return;
        }

        updateSettings((current) => ({
          ...current,
          windowWidth: size.width,
          windowHeight: size.height
        }));
      });

    return () => unsubscribe?.();
  }, [updateSettings]);

  useEffect(() => {
    window.echoDesktop?.setAlwaysOnTop?.(alwaysOnTop);
  }, [alwaysOnTop]);

  useEffect(() => {
    saveStorage(
      'echo-speech-language',
      JSON.stringify(language)
    );
  }, [language]);

  /* =========================================
     SCRIPT POSITION RESTORATION
  ========================================= */

  useEffect(() => {
    if (viewMode !== 'script') return;

    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop =
          scriptScrollTopRef.current;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [viewMode]);

  // Auto-scroll the original script to the active word.

  useEffect(() => {
    const returningToScript =
      previousViewModeRef.current === 'answer' &&
      viewMode === 'script';

    previousViewModeRef.current = viewMode;

    if (returningToScript) return;

    if (viewMode !== 'script') return;

    if (
      activeWordIndex < 0 ||
      activeWordIndex >= scriptTokens.length
    ) {
      return;
    }

    const container = scrollRef.current;

    const word = container?.querySelector(
      `[data-word-index="${activeWordIndex}"]`
    );

    if (!container || !word) return;

    const containerRect = container.getBoundingClientRect();

    const wordRect = word.getBoundingClientRect();

    const delta =
      wordRect.top -
      containerRect.top -
      container.clientHeight * 0.43;

    if (Math.abs(delta) > 12) {
      container.scrollTop = Math.max(
        0,
        container.scrollTop + delta
      );

      scriptScrollTopRef.current = container.scrollTop;
    }
  }, [activeWordIndex, scriptTokens.length, viewMode]);

  /*
   * Answer mode has its own scroll container.
   * This scrolls the active spoken word into view.
   */

  useEffect(() => {
    if (viewMode !== 'answer') return;

    if (
      activeAnswerWordIndex < 0 ||
      activeAnswerWordIndex >= answerTokens.length
    ) {
      return;
    }

    const container = answerScrollRef.current;

    const word = container?.querySelector(
      `[data-answer-word-index="${activeAnswerWordIndex}"]`
    );

    if (!container || !word) return;

    const containerRect = container.getBoundingClientRect();

    const wordRect = word.getBoundingClientRect();

    const topPadding = 8;

    const bottomPadding = 12;

    if (wordRect.top < containerRect.top + topPadding) {
      container.scrollTop -=
        containerRect.top + topPadding - wordRect.top;
    } else if (
      wordRect.bottom > containerRect.bottom - bottomPadding
    ) {
      container.scrollTop +=
        wordRect.bottom - containerRect.bottom + bottomPadding;
    }
  }, [
    activeAnswerWordIndex,
    answerTokens.length,
    answerText,
    viewMode
  ]);

  // Reset the original-script cursor only when the script changes.
  // Switching between script and answer must preserve its position.

  useEffect(() => {
    confirmedIndexRef.current = -1;
    setConfirmedWordIndex(-1);
    setInterimWordIndex(null);
  }, [script]);

  /* =========================================
     TIMERS
  ========================================= */

  const clearQuestionTimers = () => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }

    if (askTimeoutRef.current) {
      clearTimeout(askTimeoutRef.current);
      askTimeoutRef.current = null;
    }
  };

  /* =========================================
     WINDOW RESIZING
  ========================================= */

  const resizeWindowSetting = async (key, value) => {
    const nextSettings = {
      ...settings,
      [key]: value
    };

    updateSettings((current) => ({
      ...current,
      [key]: value
    }));

    try {
      const actualSize =
        await window.echoDesktop?.setCompactSize?.({
          width: nextSettings.windowWidth,
          height: nextSettings.windowHeight
        });

      if (
        actualSize &&
        typeof actualSize.width === 'number' &&
        typeof actualSize.height === 'number'
      ) {
        updateSettings((current) => ({
          ...current,
          windowWidth: actualSize.width,
          windowHeight: actualSize.height
        }));
      }
    } catch (error) {
      console.error('Window resize failed:', error);
    }
  };

  /* =========================================
     STOP MICROPHONE TRACKING
  ========================================= */

  const stopSpeech = async () => {
    const provider = providerRef.current;

    providerRef.current = null;

    setSpeechError('');

    try {
      await provider?.stop();
    } catch (error) {
      console.error(
        'Deepgram microphone stop failed:',
        error
      );
    }

    setSpeechStatus('stopped');

    setInterimWordIndex(null);

    setAnswerInterimWordIndex(null);

    setIsActive(false);
  };

  /* =========================================
     START MICROPHONE TRACKING
  ========================================= */

  const startSpeech = async () => {
    if (providerRef.current) {
      setIsActive(true);
      return true;
    }

    setSpeechError('');

    setSpeechStatus('connecting');

    lastFinalTranscriptRef.current = {
      script: '',
      answer: ''
    };

    setInterimWordIndex(null);
    setAnswerInterimWordIndex(null);

    // At this point, target may be the original script or AI answer.

    const target = trackingTargetRef.current || {
      mode: 'script',
      text: script,
      tokens: scriptTokensRef.current
    };

    const provider = createSpeechProvider({
      language,

      keyterms: extractKeyterms(target.text),

      onStatus: ({ status }) => {
        setSpeechStatus(status || 'idle');

        if (
          status === 'disconnected' ||
          status === 'error'
        ) {
          setIsActive(false);
        }
      },

      onTranscript: (result) => {
        const currentTarget = trackingTargetRef.current;

        if (!currentTarget?.tokens?.length) return;

        const transcript = String(result?.transcript || '').trim();

        if (!transcript) {
          if (result?.isFinal) {
            if (currentTarget.mode === 'answer') {
              setAnswerInterimWordIndex(null);
            } else {
              setInterimWordIndex(null);
            }
          }
          return;
        }

        const isAnswerTarget = currentTarget.mode === 'answer';
        const mode = isAnswerTarget ? 'answer' : 'script';

        const cursorRef = isAnswerTarget
          ? answerConfirmedIndexRef
          : confirmedIndexRef;

        // Interim messages revise a live phrase. Only final messages
        // may permanently commit a new cursor position.
        if (result.isFinal) {
          const startTime = Number(result.start || 0).toFixed(3);
          const duration = Number(result.duration || 0).toFixed(3);
          const signature =
            `${startTime}:${duration}:${transcript.toLocaleLowerCase()}`;

          if (lastFinalTranscriptRef.current[mode] === signature) {
            return;
          }

          lastFinalTranscriptRef.current[mode] = signature;
        }

        const alignment = alignTranscriptToScript(
          currentTarget.tokens,
          transcript,
          cursorRef.current,
          {
            mode: result.isFinal ? 'final' : 'interim',
            allowGlobalRecovery: Boolean(result.isFinal),
            localForwardWindow: result.isFinal ? 38 : 26
          }
        );

        if (!alignment.accepted) {
          // Remove an invalid provisional position rather than leaving
          // the highlight stuck on an old, incorrect guess.
          if (isAnswerTarget) {
            setAnswerInterimWordIndex(null);
          } else {
            setInterimWordIndex(null);
          }
          return;
        }

        // The cursor must not jump backwards on a revised transcript.
        const nextIndex = Math.max(
          cursorRef.current,
          alignment.endIndex
        );

        if (isAnswerTarget) {
          if (result.isFinal) {
            answerConfirmedIndexRef.current = nextIndex;
            setAnswerConfirmedWordIndex(nextIndex);
            setAnswerInterimWordIndex(null);
          } else {
            setAnswerInterimWordIndex(nextIndex);
          }
          return;
        }

        if (result.isFinal) {
          confirmedIndexRef.current = nextIndex;
          setConfirmedWordIndex(nextIndex);
          setInterimWordIndex(null);
        } else {
          setInterimWordIndex(nextIndex);
        }
      },

      onError: (error) => {
        const message =
          error?.message || 'Speech recognition failed.';

        const failedProvider = providerRef.current;

        providerRef.current = null;

        setSpeechError(message);

        setInterimWordIndex(null);

        setAnswerInterimWordIndex(null);

        setSpeechStatus('error');

        setIsActive(false);

        failedProvider?.stop()
          .catch(() => {})
          .finally(() => setSpeechStatus('error'));
      }
    });

    providerRef.current = provider;

    try {
      const didStart = await provider.start();

      if (!didStart) return false;

      setIsActive(true);

      setSpeechStatus('listening');

      return true;
    } catch (error) {
      providerRef.current = null;

      setIsActive(false);

      setSpeechStatus('error');

      setSpeechError(
        error?.message ||
        'Could not start Deepgram speech tracking.'
      );

      return false;
    }
  };

  const toggleSpeech = () => {
    if (isTracking || providerRef.current) {
      stopSpeech();
    } else {
      startSpeech();
    }
  };

  /* =========================================
     UNIVERSAL AI ANSWER GENERATION
  ========================================= */

  const requestAIAnswer = async (
    question,
    conversation
  ) => {
    setAnswerError('');

    setAnswerText('');

    setAskStatus('generating');

    try {
      const askKnowledgeQuestion = window.echoDesktop?.askKnowledgeQuestion;

      if (typeof askKnowledgeQuestion !== 'function') {
        throw new Error(
          'Knowledge Assistant bridge is missing. Update preload.cjs and restart Echo.'
        );
      }

      // Search all indexed projects with BM25 before answer generation.

      const result = await askKnowledgeQuestion({
        question,
        projectId: null,
        conversation: conversation || '',
        answerStyle: 'natural'
      });

      if (!result?.answer) {
        throw new Error(
          'The AI provider returned an empty answer.'
        );
      }

      const newAnswer = result.answer;

      const newAnswerTokens = tokenizeScript(newAnswer);

      // Reset the answer cursor and switch the microphone target.

      answerConfirmedIndexRef.current = -1;

      lastFinalTranscriptRef.current.answer = '';

      setAnswerConfirmedWordIndex(-1);

      setAnswerInterimWordIndex(null);

      trackingTargetRef.current = {
        mode: 'answer',
        text: newAnswer,
        tokens: newAnswerTokens
      };

      setAnswerText(newAnswer);

      setAskStatus('done');

      /*
       * The question and answer share one scroll container.
       * Scroll just below the question row once the answer renders.
       * The question can still be reached by scrolling upward.
       */

      requestAnimationFrame(() => {
        const container = answerScrollRef.current;

        const questionRow = container?.querySelector(
          '.answer-question-row'
        );

        if (container && questionRow) {
          container.scrollTop = questionRow.offsetHeight + 8;
        }
      });

      /*
       * Automatically start microphone tracking after generation.
       * If it was already tracking the script, reuse the same stream.
       */

      if (providerRef.current) {
        setIsActive(true);
        setSpeechStatus('listening');
      } else {
        await startSpeech();
      }
    } catch (error) {
      setAnswerError(
        error?.message || 'Could not generate an answer.'
      );

      setAskStatus('error');
    } finally {
      processingQuestionRef.current = false;
    }
  };

  /* =========================================
     GENERATE ANSWER FROM DETECTED QUESTION
  ========================================= */

  const generateAnswerFromQuestion = async (question) => {
    if (processingQuestionRef.current) return;

    processingQuestionRef.current = true;

    clearQuestionTimers();

    // Save the exact original script scroll position.

    if (viewMode === 'script') {
      scriptScrollTopRef.current =
        scrollRef.current?.scrollTop ??
        scriptScrollTopRef.current;
    }

    const conversation = capturedUtterancesRef.current
      .slice(-6)
      .join('\n');

    // Remember whether script tracking existed before answer mode.

    wasTrackingBeforeAnswerRef.current = Boolean(
      providerRef.current && isActive
    );

    capturedQuestionRef.current = question;

    capturedConversationRef.current = conversation;

    setDetectedQuestion(question);

    setAnswerText('');

    setAnswerError('');

    setViewMode('answer');

    setAskStatus('generating');

    // Stop system-audio question capture.
    // Microphone capture is independent and can continue.

    const provider = questionProviderRef.current;

    questionProviderRef.current = null;

    try {
      await provider?.stop();
    } catch (error) {
      console.error(
        'Question capture cleanup:',
        error
      );
    }

    await requestAIAnswer(
      question,
      conversation
    );
  };

  /* =========================================
     UPDATE EDITED QUESTION
  ========================================= */

  const updateAnswerForQuestion = async () => {
    const question = detectedQuestion.trim();

    if (!question) {
      setAnswerError('Enter a question first.');
      return;
    }

    if (processingQuestionRef.current) return;

    processingQuestionRef.current = true;

    capturedQuestionRef.current = question;

    await requestAIAnswer(
      question,
      capturedConversationRef.current
    );
  };

  const retryAnswer = async () => {
    await updateAnswerForQuestion();
  };

  /* =========================================
     QUESTION UTTERANCE PROCESSING
  ========================================= */

  const finalizeCurrentUtterance = async () => {
    if (processingQuestionRef.current) return;

    const transcript = questionPartsRef.current
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    questionPartsRef.current = [];

    if (!transcript) return;

    capturedUtterancesRef.current.push(transcript);

    if (capturedUtterancesRef.current.length > 8) {
      capturedUtterancesRef.current.shift();
    }

    const question = extractQuestionCandidate(transcript);

    if (!question) {
      setAskStatus('capturing');
      return;
    }

    await generateAnswerFromQuestion(question);
  };

  finishUtteranceRef.current = finalizeCurrentUtterance;

  scheduleFinalizeRef.current = () => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
    }

    finalizeTimerRef.current = setTimeout(() => {
      finalizeTimerRef.current = null;
      finishUtteranceRef.current?.();
    }, 350);
  };

  /* =========================================
     QUESTION CAPTURE ERRORS
  ========================================= */

  const failQuestionCapture = async (error) => {
    if (processingQuestionRef.current) return;

    clearQuestionTimers();

    const provider = questionProviderRef.current;

    questionProviderRef.current = null;

    try {
      await provider?.stop();
    } catch {
      // Ignore cleanup errors.
    }

    setAskStatus('error');

    setAskError(
      error?.message || 'Question capture failed.'
    );
  };

  /* =========================================
     START ONE-QUESTION CAPTURE
  ========================================= */

  const startQuestionCapture = async () => {
    if (
      askStatus === 'connecting' ||
      askStatus === 'capturing' ||
      askStatus === 'generating'
    ) {
      return;
    }

    if (!systemAudioSupport?.supported) {
      setAskError(
        systemAudioSupport?.message ||
        'System-audio capture is unavailable.'
      );

      setAskStatus('error');

      return;
    }

    clearQuestionTimers();

    questionPartsRef.current = [];

    capturedUtterancesRef.current = [];

    capturedQuestionRef.current = '';

    capturedConversationRef.current = '';

    processingQuestionRef.current = false;

    setAskError('');

    setAnswerError('');

    if (viewMode === 'answer') {
      // Switch the target back to the script while capturing another question.

      trackingTargetRef.current = {
        mode: 'script',
        text: script,
        tokens: scriptTokensRef.current
      };

      setViewMode('script');

      // Stop the microphone if it was started only for answer tracking.

      if (
        !wasTrackingBeforeAnswerRef.current &&
        providerRef.current
      ) {
        await stopSpeech();
      }
    }

    setAskStatus('connecting');

    const provider = new QuestionCaptureProvider({
      language,

      onStatus: ({ status }) => {
        if (status === 'listening') {
          setAskStatus('capturing');
        }
      },

      onTranscript: (result) => {
        if (!result || !result.isFinal) return;

        const text = String(
          result.transcript || ''
        ).trim();

        if (!text) return;

        questionPartsRef.current.push(text);

        if (result.speechFinal) {
          scheduleFinalizeRef.current?.();
        }
      },

      onUtteranceEnd: () => {
        scheduleFinalizeRef.current?.();
      },

      onError: (error) => {
        failQuestionCapture(error);
      }
    });

    questionProviderRef.current = provider;

    // Stop if no clear question is detected within 25 seconds.

    askTimeoutRef.current = setTimeout(async () => {
      if (processingQuestionRef.current) return;

      const currentProvider = questionProviderRef.current;

      questionProviderRef.current = null;

      try {
        await currentProvider?.stop();
      } catch {
        // Ignore cleanup errors.
      }

      setAskStatus('error');

      setAskError(
        'No clear question was detected. Click Ask and try again.'
      );
    }, 25000);

    try {
      // The first asynchronous action calls getDisplayMedia().

      const started = await provider.start();

      if (
        questionProviderRef.current !== provider ||
        processingQuestionRef.current
      ) {
        return;
      }

      if (started) {
        setAskStatus('capturing');
      } else {
        clearQuestionTimers();

        questionProviderRef.current = null;

        setAskStatus('idle');
      }
    } catch (error) {
      if (questionProviderRef.current === provider) {
        questionProviderRef.current = null;

        clearQuestionTimers();

        setAskStatus('error');

        setAskError(
          error?.message ||
          'Could not start system-audio capture.'
        );
      }
    }
  };

  /* =========================================
     CANCEL QUESTION CAPTURE
  ========================================= */

  const cancelQuestionCapture = async () => {
    clearQuestionTimers();

    const provider = questionProviderRef.current;

    questionProviderRef.current = null;

    questionPartsRef.current = [];

    try {
      await provider?.stop();
    } catch (error) {
      console.error(
        'Question capture cancellation:',
        error
      );
    }

    setAskStatus('idle');

    setAskError('');
  };

  const handleAskClick = () => {
    if (askStatus === 'capturing') {
      cancelQuestionCapture();
      return;
    }

    if (
      askStatus === 'connecting' ||
      askStatus === 'generating'
    ) {
      return;
    }

    startQuestionCapture();
  };

  /* =========================================
     BACK TO SCRIPT
  ========================================= */

  const backToScript = async () => {
    trackingTargetRef.current = {
      mode: 'script',
      text: script,
      tokens: scriptTokensRef.current
    };

    answerConfirmedIndexRef.current = -1;

    setAnswerConfirmedWordIndex(-1);

    setAnswerInterimWordIndex(null);

    setViewMode('script');

    setAskStatus('idle');

    setAskError('');

    setAnswerError('');

    // Stop microphone if it was started only for answer tracking.
    // If it was already active for the script, keep the stream running.

    if (
      !wasTrackingBeforeAnswerRef.current &&
      providerRef.current
    ) {
      await stopSpeech();
    }

    wasTrackingBeforeAnswerRef.current = false;
  };

  /* =========================================
     CLOSE WINDOW
  ========================================= */

  const closeWindow = async () => {
    clearQuestionTimers();

    if (providerRef.current) {
      await stopSpeech();
    }

    if (questionProviderRef.current) {
      await cancelQuestionCapture();
    }

    await window.echoDesktop?.closeCompact?.();
  };

  /* =========================================
     CLEANUP
  ========================================= */

  useEffect(() => {
    return () => {
      clearQuestionTimers();

      const speechProvider = providerRef.current;

      providerRef.current = null;

      const questionProvider = questionProviderRef.current;

      questionProviderRef.current = null;

      speechProvider?.stop().catch(() => {});

      questionProvider?.stop().catch(() => {});
    };
  }, []);

  /* =========================================
     STATUS LABELS
  ========================================= */

  const micStatusLabel = {
    idle: 'Mic paused',
    connecting: 'Connecting…',
    connected: 'Connected',
    listening: 'Listening · Deepgram',
    stopping: 'Stopping…',
    stopped: 'Mic paused',
    disconnected: 'Disconnected',
    error: 'Mic issue',
    'network-backpressure': 'Network slow',
    'speech-started': 'Speaking…',
    'utterance-end': 'Pause detected'
  }[speechStatus] || 'Mic paused';

  const askButtonLabel = {
    idle: viewMode === 'answer' ? 'Ask again' : 'Ask',
    connecting: 'Starting…',
    capturing: 'Cancel',
    generating: 'Thinking…',
    done: 'Ask again',
    error: 'Ask again'
  }[askStatus] || 'Ask';

  const footerStatus =
    askStatus === 'connecting'
      ? 'Starting capture…'
      : askStatus === 'capturing'
        ? 'Listening for question…'
        : askStatus === 'generating'
          ? 'Generating answer…'
          : micStatusLabel;

  const askDisabled =
    askStatus === 'connecting' ||
    askStatus === 'generating' ||
    systemAudioSupport === null ||
    systemAudioSupport?.supported === false;

  /* =========================================
     SCRIPT / ANSWER WORD RENDERING
  ========================================= */

  const scriptRenderNodes = buildTrackedWordNodes({
    text: script,
    tokens: scriptTokens,
    dataAttribute: 'data-word-index',
    keyPrefix: 'script',
    getClassName: (wordIndex, token) => {
      const classes = [];

      const highlight = highlightAtRange(
        scriptHighlightRanges,
        token.start,
        token.end
      );

      if (highlight) {
        classes.push(`script-highlight-${highlight.color}`);
      }

      if (wordIndex < confirmedWordIndex) {
        classes.push('spoken-word');
      }

      if (
        wordIndex === activeWordIndex &&
        activeWordIndex >= 0
      ) {
        classes.push(
          interimWordIndex !== null
            ? 'interim-word'
            : 'current-word'
        );
      } else if (
        interimWordIndex !== null &&
        wordIndex >= confirmedWordIndex &&
        wordIndex < interimWordIndex
      ) {
        classes.push('tentative-spoken-word');
      }

      return classes.join(' ');
    }
  });

  const answerRenderNodes = buildTrackedWordNodes({
    text: answerText,
    tokens: answerTokens,
    dataAttribute: 'data-answer-word-index',
    keyPrefix: 'answer',
    getClassName: (wordIndex) => {
      const classes = [];

      if (wordIndex < answerConfirmedWordIndex) {
        classes.push('spoken-word');
      }

      if (
        wordIndex === activeAnswerWordIndex &&
        activeAnswerWordIndex >= 0
      ) {
        classes.push(
          answerInterimWordIndex !== null
            ? 'interim-word'
            : 'current-word'
        );
      } else if (
        answerInterimWordIndex !== null &&
        wordIndex >= answerConfirmedWordIndex &&
        wordIndex < answerInterimWordIndex
      ) {
        classes.push('tentative-spoken-word');
      }

      return classes.join(' ');
    }
  });

  const displayedWordCount =
    viewMode === 'answer' ? answerTokens.length : wordCount;

  const displayedWordIndex =
    viewMode === 'answer'
      ? answerConfirmedWordIndex
      : confirmedWordIndex;

  /* =========================================
     FLOATING WINDOW UI
  ========================================= */

  return (
    <main className="compact-shell">

      {/* HEADER */}

      <header className="compact-header drag-region">
        <span className="compact-title">
          Teleprompter
        </span>

        <div className="compact-actions no-drag">
          {viewMode === 'answer' && (
            <button
              type="button"
              className="compact-back-button"
              onClick={backToScript}
              title="Return to your script"
            >
              <RotateCcw size={11} />
              Back to Script
            </button>
          )}

          <button
            type="button"
            className={`compact-icon-button ${
              settingsOpen ? 'selected' : ''
            }`}
            title="Settings"
            aria-label="Settings"
            onClick={() =>
              setSettingsOpen((current) => !current)
            }
          >
            <Settings size={15} />
          </button>

          <button
            type="button"
            className="compact-icon-button"
            title="Close"
            aria-label="Close"
            onClick={closeWindow}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* CONTENT AREA */}

      <section
        className={`compact-content ${
          viewMode === 'answer' ? 'answer-mode' : ''
        }`}
      >
        {viewMode === 'script' ? (
          /* SCRIPT MODE */

          <div
            ref={scrollRef}
            className="compact-script no-drag"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight
            }}
            aria-label="Live teleprompter script"
            onScroll={(event) => {
              scriptScrollTopRef.current =
                event.currentTarget.scrollTop;
            }}
          >
            {script.trim()
              ? scriptRenderNodes
              : 'Your script will appear here. Add your script in the main window.'}
          </div>
        ) : (
          /* ANSWER MODE
             Question and answer share one scroll container.
          */

          <div
            ref={answerScrollRef}
            className="compact-script compact-answer-view no-drag"
            aria-label="Edit question and read generated answer"
          >
            <div className="answer-question-row">
              <input
                type="text"
                className="answer-question-input"
                value={detectedQuestion}
                onChange={(event) =>
                  setDetectedQuestion(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !isQuestionGenerating
                  ) {
                    event.preventDefault();
                    updateAnswerForQuestion();
                  }
                }}
                placeholder="Edit the detected question…"
                aria-label="Detected question"
                spellCheck="true"
              />

              <button
                type="button"
                className="answer-update-button"
                onClick={() => {
                  if (answerScrollRef.current) {
                    answerScrollRef.current.scrollTop = 0;
                  }

                  updateAnswerForQuestion();
                }}
                disabled={
                  !detectedQuestion.trim() ||
                  isQuestionGenerating
                }
                title="Generate a new answer from the edited question"
              >
                {isQuestionGenerating ? (
                  <Loader2
                    size={12}
                    className="answer-spinner"
                  />
                ) : (
                  'Update'
                )}
              </button>
            </div>

            <div
              className="answer-text"
              role="region"
              aria-label="Generated answer"
              aria-live="polite"
              style={{
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight
              }}
            >
              {isQuestionGenerating ? (
                <div className="answer-loading">
                  <Loader2
                    size={14}
                    className="answer-spinner"
                  />
                  Generating answer…
                </div>
              ) : answerError ? (
                <div className="answer-error">
                  <span>{answerError}</span>

                  <button
                    type="button"
                    className="answer-retry-button"
                    onClick={retryAnswer}
                  >
                    Try again
                  </button>
                </div>
              ) : answerText ? (
                answerRenderNodes
              ) : (
                'Your answer will appear here.'
              )}
            </div>
          </div>
        )}

        {/* FOOTER */}

        <footer className="compact-footer no-drag">
          <button
            type="button"
            className={`start-button ${
              isTracking ? 'is-active' : ''
            }`}
            onClick={toggleSpeech}
            disabled={
              speechStatus === 'stopping' ||
              speechStatus === 'connecting'
            }
          >
            {isTracking
              ? <Pause size={12} />
              : <Play size={12} />}

            {isTracking ? 'Pause' : 'Start'}
          </button>

          <button
            type="button"
            className={`ask-button ${
              isQuestionCapturing ? 'is-active' : ''
            }`}
            onClick={handleAskClick}
            disabled={askDisabled}
            title={
              systemAudioSupport?.message ||
              'Capture one meeting question and generate an answer'
            }
          >
            {isQuestionCapturing ? (
              <X size={12} />
            ) : isQuestionGenerating ? (
              <Loader2
                size={12}
                className="answer-spinner"
              />
            ) : (
              <CircleHelp size={12} />
            )}

            {askButtonLabel}
          </button>

          <span
            className={`compact-state ${
              isQuestionCapturing
                ? 'ask-state-listening'
                : isQuestionGenerating
                  ? 'ask-state-generating'
                  : `speech-state-${speechStatus}`
            }`}
            title={
              speechError ||
              askError ||
              footerStatus
            }
          >
            {footerStatus}
          </span>

          <span className="compact-meta">
            {settings.fontSize}px
            <span className="meta-separator">·</span>
            {Math.max(0, displayedWordIndex)} / {displayedWordCount}
          </span>
        </footer>

        {(speechError || askError) && (
          <div
            className="speech-feedback"
            role="status"
          >
            {askError || speechError}
          </div>
        )}
      </section>

      {/* SETTINGS */}

      {settingsOpen && (
        <section className="floating-settings no-drag">
          <div className="floating-settings-heading">
            <strong>Teleprompter settings</strong>

            <button
              type="button"
              className="plain-icon-button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              <X size={14} />
            </button>
          </div>

          <div className="settings-group-title">
            SPEECH TRACKING
          </div>

          <label className="language-setting">
            <span>Recognition language</span>

            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value)
              }
              disabled={isTracking || isQuestionCapturing}
            >
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="hi">Hindi</option>
            </select>
          </label>

          <div className="settings-footnote">
            Nova-3 streaming. Ask listens to system audio
            for one complete question.
          </div>

          <div className="settings-group-title">
            WINDOW SIZE
          </div>

          <RangeSetting
            label="Width"
            value={settings.windowWidth}
            min={420}
            max={1000}
            step={10}
            suffix=" px"
            onChange={(value) =>
              resizeWindowSetting('windowWidth', value)
            }
          />

          <RangeSetting
            label="Height"
            value={settings.windowHeight}
            min={150}
            max={500}
            step={5}
            suffix=" px"
            onChange={(value) =>
              resizeWindowSetting('windowHeight', value)
            }
          />

          <div className="settings-group-title">
            TEXT & APPEARANCE
          </div>

          <RangeSetting
            label="Opacity"
            value={settings.opacity}
            min={45}
            max={100}
            suffix="%"
            onChange={(value) =>
              updateSettings((current) => ({
                ...current,
                opacity: value
              }))
            }
          />

          <RangeSetting
            label="Font size"
            value={settings.fontSize}
            min={14}
            max={32}
            suffix=" px"
            onChange={(value) =>
              updateSettings((current) => ({
                ...current,
                fontSize: value
              }))
            }
          />

          <RangeSetting
            label="Line spacing"
            value={settings.lineHeight}
            min={1.2}
            max={2.2}
            step={0.1}
            suffix="×"
            onChange={(value) =>
              updateSettings((current) => ({
                ...current,
                lineHeight: value
              }))
            }
          />

          <div className="settings-group-title">
            WINDOW BEHAVIOUR
          </div>

          <ToggleSetting
            label="Always on top"
            checked={alwaysOnTop}
            onChange={toggleAlwaysOnTop}
          />

          <ToggleSetting
            label="Hide from screen capture"
            description="Supported capture methods only"
            checked={captureProtection}
            onChange={toggleCaptureProtection}
          />

          <div className="settings-footnote">
            Minimum size: 420 × 150 px. Use the width and
            height sliders to resize.
          </div>
        </section>
      )}
    </main>
  );
}

/* =========================================
   MAIN APPLICATION
========================================= */

export default function App() {
  const isCompact =
    new URLSearchParams(window.location.search)
      .get('view') === 'compact';

  const [script, setScript] = useState(readScript);

  const [scriptTitle, setScriptTitle] = useState(() =>
    readStorage('echo-script-title', 'Presentation script')
  );

  const [scriptHighlights, setScriptHighlights] = useState(() =>
    readStorage('echo-script-highlights', [])
  );

  const [activeScriptId, setActiveScriptId] = useState(() =>
    readStorage('echo-active-script-id', '')
  );

  const [savedScripts, setSavedScripts] = useState([]);

  const scriptsLoadedRef = useRef(false);

  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...readStorage('echo-settings', {})
  }));

  const [isActive, setIsActive] = useState(false);

  const [alwaysOnTop, setAlwaysOnTop] = useState(
    () => readBoolean('echo-always-on-top', true)
  );

  const [captureProtection, setCaptureProtection] =
    useState(() => readBoolean('echo-capture-protection'));

  const [activeTab, setActiveTab] =
    useState('teleprompter');

  const wordCount = useMemo(() => {
    return script.trim()
      ? script.trim().split(/\s+/).length
      : 0;
  }, [script]);

  /* =========================================
     STABLE SETTINGS UPDATER
  ========================================= */

  const updateSettings = useCallback((updater) => {
    setSettings((current) => {
      if (typeof updater === 'function') {
        return updater(current);
      }

      return {
        ...current,
        ...updater
      };
    });
  }, []);

  /* =========================================
     COMPACT DOCUMENT STYLING
  ========================================= */

  useEffect(() => {
    if (isCompact) {
      document.documentElement.classList.add(
        'compact-document'
      );

      document.body.classList.add(
        'compact-document'
      );
    }

    return () => {
      document.documentElement.classList.remove(
        'compact-document'
      );

      document.body.classList.remove(
        'compact-document'
      );
    };
  }, [isCompact]);

  /* =========================================
     PERSISTENCE
  ========================================= */

  useEffect(() => {
    saveStorage('echo-script', script);
  }, [script]);

  useEffect(() => {
    saveStorage('echo-script-title', JSON.stringify(scriptTitle));
  }, [scriptTitle]);

  useEffect(() => {
    saveStorage('echo-script-highlights', JSON.stringify(scriptHighlights));
  }, [scriptHighlights]);

  useEffect(() => {
    saveStorage('echo-active-script-id', JSON.stringify(activeScriptId));
  }, [activeScriptId]);

  useEffect(() => {
    saveStorage(
      'echo-settings',
      JSON.stringify(settings)
    );
  }, [settings]);

  useEffect(() => {
    saveStorage(
      'echo-preview-active',
      String(isActive)
    );
  }, [isActive]);

  useEffect(() => {
    saveStorage(
      'echo-always-on-top',
      String(alwaysOnTop)
    );
  }, [alwaysOnTop]);

  useEffect(() => {
    saveStorage(
      'echo-capture-protection',
      String(captureProtection)
    );
  }, [captureProtection]);

  /* =========================================
     SCRIPT LIBRARY INITIALISATION
  ========================================= */

  useEffect(() => {
    if (isCompact) return;

    let cancelled = false;

    const loadScripts = async () => {
      const desktop = window.echoDesktop;

      if (!desktop?.listScripts || !desktop?.importLegacyScript) {
        throw new Error(
          'Script Library bridge is missing. Update preload.cjs and restart Echo.'
        );
      }

      let library = await desktop.listScripts();

      if (!Array.isArray(library?.scripts)) {
        throw new Error('The script library returned an invalid response.');
      }

      if (library.scripts.length === 0) {
        library = await desktop.importLegacyScript({
          title: readStorage('echo-script-title', 'Presentation script'),
          content: readScript(),
          highlights: readStorage('echo-script-highlights', [])
        });
      }

      if (cancelled) return;

      const records = Array.isArray(library.scripts) ? library.scripts : [];

      setSavedScripts(records);

      const active =
        records.find((item) => item.id === library.activeScriptId) ||
        records[0] ||
        null;

      if (active) {
        setActiveScriptId(active.id);
        setScript(active.content || '');
        setScriptTitle(active.title || 'Untitled script');
        setScriptHighlights(active.highlights || []);
      } else {
        setActiveScriptId('');
        setScript('');
        setScriptTitle('Untitled script');
        setScriptHighlights([]);
      }

      scriptsLoadedRef.current = true;
    };

    loadScripts().catch((error) => {
      console.error('[Echo] Script Library initialisation failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [isCompact]);

  /* =========================================
     DEBOUNCED SCRIPT SAVING
  ========================================= */

  useEffect(() => {
    if (
      isCompact ||
      !scriptsLoadedRef.current ||
      !activeScriptId ||
      !window.echoDesktop?.updateScript
    ) {
      return undefined;
    }

    const timeout = setTimeout(async () => {
      try {
        const library = await window.echoDesktop.updateScript(
          activeScriptId,
          {
            title: scriptTitle,
            content: script,
            highlights: scriptHighlights
          }
        );

        setSavedScripts(library.scripts || []);
      } catch (error) {
        console.error('[Echo] Automatic script save failed:', error);
      }
    }, 550);

    return () => clearTimeout(timeout);
  }, [
    isCompact,
    activeScriptId,
    scriptTitle,
    script,
    scriptHighlights
  ]);

  /* =========================================
     MULTI-WINDOW STORAGE SYNC
  ========================================= */

  useEffect(() => {
    const handleStorage = (event) => {
      if (
        event.key === 'echo-script' &&
        event.newValue !== null
      ) {
        setScript(event.newValue);
      }

      if (event.key === 'echo-script-title' && event.newValue !== null) {
        try {
          setScriptTitle(JSON.parse(event.newValue));
        } catch {
          setScriptTitle(event.newValue);
        }
      }

      if (event.key === 'echo-script-highlights' && event.newValue !== null) {
        try {
          setScriptHighlights(JSON.parse(event.newValue));
        } catch {
          setScriptHighlights([]);
        }
      }

      if (event.key === 'echo-active-script-id' && event.newValue !== null) {
        try {
          setActiveScriptId(JSON.parse(event.newValue));
        } catch {
          setActiveScriptId('');
        }
      }

      if (
        event.key === 'echo-settings' &&
        event.newValue
      ) {
        try {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...JSON.parse(event.newValue)
          });
        } catch {
          // Ignore invalid settings.
        }
      }

      if (event.key === 'echo-preview-active') {
        setIsActive(event.newValue === 'true');
      }

      if (event.key === 'echo-always-on-top') {
        setAlwaysOnTop(event.newValue === 'true');
      }

      if (event.key === 'echo-capture-protection') {
        setCaptureProtection(event.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  /* =========================================
     RESTORE CAPTURE PROTECTION
  ========================================= */

  useEffect(() => {
    window.echoDesktop?.setCaptureProtection?.(
      captureProtection
    ).then((result) => {
      if (typeof result?.enabled === 'boolean') {
        setCaptureProtection(result.enabled);
      }
    }).catch((error) => {
      console.error(
        'Capture protection restore:',
        error
      );
    });

    // Initial synchronization only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================
     OPEN FLOATING WINDOW
  ========================================= */

  const openCompact = () => {
    window.echoDesktop?.openCompact?.({
      width: settings.windowWidth,
      height: settings.windowHeight
    });
  };

  /* =========================================
     ALWAYS ON TOP
  ========================================= */

  const toggleAlwaysOnTop = async (enabled) => {
    const next = Boolean(enabled);

    setAlwaysOnTop(next);

    try {
      await window.echoDesktop?.setAlwaysOnTop?.(next);
    } catch (error) {
      console.error('Always-on-top error:', error);
    }
  };

  /* =========================================
     CAPTURE PROTECTION
  ========================================= */

  const toggleCaptureProtection = async (enabled) => {
    try {
      const result =
        await window.echoDesktop?.setCaptureProtection?.(
          Boolean(enabled)
        );

      setCaptureProtection(
        Boolean(result?.enabled)
      );
    } catch (error) {
      console.error(
        'Capture protection error:',
        error
      );
    }
  };

  /* =========================================
     SCRIPT LIBRARY ACTIONS
  ========================================= */

  const activateScript = (record) => {
    if (!record) return;

    setActiveScriptId(record.id);
    setScript(record.content || '');
    setScriptTitle(record.title || 'Untitled script');
    setScriptHighlights(record.highlights || []);

    saveStorage('echo-active-script-id', JSON.stringify(record.id));
    saveStorage('echo-script', record.content || '');
    saveStorage('echo-script-title', JSON.stringify(record.title || 'Untitled script'));
    saveStorage('echo-script-highlights', JSON.stringify(record.highlights || []));
  };

  const handleSelectScript = async (record) => {
    if (!record) return;

    try {
      const library = await window.echoDesktop.setActiveScript(record.id);

      setSavedScripts(library.scripts || []);

      const selected = (library.scripts || []).find(
        (item) => item.id === record.id
      );

      activateScript(selected || record);

      setActiveTab('teleprompter');
    } catch (error) {
      console.error('[Echo] Could not select script:', error);
      throw error;
    }
  };

  const handleCreateScript = async (title) => {
    const library = await window.echoDesktop.createScript({
      title,
      content: ''
    });

    setSavedScripts(library.scripts || []);

    const active = (library.scripts || []).find(
      (item) => item.id === library.activeScriptId
    );

    activateScript(active);

    setActiveTab('teleprompter');

    return active;
  };

  const handleRenameScript = async (scriptId, title) => {
    const library = await window.echoDesktop.updateScript(
      scriptId,
      { title }
    );

    setSavedScripts(library.scripts || []);

    const updated = (library.scripts || []).find(
      (item) => item.id === scriptId
    );

    if (updated && scriptId === activeScriptId) {
      setScriptTitle(updated.title);
    }

    return updated;
  };

  const handleDuplicateScript = async (scriptId) => {
    const library = await window.echoDesktop.duplicateScript(scriptId);

    setSavedScripts(library.scripts || []);

    const active = (library.scripts || []).find(
      (item) => item.id === library.activeScriptId
    );

    activateScript(active);

    setActiveTab('teleprompter');

    return active;
  };

  const handleDeleteScript = async (scriptId) => {
    const library = await window.echoDesktop.deleteScript(scriptId);

    setSavedScripts(library.scripts || []);

    if (scriptId === activeScriptId) {
      const nextActive = (library.scripts || []).find(
        (item) => item.id === library.activeScriptId
      );

      if (nextActive) {
        activateScript(nextActive);
      } else {
        setActiveScriptId('');
        setScript('');
        setScriptTitle('Untitled script');
        setScriptHighlights([]);

        saveStorage('echo-script', '');
        saveStorage('echo-script-title', JSON.stringify('Untitled script'));
        saveStorage('echo-script-highlights', JSON.stringify([]));
        saveStorage('echo-active-script-id', JSON.stringify(''));
      }
    }

    return library;
  };

  /* =========================================
     COMPACT WINDOW ROUTE
  ========================================= */

  if (isCompact) {
    return (
      <CompactView
        script={script}
        scriptHighlights={scriptHighlights}
        settings={settings}
        updateSettings={updateSettings}
        isActive={isActive}
        setIsActive={setIsActive}
        alwaysOnTop={alwaysOnTop}
        toggleAlwaysOnTop={toggleAlwaysOnTop}
        captureProtection={captureProtection}
        toggleCaptureProtection={toggleCaptureProtection}
      />
    );
  }

  const pageTitle = {
    teleprompter: 'Teleprompter',
    scripts: 'Scripts',
    assistant: 'AI assistant',
    library: 'Knowledge library',
    settings: 'Settings'
  }[activeTab];

  /* =========================================
     DASHBOARD
  ========================================= */

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-heading">
          Workspace
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${
              activeTab === 'teleprompter' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('teleprompter')}
          >
            <BookOpen size={17} />
            <span>Teleprompter</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === 'scripts' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('scripts')}
          >
            <FileText size={17} />
            <span>Scripts</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === 'assistant' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('assistant')}
          >
            <Sparkles size={17} />
            <span>AI assistant</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === 'library' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('library')}
          >
            <FileText size={17} />
            <span>Knowledge library</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`nav-item ${
              activeTab === 'settings' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={17} />
            <span>Settings</span>
          </button>

          <div className="sidebar-caption">
            Saved on this device
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace

            <ChevronRight size={13} />

            <strong>{pageTitle}</strong>
          </div>

          <button
            className="top-privacy-button"
            onClick={() =>
              toggleCaptureProtection(!captureProtection)
            }
          >
            <ShieldCheck size={15} />

            {captureProtection
              ? 'Capture protection on'
              : 'Capture protection off'}
          </button>
        </header>

        {/* TELEPROMPTER PAGE */}

        {activeTab === 'teleprompter' && (
          <>
            <section className="page-intro">
              <div>
                <div className="eyebrow">
                  YOUR SCRIPT
                </div>

                <h1>Speak at your own pace.</h1>

                <p>
                  Keep your notes close and your delivery natural.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={openCompact}
              >
                <Maximize2 size={16} />
                Open floating window
              </button>
            </section>

            <section className="workspace-grid">
              <div className="card script-card">
                <div className="card-heading">
                  <div>
                    <span className="section-label">
                      SCRIPT EDITOR
                    </span>

                    <h2>{scriptTitle}</h2>
                  </div>

                  <span className="saved-label">
                    <Check size={14} />
                    Saved automatically
                  </span>
                </div>

                <ScriptEditor
                  value={script}
                  onChange={setScript}
                  highlights={scriptHighlights}
                  onHighlightsChange={setScriptHighlights}
                  placeholder="Paste or write your script here..."
                />

                <div className="editor-footer">
                  <span>
                    {wordCount} words · approximately{' '}
                    {Math.max(1, Math.ceil(wordCount / 130))}
                    {' '}min read
                  </span>

                  <div className="script-editor-actions">
                    <button
                      type="button"
                      onClick={() => setActiveTab('scripts')}
                    >
                      Manage scripts
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Clear the contents of this script?')) {
                          setScript('');
                        }
                      }}
                    >
                      Clear script
                    </button>
                  </div>
                </div>
              </div>

              <aside className="right-column">
                <div className="card preview-card">
                  <div className="card-heading">
                    <div>
                      <span className="section-label">
                        ON-SCREEN PREVIEW
                      </span>

                      <h2>Floating window</h2>
                    </div>

                    <button
                      className="small-icon-button"
                      onClick={openCompact}
                      aria-label="Open floating window"
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>

                  <div className="preview-stage">
                    <div
                      className="mini-window"
                      style={{
                        fontSize: `${settings.fontSize}px`
                      }}
                    >
                      {script.slice(0, 210)}
                      {script.length > 210 ? '…' : ''}
                    </div>
                  </div>

                  <button
                    className="secondary-button full-width"
                    onClick={openCompact}
                  >
                    Open teleprompter
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="card controls-card">
                  <div className="card-heading">
                    <div>
                      <span className="section-label">
                        SESSION
                      </span>

                      <h2>Quick controls</h2>
                    </div>
                  </div>

                  <div className="control-row">
                    <div className="control-icon">
                      <Mic size={17} />
                    </div>

                    <div className="control-copy">
                      <strong>Voice tracking</strong>

                      <small>
                        Live Nova-3 streaming via your microphone.
                      </small>
                    </div>

                    <span className="plain-status">
                      {isActive ? 'Tracking' : 'Ready'}
                    </span>
                  </div>

                  <div className="control-row">
                    <div className="control-icon">
                      <ShieldCheck size={17} />
                    </div>

                    <div className="control-copy">
                      <strong>Capture privacy</strong>

                      <small>
                        Supported capture methods only.
                      </small>
                    </div>

                    <button
                      className={`switch ${
                        captureProtection ? 'is-on' : ''
                      }`}
                      role="switch"
                      aria-checked={captureProtection}
                      onClick={() =>
                        toggleCaptureProtection(!captureProtection)
                      }
                    >
                      <span />
                    </button>
                  </div>

                  <div className="control-row">
                    <div className="control-icon">
                      <Headphones size={17} />
                    </div>

                    <div className="control-copy">
                      <strong>One-question mode</strong>

                      <small>
                        Capture a meeting question and generate an answer.
                      </small>
                    </div>

                    <span className="plain-status">
                      Available
                    </span>
                  </div>
                </div>
              </aside>
            </section>
          </>
        )}

        {/* SAVED SCRIPT LIBRARY */}

        {activeTab === 'scripts' && (
          <ScriptLibrary
            scripts={savedScripts}
            activeScriptId={activeScriptId}
            onSelectScript={handleSelectScript}
            onCreateScript={handleCreateScript}
            onRenameScript={handleRenameScript}
            onDuplicateScript={handleDuplicateScript}
            onDeleteScript={handleDeleteScript}
            onBackToEditor={() => setActiveTab('teleprompter')}
          />
        )}

        {/* SETTINGS CENTRE */}

        {activeTab === 'settings' && (
          <SettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            captureProtection={captureProtection}
            toggleCaptureProtection={toggleCaptureProtection}
            alwaysOnTop={alwaysOnTop}
            toggleAlwaysOnTop={toggleAlwaysOnTop}
          />
        )}

        {/* PROJECT KNOWLEDGE LIBRARY */}

        {activeTab === 'library' && <KnowledgeLibrary />}

        {/* PROJECT-AWARE AI ASSISTANT */}

        {activeTab === 'assistant' && <AIAssistant />}
      </main>
    </div>
  );
}
