// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderMarkdown } from "./markdown";

// The note frame renders untrusted text from a shared/forked dashboard.json, so
// these tests pin the two things that matter: the supported subset renders as
// real elements, and nothing can smuggle live HTML/script through.

function mount(src: string) {
  return render(<div>{renderMarkdown(src)}</div>);
}

afterEach(() => cleanup());

describe("renderMarkdown — inline grammar", () => {
  it("renders bold, italic and inline code as elements", () => {
    const { container } = mount("**b** *i* `c`");
    expect(container.querySelector("strong")?.textContent).toBe("b");
    expect(container.querySelector("em")?.textContent).toBe("i");
    expect(container.querySelector("code")?.textContent).toBe("c");
  });

  it("turns an https link into a safe new-tab anchor", () => {
    const { container } = mount("see [docs](https://example.com/x)");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com/x");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("docs");
  });
});

describe("renderMarkdown — blocks", () => {
  it("renders headings for #, ## and ###", () => {
    const { container } = mount("# One\n## Two\n### Three");
    expect(container.textContent).toContain("One");
    expect(container.textContent).toContain("Two");
    expect(container.textContent).toContain("Three");
  });

  it("renders unordered and ordered lists", () => {
    const { container } = mount("- a\n- b\n\n1. x\n2. y");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("splits blank-line-separated paragraphs", () => {
    const { container } = mount("first\n\nsecond");
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("keeps plain text intact (backward compatible)", () => {
    const { container } = mount("just a plain note");
    expect(container.textContent).toBe("just a plain note");
    expect(container.querySelector("strong")).toBeNull();
  });
});

describe("renderMarkdown — safety", () => {
  it("never emits a script element from raw HTML in the source", () => {
    const { container } = mount("<script>alert(1)</script> **hi**");
    expect(container.querySelector("script")).toBeNull();
    // The angle-bracket text survives as literal text, not markup.
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not create anchors for javascript: or other unsafe schemes", () => {
    const { container } = mount(
      "[x](javascript:alert(1)) [y](data:text/html,evil)",
    );
    expect(container.querySelector("a")).toBeNull();
    // The label text is still shown.
    expect(container.textContent).toContain("x");
    expect(container.textContent).toContain("y");
  });
});
