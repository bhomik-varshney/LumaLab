import { createFileRoute } from "@tanstack/react-router";
import {
  Aperture,
  ArrowDownToLine,
  ArrowLeftRight,
  Check,
  ChevronDown,
  CircleHelp,
  FileImage,
  ImagePlus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import sampleImage from "@/assets/lumalab-sample.jpg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { checkMatlab, uploadImage, enhanceImage } from "@/lib/matlab-api";
import type { Health, Method, ProcessingResult } from "@/lib/matlab-api";
type ViewMode = "split" | "side-by-side";

const methods: { id: Method; name: string; short: string }[] = [
  { id: "gamma", name: "Gamma correction", short: "Gamma" },
  { id: "equalize", name: "Histogram equalization", short: "Equalize" },
  { id: "stretch", name: "Contrast stretching", short: "Stretch" },
];
const presets = [
  { label: "Brighten", value: 0.6 },
  { label: "Neutral", value: 1 },
  { label: "Darken", value: 1.8 },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LumaLab — Image Enhancement Studio" },
      {
        name: "description",
        content:
          "An interactive image enhancement laboratory for exploring gamma correction, histogram equalization, and contrast stretching.",
      },
      { property: "og:title", content: "LumaLab — Image Enhancement Studio" },
      {
        property: "og:description",
        content:
          "Explore image enhancement with MATLAB processing, live histograms, and a hands-on comparison workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LumaLab,
});

function histogramPath(bins: number[], peak: number) {
  return bins
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${(index / (bins.length - 1)) * 240},${84 - (value / peak) * 78}`,
    )
    .join(" ");
}

function LumaLab() {
  const [imageUrl, setImageUrl] = useState(sampleImage);
  const [fileName, setFileName] = useState("alpine-dawn-demo.jpg");
  const [isDemo, setIsDemo] = useState(true);
  const [gamma, setGamma] = useState(1);
  const [method, setMethod] = useState<Method>("gamma");
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageFile, setImageFile] = useState<Blob | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health>({
    status: "starting",
    detail: "Checking MATLAB bridge…",
  });
  const [retry, setRetry] = useState(0);
  const neutralResult = useRef<ProcessingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const next = await checkMatlab();
        if (active) setHealth(next);
      } catch (error) {
        if (active) setHealth({ status: "offline", detail: (error as Error).message });
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(sampleImage, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the sample image.");
        return response.blob();
      })
      .then((blob) => setImageFile((current) => current ?? blob))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setErrorMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    setImageId(null);
    setResult(null);
    neutralResult.current = null;
    if (!imageFile || health.status !== "ready") {
      setIsProcessing(false);
      return;
    }
    const controller = new AbortController();
    setIsProcessing(true);
    setErrorMessage("");
    uploadImage(imageFile, controller.signal)
      .then((output) => {
        if (controller.signal.aborted) return;
        neutralResult.current = output;
        setResult(output);
        setImageId(output.imageId);
        setIsProcessing(false);
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error.message);
        setIsProcessing(false);
      });
    return () => controller.abort();
  }, [imageFile, health.status, retry]);

  useEffect(() => {
    if (!imageId || health.status !== "ready") return;
    const controller = new AbortController();
    setErrorMessage("");
    if (method === "gamma" && gamma === 1 && neutralResult.current) {
      setResult(neutralResult.current);
      setIsProcessing(false);
      return () => controller.abort();
    }
    setResult(null);
    setIsProcessing(true);
    const timer = setTimeout(() => {
      enhanceImage(imageId, method, gamma, controller.signal)
        .then((output) => {
          if (!controller.signal.aborted) {
            setResult(output);
            setIsProcessing(false);
          }
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) {
            setErrorMessage(error.message);
            setIsProcessing(false);
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [imageId, method, gamma, health.status]);

  const histograms = result?.histograms ?? { original: [], enhanced: [] };
  const histogramPeak = Math.max(...histograms.original, ...histograms.enhanced, 1);
  const hasCurrentResult =
    !!result && result.method === method && (method !== "gamma" || result.gamma === gamma);
  const statusText =
    health.status === "ready"
      ? "MATLAB connected"
      : health.status === "starting"
        ? "MATLAB starting…"
        : "MATLAB unavailable";

  const openFile = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setErrorMessage("That format is not supported. Choose a PNG, JPG, or JPEG image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Image is too large. Choose a file under 10 MB and 16 million pixels.");
      return;
    }
    setImageId(null);
    setResult(null);
    neutralResult.current = null;
    setImageFile(file);
    setFileName(file.name);
    setIsDemo(false);
    setErrorMessage("");
    setGamma(1);
    setMethod("gamma");
    setZoom(100);
  };

  const resetImage = () => {
    setGamma(1);
    setMethod("gamma");
    setSplit(50);
    setZoom(100);
  };

  const selectedMethod = methods.find((item) => item.id === method)?.name ?? "Gamma correction";
  const explanation = useMemo(() => {
    if (method === "gamma") {
      if (gamma < 1) return "Midtone pixels are brightened; shadow detail becomes easier to see.";
      if (gamma > 1) return "Midtone pixels are darkened; highlights stay more visible.";
      return "At γ = 1, each normalized input intensity maps to itself.";
    }
    if (method === "equalize")
      return "The cumulative luminance histogram redistributes tones for greater global contrast.";
    return "The darkest and brightest luminance values are mapped across the full display range.";
  }, [gamma, method]);

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)));
  };

  const imageCompare = (enhanced: boolean) => (
    <img
      src={
        enhanced
          ? hasCurrentResult
            ? result?.url
            : imageUrl
          : (neutralResult.current?.originalUrl ?? imageUrl)
      }
      alt={enhanced ? "Enhanced image preview" : "Original image preview"}
      className="absolute inset-0 m-auto h-full w-full select-none object-contain transition-[filter] duration-200"
      draggable={false}
    />
  );

  return (
    <main className="lab-shell">
      <header className="topbar grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center border border-lab/40 text-lab">
            <Aperture size={19} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex items-baseline gap-3">
            <span className="font-display text-2xl leading-none text-foreground">LumaLab</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:block">
              Image Enhancement Studio
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <span className="hidden items-center gap-2 text-[10px] font-semibold tracking-[0.13em] text-muted-foreground md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-lab-dim" />
            LOCAL WORKSPACE
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-border bg-transparent text-foreground hover:bg-accent"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={15} />
            New image
          </Button>
          <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                aria-label="About LumaLab"
                title="About LumaLab"
              >
                <CircleHelp size={17} />
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-popover text-foreground sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">About this lab</DialogTitle>
                <DialogDescription className="pt-2 leading-6">
                  LumaLab is an interactive teaching workspace for exploring how intensity
                  transforms change an image and its luminance distribution.
                </DialogDescription>
              </DialogHeader>
              <div className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
                Images are sent to a local service and processed by MATLAB. The algorithms also work
                without Image Processing Toolbox. Uploaded originals remain unchanged. Histograms
                and statistics use all grayscale or BT.601 luminance pixels, excluding alpha.
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="control-column bg-panel px-5 py-6 sm:px-6">
          <SectionTitle number="01" title="Image" />
          <button
            type="button"
            className="drop-target mt-4 flex w-full flex-col items-center justify-center gap-2 border border-dashed border-border px-3 py-5 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-dragging={isDropActive}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDropActive(false);
              openFile(event.dataTransfer.files[0]);
            }}
          >
            <Upload className="text-muted-foreground" size={18} strokeWidth={1.5} />
            <span className="text-xs font-medium">
              Drop an image, or <span className="text-lab">browse</span>
            </span>
            <span className="text-[10px] text-muted-foreground">PNG · JPG · JPEG · Max 10 MB</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,.jpg,.jpeg"
            className="sr-only"
            onChange={(event) => {
              openFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <div className="mt-4 flex min-w-0 items-center gap-2">
            <FileImage size={15} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={fileName}>
              {fileName}
            </span>
            {isDemo && (
              <span className="shrink-0 text-[9px] tracking-wider text-lab-dim">DEMO</span>
            )}
            {!isDemo && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                title="Replace image"
                aria-label="Replace image"
              >
                <RotateCcw size={14} />
              </Button>
            )}
          </div>
          {result && (
            <p className="mt-1 pl-[22px] text-[10px] text-muted-foreground">
              {result.original.width} × {result.original.height} px
            </p>
          )}

          <div className="my-6 border-t border-border" />
          <SectionTitle number="02" title="Enhancement" />
          <div className="mt-4 flex flex-col gap-1" role="group" aria-label="Enhancement method">
            {methods.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className={`h-9 w-full justify-between rounded-sm px-2.5 text-xs ${method === item.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMethod(item.id)}
                aria-pressed={method === item.id}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${method === item.id ? "bg-lab" : "bg-transparent"}`}
                  />
                  {item.name}
                </span>
                {method === item.id && <Check size={13} className="text-lab" />}
              </Button>
            ))}
          </div>

          <div className="my-5 border-t border-border" />
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="gamma" className="text-xs font-medium text-foreground">
              Gamma value
            </label>
            <span className="font-mono text-sm tabular-nums text-lab" aria-live="polite">
              γ {gamma.toFixed(2)}
            </span>
          </div>
          <input
            id="gamma"
            aria-label="Gamma value"
            type="range"
            min="0.2"
            max="3"
            step="0.05"
            value={gamma}
            disabled={method !== "gamma"}
            onChange={(event) => setGamma(Number(event.target.value))}
            className="range-control mt-4 h-1 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-35"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>0.20</span>
            <span>3.00</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setMethod("gamma");
                  setGamma(preset.value);
                }}
                className={`h-8 border-border bg-transparent px-1 text-[10px] font-normal ${method === "gamma" && gamma === preset.value ? "border-lab/55 text-lab" : "text-muted-foreground hover:text-foreground"}`}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {method === "gamma" && (
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Below 1 brightens midtones; above 1 darkens them.
            </p>
          )}

          <details className="group mt-5 border-t border-border pt-3">
            <summary className="flex cursor-pointer items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground">
              <span className="flex items-center gap-2">
                <Sparkles size={13} />
                Transformation notes
              </span>
              <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2 pb-2 text-[11px] leading-5 text-muted-foreground">
              {method === "gamma" ? (
                <>
                  <p>
                    Input intensity <i>r</i> is normalized to [0, 1]. The transform applies{" "}
                    <span className="font-mono text-foreground">
                      s = r<sup>γ</sup>
                    </span>
                    , then scales the output back to its display range.
                  </p>
                  <p>Values below 1 brighten midtones; values above 1 darken them.</p>
                </>
              ) : method === "equalize" ? (
                <p>
                  MATLAB equalizes the 256-bin cumulative histogram. RGB adjusts BT.601 luminance
                  while preserving chrominance before clipping; saturated colors can be affected.
                </p>
              ) : (
                <p>
                  Contrast stretching maps the observed darkest and brightest luminance values to
                  the full output range of 0–255.
                </p>
              )}
              <p className="border-t border-border pt-2 text-[10px]">
                MATLAB processes the full-resolution image. Histograms use 256 luminance bins;
                statistics use a 0–255 scale and population standard deviation.
              </p>
            </div>
          </details>

          <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
            <span
              className={`h-1.5 w-1.5 rounded-full ${health.status === "ready" ? "bg-lab" : "bg-muted-foreground"}`}
            />
            <span className="text-[10px] text-muted-foreground" role="status">
              {statusText}
            </span>
          </div>
          {health.status !== "ready" && (
            <p role="status" className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {health.detail}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-[10px] text-muted-foreground"
            onClick={() => setRetry((value) => value + 1)}
            disabled={health.status !== "ready" || isProcessing}
          >
            Retry processing
          </Button>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={resetImage}
              className="h-9 border-border bg-transparent text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={13} />
              Reset
            </Button>
            <Button
              onClick={() => {
                if (result) {
                  const link = document.createElement("a");
                  link.href = result.url;
                  link.download = `${fileName.replace(/\.[^.]+$/, "")}-enhanced.png`;
                  link.click();
                }
              }}
              disabled={!hasCurrentResult || isProcessing || health.status !== "ready"}
              className="h-9 bg-lab text-xs text-primary-foreground hover:bg-lab/90"
            >
              <ArrowDownToLine size={14} />
              Save image
            </Button>
          </div>
        </aside>

        <section className="image-column min-w-0 px-4 py-5 sm:px-7 sm:py-7">
          <div className="mb-5 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                IMAGE WORKSPACE <span className="px-1.5 text-border">/</span>{" "}
                <span className="text-lab-dim">{selectedMethod.toUpperCase()}</span>
              </p>
              <h1 className="mt-1 truncate font-display text-2xl text-foreground sm:text-3xl">
                Compare &amp; explore
              </h1>
            </div>
            <div
              className="flex shrink-0 items-center gap-1 border border-border p-1"
              role="group"
              aria-label="Comparison layout"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("split")}
                aria-pressed={viewMode === "split"}
                className={`h-7 gap-1.5 rounded-none px-2 text-[10px] ${viewMode === "split" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
              >
                <ArrowLeftRight size={13} />
                Split
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("side-by-side")}
                aria-pressed={viewMode === "side-by-side"}
                className={`h-7 rounded-none px-2 text-[10px] ${viewMode === "side-by-side" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
              >
                Side by side
              </Button>
            </div>
          </div>

          <div
            className="stage-frame checkerboard relative flex items-center justify-center overflow-hidden border border-border"
            ref={stageRef}
            onPointerMove={handleStagePointerMove}
            onPointerUp={() => setIsDragging(false)}
            onPointerLeave={() => setIsDragging(false)}
          >
            {imageUrl ? (
              <>
                {viewMode === "split" ? (
                  <div
                    className="relative h-full min-h-[inherit] w-full overflow-hidden"
                    style={{ minHeight: "inherit" }}
                  >
                    <div className="absolute inset-0" style={{ transform: `scale(${zoom / 100})` }}>
                      {imageCompare(true)}
                    </div>
                    <div
                      className="absolute inset-0"
                      style={{
                        clipPath: `inset(0 ${100 - split}% 0 0)`,
                        transform: `scale(${zoom / 100})`,
                      }}
                    >
                      {imageCompare(false)}
                    </div>
                    <span className="absolute left-3 top-3 z-10 border border-border/70 bg-background/90 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] text-foreground">
                      ORIGINAL
                    </span>
                    <span className="absolute right-3 top-3 z-10 border border-border/70 bg-background/90 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] text-foreground">
                      ENHANCED
                    </span>
                    <div
                      className="absolute bottom-0 top-0 z-20 w-px cursor-ew-resize bg-lab"
                      style={{ left: `${split}%` }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setIsDragging(true);
                      }}
                      role="separator"
                      aria-label="Drag to compare original and enhanced image"
                      aria-orientation="vertical"
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 z-20 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-lab/80 bg-background text-lab shadow-sm"
                      style={{ left: `${split}%` }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setIsDragging(true);
                      }}
                      aria-label="Drag image comparison divider"
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="grid h-full min-h-[inherit] w-full grid-cols-2 gap-px bg-border">
                    {[
                      { label: "ORIGINAL", enhanced: false },
                      { label: "ENHANCED", enhanced: true },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="checkerboard relative flex min-w-0 items-center justify-center overflow-hidden"
                      >
                        <div
                          className="absolute inset-0"
                          style={{ transform: `scale(${zoom / 100})` }}
                        >
                          {imageCompare(item.enhanced)}
                        </div>
                        <span className="absolute left-2 top-2 z-10 border border-border/70 bg-background/90 px-1.5 py-1 text-[8px] font-semibold tracking-[0.1em] text-foreground sm:left-3 sm:top-3 sm:px-2 sm:text-[9px]">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center">
                <FileImage size={33} strokeWidth={1} className="mb-5 text-muted-foreground" />
                <h2 className="font-display text-2xl text-foreground">
                  Bring an image into the lab
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Explore how intensity transformations change brightness, contrast, and pixel
                  distributions.
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 bg-lab text-primary-foreground hover:bg-lab/90"
                >
                  <Upload size={15} />
                  Choose image
                </Button>
                <p className="mt-4 text-[10px] text-muted-foreground">PNG · JPG · JPEG</p>
              </div>
            )}
            {isProcessing && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-background/65">
                <div className="flex items-center gap-2 border border-border bg-panel px-4 py-3 text-xs text-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-lab" />
                  Processing in MATLAB…
                </div>
              </div>
            )}
            {errorMessage && (
              <div
                role="alert"
                className="absolute bottom-3 left-3 right-3 z-40 flex items-center justify-between gap-3 border border-destructive/40 bg-background px-3 py-2 text-xs text-foreground"
              >
                <span>{errorMessage}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  onClick={() => setErrorMessage("")}
                  aria-label="Dismiss message"
                >
                  <X size={13} />
                </Button>
              </div>
            )}
          </div>

          {viewMode === "split" && (
            <div className="mt-4 flex items-center gap-3">
              <span className="w-12 shrink-0 text-[9px] font-semibold tracking-wider text-muted-foreground">
                BEFORE
              </span>
              <input
                aria-label="Image comparison divider"
                type="range"
                min="0"
                max="100"
                value={split}
                onChange={(event) => setSplit(Number(event.target.value))}
                className="range-control h-1 min-w-0 flex-1 cursor-ew-resize"
              />
              <span className="w-12 shrink-0 text-right text-[9px] font-semibold tracking-wider text-muted-foreground">
                AFTER
              </span>
              <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setZoom((value) => Math.max(50, value - 10))}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <Minus size={13} />
                </Button>
                <span className="w-10 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setZoom((value) => Math.min(150, value + 10))}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <Plus size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setZoom(100)}
                  aria-label="Fit image to view"
                  title="Fit to view"
                >
                  <Maximize2 size={12} />
                </Button>
              </div>
            </div>
          )}
          {viewMode === "side-by-side" && (
            <div className="mt-4 flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setZoom((value) => Math.max(50, value - 10))}
                aria-label="Zoom out"
              >
                <Minus size={13} />
              </Button>
              <span className="w-10 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                {zoom}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setZoom((value) => Math.min(150, value + 10))}
                aria-label="Zoom in"
              >
                <Plus size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setZoom(100)}
                aria-label="Fit image to view"
              >
                <Maximize2 size={12} />
              </Button>
            </div>
          )}
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border pt-4 sm:flex sm:justify-between">
            <p className="min-w-0 text-[11px] leading-5 text-muted-foreground">
              <span className="mr-2 text-lab">●</span>
              {explanation}
            </p>
            <span className="shrink-0 text-[9px] tracking-wider text-muted-foreground">
              {hasCurrentResult ? "MATLAB PROCESSED" : "ORIGINAL PREVIEW"}
            </span>
          </div>
        </section>

        <aside className="analysis-column bg-panel px-5 py-6 sm:px-6">
          <div className="analysis-inner">
            <div>
              <SectionTitle number="03" title="Tone analysis" />
              <div className="mt-5 flex items-center justify-between gap-2">
                <h2 className="text-xs font-medium text-foreground">Luminance histogram</h2>
                <span className="text-[9px] text-muted-foreground">
                  {hasCurrentResult ? "MATLAB DATA" : "AWAITING MATLAB"}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Pixel distribution · 0–255</p>
              <div
                className="mt-4"
                aria-label="Luminance histogram comparing original and enhanced pixels"
              >
                <svg
                  viewBox="0 0 240 104"
                  className="block w-full overflow-visible"
                  role="img"
                  aria-label="Original and enhanced luminance histogram"
                >
                  {[12, 34, 56, 78].map((y) => (
                    <line key={y} x1="0" x2="240" y1={y} y2={y} className="histogram-grid" />
                  ))}
                  <path
                    d={histogramPath(histograms.original, histogramPeak)}
                    className="histogram-original"
                  />
                  <path
                    d={histogramPath(histograms.enhanced, histogramPeak)}
                    className="histogram-enhanced"
                  />
                  <line x1="0" x2="240" y1="84" y2="84" className="histogram-grid" />
                </svg>
                <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                  <span>0</span>
                  <span>64</span>
                  <span>128</span>
                  <span>192</span>
                  <span>255</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-px w-3 bg-muted-foreground" />
                  Original
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-px w-3 bg-lab" />
                  Enhanced
                </span>
              </div>
            </div>

            <div className="mt-7 border-t border-border pt-5 lg:border-t-0 lg:pt-0">
              <SectionTitle number="04" title="Image statistics" />
              <div className="mt-4 divide-y divide-border border-y border-border">
                <Stat
                  label="Dimensions"
                  value={result ? `${result.original.width} × ${result.original.height}` : "—"}
                  unit="px"
                />
                <Stat
                  label="Channels"
                  value={result ? String(result.original.channels) : "—"}
                  unit=""
                />
                <Stat
                  label="Mean intensity"
                  value={result ? result.original.mean.toFixed(1) : "—"}
                  unit="/ 255"
                />
                <Stat
                  label="Std. deviation"
                  value={result ? result.original.deviation.toFixed(1) : "—"}
                  unit=""
                />
                <Stat
                  label="Enhanced mean"
                  value={result ? result.enhanced.mean.toFixed(1) : "—"}
                  unit="/ 255"
                />
                <Stat
                  label="Enhanced deviation"
                  value={result ? result.enhanced.deviation.toFixed(1) : "—"}
                  unit=""
                />
              </div>
              <div className="mt-4 flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Current gamma</span>
                <span className="font-mono tabular-nums text-lab">γ {gamma.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <SectionTitle number="05" title="What changed" />
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{explanation}</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="grid h-5 w-5 place-items-center border border-border font-mono text-[9px] text-lab">
                  {method === "gamma" ? "γ" : method === "equalize" ? "H" : "C"}
                </span>
                <span>{selectedMethod}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <footer className="flex min-h-10 items-center justify-between gap-4 border-t border-border px-5 text-[9px] text-muted-foreground sm:px-8">
        <span>
          IMAGE ENHANCEMENT LABORATORY <span className="px-1.5 text-border">·</span> MATLAB IMAGE
          PROCESSING
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          {statusText.toUpperCase()}
        </span>
      </footer>
    </main>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] tabular-nums text-lab-dim">{number}</span>
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-foreground">{title}</h2>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2.5">
      <span className="min-w-0 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums text-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground">{unit}</span>
    </div>
  );
}
