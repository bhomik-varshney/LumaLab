import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NoisePlayground } from "@/components/noise-playground";
import { LearningAssistant } from "@/components/learning-assistant";
import { addNoise, enhanceImage } from "@/lib/matlab-api";
import type { ProcessingResult } from "@/lib/matlab-api";
import { measuredContext } from "@/lib/learning-context";
import type { LearningContext } from "@/lib/learning-context";
vi.mock("@/lib/matlab-api", () => ({ addNoise: vi.fn(), enhanceImage: vi.fn() }));
const bins = Array(256).fill(0);
bins[80] = 6;
const clean: ProcessingResult = {
  imageId: "clean-id",
  url: "data:image/png;base64,Y2xlYW4=",
  originalUrl: "data:image/png;base64,Y2xlYW4=",
  original: { width: 3, height: 2, channels: 3, imageClass: "uint8", mean: 80, deviation: 20 },
  enhanced: { width: 3, height: 2, channels: 3, imageClass: "uint8", mean: 80, deviation: 20 },
  histograms: { original: bins, enhanced: bins },
  processor: "MATLAB",
  category: "intensity",
  method: "gamma",
  parameters: { gamma: 1 },
  gamma: 1,
  lowCutoff: 0.1,
  highCutoff: 0.9,
  outputKind: "enhanced",
};
const context: LearningContext = {
  mode: "studio",
  status: "ready",
  selected: { category: "intensity", method: "gamma", parameters: { gamma: 0.7 } },
  sequence: [{ category: "spatial", method: "median", parameters: { kernelSize: 5 } }],
  resultSequence: [],
  resultOperation: { category: "intensity", method: "gamma", parameters: { gamma: 0.7 } },
  noise: null,
  measurements: { original: measuredContext(clean.original, bins) },
};
beforeEach(() => {
  vi.mocked(addNoise).mockImplementation(async (imageId, noise) => ({
    ...clean,
    imageId,
    noise,
    category: "noise",
    method: "noise",
    parameters: {},
    noisyImageId: "noisy-id",
    url: "data:image/png;base64,bm9pc3k=",
    enhanced: { ...clean.enhanced, mean: 90 },
  }));
  vi.mocked(enhanceImage).mockImplementation(async (imageId, operation) => ({
    ...clean,
    imageId,
    ...operation,
    url: "data:image/png;base64,ZmlsdGVyZWQ=",
    original: { ...clean.original, mean: 90 },
    enhanced: { ...clean.enhanced, mean: 85 },
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("uses the clean ID for every realization, noisy ID for filters, actual comparisons/exports, and resets", async () => {
  render(
    <NoisePlayground
      clean={clean}
      fileName="sample.png"
      health={{ status: "ready", detail: "ready" }}
      onUpload={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply filter" })).toBeEnabled());
  expect(addNoise).toHaveBeenLastCalledWith(
    "clean-id",
    { type: "salt-pepper", density: 0.05, seed: 42 },
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await waitFor(() => expect(addNoise).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply filter" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save filtered image" })).toBeEnabled(),
  );
  expect(enhanceImage).toHaveBeenLastCalledWith(
    "noisy-id",
    { category: "spatial", method: "median", parameters: { kernelSize: 3 } },
    expect.any(AbortSignal),
  );
  expect(screen.getByAltText("Noisy input")).toHaveAttribute(
    "src",
    "data:image/png;base64,bm9pc3k=",
  );
  expect(screen.getByAltText("Filtered result")).toHaveAttribute(
    "src",
    "data:image/png;base64,ZmlsdGVyZWQ=",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clean original" }));
  expect(screen.getByAltText("Clean original")).toHaveAttribute("src", clean.originalUrl);
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.href);
  });
  fireEvent.click(screen.getByRole("button", { name: "Save filtered image" }));
  expect(downloads).toEqual(["data:image/png;base64,ZmlsdGVyZWQ="]);
  fireEvent.click(screen.getByRole("button", { name: "Mean" }));
  expect(screen.getByRole("button", { name: "Save filtered image" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
  await waitFor(() => expect(enhanceImage).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Reset playground" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset playground" }));
  expect(screen.queryByAltText("Filtered result")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply filter" })).toBeDisabled();
});
it("blocks stale noise filtering, regenerates from clean, and uses accurate Gaussian units", async () => {
  render(
    <NoisePlayground
      clean={clean}
      fileName="sample.png"
      health={{ status: "ready", detail: "ready" }}
      onUpload={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Noise density"), { target: { value: "12" } });
  expect(screen.getByRole("button", { name: "Apply filter" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save noisy image" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
  await waitFor(() => expect(addNoise).toHaveBeenCalledTimes(2));
  expect(vi.mocked(addNoise).mock.calls[1]![0]).toBe("clean-id");
  expect(vi.mocked(addNoise).mock.calls[1]![1].seed).not.toBe(42);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add noise" })).toBeEnabled());
  fireEvent.click(
    within(screen.getByRole("group", { name: "Noise type" })).getByRole("button", {
      name: "Gaussian",
    }),
  );
  expect(screen.getByLabelText("Standard deviation (σ)")).toHaveValue("0.05");
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await waitFor(() => expect(addNoise).toHaveBeenCalledTimes(3));
  expect(vi.mocked(addNoise).mock.calls[2]![1]).toMatchObject({
    type: "gaussian",
    standardDeviation: 0.05,
  });
});
it("assistant sends current metadata only and labels an explanation stale when controls change", async () => {
  let finish: ((value: Response) => void) | undefined;
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<LearningAssistant context={context} />);
  fireEvent.click(screen.getByRole("button", { name: /AI Learning Assistant/ }));
  fireEvent.click(screen.getByRole("button", { name: "Explain my sequence" }));
  const payload = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
  expect(payload.context).toEqual(context);
  expect(payload.action).toBe("sequence");
  expect(JSON.stringify(payload)).not.toContain("data:image");
  rerender(
    <LearningAssistant
      context={{
        ...context,
        selected: { category: "intensity", method: "gamma", parameters: { gamma: 1.8 } },
      }}
    />,
  );
  await act(async () =>
    finish?.(Response.json({ explanation: "Median can suppress impulses.", truncated: false })),
  );
  expect(screen.getByText(/Your experiment changed/)).toBeInTheDocument();
  expect(screen.getByText("AI-GENERATED · GROQ")).toBeInTheDocument();
});
it("assistant errors have a retry and do not call or disable MATLAB operations", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "AI assistant is not configured." }, { status: 503 }),
    )
    .mockResolvedValueOnce(
      Response.json({ explanation: "Gamma remaps intensity.", truncated: false }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<LearningAssistant context={context} />);
  fireEvent.click(screen.getByRole("button", { name: /AI Learning Assistant/ }));
  fireEvent.click(screen.getByRole("button", { name: "Explain this result" }));
  await screen.findByText("AI assistant is not configured.");
  fireEvent.click(screen.getByRole("button", { name: "Retry explanation" }));
  await screen.findByText("Gamma remaps intensity.");
  expect(addNoise).not.toHaveBeenCalled();
  expect(enhanceImage).not.toHaveBeenCalled();
});

it("noise failures keep the clean source and retry without claiming a filtered result", async () => {
  vi.mocked(addNoise).mockRejectedValueOnce(new Error("MATLAB is busy. Retry."));
  render(
    <NoisePlayground
      clean={clean}
      fileName="sample.png"
      health={{ status: "ready", detail: "ready" }}
      onUpload={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await screen.findByText(/MATLAB is busy/);
  expect(screen.getByRole("button", { name: "Save filtered image" })).toBeDisabled();
  expect(screen.getByAltText("Clean original")).toHaveAttribute("src", clean.originalUrl);
  fireEvent.click(screen.getByRole("button", { name: "Add noise" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply filter" })).toBeEnabled());
  expect(addNoise).toHaveBeenCalledTimes(2);
});
