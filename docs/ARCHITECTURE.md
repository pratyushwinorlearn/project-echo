# Architecture Overview

Project Echo is a desktop application built around Electron and a React renderer.

## Main layers

### Electron main process

The main process owns desktop windows, application lifecycle, system tray behaviour, privileged operations, provider requests, local storage, and IPC registration. It is the authority for operations that require filesystem access, credentials, or desktop capture APIs.

### Preload bridge

`electron/preload.cjs` exposes a deliberately limited `window.echoDesktop` API. Renderer code should call the methods exposed by this bridge rather than importing Electron modules or accessing Node.js directly.

### React renderer

The React UI contains the dashboard, compact teleprompter, settings, script library, Project Knowledge Library, and AI-assisted question workflow.

### AI provider layer

The AI manager resolves the active user-configured provider and delegates to the relevant adapter. OpenAI-compatible endpoints use the shared compatible adapter; Anthropic uses its native Messages API adapter. Provider credentials are managed outside the renderer.

### Speech layer

Deepgram handles streaming speech recognition. Microphone tracking and meeting/system-audio capture are separate workflows. System-audio capture capability depends on the operating system and must be read together with [Platform Support](PLATFORM_SUPPORT.md).

### Knowledge Library

Imported documents are extracted to text, chunked, indexed with BM25, and stored in the application's local user-data directory. Search results are used as evidence context for project-aware AI questions. The retrieved document text is sent to the selected AI provider when used to generate an answer.

## Security boundaries

- Renderer code should not receive unrestricted Node.js or filesystem access.
- Privileged IPC handlers should validate the sender and validate all inputs.
- Credentials should never be returned to renderer-facing configuration responses.
- User documents, transcripts, questions, model output, and retrieved passages are untrusted data.
- Capture protection is best effort and is not an application security boundary.

## Data flow summary

1. The user imports documents or records/transcribes speech.
2. Local document extraction, chunking, indexing, and search are performed on-device.
3. When speech capture is enabled, audio is streamed to Deepgram.
4. When answer generation is requested, the question, selected conversation context, and retrieved passages may be sent to the configured AI provider.
5. Scripts, library metadata, extracted files, and indexes remain in local app storage unless the user separately moves or shares them.
