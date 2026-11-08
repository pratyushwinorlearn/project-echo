# Platform Support Matrix

The project targets Windows, macOS, and Linux, but feature parity is not yet established. This matrix describes the current beta implementation and known limitations, not a certification of every OS version or desktop environment.

| Capability | Windows 10/11 | macOS | Linux |
|---|---|---|---|
| Dashboard and floating window | Primary development target | Needs release-device validation | Needs release-device validation; Wayland may restrict positioning/focus |
| Microphone speech tracking | Implemented; test on release build | Expected; validate permissions and device handling | Expected; validate permissions and audio stack |
| System-audio question capture | Implemented using Electron loopback path | Experimental/native system picker path; macOS 15+ and permission metadata required | Disabled in current beta |
| OS-backed credential storage | Uses Electron `safeStorage`; validate on target Windows account | Uses platform-backed storage when available; validate on device | Depends on available desktop secret store; do not assume it is available on every distribution |
| Capture protection | Requested through Electron; not universal | Requested through Electron; newer capture paths may bypass it | Not supported by Electron's current API |
| System tray | Available; test on target shell | Available; template icon conventions apply | Desktop-environment dependent |

## Windows

Windows is the primary development and validation target. The current system-audio implementation uses Electron's Windows loopback capture support. Capture protection can request exclusion on supported Windows capture paths, but it is not guaranteed against every recorder or capture method.

## macOS

Microphone permission and system-audio capture must be verified on real macOS devices. The system-audio path relies on the macOS system picker capability available on newer macOS versions and is experimental. Packaged builds need the appropriate audio-capture usage description in their application metadata. Capture protection is not guaranteed against every ScreenCaptureKit-based capture path.

## Linux

The current beta does not enable system-audio question capture. Microphone, tray, and floating-window behaviour need testing across distributions and desktop environments. Wayland can restrict programmatic window movement, positioning, and focus. Electron capture protection is not supported on Linux.

## Reporting platform issues

When reporting a platform issue, include the OS version, desktop environment/window system where relevant, Echo version, capture source, permission state, and a short reproduction. Do not upload private audio or transcripts.
