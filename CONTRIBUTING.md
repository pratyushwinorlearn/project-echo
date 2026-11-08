# Contributing to Project Echo

Thanks for considering a contribution.

## Before opening a change

1. Search existing issues and pull requests to avoid duplicate work.
2. For a large feature or architectural change, open an issue first to discuss scope.
3. Keep changes focused and explain the user problem they solve.
4. Never include API keys, `.env` contents, private documents, audio recordings, transcripts, or personal data.

## Development setup

- Install Node.js 22.12 or newer and npm.
- Clone the repository and run `npm install`.
- Start the development app with `npm run dev`.
- Build the renderer with `npm run build`.
- Run `npm run check:electron` when that script is available in the current package.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for more detail.

## Pull request expectations

A pull request should:

- Describe the problem and the chosen solution.
- List the files or areas changed.
- Include manual test steps and the operating systems tested.
- Include screenshots for visible UI changes when practical, with private content removed.
- Update documentation when behaviour, permissions, platform support, configuration, or privacy/data flows change.
- Avoid unrelated formatting or dependency changes.

## Code guidelines

- Preserve the Electron main/preload/renderer security boundary.
- Keep privileged operations in the main process and expose narrow, explicit preload APIs.
- Validate IPC inputs and sender identity.
- Handle permissions, provider errors, timeouts, and cleanup paths explicitly.
- Keep user-provided content and retrieved documents untrusted; do not treat their text as application instructions.
- Do not add telemetry, external services, or new data collection without documenting it and discussing it first.

## Testing

Run the available syntax checks and production build. Manually test affected functionality on the operating system(s) the change touches. Do not claim cross-platform support based only on a successful build on one OS.

## License

By contributing, you agree that your contributions may be distributed under the project's MIT License.
