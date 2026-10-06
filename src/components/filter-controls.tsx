import { Check, ChevronDown } from "lucide-react";
import type { Method } from "@/lib/matlab-api";

type Props = {
  method: Method;
  kernelSize: number;
  sigmaValue: string;
  amountValue: string;
  disabled: boolean;
  setKernelSize: (value: number) => void;
  setSigmaValue: (value: string) => void;
  setAmountValue: (value: string) => void;
};

export function FilterControls({
  method,
  kernelSize,
  sigmaValue,
  amountValue,
  disabled,
  setKernelSize,
  setSigmaValue,
  setAmountValue,
}: Props) {
  if (method === "sobel")
    return (
      <div className="automatic-note edge-note">
        <Check size={16} />
        <div>
          <strong>Grayscale edge map</strong>
          <p>Bright pixels show stronger edges. Fixed Sobel scaling makes flat regions dark.</p>
        </div>
      </div>
    );
  return (
    <div className="filter-controls method-controls">
      {(method === "mean" || method === "median") && (
        <>
          <div className="control-label">
            <span>Smoothing</span>
            <span className="control-value">
              {kernelSize === 3 ? "Light" : kernelSize === 5 ? "Balanced" : "Strong"}
            </span>
          </div>
          <div className="preset-row">
            {[
              { size: 3, label: "Light" },
              { size: 5, label: "Balanced" },
              { size: 7, label: "Strong" },
            ].map(({ size, label }) => (
              <button
                type="button"
                key={size}
                className="preset-button"
                disabled={disabled}
                aria-pressed={kernelSize === size}
                onClick={() => setKernelSize(size)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {method === "gaussian" && (
        <FilterSlider
          label="Blur strength"
          value={sigmaValue}
          onChange={setSigmaValue}
          min={0.3}
          max={3}
          disabled={disabled}
        />
      )}
      {method === "unsharp" && (
        <FilterSlider
          label="Sharpening strength"
          value={amountValue}
          onChange={setAmountValue}
          min={0}
          max={3}
          disabled={disabled}
        />
      )}
      <details className="advanced-controls">
        <summary>
          More controls
          <ChevronDown size={13} />
        </summary>
        <div className="advanced-body">
          <div className="control-label">
            <span>Neighborhood size</span>
            <span className="control-value">
              {kernelSize} × {kernelSize}
            </span>
          </div>
          <div className="preset-row" role="group" aria-label="Neighborhood size">
            {[3, 5, 7].map((size) => (
              <button
                type="button"
                className="preset-button"
                key={size}
                disabled={disabled}
                aria-label={`${size} by ${size} neighborhood`}
                aria-pressed={kernelSize === size}
                onClick={() => setKernelSize(size)}
              >
                {size} × {size}
              </button>
            ))}
          </div>
          {method === "unsharp" && (
            <FilterSlider
              label="Blur sigma"
              value={sigmaValue}
              onChange={setSigmaValue}
              min={0.3}
              max={3}
              disabled={disabled}
            />
          )}
          {(method === "gaussian" || method === "unsharp") && (
            <p>σ controls the Gaussian weights inside this neighborhood.</p>
          )}
          <p>Image boundaries repeat the nearest edge pixel.</p>
        </div>
      </details>
    </div>
  );
}

function FilterSlider({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  disabled: boolean;
}) {
  const parsed = Number(value);
  const invalid = value.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max;
  const id = `filter-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="filter-slider">
      <div className="control-label">
        <label htmlFor={id}>{label}</label>
        <div className="number-field">
          <input
            id={id}
            type="number"
            min={min}
            max={max}
            step={0.1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-invalid={invalid}
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="any"
        value={invalid ? min : parsed}
        onChange={(event) => onChange(String(Math.round(Number(event.target.value) * 100) / 100))}
        disabled={disabled}
        aria-label={`${label} slider`}
        className="parameter-slider"
      />
      <div className="range-labels">
        <span>{min} · Subtle</span>
        <span>{max} · Strong</span>
      </div>
    </div>
  );
}

export function NeighborhoodDiagram({ size }: { size: number }) {
  return (
    <div className="neighborhood-example">
      <div
        className="neighborhood-grid"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        aria-hidden="true"
      >
        {Array.from({ length: size * size }, (_, index) => (
          <span
            key={index}
            className={index === Math.floor((size * size) / 2) ? "center-pixel" : ""}
          />
        ))}
      </div>
      <p>
        A {size} × {size} window moves across the image. The outlined center pixel receives the
        neighborhood’s result.
      </p>
    </div>
  );
}
