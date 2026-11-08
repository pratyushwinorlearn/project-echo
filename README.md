# Project Echo

**A desktop speaking companion with a floating teleprompter, live speech tracking, meeting-question capture, and project-aware AI assistance.**

> **Status: pre-release beta preparation.** Echo is under active development. The repository is being prepared for an initial public beta; installers, platform coverage, and the release process still require validation. Expect bugs and breaking changes.

## What Echo does

Project Echo combines a compact floating teleprompter with an expanded desktop dashboard. The current application includes:

- Editable scripts and a saved-script library.
- Live speech-to-text through Deepgram, with script alignment, word tracking, and reading assistance.
- A manual meeting-question workflow that can capture audio, transcribe a question, and generate a spoken-style answer.
- AI provider settings for user-supplied credentials (BYOK).
- A local Project Knowledge Library for importing documentation and source files, indexing them with BM25, searching passages, and generating answers grounded in retrieved project material.
- A settings area for appearance and supported capture-privacy controls.
- A floating teleprompter and a dashboard window, with system-tray behaviour in the current desktop implementation.

Features and platform availability vary. See [Platform support](docs/PLATFORM_SUPPORT.md) before relying on audio capture, capture protection, window positioning, or tray behaviour on a particular operating system.

## Beta status and limitations

- Windows is the primary development and validation target.
- macOS support is in development; system-audio capture depends on newer macOS capabilities and requires device-level testing and the correct application permission metadata.
- Linux microphone and general desktop behaviour require broader validation. System-audio question capture and capture protection are not enabled in the current beta implementation.
- Electron's capture-protection API is a best-effort platform feature, not a security boundary. It cannot guarantee that Echo is excluded from every screen-sharing, recording, remote-control, or capture path.
- Speech recognition and AI answer generation use third-party services configured by the user. Their availability, pricing, data handling, and model behaviour are controlled by those providers.
- Scanned-PDF OCR is not included. PDFs need extractable text.

Do not use Echo to bypass meeting, workplace, school, assessment, or recording rules. Obtain permission before capturing or processing other people's audio, and follow applicable laws and service terms.

## Requirements

- Node.js **22.12 or newer** is the intended development runtime.
- npm.
- A supported desktop operating system and the permissions required for microphone/audio capture.
- A Deepgram API key for speech recognition.
- An API key for one of the configured AI providers if you want AI-generated answers.

Supported AI integrations in the current codebase include OpenAI-compatible providers (including OpenAI, Groq, Gemini, OpenRouter, and custom compatible endpoints) plus the native Anthropic adapter. Available models and endpoint behaviour depend on each provider.

## Run from source

```bash
npm install
npm run dev
```

Build the renderer:

```bash
npm run build
```

Run the Electron application using the package script:

```bash
npm start
```

Run the Electron syntax checks if the `check:electron` script is present in your checked-out package:

```bash
npm run check:electron
```

If a command is unavailable, check the scripts section of `package.json`. Release packaging is not yet documented as a stable workflow.

## First-time setup

1. Start Echo from source.
2. Open Settings and configure a speech provider key for Deepgram.
3. Choose an AI provider, enter its API key, endpoint (when applicable), and model ID, then test the connection.
4. Create a project in Knowledge Library and import a README or a small set of documentation files.
5. Test speech tracking, question capture, project search, and AI answers with non-sensitive sample material before using Echo in a real meeting.

Prefer entering credentials in Echo's credential settings. Never commit `.env`, API keys, captured audio, transcripts, imported project documents, encrypted credential stores, or personal data.

## Privacy at a glance

Echo stores its local scripts, knowledge-library files, indexes, and settings on the user's device. When enabled, microphone or system audio is sent to Deepgram for transcription. Questions, relevant transcript context, and retrieved project passages may be sent to the AI provider selected by the user to generate an answer. The data practices of those third-party providers apply to data they receive.

See [PRIVACY.md](PRIVACY.md) for the beta privacy notice and [SECURITY.md](SECURITY.md) for vulnerability reporting. This documentation should be reviewed and updated before each public release.

## Documentation

- [Development guide](docs/DEVELOPMENT.md)
- [Architecture overview](docs/ARCHITECTURE.md)
- [Platform support](docs/PLATFORM_SUPPORT.md)
- [Privacy notice](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Roadmap](ROADMAP.md)
- [Release checklist](RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## Contributing

Bug reports, documentation improvements, and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and use the GitHub issue templates. Do not include secrets, private audio, transcripts, or proprietary project files in issues.

## License

Project Echo is intended to be released under the [MIT License](LICENSE).
