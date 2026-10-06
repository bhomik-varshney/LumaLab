import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecommendationReview } from "@/components/recommendation-review";
import type { SequenceRecommendation } from "@/lib/learning-context";
const recommendation: SequenceRecommendation = {
  type: "sequence_recommendation",
  title: "Try median",
  reason: "Explore impulse suppression.",
  input: "original",
  steps: [
    {
      category: "spatial",
      method: "median",
      parameters: { kernelSize: 5 },
      explanation: "Compare the neighborhood median.",
    },
  ],
};
afterEach(cleanup);
it("requires review and explicit acceptance before adding any steps", () => {
  const accept = vi.fn(() => null);
  render(
    <RecommendationReview
      recommendation={recommendation}
      sourceLabel="Sample"
      existingLength={0}
      disabled={false}
      stale={false}
      onAccept={accept}
    />,
  );
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review sequence" }));
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use this sequence" }));
  expect(accept).toHaveBeenCalledExactlyOnceWith(recommendation, "append");
  expect(screen.getByRole("status")).toHaveTextContent("Run sequence");
});
it("offers append and requires a separate confirmation to replace manual steps", () => {
  const accept = vi.fn(() => null);
  render(
    <RecommendationReview
      recommendation={recommendation}
      sourceLabel="Sample"
      existingLength={2}
      disabled={false}
      stale={false}
      onAccept={accept}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review sequence" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace saved sequence…" }));
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep my sequence" }));
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Append 1 steps" }));
  expect(accept).toHaveBeenCalledExactlyOnceWith(recommendation, "append");
});
it("confirmed replacement is explicit; full sequences cannot be silently truncated", () => {
  const accept = vi.fn(() => null);
  render(
    <RecommendationReview
      recommendation={recommendation}
      sourceLabel="Sample"
      existingLength={6}
      disabled={false}
      stale={false}
      onAccept={accept}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review sequence" }));
  expect(screen.getByRole("button", { name: "Append 1 steps" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Replace saved sequence…" }));
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
  expect(accept).toHaveBeenCalledExactlyOnceWith(recommendation, "replace");
});
it("changed experiment disables acceptance without hiding why", () => {
  const accept = vi.fn(() => null);
  render(
    <RecommendationReview
      recommendation={recommendation}
      sourceLabel="Old noisy image"
      existingLength={0}
      disabled
      stale
      onAccept={accept}
    />,
  );
  expect(screen.getByRole("button", { name: "Review sequence" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("experiment changed");
  expect(accept).not.toHaveBeenCalled();
});
