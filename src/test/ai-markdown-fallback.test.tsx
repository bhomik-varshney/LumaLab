import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("react-markdown", () => ({
  default: () => {
    throw new Error("Isolated renderer failure");
  },
}));
import { AiMarkdown } from "@/components/ai-markdown";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("uses readable plain text if the Markdown renderer throws", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(<AiMarkdown text={"## Result\n\n**Median** uses `5` pixels."} />);
  expect(screen.getByText(/Median uses 5 pixels/)).toBeInTheDocument();
  expect(container.textContent).not.toContain("**");
  expect(container.textContent).not.toContain("##");
});
