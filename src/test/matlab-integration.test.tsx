import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingResult } from "@/lib/matlab-api";
import { checkMatlab, enhanceImage, uploadImage } from "@/lib/matlab-api";
import { Route } from "@/routes/index";

vi.mock("@/lib/matlab-api", () => ({
  checkMatlab: vi.fn(),
  uploadImage: vi.fn(),
  enhanceImage: vi.fn(),
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
  method: "gamma",
  gamma: 1,
};

beforeEach(() => {
  vi.mocked(checkMatlab).mockResolvedValue({ status: "ready", detail: "MATLAB ready" });
  vi.mocked(uploadImage).mockResolvedValue(original);
  vi.mocked(enhanceImage).mockImplementation(async (_id, method, gamma) => ({
    ...original,
    method,
    gamma,
    url: "data:image/png;base64,ZW5oYW5jZWQ=",
    enhanced: { ...original.enhanced, mean: 120 },
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
        "gamma",
        0.6,
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
        "equalize",
        1,
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
    const signal = vi.mocked(enhanceImage).mock.calls[0]![3];
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
});
