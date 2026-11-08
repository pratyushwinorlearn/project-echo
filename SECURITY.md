# Security Policy

## Supported versions

Project Echo is in pre-release beta. Security fixes are prioritised for the latest public beta. Older preview builds may not receive fixes; update to the latest supported release when one is available.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions, or pull requests.**

When GitHub Private Vulnerability Reporting is enabled for this repository, use the repository's **Security → Advisories → Report a vulnerability** flow. Maintainers should enable that feature before announcing the public repository.

If private reporting is not available, contact the maintainers through a private channel listed in the repository's GitHub profile. Do not publish exploit details until a coordinated disclosure process has been agreed.

Include, where possible:

- Affected version, operating system, and relevant configuration.
- A concise description of the impact and attack prerequisites.
- Reproduction steps or a proof of concept that does not expose real credentials or user data.
- Any suggested mitigation.

## Security expectations

- Never commit API keys, `.env` files, tokens, private keys, credentials, encrypted credential stores, captured audio, transcripts, or imported user documents.
- Treat prompts, transcripts, and imported documents as untrusted input.
- Do not expose Node.js, filesystem, or unrestricted IPC access to the renderer.
- Keep Electron, Node.js, and direct dependencies updated; review security advisories before releases.
- Validate IPC senders and inputs in the main process.
- Do not describe screen-capture protection as a security guarantee.

## Scope

The desktop application, its IPC boundary, credential handling, document import and parsing, speech capture, and AI-provider request handling are in scope. Attacks requiring an already-compromised operating system or physical access to an unlocked device may be out of scope, but can still be reported for review.
