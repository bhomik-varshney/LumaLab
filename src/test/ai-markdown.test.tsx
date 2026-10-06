import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiMarkdown } from "@/components/ai-markdown";
import { plainExplanation } from "@/lib/markdown-text";
afterEach(cleanup);
it("formats headings, emphasis, lists, code, line breaks and comparison tables", () => {
  const text =
    "## What happened\n\nA **measured** result with `gamma`.\n\n1. First step\n2. Second step\n\n- Compare the original\n- Try median\n\nFirst line  \nSecond line\n\n```matlab\nx = 1;\n```\n\n| Method | Effect |\n| --- | --- |\n| Median | Impulses |";
  const { container } = render(<AiMarkdown text={text} />);
  expect(screen.getByRole("heading", { name: "What happened" })).toBeInTheDocument();
  expect(container.querySelector("strong")).toHaveTextContent("measured");
  expect(container.querySelector("ol")).toHaveTextContent("First step");
  expect(container.querySelector("ul")).toHaveTextContent("Try median");
  expect(container.querySelector("code")).toHaveTextContent("gamma");
  expect(container.querySelector("br")).toBeInTheDocument();
  expect(container.querySelector("pre")).toHaveTextContent("x = 1;");
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(container.textContent).not.toContain("**measured**");
  expect(container.textContent).not.toContain("##");
});
it("never renders model HTML, scripts, images, events or unsafe links", () => {
  const { container } = render(
    <AiMarkdown
      text={
        '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[unsafe](javascript:alert%281%29) [data](data:text/html,attack) [safe](https://example.com)\n\n![remote](https://example.com/tracker.png)'
      }
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("[onerror]")).toBeNull();
  expect(screen.queryByRole("link", { name: "unsafe" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "data" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute("rel", "noopener noreferrer");
});
it("incomplete formatting stays readable and the plain fallback strips syntax and unsafe markup", () => {
  const { container } = render(
    <AiMarkdown text={"## Explanation\n\n**Incomplete emphasis\n\n```matlab\nx = 1;"} />,
  );
  expect(screen.getByRole("heading", { name: "Explanation" })).toBeInTheDocument();
  expect(container.textContent).toContain("Incomplete emphasis");
  expect(container.textContent).toContain("x = 1;");
  expect(plainExplanation("## Result\n\n**Median** with `5` pixels.\n<script>bad()</script>")).toBe(
    "Result\n\nMedian with 5 pixels.\n",
  );
});
