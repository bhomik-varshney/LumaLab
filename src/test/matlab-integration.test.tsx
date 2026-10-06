import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingResult } from "@/lib/matlab-api";
import {
  checkMatlab,
  enhanceImage,
  uploadImage,
  runSequence,
  checkSequenceProgress,
} from "@/lib/matlab-api";
import { Route } from "@/routes/index";

vi.mock("@/lib/matlab-api", () => ({
  checkMatlab: vi.fn(),
  uploadImage: vi.fn(),
  enhanceImage: vi.fn(),
  runSequence: vi.fn(),
  checkSequenceProgress: vi.fn(),
}));
const LumaLab = Route.options.component as ComponentType;
const original: ProcessingResult = {
  imageId: "test-image",
  url: "data:image/png;base64,b3JpZ2luYWw=",
  originalUrl: "data:image/png;base64,b3JpZ2luYWw=",
  original: { width: 3, height: 2, channels: 3, imageClass: "uint8", mean: 80, deviation: 20 },
  enhanced: { width: 3, height: 2, channels: 3, imageClass: "uint8", mean: 80, deviation: 20 },
  histograms: { original: Array(256).fill(0), enhanced: Array(256).fill(0) },
  processor: "MATLAB",
  category: "intensity",
  method: "gamma",
  parameters: { gamma: 1 },
  outputKind: "enhanced",
  gamma: 1,
  lowCutoff: 0.1,
  highCutoff: 0.9,
};

beforeEach(() => {
  vi.mocked(checkSequenceProgress).mockResolvedValue({
    state: "processing",
    step: 2,
    total: 3,
    completedSteps: 1,
    method: "median",
  });
  vi.mocked(runSequence).mockImplementation(async (_id, steps, runId) => ({
    ...original,
    category: "sequence",
    method: "sequence",
    parameters: {},
    runId,
    steps: steps.map((step) => ({ ...step, output: original.enhanced })),
    url: "data:image/png;base64,c2VxdWVuY2U=",
  }));
  vi.mocked(checkMatlab).mockResolvedValue({ status: "ready", detail: "MATLAB ready" });
  vi.mocked(uploadImage).mockResolvedValue(original);
  vi.mocked(enhanceImage).mockImplementation(async (_id, options) => ({
    ...original,
    ...options,
    gamma: options.parameters.gamma ?? 1,
    lowCutoff: options.parameters.lowCutoff ?? 0.1,
    highCutoff: options.parameters.highCutoff ?? 0.9,
    outputKind: options.method === "sobel" ? "edge-map" : "enhanced",
    url: "data:image/png;base64,ZW5oYW5jZWQ=",
    enhanced: { ...original.enhanced, mean: 120, channels: options.method === "sobel" ? 1 : 3 },
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["sample"], { type: "image/jpeg" }),
    }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:sample"), revokeObjectURL: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MATLAB frontend integration", () => {
  it("uploads, enhances, saves the returned image, and resets to the original", async () => {
    render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    expect(uploadImage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Brighten" }));
    expect(save).toBeDisabled();
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenCalledWith(
        "test-image",
        { category: "intensity", method: "gamma", parameters: { gamma: 0.6 } },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,ZW5oYW5jZWQ=",
    );
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.href);
    });
    fireEvent.click(save);
    expect(downloads).toEqual(["data:image/png;base64,ZW5oYW5jZWQ="]);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
    expect(screen.getByRole("slider", { name: "Gamma value" })).toHaveValue("1");
    expect(enhanceImage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Histogram equalization" }));
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        { category: "intensity", method: "equalize", parameters: {} },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
  });

  it("discards an obsolete processing response after reset", async () => {
    let finish: ((output: ProcessingResult) => void) | undefined;
    vi.mocked(enhanceImage).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<LumaLab />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Darken" }));
    await waitFor(() => expect(finish).toBeDefined());
    const signal = vi.mocked(enhanceImage).mock.calls[0]![2];
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    finish?.({ ...original, gamma: 1.8, url: "data:image/png;base64,c3RhbGU=" });
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
  });

  it("reports an unavailable MATLAB bridge and keeps save disabled", async () => {
    vi.mocked(checkMatlab).mockRejectedValue(new Error("Start npm run dev:full, then retry."));
    render(<LumaLab />);
    await screen.findByText("Start npm run dev:full, then retry.");
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(screen.queryByText("MATLAB PROCESSED")).not.toBeInTheDocument();
  });

  it("synchronizes contrast controls, blocks reversed ranges, and resets cutoffs", async () => {
    render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Contrast stretching" }));
    expect(screen.queryByRole("slider", { name: "Gamma value" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Low cutoff"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("High cutoff"), { target: { value: "60" } });
    expect(screen.getByRole("slider", { name: "Low cutoff slider" })).toHaveValue("40");
    expect(screen.getByRole("slider", { name: "High cutoff slider" })).toHaveValue("60");
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        {
          category: "intensity",
          method: "stretch",
          parameters: { lowCutoff: 0.4, highCutoff: 0.6 },
        },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Low cutoff"), { target: { value: "80" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Low cutoff must be below high cutoff");
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset cutoffs" }));
    expect(screen.getByLabelText("Low cutoff")).toHaveValue(10);
    expect(screen.getByLabelText("High cutoff")).toHaveValue(90);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
  });

  it("supports keyboard comparison and a usable empty-image state", async () => {
    render(<LumaLab />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled());
    const divider = screen.getByRole("slider", { name: "Image comparison divider" });
    fireEvent.keyDown(divider, { key: "ArrowRight", shiftKey: true });
    expect(divider).toHaveAttribute("aria-valuenow", "60");
    fireEvent.keyDown(divider, { key: "Home" });
    expect(screen.getByRole("slider", { name: "Comparison position" })).toHaveValue("0");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.getByRole("button", { name: "Choose image" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save image" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contrast stretching" })).toBeDisabled();
  });

  it("switches categories, validates filter strength, labels edge maps, and resets", async () => {
    render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Spatial Filtering" }));
    expect(screen.queryByRole("slider", { name: "Gamma value" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gaussian" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Blur strength"), { target: { value: "1.5" } });
    expect(screen.getByRole("slider", { name: "Blur strength slider" })).toHaveValue("1.5");
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        { category: "spatial", method: "gaussian", parameters: { kernelSize: 5, sigma: 1.5 } },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Blur strength"), { target: { value: "4" } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Gaussian sigma between 0.3 and 3");
    fireEvent.click(screen.getByRole("button", { name: "Unsharp Mask" }));
    expect(screen.queryByLabelText("Blur strength")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sharpening strength"), { target: { value: "2" } });
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        {
          category: "spatial",
          method: "unsharp",
          parameters: { kernelSize: 5, sigma: 1, amount: 2 },
        },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Median" }));
    fireEvent.change(screen.getByRole("slider", { name: "Kernel size" }), {
      target: { value: "15" },
    });
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        { category: "spatial", method: "median", parameters: { kernelSize: 15 } },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sobel" }));
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByAltText("Sobel edge map preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,ZW5oYW5jZWQ=",
    );
    expect(screen.getByRole("columnheader", { name: "Edge map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
    expect(screen.getByRole("button", { name: "Intensity Transformations" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("changes kernel footprint without changing Gaussian sigma or unsharp strength", async () => {
    render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Spatial Filtering" }));
    fireEvent.change(screen.getByLabelText("Blur strength"), { target: { value: "1.7" } });
    const kernel = screen.getByRole("slider", { name: "Kernel size" });
    expect(kernel).toHaveAttribute("step", "2");
    fireEvent.change(kernel, { target: { value: "13" } });
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        { category: "spatial", method: "gaussian", parameters: { kernelSize: 13, sigma: 1.7 } },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    const count = vi.mocked(enhanceImage).mock.calls.length;
    fireEvent.change(kernel, { target: { value: "8" } });
    expect(kernel).toHaveValue("13");
    expect(enhanceImage).toHaveBeenCalledTimes(count);
    fireEvent.click(screen.getByRole("button", { name: "Unsharp Mask" }));
    fireEvent.change(screen.getByLabelText("Sharpening strength"), { target: { value: "2.1" } });
    fireEvent.change(kernel, { target: { value: "11" } });
    await waitFor(() =>
      expect(enhanceImage).toHaveBeenLastCalledWith(
        "test-image",
        {
          category: "spatial",
          method: "unsharp",
          parameters: { kernelSize: 11, sigma: 1, amount: 2.1 },
        },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByRole("button", { name: "Simulate steps" })).toBeEnabled();
  });
  it("saves sequence snapshots, reorders/removes them, exports the final result, and resets predictably", async () => {
    const { container } = render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByText("Processing Sequence"));
    const add = screen.getByRole("button", { name: "Add step" });
    const run = screen.getByRole("button", { name: "Run sequence" });
    expect(run).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Gamma numeric value"), { target: { value: "0.7" } });
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Gamma numeric value"), { target: { value: "0.8" } });
    expect(container.querySelector(".sequence-step-list")).toHaveTextContent("γ 0.70");
    fireEvent.click(screen.getByRole("button", { name: "Spatial Filtering" }));
    fireEvent.click(screen.getByRole("button", { name: "Median" }));
    fireEvent.change(screen.getByRole("slider", { name: "Kernel size" }), {
      target: { value: "5" },
    });
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Intensity Transformations" }));
    fireEvent.click(screen.getByRole("button", { name: "Contrast stretching" }));
    fireEvent.change(screen.getByLabelText("Low cutoff"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("High cutoff"), { target: { value: "95" } });
    fireEvent.click(add);
    const names = () =>
      Array.from(container.querySelectorAll(".sequence-step-copy strong")).map(
        (node) => node.textContent,
      );
    expect(names()).toEqual(["Gamma correction", "Median", "Contrast stretching"]);
    fireEvent.click(screen.getByRole("button", { name: "Move step 3 up" }));
    expect(names()).toEqual(["Gamma correction", "Contrast stretching", "Median"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove step 3: Median" }));
    expect(names()).toEqual(["Gamma correction", "Contrast stretching"]);
    fireEvent.click(screen.getByRole("button", { name: "Spatial Filtering" }));
    fireEvent.click(screen.getByRole("button", { name: "Median" }));
    fireEvent.change(screen.getByRole("slider", { name: "Kernel size" }), {
      target: { value: "5" },
    });
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Move step 3 up" }));
    await waitFor(() => expect(run).toBeEnabled());
    const expected = [
      { category: "intensity", method: "gamma", parameters: { gamma: 0.7 } },
      { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
      {
        category: "intensity",
        method: "stretch",
        parameters: { lowCutoff: 0.05, highCutoff: 0.95 },
      },
    ];
    fireEvent.click(run);
    await waitFor(() =>
      expect(runSequence).toHaveBeenCalledWith(
        "test-image",
        expected,
        expect.any(String),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByAltText("Sequence result preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,c2VxdWVuY2U=",
    );
    expect(screen.getByText("SEQUENCE RESULT")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sequence result" })).toBeInTheDocument();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.href);
    });
    fireEvent.click(save);
    expect(downloads).toEqual(["data:image/png;base64,c2VxdWVuY2U="]);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
    expect(names()).toEqual(["Gamma correction", "Median", "Contrast stretching"]);
    fireEvent.click(run);
    await waitFor(() => expect(runSequence).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect(save).toBeDisabled();
    expect(screen.queryByText("MATLAB SEQUENCE COMPLETE")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear sequence" }));
    expect(names()).toEqual([]);
    expect(run).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByAltText("Enhanced image preview")).toHaveAttribute("src", original.url),
    );
  });

  it("reports real step progress, blocks overlapping runs, and preserves the sequence after a failure", async () => {
    let rejectRun: ((error: Error) => void) | undefined;
    vi.mocked(runSequence).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRun = reject;
        }),
    );
    vi.mocked(checkSequenceProgress).mockResolvedValue({
      state: "processing",
      step: 2,
      total: 2,
      completedSteps: 1,
      method: "median",
    });
    const { container } = render(<LumaLab />);
    const save = screen.getByRole("button", { name: "Save image" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(screen.getByText("Processing Sequence"));
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.click(screen.getByRole("button", { name: "Spatial Filtering" }));
    fireEvent.click(screen.getByRole("button", { name: "Median" }));
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const run = screen.getByRole("button", { name: "Run sequence" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() =>
      expect(container.querySelector(".sequence-status")).toHaveTextContent(
        "Applying step 2 of 2: Median",
      ),
    );
    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(save).toBeDisabled();
    expect(runSequence).toHaveBeenCalledOnce();
    rejectRun?.(
      new Error("Step 2 (median) failed: invalid neighborhood. Remove it and add a valid size."),
    );
    await screen.findByText(/Step 2 \(median\) failed: invalid neighborhood/);
    expect(container.querySelectorAll(".sequence-step-list li")).toHaveLength(2);
    expect(save).toBeDisabled();
    expect(screen.queryByText("MATLAB SEQUENCE COMPLETE")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Sequence result preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run sequence" }));
    await waitFor(() => expect(save).toBeEnabled());
    expect(runSequence).toHaveBeenCalledTimes(2);
  });
});

it("a rejected AI recommendation leaves the manual sequence available and never executes automatically", async () => {
  const { container } = render(<LumaLab />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled());
  fireEvent.click(screen.getByText("Processing Sequence"));
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      explanation: "## What to try next\n\nUse a **supported** method.",
      recommendation: null,
      recommendationIssue: "Step 1 cannot be used: unsupported operation.",
      truncated: false,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /AI Learning Assistant/ }));
  fireEvent.click(screen.getByRole("button", { name: "Suggest what to try next" }));
  await screen.findByText(/Not executable/);
  expect(screen.queryByRole("button", { name: "Review sequence" })).not.toBeInTheDocument();
  expect(container.querySelectorAll(".sequence-step-list > li")).toHaveLength(1);
  expect(runSequence).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Run sequence" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Run sequence" }));
  await waitFor(() => expect(runSequence).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled());
});
