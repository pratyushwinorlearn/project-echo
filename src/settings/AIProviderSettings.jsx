
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Info, 
  KeyRound,
  Loader2,
  RefreshCw,
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

function errorMessage(error) {
  return error?.message || 'Something went wrong.';
}

export default function AIProviderSettings() {
  const [providers, setProviders] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProvider, setActiveProvider] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);

  const [providerId, setProviderId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [status, setStatus] = useState(null);

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === providerId),
    [providers, providerId]
  );

  const savedProfile = profiles[providerId] || null;

  const environmentProfile =
    activeConfig?.provider === providerId
      ? activeConfig
      : null;

  const existingProfile = savedProfile || environmentProfile;

  const isConfigured = Boolean(
    existingProfile?.configured
  );

  const isActive = activeProvider === providerId;

  const setMessage = (type, message) => {
    setStatus({ type, message });
  };

  const applyProvider = useCallback(
    (id, providerList, profileMap, active) => {
      const definition = providerList.find(
        (item) => item.id === id
      );

      if (!definition) return;

      const profile = profileMap[id] ||
        (active?.provider === id ? active : null);

      setProviderId(id);
      setApiKey('');
      setModel(
        profile?.model ||
        definition.defaultModel ||
        ''
      );
      setBaseUrl(
        profile?.baseUrl ||
        definition.defaultBaseUrl ||
        ''
      );
      setModels([]);
      setStatus(null);
    },
    []
  );

  const loadConfiguration = useCallback(async () => {
    setLoading(true);

    try {
      const desktop = getDesktop();

      const [providerList, configuration] = await Promise.all([
        desktop.getAIProviders(),
        desktop.getAIConfiguration()
      ]);

      setProviders(providerList || []);
      setProfiles(configuration?.profiles || {});
      setActiveProvider(configuration?.activeProvider || null);
      setActiveConfig(configuration?.activeConfig || null);

      const initialProvider =
        configuration?.activeProvider ||
        configuration?.activeConfig?.provider ||
        providerList?.[0]?.id ||
        '';

      if (initialProvider) {
        applyProvider(
          initialProvider,
          providerList || [],
          configuration?.profiles || {},
          configuration?.activeConfig || null
        );
      }
    } catch (error) {
      setMessage('error', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [applyProvider]);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const handleProviderChange = (id) => {
    applyProvider(id, providers, profiles, activeConfig);
  };

  const makeConfig = () => ({
    provider: providerId,
    apiKey: apiKey.trim(),
    model: model.trim(),
    baseUrl: baseUrl.trim()
  });

  const validateForm = () => {
    if (!providerId) {
      throw new Error('Choose an AI provider.');
    }

    if (!model.trim()) {
      throw new Error('Enter a model ID.');
    }

    if (!baseUrl.trim()) {
      throw new Error('Enter the provider API endpoint.');
    }

    if (
      selectedProvider?.requiresApiKey &&
      !apiKey.trim() &&
      !isConfigured
    ) {
      throw new Error('Enter your API key.');
    }
  };

  const handleSave = async () => {
    setStatus(null);

    try {
      validateForm();
    } catch (error) {
      setMessage('error', errorMessage(error));
      return;
    }

    setSaving(true);

    try {
      const configuration =
        await getDesktop().saveAIConfiguration(makeConfig());

      setProfiles(configuration?.profiles || {});
      setActiveProvider(configuration?.activeProvider || providerId);
      setActiveConfig(configuration?.activeConfig || null);

      setApiKey('');

      setMessage(
        'success',
        `${selectedProvider?.name || 'Provider'} configuration saved securely.`
      );
    } catch (error) {
      setMessage('error', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setStatus(null);

    try {
      validateForm();
    } catch (error) {
      setMessage('error', errorMessage(error));
      return;
    }

    setTesting(true);

    try {
      // Save first, then test the encrypted active profile.
      const configuration =
        await getDesktop().saveAIConfiguration(makeConfig());

      setProfiles(configuration?.profiles || {});
      setActiveProvider(configuration?.activeProvider || providerId);
      setActiveConfig(configuration?.activeConfig || null);

      setApiKey('');

      const result = await getDesktop().testAIConnection();

      setMessage(
        'success',
        result?.message ||
        `Connected successfully to ${result?.model || model}.`
      );
    } catch (error) {
      setMessage('error', errorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const handleLoadModels = async () => {
    setStatus(null);

    if (!isActive || !isConfigured) {
      setMessage(
        'info',
        'Save this provider and make it active before loading its models.'
      );
      return;
    }

    setLoadingModels(true);

    try {
      const result = await getDesktop().getAIModels();

      setModels(result || []);

      if (!result?.length) {
        setMessage(
          'info',
          'The provider did not return a model list. You can enter a model ID manually.'
        );
      } else {
        setMessage(
          'success',
          `${result.length} model options loaded.`
        );
      }
    } catch (error) {
      setMessage(
        'error',
        `Could not load models: ${errorMessage(error)}`
      );
    } finally {
      setLoadingModels(false);
    }
  };

  const handleActivate = async () => {
    if (!profiles[providerId]) {
      setMessage(
        'info',
        'Save this provider configuration before activating it.'
      );
      return;
    }

    setSaving(true);

    try {
      const configuration =
        await getDesktop().setActiveAIProvider(providerId);

      setProfiles(configuration?.profiles || {});
      setActiveProvider(configuration?.activeProvider || providerId);
      setActiveConfig(configuration?.activeConfig || null);

      setMessage(
        'success',
        `${selectedProvider?.name || 'Provider'} is now active.`
      );
    } catch (error) {
      setMessage('error', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!profiles[providerId]) {
      setMessage('info', 'There is no saved profile to delete.');
      return;
    }

    const confirmed = window.confirm(
      `Delete the saved ${selectedProvider?.name || providerId} configuration from this device?`
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const configuration =
        await getDesktop().deleteAIProvider(providerId);

      setProfiles(configuration?.profiles || {});
      setActiveProvider(configuration?.activeProvider || null);
      setActiveConfig(configuration?.activeConfig || null);
      setApiKey('');

      setMessage('success', 'Saved provider configuration deleted.');
    } catch (error) {
      setMessage('error', errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="echo-settings-loading">
        <Loader2 size={18} className="echo-spin" />
        Loading AI provider settings…
      </div>
    );
  }

  return (
    <div className="echo-settings-stack">

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Selected AI provider</h3>
            <p>
              Choose the service Echo should use to generate answers.
            </p>
          </div>

          <span className="echo-settings-inline-icon">
            <Wifi size={18} />
          </span>
        </div>

        <label className="echo-field">
          <span>Provider</span>

          <div className="echo-select-wrap">
            <select
              value={providerId}
              onChange={(event) =>
                handleProviderChange(event.target.value)
              }
            >
              {providers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                >
                  {provider.name}
                </option>
              ))}
            </select>

            <ChevronDown size={15} />
          </div>
        </label>

        {selectedProvider?.description && (
          <p className="echo-field-help">
            {selectedProvider.description}
          </p>
        )}

        <div className="echo-settings-profile-status">
          <span
            className={`echo-status-dot ${
              isConfigured ? 'configured' : ''
            }`}
          />

          <span>
            {isConfigured
              ? isActive
                ? 'Configured · Currently active'
                : 'Configuration saved on this device'
              : 'Not configured yet'}
          </span>

          {existingProfile?.source === 'environment' && (
            <span className="echo-env-label">
              .env
            </span>
          )}
        </div>
      </section>

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Provider credentials</h3>
            <p>
              Your API key is sent directly from Echo's main process
              to the provider. It is never shown again after saving.
            </p>
          </div>

          <KeyRound size={19} className="echo-settings-muted-icon" />
        </div>

        <label className="echo-field">
          <span>API key</span>

          <div className="echo-password-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                isConfigured
                  ? 'Saved securely · leave blank to keep'
                  : selectedProvider?.requiresApiKey
                    ? 'Paste your provider API key'
                    : 'Optional for this endpoint'
              }
              autoComplete="new-password"
              spellCheck="false"
            />

            <button
              type="button"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <small>
            {isConfigured
              ? 'The existing key is stored securely. Enter a new key only when rotating it.'
              : 'Your key is not saved until you click Save configuration.'}
          </small>
        </label>

        <label className="echo-field">
          <span>Model ID</span>

          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Enter the exact model ID"
            spellCheck="false"
          />

          <small>
            Model IDs are provider-specific. Check your provider's
            model catalogue if you are unsure.
          </small>
        </label>

        <label className="echo-field">
          <span>API endpoint</span>

          <input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
            spellCheck="false"
          />

          <small>
            The default endpoint is filled in for supported providers.
            Use HTTPS for remote services.
          </small>
        </label>

        {models.length > 0 && (
          <label className="echo-field">
            <span>Available models</span>

            <div className="echo-select-wrap">
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    setModel(event.target.value);
                  }
                }}
              >
                <option value="">Choose a model…</option>

                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>

              <ChevronDown size={15} />
            </div>
          </label>
        )}

        <div className="echo-settings-actions">
          <button
            type="button"
            className="echo-button secondary"
            onClick={handleLoadModels}
            disabled={loadingModels || saving || !isActive || !isConfigured}
          >
            {loadingModels ? (
              <Loader2 size={15} className="echo-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Load models
          </button>

          <button
            type="button"
            className="echo-button secondary"
            onClick={handleSave}
            disabled={saving || testing || deleting}
          >
            {saving ? (
              <Loader2 size={15} className="echo-spin" />
            ) : (
              <Save size={15} />
            )}
            Save configuration
          </button>

          <button
            type="button"
            className="echo-button primary"
            onClick={handleTest}
            disabled={saving || testing || deleting}
          >
            {testing ? (
              <Loader2 size={15} className="echo-spin" />
            ) : (
              <Wifi size={15} />
            )}
            Test connection
          </button>
        </div>
      </section>

      {profiles[providerId] && !isActive && (
        <section className="echo-settings-card echo-settings-profile-card">
          <div>
            <strong>Saved provider</strong>
            <span>
              {profiles[providerId].model || 'Model not specified'}
            </span>
          </div>

          <button
            type="button"
            className="echo-button primary"
            onClick={handleActivate}
            disabled={saving}
          >
            {saving ? (
              <Loader2 size={14} className="echo-spin" />
            ) : (
              <Check size={14} />
            )}
            Make active
          </button>
        </section>
      )}

      {profiles[providerId] && (
        <section className="echo-settings-card echo-danger-card">
          <div>
            <strong>Remove saved configuration</strong>
            <span>
              Deletes this provider's saved credentials and settings
              from Echo on this device.
            </span>
          </div>

          <button
            type="button"
            className="echo-button danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 size={14} className="echo-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Remove
          </button>
        </section>
      )}

      {status && (
        <div
          className={`echo-settings-message ${status.type}`}
          role="status"
        >
          {status.type === 'success' ? (
            <CircleCheck size={16} />
          ) : status.type === 'error' ? (
            <CircleAlert size={16} />
          ) : (
            <Info size={16} />
          )}

          <span>{status.message}</span>
        </div>
      )}

      <p className="echo-settings-footnote">
        Echo does not provide AI model access or bundle API credits.
        Usage and billing are managed by your selected provider.
      </p>
    </div>
  );
}
