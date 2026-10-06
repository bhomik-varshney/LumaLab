import { createFileRoute } from "@tanstack/react-router";
import {
  Aperture,
  ArrowDownToLine,
  ArrowLeftRight,
  Check,
  ChevronDown,
  FileImage,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import sampleImage from "@/assets/lumalab-sample.jpg";
import {
  checkMatlab,
  uploadImage,
  enhanceImage,
  runSequence,
  checkSequenceProgress,
} from "@/lib/matlab-api";
import type {
  Health,
  Method,
  ProcessingResult,
  ProcessingOptions,
  SequenceProgress,
} from "@/lib/matlab-api";

import { categories, methods, describeResult } from "@/lib/enhancement-methods";
import { Histogram } from "@/components/histogram";
import { NoisePlayground } from "@/components/noise-playground";
import { LearningAssistant } from "@/components/learning-assistant";
import { measuredContext } from "@/lib/learning-context";
import { FilterControls, NeighborhoodDiagram } from "@/components/filter-controls";
import { FilterSimulation } from "@/components/filter-simulation";
import { isValidKernelSize } from "@/lib/filter-settings";
import { ProcessingSequence } from "@/components/processing-sequence";
import { MAX_SEQUENCE_STEPS, sequenceSignature } from "@/lib/processing-sequence";
import { validateOperation, operationRegistry } from "../../shared/operations.mjs";
import type { SequenceRecommendation } from "@/lib/learning-context";
import type { NoisySequenceInput, SequenceStep, SequencePhase } from "@/lib/processing-sequence";

type ViewMode = "split" | "side-by-side";
const gammaPresets = [
  { label: "Brighten", value: "0.6" },
  { label: "Neutral", value: "1" },
  { label: "Darken", value: "1.8" },
];
const stretchPresets = [
  { label: "Gentle", low: "2", high: "98" },
  { label: "Balanced", low: "10", high: "90" },
  { label: "Strong", low: "20", high: "80" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LumaLab — Image Enhancement Studio" },
      {
        name: "description",
        content:
          "A hands-on MATLAB image studio. Adjust tones, smooth noise, sharpen detail, and compare real images and histograms.",
      },
      { property: "og:title", content: "LumaLab — Image Enhancement Studio" },
    ],
  }),
  component: LumaLab,
});

function LumaLab() {
  const [noiseOpened, setNoiseOpened] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"studio" | "noise">("studio");
  const [imageUrl, setImageUrl] = useState(sampleImage);
  const [fileName, setFileName] = useState("alpine-dawn-demo.jpg");
  const [isDemo, setIsDemo] = useState(true);
  const [gammaValue, setGammaValue] = useState("1");
  const [lowValue, setLowValue] = useState("10");
  const [highValue, setHighValue] = useState("90");
  const [kernelSize, setKernelSize] = useState(5);
  const [sigmaValue, setSigmaValue] = useState("1");
  const [amountValue, setAmountValue] = useState("1");
  const sigma = sigmaValue.trim() === "" ? NaN : Number(sigmaValue);
  const amount = amountValue.trim() === "" ? NaN : Number(amountValue);
  const gamma = gammaValue.trim() === "" ? NaN : Number(gammaValue);
  const low = lowValue.trim() === "" ? NaN : Number(lowValue);
  const high = highValue.trim() === "" ? NaN : Number(highValue);
  const [method, setMethod] = useState<Method>("gamma");
  const selected = methods.find((item) => item.id === method)!;
  const category = selected.category;
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewMode, setPreviewMode] = useState<"single" | "sequence">("single");
  const [latestNoise, setLatestNoise] = useState<ProcessingResult | null>(null);
  const [sequenceInput, setSequenceInput] = useState<NoisySequenceInput | null>(null);
  const [sequenceResultInput, setSequenceResultInput] = useState<NoisySequenceInput | null>(null);
  const [compareClean, setCompareClean] = useState(false);
  const [sequenceNotice, setSequenceNotice] = useState("");
  const sequenceBuilderRef = useRef<HTMLDetailsElement>(null);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([]);
  const [sequencePhase, setSequencePhase] = useState<SequencePhase>("idle");
  const [sequenceProgress, setSequenceProgress] = useState<SequenceProgress | null>(null);
  const [sequenceError, setSequenceError] = useState("");
  const [sequenceRunId, setSequenceRunId] = useState<string | null>(null);
  const sequenceController = useRef<AbortController | null>(null);
  const sequenceRunning = sequencePhase === "running";
  const [imageFile, setImageFile] = useState<Blob | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health>({
    status: "starting",
    detail: "Checking MATLAB bridge…",
  });
  const [retry, setRetry] = useState(0);
  const neutralResult = useRef<ProcessingResult | null>(null);
  const sampleLoader = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const parameterError =
    method === "stretch" &&
    (!Number.isFinite(low) ||
      !Number.isFinite(high) ||
      low < 0 ||
      high > 100 ||
      high - low < 0.0001)
      ? "Low cutoff must be below high cutoff. Use values from 0 to 100%."
      : method === "gamma" && (!Number.isFinite(gamma) || gamma < 0.2 || gamma > 3)
        ? "Choose a gamma value between 0.2 and 3."
        : category === "spatial" && method !== "sobel" && !isValidKernelSize(kernelSize)
          ? "Choose an odd kernel size from 3 to 15."
          : (method === "gaussian" || method === "unsharp") &&
              (!Number.isFinite(sigma) || sigma < 0.3 || sigma > 3)
            ? "Choose a Gaussian sigma between 0.3 and 3."
            : method === "unsharp" && (!Number.isFinite(amount) || amount < 0 || amount > 3)
              ? "Choose a sharpening strength between 0 and 3."
              : "";

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
    sampleLoader.current = controller;
    fetch(sampleImage, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the sample image.");
        return response.blob();
      })
      .then((blob) => {
        if (!controller.signal.aborted) setImageFile((current) => current ?? blob);
      })
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
    if (sequenceController.current) {
      sequenceController.current.abort();
      sequenceController.current = null;
      setSequencePhase("error");
      setSequenceError(
        "The image or MATLAB connection changed. Wait for MATLAB to be ready, then run the saved sequence again.",
      );
    } else setSequencePhase("idle");
    setPreviewMode("single");
    setSequenceProgress(null);
    setLatestNoise(null);
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
        if (!controller.signal.aborted) {
          setErrorMessage(error.message);
          setIsProcessing(false);
        }
      });
    return () => controller.abort();
  }, [imageFile, health.status, retry]);

  // Only parameters for the active method trigger processing. Draft numeric input
  // can be invalid temporarily; it never reaches MATLAB or enables export.
  const options = useMemo<ProcessingOptions>(() => {
    const parameters =
      method === "gamma"
        ? { gamma }
        : method === "stretch"
          ? { lowCutoff: low / 100, highCutoff: high / 100 }
          : method === "mean" || method === "median"
            ? { kernelSize }
            : method === "gaussian"
              ? { kernelSize, sigma }
              : method === "unsharp"
                ? { kernelSize, sigma, amount }
                : {};
    return { category, method, parameters };
  }, [category, method, gamma, low, high, kernelSize, sigma, amount]);
  // Changing controls returns to the single-operation preview. Saved snapshots
  // stay untouched; starting a sequence does not change these controls.
  useEffect(() => {
    setPreviewMode("single");
  }, [options]);
  useEffect(() => () => sequenceController.current?.abort(), []);
  useEffect(() => {
    if (!sequenceRunning || !sequenceRunId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const progress = await checkSequenceProgress(sequenceRunId, controller.signal);
        if (!controller.signal.aborted) setSequenceProgress(progress);
      } catch {
        /* A run may not be registered yet. The processing response owns errors. */
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 350);
    };
    timer = setTimeout(() => void poll(), 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sequenceRunning, sequenceRunId]);
  useEffect(() => {
    if (previewMode === "sequence") return;
    if (!imageId || health.status !== "ready") return;
    if (parameterError) {
      setIsProcessing(false);
      return;
    }
    const controller = new AbortController();
    setErrorMessage("");
    if (method === "gamma" && gamma === 1 && neutralResult.current) {
      setResult(neutralResult.current);
      setIsProcessing(false);
      return () => controller.abort();
    }
    setIsProcessing(true);
    const timer = setTimeout(() => {
      enhanceImage(imageId, options, controller.signal)
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
  }, [imageId, options, method, gamma, health.status, parameterError, previewMode]);

  const hasCurrentSequence =
    !!result &&
    previewMode === "sequence" &&
    sequencePhase === "success" &&
    result.method === "sequence" &&
    result.imageId === (sequenceInput?.imageId ?? imageId) &&
    (!sequenceInput ||
      (sequenceInput.cleanImageId === imageId &&
        latestNoise?.noisyImageId === sequenceInput.imageId)) &&
    sequenceSignature(result.steps ?? []) === sequenceSignature(sequenceSteps);
  const hasCurrentResult =
    hasCurrentSequence ||
    (!!result &&
      previewMode === "single" &&
      !parameterError &&
      result.method === method &&
      result.category === category &&
      Object.entries(options.parameters).every(
        ([key, value]) => result.parameters[key as keyof typeof result.parameters] === value,
      ));
  const sequenceValidationError = (() => {
    if (
      sequenceInput &&
      (sequenceInput.cleanImageId !== imageId ||
        latestNoise?.noisyImageId !== sequenceInput.imageId)
    )
      return "The reviewed noisy input changed or was reset. Choose the current noisy realization or clean original before running.";
    for (let index = 0; index < sequenceSteps.length; index++) {
      try {
        validateOperation(sequenceSteps[index], {
          strict: true,
          availableIds: health.operations ?? operationRegistry.operations.map((item) => item.id),
        });
      } catch (error) {
        return `Step ${index + 1} needs correction: ${(error as Error).message}`;
      }
    }
    return "";
  })();
  const canAdjust = !!imageFile && !!imageId && health.status === "ready" && !sequenceRunning;
  const canSave = hasCurrentResult && !isProcessing && health.status === "ready";
  const source = neutralResult.current;
  const selectedMethod = selected.name;
  const statusText =
    health.status === "ready"
      ? "MATLAB ready"
      : health.status === "starting"
        ? "Connecting to MATLAB"
        : "MATLAB unavailable";
  const explanation = selected.explanation;
  const previewStatus = sequenceRunning
    ? sequenceProgress?.state === "processing"
      ? `Applying step ${sequenceProgress.step} of ${sequenceProgress.total}: ${methods.find((item) => item.id === sequenceProgress.method)?.name ?? sequenceProgress.method}`
      : sequenceProgress?.state === "exporting" || sequenceProgress?.state === "complete"
        ? "Preparing final sequence result…"
        : "Waiting for MATLAB to run the sequence…"
    : isProcessing
      ? "Processing in MATLAB…"
      : hasCurrentResult
        ? hasCurrentSequence
          ? "MATLAB SEQUENCE COMPLETE"
          : "MATLAB PROCESSED"
        : result
          ? result.method === "sequence"
            ? "Previous sequence result · run to update"
            : "Previous result · adjust to update"
          : "Original preview";
  const enhancedLabel = hasCurrentResult
    ? hasCurrentSequence
      ? result?.outputKind === "edge-map"
        ? "SEQUENCE EDGE MAP"
        : "SEQUENCE RESULT"
      : result?.outputKind === "edge-map"
        ? "EDGE MAP"
        : "ENHANCED"
    : result
      ? result.method === "sequence"
        ? "LAST SEQUENCE RESULT"
        : result.outputKind === "edge-map"
          ? "LAST EDGE MAP"
          : "LAST RESULT"
      : "ORIGINAL PREVIEW";
  const resultParameters = result ? describeResult(result) : "Awaiting MATLAB";
  const chooseMethod = (next: Method) => {
    if (sequenceRunning) return;
    setPreviewMode("single");
    if (next === method) return;
    setMethod(next);
    if (methods.find((item) => item.id === next)?.category === "spatial") {
      setKernelSize(next === "mean" || next === "median" ? 3 : 5);
      setSigmaValue("1");
      setAmountValue("1");
    }
  };

  const openFile = (file?: File) => {
    if (sequenceController.current) return;
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setErrorMessage("Choose a PNG or JPEG image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Choose a file under 10 MB and 16 million pixels.");
      return;
    }
    sampleLoader.current?.abort();
    setImageId(null);
    setResult(null);
    neutralResult.current = null;
    setImageFile(file);
    setFileName(file.name);
    setIsDemo(false);
    setErrorMessage("");
    setGammaValue("1");
    setLowValue("10");
    setHighValue("90");
    setMethod("gamma");
    setKernelSize(5);
    setSigmaValue("1");
    setAmountValue("1");
    setZoom(100);
    setSplit(50);
  };
  const resetImage = () => {
    setPreviewMode("single");
    setSequencePhase("idle");
    setSequenceProgress(null);
    setSequenceError("");
    setGammaValue("1");
    setLowValue("10");
    setHighValue("90");
    setMethod("gamma");
    setKernelSize(5);
    setSigmaValue("1");
    setAmountValue("1");
    setSplit(50);
    setZoom(100);
    setViewMode("split");
    setErrorMessage("");
  };
  const updateSequence = (steps: SequenceStep[]) => {
    setSequenceSteps(steps);
    setSequencePhase("idle");
    setSequenceError("");
    setSequenceProgress(null);
  };
  const addSequenceStep = () => {
    if (sequenceController.current || parameterError || !imageUrl) return;
    const snapshot = { ...options, parameters: { ...options.parameters }, id: crypto.randomUUID() };
    setSequenceSteps((current) =>
      current.length < MAX_SEQUENCE_STEPS ? [...current, snapshot] : current,
    );
    setSequencePhase("idle");
    setSequenceError("");
    setSequenceProgress(null);
  };
  const moveSequenceStep = (index: number, direction: -1 | 1) => {
    if (sequenceController.current) return;
    const next = [...sequenceSteps],
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateSequence(next);
  };
  const noiseBinding = (noisy: ProcessingResult): NoisySequenceInput | null =>
    noisy.noisyImageId && noisy.noise
      ? {
          imageId: noisy.noisyImageId,
          cleanImageId: noisy.imageId,
          url: noisy.url,
          noise: noisy.noise,
          info: noisy.enhanced,
          histogram: noisy.histograms.enhanced,
          label: `${fileName} · ${noisy.noise.type === "salt-pepper" ? `salt-and-pepper ${noisy.noise.density * 100}%` : `Gaussian σ ${noisy.noise.standardDeviation}`} · seed ${noisy.noise.seed}`,
        }
      : null;
  const acceptRecommendation = (
    recommendation: SequenceRecommendation,
    mode: "append" | "replace",
    noisy: ProcessingResult | null = null,
  ): string | null => {
    if (sequenceController.current || isProcessing)
      return "Wait for MATLAB processing to finish before adding steps.";
    if (!imageId) return "Load an image before accepting a sequence.";
    const input = recommendation.input === "noisy" ? noisy && noiseBinding(noisy) : null;
    if (
      recommendation.input === "noisy" &&
      (!input || input.cleanImageId !== imageId || latestNoise?.noisyImageId !== input.imageId)
    )
      return "The recommended noisy input is no longer current. Generate noise and ask again.";
    if (
      mode === "append" &&
      sequenceSteps.length &&
      (sequenceInput?.imageId ?? imageId) !== (input?.imageId ?? imageId)
    )
      return "These steps use a different input from your saved sequence. Choose replacement explicitly, or keep the current sequence.";
    if (
      (mode === "append" ? sequenceSteps.length : 0) + recommendation.steps.length >
      MAX_SEQUENCE_STEPS
    )
      return "The sequence would exceed six steps. Remove steps or explicitly replace it.";
    let steps: SequenceStep[];
    try {
      steps = recommendation.steps.map((step) => ({
        ...validateOperation(step, {
          strict: true,
          availableIds: health.operations ?? operationRegistry.operations.map((item) => item.id),
        }),
        id: crypto.randomUUID(),
      }));
    } catch (error) {
      return (error as Error).message;
    }
    updateSequence(mode === "append" ? [...sequenceSteps, ...steps] : steps);
    setSequenceInput(input);
    setSequenceNotice(
      "AI suggestion accepted as editable steps. Review them and click Run sequence when ready.",
    );
    setWorkspaceMode("studio");
    requestAnimationFrame(() => {
      const builder = sequenceBuilderRef.current;
      if (builder) {
        builder.open = true;
        builder.scrollIntoView({ behavior: "smooth", block: "center" });
        builder.querySelector<HTMLButtonElement>('button[aria-label^="Edit step"]')?.focus();
      }
    });
    return null;
  };
  const startSequence = async () => {
    if (
      sequenceController.current ||
      !canAdjust ||
      isProcessing ||
      !imageId ||
      !sequenceSteps.length ||
      sequenceValidationError
    )
      return;
    const controller = new AbortController();
    sequenceController.current = controller;
    const runId = crypto.randomUUID();
    const steps = sequenceSteps.map(({ category, method, parameters }) => ({
      category,
      method,
      parameters: { ...parameters },
    }));
    setPreviewMode("sequence");
    setSequencePhase("running");
    setIsProcessing(true);
    setSequenceRunId(runId);
    setSequenceProgress(null);
    setSequenceError("");
    setErrorMessage("");
    try {
      const output = await runSequence(
        sequenceInput?.imageId ?? imageId,
        steps,
        runId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(output);
      setSequenceResultInput(sequenceInput);
      setCompareClean(false);
      setSequencePhase("success");
      setSequenceProgress({
        state: "complete",
        step: steps.length,
        total: steps.length,
        completedSteps: steps.length,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setSequencePhase("error");
        setSequenceError((error as Error).message);
      }
    } finally {
      if (sequenceController.current === controller) {
        sequenceController.current = null;
        setIsProcessing(false);
      }
    }
  };
  const removeImage = () => {
    sampleLoader.current?.abort();
    setImageFile(null);
    setImageUrl("");
    setFileName("");
    setImageId(null);
    setResult(null);
    neutralResult.current = null;
    setErrorMessage("");
    setIsProcessing(false);
    resetImage();
  };
  const saveImage = () => {
    if (!result || !canSave) return;
    const link = document.createElement("a");
    link.href = result.url;
    link.download = `${fileName.replace(/\.[^.]+$/, "")}-${result.method === "sequence" && sequenceResultInput ? "noisy-sequence" : result.method}.png`;
    link.click();
  };
  const moveDivider = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)));
  };
  const showingNoisySequence =
    previewMode === "sequence" && result?.method === "sequence" && !!sequenceResultInput;
  const comparisonOriginalUrl =
    showingNoisySequence && !compareClean
      ? sequenceResultInput!.url
      : (source?.originalUrl ?? imageUrl);
  const comparisonOriginalInfo =
    showingNoisySequence && compareClean ? source?.original : result?.original;
  const comparisonOriginalHistogram =
    showingNoisySequence && compareClean
      ? source?.histograms.original
      : result?.histograms.original;
  const originalLabel = showingNoisySequence && !compareClean ? "NOISY INPUT" : "ORIGINAL";
  const imageCompare = (enhanced: boolean) => (
    <img
      src={enhanced ? (result?.url ?? source?.originalUrl ?? imageUrl) : comparisonOriginalUrl}
      alt={
        enhanced
          ? result?.method === "sequence"
            ? result.outputKind === "edge-map"
              ? "Sequence edge map preview"
              : "Sequence result preview"
            : result?.outputKind === "edge-map"
              ? "Sobel edge map preview"
              : "Enhanced image preview"
          : showingNoisySequence && !compareClean
            ? "Noisy sequence input preview"
            : "Original image preview"
      }
      draggable={false}
      className="comparison-image"
      style={{ transform: `scale(${zoom / 100})` }}
    />
  );

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <a href="/" className="studio-brand" aria-label="LumaLab home">
          <span className="brand-mark">
            <Aperture size={21} strokeWidth={1.5} />
          </span>
          <span>
            LumaLab
            <span className="brand-subtitle">
              <span className="desktop-subtitle">IMAGE ENHANCEMENT STUDIO</span>
              <span className="mobile-subtitle">IMAGE STUDIO</span>
            </span>
          </span>
        </a>
        <div className="header-actions">
          <span
            className={`connection-pill ${health.status === "ready" ? "is-ready" : ""}`}
            title={health.detail}
            role="status"
          >
            <span className="status-dot" />
            {statusText}
          </span>
          <button
            type="button"
            className="studio-button secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={sequenceRunning}
          >
            <Upload size={15} />
            <span>Upload image</span>
          </button>
          {workspaceMode === "studio" && (
            <button
              type="button"
              className="studio-button primary"
              onClick={saveImage}
              disabled={!canSave}
            >
              <ArrowDownToLine size={15} />
              <span>Save image</span>
            </button>
          )}
        </div>
      </header>

      <div className="studio-content">
        <div className="workspace-heading">
          <div></div>
        </div>
        <div className="workspace-modes segmented" role="group" aria-label="Workspace mode">
          <button
            aria-pressed={workspaceMode === "studio"}
            onClick={() => setWorkspaceMode("studio")}
            disabled={sequenceRunning}
          >
            Enhancement Studio
          </button>
          <button
            aria-pressed={workspaceMode === "noise"}
            onClick={() => {
              setNoiseOpened(true);
              setWorkspaceMode("noise");
            }}
            disabled={sequenceRunning}
          >
            Noise Playground
          </button>
        </div>
        {noiseOpened && (
          <div hidden={workspaceMode !== "noise"}>
            <NoisePlayground
              key={imageId ?? "empty"}
              clean={source}
              fileName={fileName}
              health={health}
              onUpload={() => fileInputRef.current?.click()}
              onNoiseChange={setLatestNoise}
              onAccept={(recommendation, mode, noisy) =>
                acceptRecommendation(recommendation, mode, noisy)
              }
              sequenceLength={sequenceSteps.length}
            />
          </div>
        )}
        <div hidden={workspaceMode !== "studio"}>
          <LearningAssistant
            sourceKey={`${imageId ?? "empty"}:${sequenceInput?.imageId ?? "original"}:${latestNoise?.noisyImageId ?? "none"}`}
            sourceLabel={sequenceInput?.label ?? fileName}
            sequenceLength={sequenceSteps.length}
            acceptDisabled={sequenceRunning || isProcessing || !imageId}
            onAccept={(recommendation, mode) =>
              acceptRecommendation(
                recommendation,
                mode,
                sequenceInput && latestNoise?.noisyImageId !== sequenceInput.imageId
                  ? null
                  : latestNoise,
              )
            }
            context={{
              mode: "studio",
              status: !imageId
                ? "empty"
                : isProcessing
                  ? "processing"
                  : errorMessage || (previewMode === "sequence" && sequenceError)
                    ? "error"
                    : hasCurrentResult
                      ? "ready"
                      : "stale",
              selected: parameterError ? null : options,
              sequence: sequenceSteps.map(({ category, method, parameters }) => ({
                category,
                method,
                parameters,
              })),
              resultSequence:
                result?.steps?.map(({ category, method, parameters }) => ({
                  category,
                  method,
                  parameters,
                })) ?? [],
              resultOperation:
                result && result.method !== "sequence" && result.method !== "noise"
                  ? {
                      category: result.category as "intensity" | "spatial",
                      method: result.method,
                      parameters: result.parameters,
                    }
                  : null,
              workflow: previewMode,
              sequenceInput: sequenceInput ? "noisy" : "original",
              resultInput:
                result?.method === "sequence" && sequenceResultInput ? "noisy" : "original",
              noise: sequenceInput?.noise ?? null,
              selectedNoise: sequenceInput ? (latestNoise?.noise ?? null) : null,
              measurements: result
                ? {
                    original: measuredContext(
                      source?.original ?? result.original,
                      source?.histograms.original ?? result.histograms.original,
                    ),
                    ...(sequenceResultInput
                      ? {
                          noisy: measuredContext(
                            sequenceResultInput.info,
                            sequenceResultInput.histogram,
                          ),
                        }
                      : {}),
                    result: measuredContext(result.enhanced, result.histograms.enhanced),
                  }
                : {},
            }}
          />
          <nav className="category-navigation" aria-label="Enhancement category">
            <div className="category-choices">
              {categories.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className="category-choice"
                  aria-label={item.name}
                  aria-pressed={category === item.id}
                  disabled={sequenceRunning}
                  onClick={() => {
                    if (item.id !== category)
                      chooseMethod(item.id === "intensity" ? "gamma" : "gaussian");
                  }}
                >
                  <span className="category-number">0{index + 1}</span>
                  {item.name}
                </button>
              ))}
            </div>
            <p>{categories.find((item) => item.id === category)!.description}</p>
          </nav>
          {(errorMessage || health.status === "offline") && (
            <div className="studio-alert" role="alert">
              <span>{errorMessage || health.detail}</span>
              <div className="alert-actions">
                {health.status === "ready" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRetry((value) => value + 1)}
                    disabled={isProcessing || !!parameterError}
                  >
                    Retry processing
                  </button>
                )}
                {errorMessage && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setErrorMessage("")}
                    aria-label="Dismiss message"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="studio-grid">
            <section className="inspect-column" aria-label="Image comparison and analysis">
              <div className="preview-card">
                <div className="preview-toolbar">
                  <div className="preview-file">
                    <FileImage size={15} />
                    <span title={fileName}>{fileName || "No image selected"}</span>
                    {isDemo && imageUrl && <span className="small-tag">SAMPLE</span>}
                  </div>
                  <div
                    className="segmented layout-switch"
                    role="group"
                    aria-label="Comparison layout"
                  >
                    <button
                      type="button"
                      aria-pressed={viewMode === "split"}
                      onClick={() => setViewMode("split")}
                      disabled={!imageUrl}
                    >
                      <ArrowLeftRight size={13} />
                      Split
                    </button>
                    <button
                      type="button"
                      aria-pressed={viewMode === "side-by-side"}
                      onClick={() => setViewMode("side-by-side")}
                      disabled={!imageUrl}
                    >
                      Side by side
                    </button>
                  </div>
                </div>
                <div
                  className="comparison-stage checkerboard"
                  ref={stageRef}
                  onPointerMove={moveDivider}
                  onPointerUp={() => setIsDragging(false)}
                  onPointerCancel={() => setIsDragging(false)}
                >
                  {imageUrl ? (
                    viewMode === "split" ? (
                      <>
                        {imageCompare(true)}
                        <div
                          className="original-mask"
                          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                        >
                          {imageCompare(false)}
                        </div>
                        <span className="image-label original-label">{originalLabel}</span>
                        <span className="image-label enhanced-label">{enhancedLabel}</span>
                        <div className="divider-line" style={{ left: `${split}%` }} />
                        <button
                          type="button"
                          className="divider-handle"
                          style={{ left: `${split}%` }}
                          role="slider"
                          aria-label="Image comparison divider"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(split)}
                          aria-orientation="horizontal"
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setIsDragging(true);
                          }}
                          onKeyDown={(event) => {
                            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                              event.preventDefault();
                              setSplit((value) =>
                                event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? 100
                                    : Math.min(
                                        100,
                                        Math.max(
                                          0,
                                          value +
                                            (event.key === "ArrowLeft" ? -1 : 1) *
                                              (event.shiftKey ? 10 : 1),
                                        ),
                                      ),
                              );
                            }
                          }}
                        >
                          <ArrowLeftRight size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="side-by-side">
                        {[false, true].map((enhanced) => (
                          <div className="side-image" key={String(enhanced)}>
                            {imageCompare(enhanced)}
                            <span className="image-label original-label">
                              {enhanced ? enhancedLabel : originalLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="empty-stage">
                      <FileImage size={32} strokeWidth={1.2} />
                      <h2>Your next experiment starts here.</h2>
                      <p>Bring in an image to explore light, contrast, and tone.</p>
                      <button
                        type="button"
                        className="studio-button primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={15} />
                        Choose image
                      </button>
                      <small>PNG or JPEG · up to 10 MB</small>
                    </div>
                  )}
                  {isProcessing && (
                    <span className="processing-pill" role="status">
                      <span className="status-dot pulse" />
                      Processing in MATLAB…
                    </span>
                  )}
                </div>
                <div className="comparison-controls">
                  <div className="comparison-position">
                    <span>Before</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      onChange={(event) => setSplit(Number(event.target.value))}
                      disabled={!imageUrl || viewMode !== "split"}
                      aria-label="Comparison position"
                    />
                    <span>After</span>
                  </div>
                  <div className="zoom-controls">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setZoom((value) => Math.max(50, value - 10))}
                      disabled={!imageUrl}
                      aria-label="Zoom out"
                    >
                      <Minus size={14} />
                    </button>
                    <span>{zoom}%</span>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setZoom((value) => Math.min(200, value + 10))}
                      disabled={!imageUrl}
                      aria-label="Zoom in"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button fit-button"
                      onClick={() => setZoom(100)}
                      disabled={!imageUrl}
                      aria-label="Fit image to view"
                      title="Fit to view"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="preview-caption">
                  <span className={hasCurrentResult ? "result-success" : ""}>
                    {hasCurrentResult ? <Check size={13} /> : <span className="status-dot" />}
                    {previewStatus}
                  </span>
                  <span>{resultParameters}</span>
                </div>
              </div>

              {showingNoisySequence && (
                <div
                  className="sequence-source-compare segmented"
                  role="group"
                  aria-label="Sequence comparison source"
                >
                  <button aria-pressed={!compareClean} onClick={() => setCompareClean(false)}>
                    Noisy sequence input
                  </button>
                  <button aria-pressed={compareClean} onClick={() => setCompareClean(true)}>
                    Clean original
                  </button>
                </div>
              )}
              <div className="analysis-grid">
                <section className="analysis-card">
                  <div className="card-heading">
                    <h2>Tone distribution</h2>
                    <span className="eyebrow">LUMINANCE</span>
                  </div>
                  <p className="card-description">See where the light and dark pixels fall.</p>
                  <Histogram
                    original={comparisonOriginalHistogram ?? []}
                    enhanced={result?.histograms.enhanced ?? []}
                    label={`${showingNoisySequence && !compareClean ? "Noisy input" : "Original"} and ${result?.method === "sequence" ? "sequence result" : result?.outputKind === "edge-map" ? "edge map" : "enhanced image"} luminance histogram`}
                  />
                  <div className="chart-legend">
                    <span>
                      <i className="original-swatch" />
                      {showingNoisySequence && !compareClean ? "Noisy input" : "Original"}
                    </span>
                    <span>
                      <i className="enhanced-swatch" />
                      {result?.method === "sequence"
                        ? result.outputKind === "edge-map"
                          ? "Sequence edge map"
                          : "Sequence result"
                        : result?.outputKind === "edge-map"
                          ? "Edge map"
                          : "Enhanced"}
                    </span>
                    <small>Brightness · 0–255</small>
                  </div>
                </section>
                <section className="analysis-card">
                  <div className="card-heading">
                    <h2>Image statistics</h2>
                    <span className="small-tag">
                      {result?.outputKind === "edge-map"
                        ? "EDGE MAP"
                        : result?.enhanced.channels === 1
                          ? "GRAYSCALE"
                          : result
                            ? "RGB"
                            : "—"}
                    </span>
                  </div>
                  <p className="card-description">Measured from the actual image pixels.</p>
                  <table className="statistics-table">
                    <thead>
                      <tr>
                        <th scope="col">Measure</th>
                        <th scope="col">
                          {showingNoisySequence && !compareClean ? "Noisy input" : "Original"}
                        </th>
                        <th scope="col">
                          {result?.method === "sequence"
                            ? result.outputKind === "edge-map"
                              ? "Sequence edge map"
                              : "Sequence result"
                            : result?.outputKind === "edge-map"
                              ? "Edge map"
                              : "Enhanced"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Mean brightness</th>
                        <td>{comparisonOriginalInfo?.mean.toFixed(1) ?? "—"}</td>
                        <td>{result?.enhanced.mean.toFixed(1) ?? "—"}</td>
                      </tr>
                      <tr>
                        <th scope="row">
                          Contrast{" "}
                          <span title="Population standard deviation of luminance">(σ)</span>
                        </th>
                        <td>{comparisonOriginalInfo?.deviation.toFixed(1) ?? "—"}</td>
                        <td>{result?.enhanced.deviation.toFixed(1) ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="statistics-note">All pixels · luminance on a 0–255 scale</p>
                </section>
              </div>
            </section>

            <aside className="adjustments-panel" aria-label="Image adjustments">
              <div className="panel-heading">
                <h2>Adjustments</h2>
                <span className="eyebrow">01 — 03</span>
              </div>
              <section className="load-section">
                <h3 className="step-heading">
                  <span>01</span>Load your image
                </h3>
                <button
                  type="button"
                  className="upload-zone"
                  disabled={sequenceRunning}
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
                  <Upload size={18} strokeWidth={1.5} />
                  <span>
                    Drop an image or <b>browse</b>
                  </span>
                  <small>PNG / JPEG · up to 10 MB</small>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,.jpg,.jpeg"
                  className="sr-only"
                  aria-label="Upload image file"
                  disabled={sequenceRunning}
                  onChange={(event) => {
                    openFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                {imageUrl && (
                  <div className="loaded-image">
                    <img src={source?.originalUrl ?? imageUrl} alt="Selected image thumbnail" />
                    <div>
                      <span title={fileName}>{fileName}</span>
                      <small>
                        {source
                          ? `${source.original.width} × ${source.original.height} px · ${source.original.channels} channel${source.original.channels === 1 ? "" : "s"}`
                          : "Preparing image…"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={removeImage}
                      aria-label="Remove image"
                      title="Remove image"
                      disabled={sequenceRunning}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </section>

              <section className="method-section">
                <h3 className="step-heading">
                  <span>02</span>Choose a method
                </h3>
                <div
                  className={`segmented method-switch ${category === "spatial" ? "spatial-methods" : ""}`}
                  role="group"
                  aria-label="Enhancement method"
                >
                  {methods
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-label={item.name}
                        aria-pressed={method === item.id}
                        disabled={!imageUrl || sequenceRunning}
                        onClick={() => chooseMethod(item.id)}
                      >
                        {item.short}
                      </button>
                    ))}
                </div>
              </section>

              <section className="parameter-section">
                <h3 className="step-heading">
                  <span>03</span>Find your balance
                </h3>
                <div className="method-copy" key={method}>
                  <h4>{selectedMethod}</h4>
                  <p>{explanation}</p>
                </div>
                {method === "gamma" && (
                  <div className="method-controls">
                    <div className="control-label">
                      <label htmlFor="gamma-number">Gamma value</label>
                      <div className="number-field">
                        <span>γ</span>
                        <input
                          id="gamma-number"
                          aria-label="Gamma numeric value"
                          type="number"
                          min="0.2"
                          max="3"
                          step="0.05"
                          value={gammaValue}
                          onChange={(event) => setGammaValue(event.target.value)}
                          disabled={!canAdjust}
                          aria-invalid={!!parameterError}
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="any"
                      value={Number.isFinite(gamma) ? gamma : 1}
                      onChange={(event) =>
                        setGammaValue(String(Math.round(Number(event.target.value) * 100) / 100))
                      }
                      disabled={!canAdjust}
                      aria-label="Gamma value"
                      className="parameter-slider"
                    />
                    <div className="range-labels">
                      <span>0.2 · Brighter</span>
                      <span>3.0 · Darker</span>
                    </div>
                    <div className="preset-row">
                      {gammaPresets.map((preset) => (
                        <button
                          type="button"
                          className="preset-button"
                          key={preset.label}
                          aria-pressed={gamma === Number(preset.value)}
                          disabled={!canAdjust}
                          onClick={() => setGammaValue(preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {method === "equalize" && (
                  <div className="automatic-note">
                    <Check size={16} />
                    <div>
                      <strong>No settings needed.</strong>
                      <p>MATLAB finds the mapping from your image’s histogram.</p>
                    </div>
                  </div>
                )}
                {method === "stretch" && (
                  <div className="method-controls">
                    <div className="cutoff-row">
                      <div className="control-label">
                        <label htmlFor="low-cutoff">Low cutoff</label>
                        <div className="number-field">
                          <input
                            id="low-cutoff"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={lowValue}
                            onChange={(event) => setLowValue(event.target.value)}
                            disabled={!canAdjust}
                            aria-invalid={!!parameterError}
                            aria-describedby={parameterError ? "parameter-error" : "cutoff-help"}
                          />
                          <span>%</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="any"
                        value={Number.isFinite(low) ? low : 10}
                        onChange={(event) =>
                          setLowValue(
                            String(
                              Math.min(
                                Math.round(Number(event.target.value) * 100) / 100,
                                Number.isFinite(high) && high > 0 ? Math.max(0, high - 0.01) : 100,
                              ),
                            ),
                          )
                        }
                        disabled={!canAdjust}
                        aria-label="Low cutoff slider"
                        className="parameter-slider"
                      />
                    </div>
                    <div className="cutoff-row">
                      <div className="control-label">
                        <label htmlFor="high-cutoff">High cutoff</label>
                        <div className="number-field">
                          <input
                            id="high-cutoff"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={highValue}
                            onChange={(event) => setHighValue(event.target.value)}
                            disabled={!canAdjust}
                            aria-invalid={!!parameterError}
                            aria-describedby={parameterError ? "parameter-error" : "cutoff-help"}
                          />
                          <span>%</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="any"
                        value={Number.isFinite(high) ? high : 90}
                        onChange={(event) =>
                          setHighValue(
                            String(
                              Math.max(
                                Math.round(Number(event.target.value) * 100) / 100,
                                Number.isFinite(low) && low < 100 ? Math.min(100, low + 0.01) : 0,
                              ),
                            ),
                          )
                        }
                        disabled={!canAdjust}
                        aria-label="High cutoff slider"
                        className="parameter-slider"
                      />
                    </div>
                    <div className="selected-range">
                      <span>Input brightness</span>
                      <strong>{parameterError ? "Invalid range" : `${low}% → ${high}%`}</strong>
                    </div>
                    <div className="tone-range" aria-hidden="true">
                      {!parameterError && (
                        <span style={{ left: `${low}%`, width: `${high - low}%` }} />
                      )}
                    </div>
                    <p id="cutoff-help" className="cutoff-help">
                      Your selected range expands to 0–100% output brightness.
                    </p>
                    <div className="preset-row">
                      {stretchPresets.map((preset) => (
                        <button
                          type="button"
                          className="preset-button"
                          key={preset.label}
                          aria-pressed={low === Number(preset.low) && high === Number(preset.high)}
                          disabled={!canAdjust}
                          onClick={() => {
                            setLowValue(preset.low);
                            setHighValue(preset.high);
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-button defaults-button"
                      disabled={!canAdjust}
                      onClick={() => {
                        setLowValue("10");
                        setHighValue("90");
                      }}
                    >
                      Reset cutoffs
                    </button>
                  </div>
                )}
                {category === "spatial" && (
                  <FilterControls
                    method={method}
                    kernelSize={kernelSize}
                    sigmaValue={sigmaValue}
                    amountValue={amountValue}
                    disabled={!imageUrl || sequenceRunning}
                    setKernelSize={setKernelSize}
                    setSigmaValue={setSigmaValue}
                    setAmountValue={setAmountValue}
                  />
                )}
                {parameterError && (
                  <p className="parameter-error" id="parameter-error" role="alert">
                    {parameterError}
                  </p>
                )}
                {category === "spatial" && (
                  <FilterSimulation
                    method={method}
                    imageUrl={imageUrl}
                    kernelSize={kernelSize}
                    sigma={method === "gaussian" || method === "unsharp" ? sigma : 1}
                    amount={method === "unsharp" ? amount : 1}
                    onLoadImage={() => fileInputRef.current?.click()}
                  />
                )}
                <p className="auto-preview-note">
                  <span className="status-dot" />
                  {sequenceRunning
                    ? "Running your saved sequence…"
                    : hasCurrentSequence
                      ? "Viewing the final sequence result."
                      : !imageFile
                        ? "Load an image to begin."
                        : !canAdjust
                          ? health.status === "ready"
                            ? "Reading your image in MATLAB…"
                            : "Waiting for the MATLAB connection."
                          : isProcessing
                            ? "Updating your preview…"
                            : "Changes preview automatically."}
                </p>
                {previewMode === "sequence" && (
                  <button
                    type="button"
                    className="text-button sequence-preview-switch"
                    disabled={sequenceRunning}
                    onClick={() => setPreviewMode("single")}
                  >
                    Preview selected operation
                  </button>
                )}
              </section>

              <ProcessingSequence
                builderRef={sequenceBuilderRef}
                inputLabel={
                  sequenceInput
                    ? `Noisy input · seed ${sequenceInput.noise.seed}`
                    : "Original image"
                }
                validationError={sequenceValidationError}
                onEdit={(id, options) =>
                  updateSequence(
                    sequenceSteps.map((step) => (step.id === id ? { ...options, id } : step)),
                  )
                }
                inputControls={
                  <div className="sequence-input-control">
                    <label htmlFor="sequence-input">Sequence input</label>
                    <select
                      id="sequence-input"
                      disabled={sequenceRunning}
                      value={sequenceInput?.imageId ?? "original"}
                      onChange={(event) => {
                        if (event.target.value === "original") {
                          setSequenceInput(null);
                          updateSequence(sequenceSteps);
                        } else if (latestNoise) {
                          setSequenceInput(noiseBinding(latestNoise));
                          updateSequence(sequenceSteps);
                        }
                      }}
                    >
                      <option value="original">Clean original</option>
                      {sequenceInput && sequenceInput.imageId !== latestNoise?.noisyImageId && (
                        <option value={sequenceInput.imageId} disabled>
                          Reviewed noise · seed {sequenceInput.noise.seed} · unavailable
                        </option>
                      )}
                      {latestNoise?.noisyImageId && (
                        <option value={latestNoise.noisyImageId}>
                          Noisy realization · seed {latestNoise.noise?.seed}
                        </option>
                      )}
                    </select>
                    {sequenceInput && <p className="filter-guidance">{sequenceInput.label}</p>}
                    {sequenceNotice && (
                      <p className="filter-guidance" role="status">
                        {sequenceNotice}
                      </p>
                    )}
                  </div>
                }
                steps={sequenceSteps}
                phase={sequencePhase}
                progress={sequenceProgress}
                error={sequenceError}
                canAdd={!!imageUrl && !parameterError}
                canRun={canAdjust && !isProcessing}
                isCurrentResult={hasCurrentSequence}
                runHint={
                  !imageUrl
                    ? "Load an image before running these steps."
                    : health.status !== "ready"
                      ? "Start MATLAB to run the saved sequence."
                      : isProcessing
                        ? "Wait for the current preview to finish, then run the sequence."
                        : "Run these saved steps to view their final result."
                }
                onAdd={addSequenceStep}
                onRun={() => void startSequence()}
                onMove={moveSequenceStep}
                onRemove={(id) => updateSequence(sequenceSteps.filter((step) => step.id !== id))}
                onClear={() => {
                  updateSequence([]);
                  resetImage();
                }}
              />

              <details className="learning-notes">
                <summary>
                  Understand this method
                  <ChevronDown size={14} />
                </summary>
                <div>
                  {category === "spatial" ? (
                    <>
                      {method !== "sobel" && <NeighborhoodDiagram size={kernelSize} />}
                      <p>
                        {method === "mean"
                          ? "Each pixel becomes the average of its neighborhood."
                          : method === "gaussian"
                            ? "Gaussian weights give the center more influence. Larger sigma spreads that influence."
                            : method === "median"
                              ? "The median is the middle value after sorting the neighborhood’s intensities."
                              : method === "unsharp"
                                ? "Detail = original − Gaussian blur. Result = original + strength × detail."
                                : "Sobel estimates horizontal and vertical intensity changes. The output is a grayscale edge-strength map on a fixed 0–1 scale."}
                      </p>
                      <p>
                        {method === "sobel"
                          ? "RGB input is converted to luminance before detecting edges."
                          : "RGB filters change BT.601 luminance and retain chrominance before clipping. Color noise can remain because chrominance is not smoothed."}
                      </p>
                    </>
                  ) : method === "gamma" ? (
                    <>
                      <p className="formula">
                        s = r<sup>γ</sup>
                      </p>
                      <p>Intensity r is normalized to 0–1. Gamma 1 leaves the image unchanged.</p>
                    </>
                  ) : method === "equalize" ? (
                    <>
                      <p>
                        Each brightness level maps through the cumulative histogram. This spreads
                        crowded tones over more of the output range.
                      </p>
                      <p>RGB processing changes luminance, keeping chrominance before clipping.</p>
                    </>
                  ) : (
                    <>
                      <p className="formula">s = (r − low) / (high − low)</p>
                      <p>
                        Below the low cutoff becomes black. Above the high cutoff becomes white.
                        Values in between spread across the full range.
                      </p>
                      <p>
                        Cutoffs are brightness percentages, not percentiles. RGB stretches
                        luminance; color is preserved before gamut clipping. Flat images stay
                        unchanged.
                      </p>
                    </>
                  )}
                </div>
              </details>
              <div className="panel-footer">
                <button
                  type="button"
                  className="studio-button secondary reset-button"
                  onClick={resetImage}
                  disabled={!imageUrl || sequenceRunning}
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                <span>
                  {sequenceSteps.length ? "Reset keeps saved steps." : "Original stays untouched."}
                </span>
              </div>
            </aside>
          </div>
        </div>
        <footer className="studio-footer">
          <span>
            LumaLab <i>/</i> Image processing, made visible.
          </span>
          <span>Full-resolution MATLAB processing</span>
        </footer>
      </div>
    </main>
  );
}
