# Roadmap

This roadmap describes project direction, not guaranteed delivery dates. Priorities may change based on beta feedback and platform testing.

## Public beta readiness

- [x] Floating teleprompter and expanded dashboard workflow.
- [x] Saved scripts and speech-tracking workflow.
- [x] User-configured AI provider support.
- [x] Local Project Knowledge Library with document extraction, BM25 indexing, search, and grounded question answering.
- [x] System-tray integration in the current desktop implementation.
- [ ] Complete clean-install and upgrade testing.
- [ ] Validate credential persistence and removal on each supported OS.
- [ ] Test microphone permissions and speech tracking on Windows, macOS, and Linux.
- [ ] Validate system-audio capture per platform and document unsupported cases.
- [ ] Add reproducible packaging and installer workflows.
- [ ] Complete privacy/security review and first public beta release.

## Near-term improvements

- Improve Knowledge Library retrieval quality and show verifiable source passages consistently.
- Add more robust import progress, cancellation, and recovery for large folders.
- Expand automated tests for parsing, chunking, indexing, IPC validation, and provider response handling.
- Improve accessibility, keyboard navigation, and error recovery.
- Add signed/notarised release builds where platform requirements allow.

## Longer-term exploration

- More reliable cross-platform system-audio capture, including PipeWire-based Linux support.
- Optional local speech or AI providers.
- Better multilingual speech tracking and terminology hints.
- Additional document formats and improved handling of scanned PDFs.
- Import/export and backup tools for scripts and the Knowledge Library.

## Non-goals for the initial beta

- An Echo-hosted AI service or bundled provider credits.
- A guarantee that capture-protection settings hide the app from every recording or screen-sharing tool.
- A promise of identical system-audio capabilities on every operating system.
