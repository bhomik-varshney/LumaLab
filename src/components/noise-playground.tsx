import { ChoiceGroup } from "./choice-group";
import type { SequenceRecommendation } from "@/lib/learning-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { addNoise, enhanceImage } from "@/lib/matlab-api";
import type {
  Health,
  Method,
  NoiseSettings,
  ProcessingOptions,
  ProcessingResult,
} from "@/lib/matlab-api";
import { FilterControls } from "./filter-controls";
import { Histogram } from "./histogram";
import { LearningAssistant } from "./learning-assistant";
import { measuredContext } from "@/lib/learning-context";
import { describeOperation, methods } from "@/lib/enhancement-methods";
import { isValidKernelSize } from "@/lib/filter-settings";
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
export function NoisePlayground({
  clean,
  fileName,
  health,
  onUpload,
  onNoiseChange,
  onAccept,
  sequenceLength = 0,
}: {
  clean: ProcessingResult | null;
  fileName: string;
  health: Health;
  onUpload: () => void;
  onNoiseChange?: (value: ProcessingResult | null) => void;
  onAccept?: (
    recommendation: SequenceRecommendation,
    mode: "append" | "replace",
    noisy: ProcessingResult | null,
  ) => string | null;
  sequenceLength?: number;
}) {
  const [type, setType] = useState<NoiseSettings["type"]>("salt-pepper");
  const [density, setDensity] = useState(5);
  const [standardDeviation, setStandardDeviation] = useState(0.05);
  const [seed, setSeed] = useState(42);
  const [noisy, setNoisy] = useState<ProcessingResult | null>(null);
  const [filtered, setFiltered] = useState<ProcessingResult | null>(null);
  const [method, setMethod] = useState<Method>("median");
  const [kernelSize, setKernelSize] = useState(3);
  const [sigmaValue, setSigmaValue] = useState("1");
  const [amountValue, setAmountValue] = useState("1");
  const [busy, setBusy] = useState<"noise" | "filter" | null>(null);
  const [error, setError] = useState("");
  const [comparison, setComparison] = useState<"clean" | "noisy">("noisy");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const noise = useMemo<NoiseSettings>(
    () =>
      type === "salt-pepper"
        ? { type, density: density / 100, seed }
        : { type, standardDeviation, seed },
    [type, density, standardDeviation, seed],
  );
  const sigma = sigmaValue.trim() ? Number(sigmaValue) : NaN;
  const amount = amountValue.trim() ? Number(amountValue) : NaN;
  const options = useMemo<ProcessingOptions>(
    () => ({
      category: "spatial",
      method,
      parameters:
        method === "mean" || method === "median"
          ? { kernelSize }
          : method === "gaussian"
            ? { kernelSize, sigma }
            : { kernelSize, sigma, amount },
    }),
    [method, kernelSize, sigma, amount],
  );
  const invalid =
    !isValidKernelSize(kernelSize) ||
    (["gaussian", "unsharp"].includes(method) &&
      (!Number.isFinite(sigma) || sigma < 0.3 || sigma > 3)) ||
    (method === "unsharp" && (!Number.isFinite(amount) || amount < 0 || amount > 3));
  const ready = !!clean && health.status === "ready";
  const currentNoise =
    !!noisy &&
    !!noisy.noise &&
    noisy.noise.type === noise.type &&
    noisy.noise.seed === noise.seed &&
    (noise.type === "salt-pepper"
      ? noisy.noise.type === "salt-pepper" && noisy.noise.density === noise.density
      : noisy.noise.type === "gaussian" &&
        noisy.noise.standardDeviation === noise.standardDeviation);
  const currentFilter =
    !error &&
    !!filtered &&
    !!noisy &&
    filtered.imageId === noisy.noisyImageId &&
    filtered.method === method &&
    Object.entries(options.parameters).every(
      ([key, value]) => filtered.parameters[key as keyof typeof filtered.parameters] === value,
    ) &&
    !invalid;
  const generate = async (regenerate: boolean) => {
    if (!clean || !ready || request.current) return;
    const nextSeed = regenerate ? newSeed() : seed;
    setSeed(nextSeed);
    setError("");
    setBusy("noise");
    const controller = new AbortController();
    request.current = controller;
    try {
      const output = await addNoise(clean.imageId, { ...noise, seed: nextSeed }, controller.signal);
      if (!controller.signal.aborted) {
        setNoisy(output);
        onNoiseChange?.(output);
        setFiltered(null);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(null);
      }
    }
  };
  const apply = async () => {
    if (!noisy?.noisyImageId || !currentNoise || !ready || invalid || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy("filter");
    try {
      const output = await enhanceImage(noisy.noisyImageId, options, controller.signal);
      if (!controller.signal.aborted) setFiltered(output);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(null);
      }
    }
  };
  const save = (value: ProcessingResult, suffix: string) => {
    const link = document.createElement("a");
    link.href = value.url;
    link.download = `${fileName.replace(/\.[^.]+$/, "")}-${suffix}.png`;
    link.click();
  };
  const before = comparison === "clean" || !noisy ? clean?.originalUrl : noisy.url;
  const beforeInfo = comparison === "clean" || !noisy ? clean?.original : noisy.enhanced;
  const beforeHistogram =
    comparison === "clean" || !noisy ? clean?.histograms.original : noisy.histograms.enhanced;
  const after = filtered?.url ?? noisy?.url;
  const afterInfo = filtered?.enhanced ?? noisy?.enhanced;
  const afterHistogram = filtered?.histograms.enhanced ?? noisy?.histograms.enhanced;
  const beforeLabel = comparison === "clean" || !noisy ? "Clean original" : "Noisy input";
  const afterLabel = filtered
    ? currentNoise && currentFilter
      ? "Filtered result"
      : "Previous filtered result"
    : noisy
      ? currentNoise
        ? "Noisy image"
        : "Previous noisy image"
      : "Awaiting noise";
  return (
    <section aria-label="Noise Playground experiment">
      <p className="noise-intro">
        Clean original → Add noise → Apply a filter. Each noise realization starts from the clean
        original. Saved studio sequences stay separate.
      </p>
      {error && (
        <div className="studio-alert" role="alert">
          {error} Retry Add noise or Apply filter when MATLAB is ready.
        </div>
      )}
      <div className="studio-grid noise-grid">
        <div className="inspect-column">
          <div className="preview-card">
            <div className="preview-toolbar">
              <span className="noise-file">
                {fileName || "No image selected"}
                {clean && (
                  <small>
                    {clean.original.width} × {clean.original.height} px
                  </small>
                )}
              </span>
              <div className="segmented" role="group" aria-label="Noise comparison source">
                <button
                  aria-pressed={comparison === "clean"}
                  onClick={() => setComparison("clean")}
                >
                  Clean original
                </button>
                <button
                  aria-pressed={comparison === "noisy"}
                  disabled={!noisy}
                  onClick={() => setComparison("noisy")}
                >
                  Noisy input
                </button>
              </div>
            </div>
            <div className="comparison-stage checkerboard noise-comparison">
              {clean ? (
                <div className="side-by-side">
                  <div className="side-image">
                    <img className="comparison-image" src={before} alt={beforeLabel} />
                    <span className="image-label original-label">{beforeLabel}</span>
                  </div>
                  <div className="side-image">
                    {after ? (
                      <img className="comparison-image" src={after} alt={afterLabel} />
                    ) : (
                      <p className="noise-placeholder">Add noise to begin the experiment.</p>
                    )}
                    <span className="image-label original-label">{afterLabel}</span>
                  </div>
                </div>
              ) : (
                <div className="empty-stage">
                  <h2>Start with a clean image.</h2>
                  <p>
                    {health.status === "ready"
                      ? "Upload an image or wait for MATLAB to read the sample."
                      : health.detail}
                  </p>
                  <button className="studio-button primary" onClick={onUpload}>
                    Choose image
                  </button>
                </div>
              )}
            </div>
            <div className="preview-caption" role="status">
              <span>
                {busy
                  ? `MATLAB ${busy === "noise" ? "generating noise" : "filtering noisy input"}…`
                  : noisy
                    ? `${afterLabel} · MATLAB`
                    : "Clean original preserved"}
              </span>
              <span>{noisy?.noise ? `Seed ${noisy.noise.seed}` : "Seed 42 by default"}</span>
            </div>
          </div>
          <div className="analysis-grid">
            <section className="analysis-card">
              <div className="card-heading">
                <h2>Tone distribution</h2>
                <span className="eyebrow">LUMINANCE</span>
              </div>
              <Histogram
                original={beforeHistogram ?? []}
                enhanced={afterHistogram ?? []}
                label={`${beforeLabel} and ${afterLabel} luminance histogram`}
              />
              <div className="chart-legend">
                <span>
                  <i className="original-swatch" />
                  {beforeLabel}
                </span>
                <span>
                  <i className="enhanced-swatch" />
                  {afterLabel}
                </span>
              </div>
            </section>
            <section className="analysis-card">
              <div className="card-heading">
                <h2>Image statistics</h2>
                <span className="small-tag">MATLAB</span>
              </div>
              <p className="card-description">Actual displayed pixels · brightness 0–255</p>
              <table className="statistics-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>{beforeLabel}</th>
                    <th>{afterLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Mean brightness</th>
                    <td>{beforeInfo?.mean.toFixed(1) ?? "—"}</td>
                    <td>{afterInfo?.mean.toFixed(1) ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Contrast (σ)</th>
                    <td>{beforeInfo?.deviation.toFixed(1) ?? "—"}</td>
                    <td>{afterInfo?.deviation.toFixed(1) ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="statistics-note">
                Standard deviation measures spread, not restoration quality.
              </p>
            </section>
          </div>
        </div>
        <aside className="adjustments-panel" aria-label="Noise experiment controls">
          <div className="panel-heading">
            <h2>Noise Playground</h2>
            <span className="eyebrow">EXPERIMENT</span>
          </div>
          <section className="parameter-section">
            <h3 className="step-heading">
              <span>01</span>Add controlled noise
            </h3>
            <p className="choice-label">Noise type</p>
            <ChoiceGroup
              label="Noise type"
              value={type}
              disabled={!!busy}
              choices={[
                { value: "salt-pepper", label: "Salt & pepper" },
                { value: "gaussian", label: "Gaussian" },
              ]}
              onChange={(value) => setType(value as NoiseSettings["type"])}
            />
            <div className="control-label">
              <label htmlFor="noise-strength">
                {type === "salt-pepper" ? "Noise density" : "Standard deviation (σ)"}
              </label>
              <output>
                {type === "salt-pepper" ? `${density}%` : standardDeviation.toFixed(3)}
              </output>
            </div>
            <input
              id="noise-strength"
              className="parameter-slider"
              type="range"
              min={0}
              max={type === "salt-pepper" ? 30 : 0.2}
              step={type === "salt-pepper" ? 1 : 0.005}
              value={type === "salt-pepper" ? density : standardDeviation}
              disabled={!!busy}
              onChange={(event) =>
                type === "salt-pepper"
                  ? setDensity(Number(event.target.value))
                  : setStandardDeviation(Number(event.target.value))
              }
            />
            <p className="filter-guidance">
              {type === "salt-pepper"
                ? "0–30% probability per pixel, split evenly between black and white."
                : "σ on normalized 0–1 intensity. For example, 0.05 ≈ 12.8 levels on an 8-bit scale. Values are clipped to the image range."}
            </p>
            <div className="noise-actions">
              <button
                className="studio-button primary"
                disabled={!ready || !!busy}
                onClick={() => void generate(false)}
              >
                Add noise
              </button>
              <button
                className="studio-button secondary"
                disabled={!ready || !!busy || !noisy}
                onClick={() => void generate(true)}
              >
                Regenerate
              </button>
            </div>
            <p className="filter-guidance">
              Add noise reuses seed {seed}; Regenerate chooses a new seed. RGB channels share each
              pixel’s noise sample.
            </p>
            {noisy && !currentNoise && (
              <p role="status" className="filter-guidance">
                Noise settings changed. Add noise to update before filtering.
              </p>
            )}
          </section>
          <section className="parameter-section">
            <h3 className="step-heading">
              <span>02</span>Filter the noisy input
            </h3>
            <p className="choice-label">Selected filter</p>
            <ChoiceGroup
              label="Selected filter"
              value={method}
              disabled={!!busy}
              className="noise-filter-choices"
              choices={methods
                .filter((item) => ["mean", "gaussian", "median", "unsharp"].includes(item.id))
                .map((item) => ({ value: item.id, label: item.short, accessibleLabel: item.name }))}
              onChange={(value) => setMethod(value as Method)}
            />
            <FilterControls
              method={method}
              kernelSize={kernelSize}
              sigmaValue={sigmaValue}
              amountValue={amountValue}
              disabled={!!busy}
              setKernelSize={setKernelSize}
              setSigmaValue={setSigmaValue}
              setAmountValue={setAmountValue}
            />
            {invalid && (
              <p role="alert" className="parameter-error">
                Choose valid filter settings.
              </p>
            )}
            <button
              className="studio-button primary"
              disabled={!ready || !currentNoise || !!busy || invalid}
              onClick={() => void apply()}
            >
              Apply filter
            </button>
            <p className="filter-guidance">
              Each filter starts from the same noisy input.{" "}
              {filtered
                ? `Displayed filter: ${describeOperation({ method: filtered.method as Method, parameters: filtered.parameters })}.`
                : "Generate noise first."}
            </p>
          </section>
          <details className="learning-notes">
            <summary>What to observe</summary>
            <div>
              <p>
                {type === "salt-pepper"
                  ? "Median often suppresses isolated black or white impulses. Compare it with mean filtering: averaging can spread impulses into neighboring pixels."
                  : "Mean and Gaussian filters smooth intensity fluctuations, often softening edges too. Unsharp may amplify noise."}
              </p>
              <p>
                Compare against the clean original. Histogram spread alone does not measure how well
                the original was recovered.
              </p>
              <p>
                Filters process RGB luminance, retain chrominance before clipping, and repeat
                boundary pixels.
              </p>
            </div>
          </details>
          <div className="noise-actions noise-export">
            <button
              className="studio-button secondary"
              disabled={!noisy || !currentNoise || !!busy || !ready}
              onClick={() =>
                noisy && save(noisy, `noisy-${noisy.noise?.type}-seed-${noisy.noise?.seed}`)
              }
            >
              Save noisy image
            </button>
            <button
              className="studio-button primary"
              disabled={!filtered || !currentNoise || !currentFilter || !!busy || !ready}
              onClick={() =>
                filtered &&
                save(filtered, `noise-filtered-${filtered.method}-seed-${noisy?.noise?.seed}`)
              }
            >
              Save filtered image
            </button>
          </div>
          <div className="panel-footer">
            <button
              className="studio-button secondary"
              disabled={!!busy}
              onClick={() => {
                setNoisy(null);
                onNoiseChange?.(null);
                setFiltered(null);
                setError("");
                setSeed(42);
                setType("salt-pepper");
                setDensity(5);
                setStandardDeviation(0.05);
                setComparison("clean");
              }}
            >
              Reset playground
            </button>
            <span>Restore clean view.</span>
          </div>
        </aside>
      </div>
      <LearningAssistant
        sourceKey={`${clean?.imageId ?? "empty"}:${noisy?.noisyImageId ?? "none"}`}
        sourceLabel={`${fileName}${noisy?.noise ? ` · ${noisy.noise.type === "salt-pepper" ? `salt-and-pepper ${noisy.noise.density * 100}%` : `Gaussian σ ${noisy.noise.standardDeviation}`} · seed ${noisy.noise.seed}` : " · clean original"}`}
        sequenceLength={sequenceLength}
        acceptDisabled={!!busy || !ready}
        {...(onAccept
          ? {
              onAccept: (recommendation: SequenceRecommendation, mode: "append" | "replace") =>
                onAccept(recommendation, mode, noisy),
            }
          : {})}
        context={{
          mode: "noise",
          status: !clean
            ? "empty"
            : busy
              ? "processing"
              : error
                ? "error"
                : noisy && currentNoise && (!filtered || currentFilter)
                  ? "ready"
                  : noisy
                    ? "stale"
                    : "empty",
          selected: invalid ? null : options,
          sequence: [],
          resultSequence: [],
          resultOperation: filtered
            ? {
                category: "spatial",
                method: filtered.method as Method,
                parameters: filtered.parameters,
              }
            : null,
          noise: noisy?.noise ?? null,
          selectedNoise: noise,
          measurements: {
            ...(clean ? { clean: measuredContext(clean.original, clean.histograms.original) } : {}),
            ...(noisy ? { noisy: measuredContext(noisy.enhanced, noisy.histograms.enhanced) } : {}),
            ...(filtered
              ? { filtered: measuredContext(filtered.enhanced, filtered.histograms.enhanced) }
              : {}),
          },
        }}
      />
    </section>
  );
}
