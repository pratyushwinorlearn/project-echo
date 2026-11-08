# Public Beta Release Checklist

Use this checklist before creating a public release. A checked item should be supported by an actual test or review, not an assumption.

## Repository safety

- [ ] Confirm `.env`, `.env.*` (except `.env.example`), credentials, private keys, local credential stores, audio, transcripts, user documents, and local databases are ignored.
- [ ] Inspect `git status --ignored` and `git ls-files` for secrets and generated/private files.
- [ ] Scan the full Git history for secrets before making the repository public.
- [ ] Rotate any credential that was ever committed, even if the commit was later amended or deleted.
- [ ] Confirm all included assets and dependencies may be redistributed.
- [ ] Confirm package metadata, version, licence, and repository URL.

## Application quality

- [ ] Clean install succeeds from the lockfile.
- [ ] Electron syntax checks pass.
- [ ] Production renderer build succeeds.
- [ ] First launch and restart work without developer-only files or `.env`.
- [ ] AI provider setup, test, switching, deletion, and credential persistence work.
- [ ] Deepgram key setup, test, deletion, and microphone tracking work.
- [ ] Teleprompter script persistence, alignment, highlighting, and scrolling work.
- [ ] Question capture, transcription, AI generation, and answer-reading tracking work.
- [ ] Knowledge Library import, extraction, indexing, search, grounded answers, deletion, and restart persistence work.
- [ ] Window close/tray/quit behaviour works as documented.
- [ ] Error messages do not reveal API keys or sensitive request bodies.

## Platform verification

- [ ] Windows clean install and runtime test.
- [ ] macOS clean install, microphone permission, credential storage, and system-audio capability test on each claimed macOS version.
- [ ] Linux clean install, microphone test, tray test, and documented system-audio limitations.
- [ ] Test capture-protection behaviour with the exact supported capture methods; document failures and limitations.
- [ ] Verify app naming, icons, update/uninstall behaviour, and local-data retention per platform.

## Legal, privacy, and community

- [ ] Review `PRIVACY.md` against actual network calls and data storage.
- [ ] Review third-party provider terms and identify all audio/text destinations.
- [ ] Confirm consent and acceptable-use guidance for meeting capture.
- [ ] Enable GitHub private vulnerability reporting.
- [ ] Configure issue templates, discussions (if desired), and repository topics.
- [ ] Confirm MIT licence and third-party notices.

## Packaging and release

- [ ] Configure platform packaging only after install/runtime testing.
- [ ] Build Windows, macOS (architecture-specific), and Linux artifacts that are actually supported.
- [ ] Code-sign Windows installers where possible.
- [ ] Sign and notarise macOS builds before claiming normal Gatekeeper-friendly distribution.
- [ ] Test each artifact on a clean machine/VM.
- [ ] Create a tagged beta release with release notes and checksums.
- [ ] Publish known limitations and a support route.

## Final approval

- [ ] No known critical security or data-loss issues remain.
- [ ] All release claims match tested behaviour.
- [ ] Maintainer explicitly approves publishing the release.
