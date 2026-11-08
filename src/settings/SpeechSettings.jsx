
import React, {
  useCallback,
  useEffect,
  useState
} from 'react';

import {
  AudioLines,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  Save,
  Trash2,
  Wifi
} from 'lucide-react';

function getDesktop() {
  if (!window.echoDesktop) {
    throw new Error(
      'Echo desktop bridge is unavailable. Restart the application.'
    );
  }

  return window.echoDesktop;
}

function readLanguage() {
  try {
    return JSON.parse(
      localStorage.getItem('echo-speech-language') || '"en-IN"'
    );
  } catch {
    return 'en-IN';
  }
}

export default function SpeechSettings() {
  const [language, setLanguage] = useState(readLanguage);
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [status, setStatus] = useState(null);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);

    try {
      const result =
        await getDesktop().getSpeechConfiguration();

      setConfigured(Boolean(result?.deepgram?.configured));
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'Could not load speech settings.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const handleLanguageChange = (value) => {
    setLanguage(value);

    const serialized = JSON.stringify(value);

    try {
      localStorage.setItem(
        'echo-speech-language',
        serialized
      );

      // Notify other same-origin renderers and this window.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'echo-speech-language',
          newValue: serialized
        })
      );
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'Could not save the language.'
      });
    }
  };

  const saveKey = async () => {
    const cleanKey = apiKey.trim();

    if (!cleanKey) {
      setStatus({
        type: 'error',
        message: 'Enter your Deepgram API key first.'
      });
      return false;
    }

    setSaving(true);
    setStatus(null);

    try {
      await getDesktop().saveDeepgramKey(cleanKey);

      setConfigured(true);
      setApiKey('');

      setStatus({
        type: 'success',
        message: 'Deepgram API key saved securely on this device.'
      });

      return true;
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'Could not save the Deepgram key.'
      });

      return false;
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);

    try {
      // Save a newly entered key before testing.
      if (apiKey.trim()) {
        const saved = await saveKey();

        if (!saved) return;
      }

      const result =
        await getDesktop().testDeepgramConnection();

      setStatus({
        type: 'success',
        message: result?.message || 'Deepgram connection successful.'
      });

      setConfigured(true);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'Deepgram connection failed.'
      });
    } finally {
      setTesting(false);
    }
  };

  const deleteKey = async () => {
    const confirmed = window.confirm(
      'Remove the saved Deepgram API key from this device? Speech recognition will stop working until you add another key.'
    );

    if (!confirmed) return;

    setDeleting(true);
    setStatus(null);

    try {
      await getDesktop().deleteDeepgramKey();

      setConfigured(false);
      setApiKey('');

      setStatus({
        type: 'success',
        message: 'Deepgram key removed from this device.'
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'Could not remove the Deepgram key.'
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="echo-settings-loading">
        <Loader2 size={18} className="echo-spin" />
        Loading speech settings…
      </div>
    );
  }

  return (
    <div className="echo-settings-stack">

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Speech recognition</h3>
            <p>
              Echo uses Deepgram Nova-3 for live transcription.
              The same credential is used for microphone and
              system-audio question capture.
            </p>
          </div>

          <AudioLines
            size={20}
            className="echo-settings-muted-icon"
          />
        </div>

        <div className="echo-settings-profile-status">
          <span
            className={`echo-status-dot ${
              configured ? 'configured' : ''
            }`}
          />

          <span>
            {configured
              ? 'Deepgram key is saved on this device'
              : 'Deepgram key has not been configured'}
          </span>
        </div>

        <label className="echo-field">
          <span>Deepgram API key</span>

          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              configured
                ? 'Saved securely · enter a new key to replace'
                : 'Paste your Deepgram API key'
            }
            autoComplete="new-password"
            spellCheck="false"
          />

          <small>
            The stored key is never returned to the interface.
            Enter a new key only when adding or rotating it.
          </small>
        </label>

        <div className="echo-settings-actions">
          <button
            type="button"
            className="echo-button secondary"
            onClick={saveKey}
            disabled={saving || testing || deleting || !apiKey.trim()}
          >
            {saving ? (
              <Loader2 size={15} className="echo-spin" />
            ) : (
              <Save size={15} />
            )}
            Save key
          </button>

          <button
            type="button"
            className="echo-button primary"
            onClick={testConnection}
            disabled={saving || testing || deleting || (!configured && !apiKey.trim())}
          >
            {testing ? (
              <Loader2 size={15} className="echo-spin" />
            ) : (
              <Wifi size={15} />
            )}
            Test connection
          </button>
        </div>

        {configured && (
          <div className="echo-settings-danger-action">
            <div>
              <strong>Remove Deepgram key</strong>
              <span>
                Removes the saved credential from this device.
              </span>
            </div>

            <button
              type="button"
              className="echo-button danger"
              onClick={deleteKey}
              disabled={deleting || saving || testing}
            >
              {deleting ? (
                <Loader2 size={14} className="echo-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Remove
            </button>
          </div>
        )}
      </section>

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Recognition language</h3>
            <p>
              Select the language Deepgram should recognise.
              The setting is shared with the floating teleprompter.
            </p>
          </div>
        </div>

        <label className="echo-field">
          <span>Speech language</span>

          <select
            value={language}
            onChange={(event) =>
              handleLanguageChange(event.target.value)
            }
          >
            <option value="en-IN">English (India)</option>
            <option value="en-US">English (United States)</option>
            <option value="en-GB">English (United Kingdom)</option>
            <option value="hi">Hindi</option>
          </select>
        </label>

        <div className="echo-settings-info-row">
          <AudioLines size={18} />

          <div>
            <strong>Streaming speech recognition</strong>
            <span>
              Audio is streamed to Deepgram while you speak.
              Your chosen language is used for new sessions.
            </span>
          </div>
        </div>
      </section>

      {status && (
        <div
          className={`echo-settings-message ${status.type}`}
          role="status"
        >
          {status.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <CircleAlert size={16} />
          )}

          <span>{status.message}</span>
        </div>
      )}

      <p className="echo-settings-footnote">
        Deepgram usage and billing are managed by your Deepgram
        account. Echo does not bundle transcription credits.
      </p>
    </div>
  );
}
