import { Fragment, type ReactNode } from "react";

/**
 * A tiny, dependency-free Markdown subset renderer that emits React elements —
 * never HTML strings. There is NO `dangerouslySetInnerHTML` and no raw-HTML
 * passthrough anywhere in here on purpose: a note lives in a shared/forked
 * `dashboard.json`, so its text is untrusted, and this must not become an XSS
 * vector. Everything is produced as React nodes, so any stray `<script>` in the
 * source is rendered as literal text.
 *
 * Supported, deliberately small: **bold**, *italic*, `inline code`,
 * [links](https://…) (http/https only, new tab), `#`/`##`/`###` headings,
 * `-`/`*` and `1.` lists, blank-line paragraphs and single-line breaks.
 * Anything else is left as plain text — so pre-existing plain-text notes still
 * render exactly as written.
 */

const cx = {
  code: "rounded bg-white/10 px-1 py-px font-mono text-[0.85em] text-strong",
  link: "text-highlight underline underline-offset-2 hover:opacity-80",
  strong: "text-strong font-bold",
  em: "italic",
  h1: "body-lg text-strong font-bold",
  h2: "body-md text-strong font-bold",
  h3: "body-sm text-strong font-semibold uppercase tracking-wide",
  // Block layout (not flex) so the list markers actually render.
  list: "space-y-0.5 pl-5",
} as const;

/** Only http/https links are ever turned into anchors — everything else stays text. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/**
 * Parse the inline span grammar of one line into React nodes. Recurses for the
 * contents of bold/italic/link so `**bold [link](https://x)**` nests correctly.
 * Plain text accumulates in `buf`; every emitted element carries a local key so
 * a caller can splice the array into a parent's children without warnings.
 */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let key = 0;
  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const rest = text.slice(i);

    // `inline code` — opaque: nothing inside is re-parsed.
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        nodes.push(
          <code key={key++} className={cx.code}>
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // [label](href)
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const [full, label, href] = m;
        flush();
        if (isSafeHref(href)) {
          nodes.push(
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx.link}
              // Notes are click-to-edit in the editor; keep a link click from
              // also toggling edit mode on the parent.
              onClick={(e) => e.stopPropagation()}
            >
              {parseInline(label)}
            </a>,
          );
        } else {
          // Unsafe/relative href → render the label as plain text, no anchor.
          nodes.push(<Fragment key={key++}>{parseInline(label)}</Fragment>);
        }
        i += full.length;
        continue;
      }
    }

    // **bold** (checked before *italic* so the double marker wins).
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        nodes.push(
          <strong key={key++} className={cx.strong}>
            {parseInline(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }

    // *italic*
    if (ch === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i) {
        flush();
        nodes.push(
          <em key={key++} className={cx.em}>
            {parseInline(text.slice(i + 1, end))}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

/** A run of consecutive plain lines joined with <br/> as one paragraph. */
function paragraph(lines: string[], key: number): ReactNode {
  return (
    <p key={key} className="leading-snug">
      {lines.map((line, idx) => (
        <Fragment key={idx}>
          {idx > 0 && <br />}
          {parseInline(line)}
        </Fragment>
      ))}
    </p>
  );
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+\.\s+(.*)$/;

/**
 * Render a Markdown-subset string as React block elements. Returns an array of
 * blocks (paragraphs, headings, lists) for the caller to place inside a
 * spacing container.
 */
export function renderMarkdown(src: string): ReactNode {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      const cls = level === 1 ? cx.h1 : level === 2 ? cx.h2 : cx.h3;
      blocks.push(
        <div key={key++} className={cls}>
          {parseInline(heading[2].trim())}
        </div>,
      );
      i++;
      continue;
    }

    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = !UL_RE.test(line);
      const re = ordered ? OL_RE : UL_RE;
      const items: ReactNode[] = [];
      while (i < lines.length && re.test(lines[i])) {
        const m = re.exec(lines[i]);
        items.push(<li key={items.length}>{parseInline(m ? m[1] : "")}</li>);
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag
          key={key++}
          className={`${cx.list} ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items}
        </Tag>,
      );
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-block lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(paragraph(para, key++));
  }

  return blocks;
}
