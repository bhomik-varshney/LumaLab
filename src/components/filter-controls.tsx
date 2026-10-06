import { useId } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Method } from "@/lib/matlab-api";
import {
  MIN_KERNEL_SIZE,
  MAX_KERNEL_SIZE,
  isValidKernelSize,
  footprintGuidance,
} from "@/lib/filter-settings";

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
  const controlId = useId();
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
      <div className="kernel-control">
        <div className="control-label">
          <label htmlFor={`${controlId}-kernel`}>Kernel size</label>
          <output htmlFor={`${controlId}-kernel`} className="control-value">
            {kernelSize} × {kernelSize}
          </output>
        </div>
        <input
          id={`${controlId}-kernel`}
          type="range"
          min={MIN_KERNEL_SIZE}
          max={MAX_KERNEL_SIZE}
          step={2}
          value={kernelSize}
          disabled={disabled}
          className="parameter-slider"
          aria-valuetext={`${kernelSize} by ${kernelSize} pixels`}
          aria-describedby={`${controlId}-guidance`}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (isValidKernelSize(next)) setKernelSize(next);
          }}
        />
        <div className="kernel-ticks" aria-hidden="true">
          {[3, 5, 7, 9, 11, 13, 15].map((size) => (
            <span key={size}>{size}</span>
          ))}
        </div>
        <p id={`${controlId}-guidance`} className="filter-guidance">
          Odd sizes only, from 3 to 15.{" "}
          {footprintGuidance[method as keyof typeof footprintGuidance]}
        </p>
      </div>
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
  const id = useId();
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
