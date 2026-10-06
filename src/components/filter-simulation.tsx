import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Play, Pause, RotateCcw, ScanLine, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { methods } from "@/lib/enhancement-methods";
import {
  clamp,
  hasWalkthrough,
  loadSimulationImage,
  simulatePixel,
  simulationCrop,
} from "@/lib/filter-simulation";
import type { SimulationImage, WalkthroughMethod } from "@/lib/filter-simulation";
import type { Method } from "@/lib/matlab-api";
import { isValidKernelSize } from "@/lib/filter-settings";

const steps: Record<WalkthroughMethod, { title: string; caption: string }[]> = {
  mean: [
    {
      title: "Find the neighborhood",
      caption:
        "The outlined center pixel will receive the result. Every pixel in this window takes part.",
    },
    {
      title: "Collect every value",
      caption:
        "Each neighbor has equal influence. These are real luminance values from your image, on a 0–255 scale.",
    },
    {
      title: "Add, then divide",
      caption: "Add all the neighborhood values and divide by the number of pixels.",
    },
    {
      title: "Replace the center",
      caption:
        "The average becomes the center pixel’s new brightness. Here only that one pixel is replaced.",
    },
  ],
  median: [
    {
      title: "Find the neighborhood",
      caption: "Choose the center pixel and collect its neighbors.",
    },
    {
      title: "Gather the values",
      caption: "Keep each value. Unlike the mean, the median does not average them.",
    },
    {
      title: "Sort by brightness",
      caption:
        "Arrange the values from darkest to lightest. The highlighted value is in the middle.",
    },
    {
      title: "Use the middle value",
      caption: "Replace the center with the median. An isolated extreme value has less influence.",
    },
  ],
  gaussian: [
    {
      title: "Build a weighted neighborhood",
      caption:
        "A Gaussian assigns larger weights near the center. All weights are normalized to sum to 1.",
    },
    {
      title: "Compare the influence",
      caption:
        "Green intensity shows each weight. Sigma controls its spread independently of kernel size.",
    },
    {
      title: "Multiply and sum",
      caption:
        "Multiply each luminance by its normalized weight. These contributions add up to the new value.",
    },
    {
      title: "Replace the center",
      caption:
        "The weighted sum becomes the center pixel’s brightness. Here only that one pixel is replaced.",
    },
  ],
  unsharp: [
    {
      title: "Start with the original",
      caption:
        "Inspect a small luminance crop from your image. The outlined pixel is the calculation’s center.",
    },
    {
      title: "Make a Gaussian blur",
      caption:
        "Blur this crop using the selected kernel and sigma, including neighbors outside the displayed crop.",
    },
    {
      title: "Extract the detail",
      caption:
        "Subtract the blur from the original. Green is positive detail; amber is negative detail. Neutral cells are near zero.",
    },
    {
      title: "Scale the detail",
      caption:
        "Multiply the detail by your selected sharpening strength. Strength 0 adds no detail.",
    },
    {
      title: "Add it back",
      caption:
        "Add the scaled detail to the original, then clip to 0–255. This shows a sharpened local luminance crop.",
    },
  ],
};
const number = (value: number) => value.toFixed(2);
const gray = (value: number) =>
  `rgb(${clamp(value, 0, 255)}, ${clamp(value, 0, 255)}, ${clamp(value, 0, 255)})`;
const signedColor = (value: number) =>
  value >= 0
    ? `rgba(176,236,147,${0.08 + 0.85 * Math.min(1, Math.abs(value) / 64)})`
    : `rgba(234,174,110,${0.08 + 0.85 * Math.min(1, Math.abs(value) / 64)})`;

type Props = {
  method: Method;
  imageUrl: string;
  kernelSize: number;
  sigma: number;
  amount: number;
  onLoadImage: () => void;
};

export function FilterSimulation({
  method,
  imageUrl,
  kernelSize,
  sigma,
  amount,
  onLoadImage,
}: Props) {
  const [open, setOpen] = useState(false);
  const valid =
    isValidKernelSize(kernelSize) &&
    Number.isFinite(sigma) &&
    sigma >= 0.3 &&
    sigma <= 3 &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 3;
  const supported = hasWalkthrough(method);
  return (
    <div className="simulation-entry">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="studio-button secondary simulate-button"
            disabled={!supported || !valid}
          >
            <ScanLine size={15} />
            Simulate steps
          </button>
        </DialogTrigger>
        <DialogContent className="filter-simulation-dialog">
          <div className="simulation-heading">
            <p className="eyebrow">THE LEARNING LAB / LOCAL ILLUSTRATION</p>
            <DialogTitle>One neighborhood. See every step.</DialogTitle>
            <DialogDescription>
              Illustrative local simulation from your image’s browser-decoded pixels, separate from
              MATLAB processing.
            </DialogDescription>
          </div>
          {!imageUrl ? (
            <div className="simulation-empty">
              <Upload size={24} />
              <h3>Load an image to explore its pixels.</h3>
              <p>The walkthrough uses your image, not invented values.</p>
              <button
                className="studio-button primary"
                onClick={() => {
                  setOpen(false);
                  onLoadImage();
                }}
              >
                Load image
              </button>
            </div>
          ) : supported && valid && open ? (
            <Walkthrough
              key={`${imageUrl}:${method}:${kernelSize}:${sigma}:${amount}`}
              method={method}
              imageUrl={imageUrl}
              kernelSize={kernelSize}
              sigma={sigma}
              amount={amount}
            />
          ) : (
            <p>No walkthrough is available for this method or these settings.</p>
          )}
        </DialogContent>
      </Dialog>
      <p>
        {!supported
          ? "Sobel’s 3×3 edge operator has no walkthrough yet."
          : !valid
            ? "Choose valid filter settings to explore the steps."
            : "Explore real pixels, one neighborhood at a time."}
      </p>
    </div>
  );
}

function Walkthrough({
  method,
  imageUrl,
  kernelSize,
  sigma,
  amount,
}: Omit<Props, "onLoadImage" | "method"> & { method: WalkthroughMethod }) {
  const [image, setImage] = useState<SimulationImage | null>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sequence = steps[method];
  useEffect(() => {
    let active = true;
    loadSimulationImage(imageUrl)
      .then((data) => {
        if (active) {
          setImage(data);
          setPosition({ x: Math.floor(data.width / 2), y: Math.floor(data.height / 2) });
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [imageUrl]);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (step < sequence.length - 1) setStep(step + 1);
      else setPlaying(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [playing, step, sequence.length]);
  const calculation = useMemo(
    () =>
      image
        ? simulatePixel(image, position.x, position.y, method, kernelSize, sigma, amount)
        : null,
    [image, position, method, kernelSize, sigma, amount],
  );
  const crop = useMemo(
    () =>
      image
        ? simulationCrop(image, position.x, position.y, method, kernelSize, sigma, amount)
        : null,
    [image, position, method, kernelSize, sigma, amount],
  );
  if (error)
    return (
      <p className="parameter-error" role="alert">
        {error}
      </p>
    );
  if (!image || !calculation || !crop) return <p role="status">Reading your image’s pixels…</p>;
  const move = (x: number, y: number) => {
    setPosition({ x: clamp(x, 0, image.width - 1), y: clamp(y, 0, image.height - 1) });
    setStep(0);
    setPlaying(false);
  };
  const last = step === sequence.length - 1;
  const radius = (kernelSize - 1) / 2;
  const atBorder =
    position.x < radius ||
    position.y < radius ||
    position.x + radius >= image.width ||
    position.y + radius >= image.height;
  const sorted = method === "median" && step >= 2;
  const cells = sorted ? calculation.ordered : calculation.samples;
  const maxWeight = Math.max(...calculation.samples.map((sample) => sample.weight));
  const name = methods.find((item) => item.id === method)!.name;
  const cropStage = method === "unsharp" ? step : 0;
  const cropValue = (pixel: (typeof crop.pixels)[number]) =>
    cropStage === 1
      ? pixel.blurred
      : cropStage === 2
        ? pixel.detail
        : cropStage === 3
          ? amount * pixel.detail
          : cropStage === 4
            ? pixel.output
            : pixel.original;
  const renderCrop = (output: boolean) => (
    <div
      className="simulation-crop-grid"
      style={{ gridTemplateColumns: `repeat(${crop.width}, 1fr)` }}
    >
      {crop.pixels.map((pixel) => {
        const center = pixel.x === position.x && pixel.y === position.y;
        const value = output
          ? method === "unsharp"
            ? cropValue(pixel)
            : center && last
              ? calculation.output
              : pixel.original
          : pixel.original;
        const signed = output && method === "unsharp" && (step === 2 || step === 3);
        return (
          <button
            type="button"
            key={`${pixel.x}:${pixel.y}`}
            className={center ? "selected-pixel" : ""}
            style={{
              background: signed ? signedColor(value) : gray(value),
              color: signed || value < 128 ? "#fff" : "#111",
            }}
            aria-label={`Select pixel ${pixel.x + 1}, ${pixel.y + 1}`}
            aria-pressed={center}
            title={`(${pixel.x + 1}, ${pixel.y + 1}) · ${number(value)}`}
            onClick={() => move(pixel.x, pixel.y)}
          >
            {value.toFixed(0)}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="simulation-workspace">
      <div className="simulation-settings">
        <span>{name}</span>
        <span>
          Kernel size: {kernelSize} × {kernelSize}
        </span>
        {(method === "gaussian" || method === "unsharp") && <span>σ {number(sigma)}</span>}
        {method === "unsharp" && <span>Strength {number(amount)}</span>}
      </div>
      <div className="simulation-layout">
        <aside className="simulation-source">
          <div className="simulation-section-label">
            <span>01 / YOUR IMAGE</span>
            <span>
              {image.width} × {image.height}
            </span>
          </div>
          <button
            type="button"
            className="simulation-image-picker"
            style={{
              width: `${(230 / image.height) * image.width}px`,
              aspectRatio: `${image.width} / ${image.height}`,
            }}
            aria-label="Choose sample pixel in image"
            onClick={(event) => {
              if (event.detail === 0) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              move(
                Math.floor(((event.clientX - bounds.left) / bounds.width) * image.width),
                Math.floor(((event.clientY - bounds.top) / bounds.height) * image.height),
              );
            }}
            onKeyDown={(event) => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const direction = directions[event.key];
              if (direction) {
                event.preventDefault();
                const [dx, dy] = direction;
                move(position.x + dx, position.y + dy);
              }
            }}
          >
            <img
              src={imageUrl}
              alt="Original image for the local simulation"
              draggable={false}
              style={{
                imageRendering: image.width < 64 && image.height < 64 ? "pixelated" : "auto",
              }}
            />
            <span
              className="simulation-crosshair"
              style={{
                left: `${((position.x + 0.5) / image.width) * 100}%`,
                top: `${((position.y + 0.5) / image.height) * 100}%`,
              }}
            />
            <span
              className="simulation-footprint"
              style={{
                left: `${(clamp(position.x - radius, 0, image.width) / image.width) * 100}%`,
                top: `${(clamp(position.y - radius, 0, image.height) / image.height) * 100}%`,
                width: `${((Math.min(image.width - 1, position.x + radius) - Math.max(0, position.x - radius) + 1) / image.width) * 100}%`,
                height: `${((Math.min(image.height - 1, position.y + radius) - Math.max(0, position.y - radius) + 1) / image.height) * 100}%`,
              }}
            />
          </button>
          <div className="simulation-coordinate-controls">
            <label>
              Column{" "}
              <input
                type="number"
                aria-label="Sample column"
                min={1}
                max={image.width}
                value={position.x + 1}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isInteger(n) && n >= 1) move(n - 1, position.y);
                }}
              />
            </label>
            <label>
              Row{" "}
              <input
                type="number"
                aria-label="Sample row"
                min={1}
                max={image.height}
                value={position.y + 1}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isInteger(n) && n >= 1) move(position.x, n - 1);
                }}
              />
            </label>
          </div>
          <p className="simulation-hint">
            Click the image or a crop pixel. Use arrow keys on the image to move one pixel.
          </p>
          <div className="simulation-crop-pair">
            <figure>
              <figcaption>Input luminance</figcaption>
              {renderCrop(false)}
            </figure>
            <figure>
              <figcaption>
                {method === "unsharp"
                  ? [
                      "Original",
                      "Gaussian blur",
                      "Detail mask",
                      "Scaled detail",
                      "Sharpened output",
                    ][step]
                  : last
                    ? "One-pixel output"
                    : "Awaiting replacement"}
              </figcaption>
              {renderCrop(true)}
            </figure>
          </div>
          <p className="simulation-border-note">
            {atBorder ? "At the border: " : "Border rule: "}repeat the nearest edge pixel, just like
            MATLAB.{" "}
            {image.width < kernelSize || image.height < kernelSize
              ? "This image is smaller than the kernel; repeated pixels fill the window."
              : "The calculation reads the full neighborhood, even beyond this small crop."}
          </p>
        </aside>
        <section className="simulation-operation">
          <div className="simulation-section-label">
            <span>02 / THE OPERATION</span>
            <span>
              Step {step + 1} of {sequence.length}
            </span>
          </div>
          <div className="simulation-step-copy" aria-live="polite">
            <h3>{sequence[step]!.title}</h3>
            <p>{sequence[step]!.caption}</p>
          </div>
          <div className="simulation-grid-label">
            <span>
              {sorted
                ? "Ordered neighborhood · darkest → lightest"
                : method === "gaussian" && step === 1
                  ? "Normalized Gaussian weights"
                  : method === "gaussian" && step === 2
                    ? "Value × normalized weight"
                    : "Neighborhood luminance · 0–255"}
            </span>
            <span>{kernelSize * kernelSize} pixels</span>
          </div>
          <div
            className={`simulation-value-grid ${sorted ? "is-sorted" : ""} ${step === 1 && (method === "mean" || method === "median") ? "is-collecting" : ""}`}
            style={{ gridTemplateColumns: `repeat(${kernelSize}, minmax(26px, 1fr))` }}
            tabIndex={0}
            role="region"
            aria-label="Neighborhood value grid"
          >
            {cells.map((cell, index) => {
              const marked = sorted
                ? index === Math.floor(cells.length / 2)
                : cell.dx === 0 && cell.dy === 0;
              const weighted = method === "gaussian" && (step === 1 || step === 2);
              const value = weighted ? (step === 1 ? cell.weight : cell.contribution) : cell.value;
              return (
                <span
                  key={cell.index}
                  className={marked ? "active-value" : ""}
                  style={{
                    background: weighted
                      ? `rgba(176,236,147,${0.08 + (0.8 * cell.weight) / maxWeight})`
                      : gray(cell.value),
                    color: weighted || cell.value < 128 ? "#fff" : "#111",
                  }}
                  title={`Luminance ${number(cell.value)}, weight ${cell.weight.toPrecision(5)}, contribution ${number(cell.contribution)}`}
                >
                  {weighted
                    ? step === 1
                      ? cell.weight.toFixed(kernelSize > 7 ? 3 : 4)
                      : number(value)
                    : cell.value.toFixed(0)}
                </span>
              );
            })}
          </div>
          <p className="simulation-grid-hint">
            Values are rounded; hover for more precision. Scroll the grid if needed.
          </p>
          <div className="simulation-calculation" data-testid="simulation-calculation">
            {step === 0 ? (
              <>
                <span>
                  Selected center · column {position.x + 1}, row {position.y + 1}
                </span>
                <strong>Input luminance = {number(calculation.original)}</strong>
                <small>{kernelSize * kernelSize} values in the full neighborhood.</small>
              </>
            ) : method === "mean" && step === 1 ? (
              <>
                <span>Add the {kernelSize * kernelSize} neighborhood values</span>
                <strong>Sum = {number(calculation.sum)}</strong>
                <small>Every value has equal influence.</small>
              </>
            ) : method === "mean" ? (
              <>
                <span>Sum ÷ pixel count</span>
                <strong>
                  {number(calculation.sum)} ÷ {kernelSize * kernelSize} ={" "}
                  {number(calculation.output)}
                </strong>
              </>
            ) : method === "median" && step === 1 ? (
              <>
                <span>Collected neighborhood</span>
                <strong>{kernelSize * kernelSize} values → sort from low to high</strong>
              </>
            ) : method === "median" ? (
              <>
                <span>Middle of {kernelSize * kernelSize} ordered values</span>
                <strong>
                  Position {(kernelSize * kernelSize + 1) / 2} → {number(calculation.output)}
                </strong>
              </>
            ) : method === "gaussian" && step === 1 ? (
              <>
                <span>Normalized Gaussian kernel</span>
                <strong>Σ weights = 1.0000</strong>
                <small>
                  Center weight ={" "}
                  {calculation.samples[Math.floor(cells.length / 2)]!.weight.toFixed(5)} · σ{" "}
                  {number(sigma)}
                </small>
              </>
            ) : method === "gaussian" ? (
              <>
                <span>Σ(value × weight), with Σ weights = 1</span>
                <strong>Weighted sum = {number(calculation.output)}</strong>
                <small>
                  σ {number(sigma)} sets the weight spread inside a {kernelSize} × {kernelSize}{" "}
                  window.
                </small>
              </>
            ) : step === 1 ? (
              <>
                <span>Gaussian weighted sum · σ {number(sigma)}</span>
                <strong>Blurred center = {number(calculation.blurred)}</strong>
              </>
            ) : step === 2 ? (
              <>
                <span>Original − blur = detail</span>
                <strong>
                  {number(calculation.original)} − {number(calculation.blurred)} ={" "}
                  {number(calculation.detail)}
                </strong>
              </>
            ) : step === 3 ? (
              <>
                <span>Strength × detail</span>
                <strong>
                  {number(amount)} × ({number(calculation.detail)}) ={" "}
                  {number(amount * calculation.detail)}
                </strong>
              </>
            ) : (
              <>
                <span>Original + strength × detail</span>
                <strong>
                  {number(calculation.original)} + {number(amount)} × ({number(calculation.detail)})
                  = {number(calculation.unclipped)}
                </strong>
                <small>After clipping to 0–255: {number(calculation.output)}</small>
              </>
            )}
          </div>
          <div className="simulation-result" data-testid="simulation-result" aria-live="polite">
            <span>{last ? "CENTER PIXEL / LOCAL OUTPUT" : "CENTER PIXEL / INPUT"}</span>
            <strong>{number(last ? calculation.output : calculation.original)}</strong>
            <span
              className="simulation-result-swatch"
              style={{ background: gray(last ? calculation.output : calculation.original) }}
            />
          </div>
        </section>
      </div>
      <div className="simulation-playback">
        <div className="simulation-step-dots" aria-label="Walkthrough steps">
          {sequence.map((item, index) => (
            <button
              type="button"
              key={item.title}
              aria-label={`Step ${index + 1}: ${item.title}`}
              aria-current={step === index ? "step" : undefined}
              onClick={() => {
                setStep(index);
                setPlaying(false);
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="simulation-playback-buttons">
          <button
            type="button"
            className="icon-button"
            aria-label="Replay simulation"
            onClick={() => {
              setStep(0);
              setPlaying(false);
            }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="studio-button secondary"
            disabled={step === 0}
            onClick={() => {
              setStep(step - 1);
              setPlaying(false);
            }}
          >
            <ArrowLeft size={14} />
            Previous
          </button>
          <button
            type="button"
            className="studio-button secondary"
            aria-label={playing ? "Pause simulation" : "Play simulation"}
            onClick={() => {
              if (last) setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="studio-button primary"
            disabled={last}
            onClick={() => {
              setStep(step + 1);
              setPlaying(false);
            }}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <p className="simulation-disclaimer">
        Browser-decoded 8-bit BT.601 luminance (0–255); displayed numbers are rounded. This is a
        local teaching illustration, not MATLAB intermediate data or a full-image result. MATLAB
        retains RGB chrominance, clips channels, and restores native precision. Transparency and
        decoding can affect these example values.
      </p>
    </div>
  );
}
