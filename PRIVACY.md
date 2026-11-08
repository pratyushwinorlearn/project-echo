# Privacy Notice (Beta Draft)

**Last updated: 9 November 2026**

This notice describes the intended data flows in the current Project Echo desktop beta. It is a project privacy notice, not legal advice. The maintainers should review it against the exact source code, dependencies, build configuration, and third-party provider terms before publishing a release.

## 1. No Echo account is required

The desktop application does not require a Project Echo account or an Echo-hosted application backend for its core workflows. This does not mean that no information leaves the device: features that use external speech or AI providers transmit the relevant data to the provider selected or configured by the user.

## 2. Information stored on your device

Depending on which features you use, Echo may store locally:

- Scripts, script-library metadata, and display preferences.
- Knowledge Library project metadata, imported original documents, extracted text, and search indexes.
- Provider configuration and credentials entered by the user.
- Application settings and local operational data.

The Knowledge Library stores imported documents and indexes in the application's local user-data directory. Do not import documents unless you are authorised to store and process them on that device.

Credential storage uses Electron's operating-system-backed `safeStorage` facility when available. Availability and the underlying protection depend on the operating system and its credential facilities. Users should protect their operating-system account and device. Do not assume encrypted local storage protects a device that is already compromised or unlocked by an unauthorised person.

## 3. Speech transcription

When speech tracking or meeting-question capture is started, Echo captures the audio source selected by the user and sends audio frames to Deepgram for transcription. The captured audio may include the user's voice and, in meeting-question mode, other speakers or system audio. Transcription is performed under the user's Deepgram account and is subject to Deepgram's terms, privacy notice, retention settings, and configuration.

Stop capture when it is no longer needed. Obtain the consent and permissions required by applicable law, workplace policy, meeting rules, and the audio service being used before capturing other people.

## 4. AI answer generation

When the user requests an AI answer, Echo may send the question, selected transcript/conversation context, and relevant Knowledge Library passages to the configured AI provider. Provider API credentials are used to authenticate that request. The provider processes the submitted content under its own terms, privacy policy, retention practices, and account settings.

Echo does not control the retention, training use, or processing location of third-party providers. Review the provider's privacy and data-use settings before sending confidential, personal, regulated, or proprietary information.

## 5. Knowledge Library

Imported documents, extracted text, and BM25 indexes are stored locally by the desktop application. When the user asks Echo a project question, retrieved passages may be included in the request to the configured AI provider. Search within the local library does not itself require sending the full library to an Echo-operated server.

Do not import secrets, private keys, credentials, personal data, or documents you are not authorised to use. Folder-import filters are a safeguard, not a guarantee that every sensitive file or secret will be identified.

## 6. Diagnostics and analytics

This beta documentation does not promise that all dependencies or operating-system components are free of diagnostics, crash reports, or network activity. Before release, maintainers must inspect the complete application and dependencies, document any telemetry or crash-reporting services, and state whether users can disable them. If any telemetry is introduced, this section must be updated before the release containing it.

## 7. Screen-capture protection

The optional capture-protection control requests exclusion through platform-supported Electron functionality. It is not guaranteed to work with every capture method and is not a security boundary. Do not rely on it to conceal activity or protect sensitive information from a meeting host, administrator, or recording system.

## 8. Your choices

You can choose whether to enable speech capture, which AI provider to configure, what project files to import, and what questions/context to send. You can remove saved project documents and provider credentials through the application's controls. You can also uninstall Echo and remove its local application-data directory if you want to delete remaining local Echo data; back up anything you want to keep first.

## 9. Children

Echo is a general-purpose desktop utility and is not designed specifically for children. Do not use it to process a child's personal information without the required parent/guardian authorisation and legal basis.

## 10. Changes and contact

This notice may change as Echo develops. For privacy questions, open a GitHub discussion or issue without including personal or confidential information. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting exploit details publicly.
