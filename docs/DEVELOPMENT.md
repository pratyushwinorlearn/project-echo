# Development Guide

## Requirements

- Node.js 22.12 or newer is the intended development runtime.
- npm.
- Git.
- A desktop OS supported by the feature being developed.

## Setup

```bash
git clone <repository-url>
cd project-echo
npm install
npm run dev
```

The project uses Vite for the React renderer and Electron for the desktop shell. The Electron main process is configured through `electron/main.cjs`, with a restricted API exposed to the renderer by `electron/preload.cjs`.

## Useful commands

```bash
npm run dev
npm run build
npm start
npm run check:electron
```

`check:electron` is expected in the current package configuration. If your checkout does not include it, inspect `package.json` and use the available syntax-check scripts. Do not add a `test` command to CI until a real test suite exists.

## Environment and credentials

- `.env` is for local development only and must never be committed.
- `.env.example` contains variable names/placeholders only.
- Prefer the in-app credential settings and the OS-backed credential store for user credentials.
- Never paste real keys into issues, logs, screenshots, or pull requests.
- Packaged builds must not depend on a developer's local `.env` file.

## Before submitting a change

1. Run the relevant syntax checks.
2. Run `npm run build`.
3. Start Echo and test the affected UI and IPC path.
4. Test on the target OS if the change touches platform-specific code.
5. Update platform, privacy, and setup documentation if behaviour changes.

## Debugging

Include redacted error messages and reproduction steps in a bug report. Do not attach the whole user-data directory, `library.json`, imported files, encrypted credential stores, raw audio, or transcript data unless the information has been sanitised and you are authorised to share it.
