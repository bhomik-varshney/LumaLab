import { plainExplanation } from "@/lib/markdown-text";
import { Component } from "react";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
// No raw HTML plugin, images, scripts, embedded media or arbitrary protocols.
const elements = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "br",
  "hr",
  "code",
  "pre",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "del",
];
class MarkdownBoundary extends Component<
  { children: ReactNode; text: string },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p className="ai-plain-fallback">{plainExplanation(this.props.text)}</p>
    ) : (
      this.props.children
    );
  }
}
export function AiMarkdown({ text }: { text: string }) {
  return (
    <MarkdownBoundary key={text} text={text}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={elements}
        unwrapDisallowed
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: () => null,
          table: ({ children }) => (
            <div className="ai-table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </MarkdownBoundary>
  );
}
