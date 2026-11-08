
import React, { useState } from 'react';
import {
  AudioLines,
  BrainCircuit,
  Info,
  Monitor,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react';

import AIProviderSettings from './AIProviderSettings';
import SpeechSettings from './SpeechSettings';
import AppearanceSettings from './AppearanceSettings';

import './settings.css';

const SECTIONS = [
  {
    id: 'ai',
    label: 'AI providers',
    description: 'API keys and models',
    icon: BrainCircuit
  },
  {
    id: 'speech',
    label: 'Speech & audio',
    description: 'Deepgram and language',
    icon: AudioLines
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Window and reading settings',
    icon: Monitor
  },
  {
    id: 'privacy',
    label: 'Privacy & security',
    description: 'Capture and local data',
    icon: ShieldCheck
  },
  {
    id: 'about',
    label: 'About Echo',
    description: 'Application information',
    icon: Info
  }
];

function PrivacySettings({
  captureProtection,
  toggleCaptureProtection,
  alwaysOnTop,
  toggleAlwaysOnTop
}) {
  return (
    <div className="echo-settings-stack">
      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Window privacy</h3>
            <p>Control how the floating teleprompter behaves.</p>
          </div>
        </div>

        <div className="echo-settings-option">
          <div>
            <strong>Hide from screen capture</strong>
            <span>
              Uses Electron capture protection where supported.
              Some capture applications may still show the window.
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={captureProtection}
            className={`echo-switch ${
              captureProtection ? 'is-on' : ''
            }`}
            onClick={() =>
              toggleCaptureProtection(!captureProtection)
            }
          >
            <span />
          </button>
        </div>

        <div className="echo-settings-option">
          <div>
            <strong>Always on top</strong>
            <span>
              Keep the floating teleprompter above other windows.
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={alwaysOnTop}
            className={`echo-switch ${
              alwaysOnTop ? 'is-on' : ''
            }`}
            onClick={() => toggleAlwaysOnTop(!alwaysOnTop)}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Credential storage</h3>
            <p>How Echo handles your API credentials.</p>
          </div>
        </div>

        <div className="echo-settings-info-row">
          <ShieldCheck size={19} />

          <div>
            <strong>Encrypted on this device</strong>
            <span>
              Saved AI and Deepgram credentials are encrypted
              using Electron's operating-system-backed safeStorage.
              They are not stored in the renderer's localStorage.
            </span>
          </div>
        </div>

        <p className="echo-settings-footnote">
          Your selected AI provider receives the questions and
          conversation context required to generate answers.
          Echo does not operate an AI proxy server.
        </p>
      </section>
    </div>
  );
}

function AboutSettings() {
  return (
    <div className="echo-settings-stack">
      <section className="echo-settings-card echo-about-card">
        <div className="echo-about-mark">
          <SlidersHorizontal size={23} />
        </div>

        <div>
          <div className="echo-settings-eyebrow">
            DESKTOP SPEAKING ASSISTANT
          </div>

          <h2>Project Echo</h2>

          <p>
            A floating teleprompter with live speech tracking
            and AI-powered answer assistance.
          </p>
        </div>

        <div className="echo-about-version">
          <span>Version</span>
          <strong>0.1.1</strong>
        </div>
      </section>

      <section className="echo-settings-card">
        <h3>Services used by Echo</h3>

        <div className="echo-settings-service-list">
          <div>
            <strong>Deepgram</strong>
            <span>Live speech recognition</span>
          </div>

          <div>
            <strong>Your selected AI provider</strong>
            <span>Question answering and response generation</span>
          </div>

          <div>
            <strong>Electron</strong>
            <span>Windows desktop application framework</span>
          </div>
        </div>

        <p className="echo-settings-footnote">
          Each third-party API is subject to its provider's
          own pricing, availability and privacy policies.
        </p>
      </section>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  updateSettings,
  captureProtection,
  toggleCaptureProtection,
  alwaysOnTop,
  toggleAlwaysOnTop
}) {
  const [activeSection, setActiveSection] = useState('ai');

  const currentSection = SECTIONS.find(
    (section) => section.id === activeSection
  );

  return (
    <section className="echo-settings-page">
      <header className="echo-settings-page-header">
        <div>
          <div className="echo-settings-eyebrow">
            PREFERENCES
          </div>

          <h1>Settings</h1>

          <p>
            Configure your AI providers, speech recognition
            and teleprompter experience.
          </p>
        </div>
      </header>

      <div className="echo-settings-layout">
        <aside className="echo-settings-sidebar">
          <div className="echo-settings-sidebar-label">
            GENERAL
          </div>

          <nav aria-label="Settings sections">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const selected = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  className={`echo-settings-nav-item ${
                    selected ? 'active' : ''
                  }`}
                  onClick={() =>
                    setActiveSection(section.id)
                  }
                  aria-current={selected ? 'page' : undefined}
                >
                  <Icon size={17} />

                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="echo-settings-sidebar-note">
            <ShieldCheck size={15} />
            <span>Credentials stay on this device.</span>
          </div>
        </aside>

        <main className="echo-settings-content">
          <div className="echo-settings-section-heading">
            <div>
              <span className="echo-settings-eyebrow">
                {currentSection?.label.toUpperCase()}
              </span>

              <h2>{currentSection?.label}</h2>

              <p>{currentSection?.description}</p>
            </div>
          </div>

          {activeSection === 'ai' && (
            <AIProviderSettings />
          )}

          {activeSection === 'speech' && (
            <SpeechSettings />
          )}

          {activeSection === 'appearance' && (
            <AppearanceSettings
              settings={settings}
              updateSettings={updateSettings}
            />
          )}

          {activeSection === 'privacy' && (
            <PrivacySettings
              captureProtection={captureProtection}
              toggleCaptureProtection={toggleCaptureProtection}
              alwaysOnTop={alwaysOnTop}
              toggleAlwaysOnTop={toggleAlwaysOnTop}
            />
          )}

          {activeSection === 'about' && (
            <AboutSettings />
          )}
        </main>
      </div>
    </section>
  );
}
