
import React from 'react';

import {
  Monitor,
  Type,
  Ruler,
  Eye
} from 'lucide-react';

function RangeField({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange
}) {
  return (
    <label className="echo-appearance-range">
      <div className="echo-appearance-range-heading">
        <div>
          <strong>{label}</strong>
          {description && <small>{description}</small>}
        </div>

        <span>{value}{suffix}</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
      />
    </label>
  );
}

export default function AppearanceSettings({
  settings,
  updateSettings
}) {
  const update = (key, value) => {
    updateSettings((current) => ({
      ...current,
      [key]: value
    }));
  };

  return (
    <div className="echo-settings-stack">

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Floating window size</h3>
            <p>
              Configure the default dimensions used when Echo
              opens the floating teleprompter.
            </p>
          </div>

          <Ruler
            size={20}
            className="echo-settings-muted-icon"
          />
        </div>

        <RangeField
          label="Width"
          description="Horizontal size of the floating window."
          value={settings.windowWidth}
          min={420}
          max={1000}
          step={10}
          suffix=" px"
          onChange={(value) => update('windowWidth', value)}
        />

        <RangeField
          label="Height"
          description="Vertical size of the floating window."
          value={settings.windowHeight}
          min={150}
          max={500}
          step={5}
          suffix=" px"
          onChange={(value) => update('windowHeight', value)}
        />
      </section>

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Reading appearance</h3>
            <p>
              Adjust the script and generated-answer text.
            </p>
          </div>

          <Type
            size={20}
            className="echo-settings-muted-icon"
          />
        </div>

        <RangeField
          label="Font size"
          description="Text size in the floating teleprompter."
          value={settings.fontSize}
          min={14}
          max={32}
          suffix=" px"
          onChange={(value) => update('fontSize', value)}
        />

        <RangeField
          label="Line spacing"
          description="Vertical spacing between lines."
          value={settings.lineHeight}
          min={1.2}
          max={2.2}
          step={0.1}
          suffix="×"
          onChange={(value) => update('lineHeight', value)}
        />
      </section>

      <section className="echo-settings-card">
        <div className="echo-settings-card-heading">
          <div>
            <h3>Window appearance</h3>
            <p>
              Adjust how opaque the floating window looks.
            </p>
          </div>

          <Eye
            size={20}
            className="echo-settings-muted-icon"
          />
        </div>

        <RangeField
          label="Opacity"
          description="Lower values make the window more transparent."
          value={settings.opacity}
          min={45}
          max={100}
          suffix="%"
          onChange={(value) => update('opacity', value)}
        />

        <div className="echo-appearance-preview">
          <div
            className="echo-appearance-preview-window"
            style={{
              opacity: settings.opacity / 100,
              fontSize: `${Math.min(settings.fontSize, 22)}px`,
              lineHeight: settings.lineHeight
            }}
          >
            Hello everyone. Welcome to my presentation.
          </div>
        </div>
      </section>

    </div>
  );
}
