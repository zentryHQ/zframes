// Untrusted-render defense at the publish boundary. Community specs are rendered
// to other people; frames like image/video/link-grid render config strings as
// URLs (img src, a href, media src). A `javascript:` / `data:` / `vbscript:` /
// `file:` URL there is an XSS / phishing vector. We reject any such scheme
// anywhere in the spec on publish. (CSP is the render-time backstop.)
//
// Scheme-based + recursive, so it's frame-agnostic (no per-frame field list to
// keep in sync). The `\S` after the colon distinguishes a URL
// (`javascript:alert`) from prose (`"JavaScript: the language"` — space after
// the colon), keeping false positives off titles/labels.
const UNSAFE_SCHEME = /^(?:javascript|data|vbscript|file):\S/i;
const LEADING_JUNK = /^\s+/;

function looksUnsafe(s: string): boolean {
  // strip leading control chars / whitespace (a common scheme obfuscation)
  return UNSAFE_SCHEME.test(s.replace(LEADING_JUNK, ""));
}

/** Every unsafe-scheme string found anywhere in the value (truncated for display). */
export function findUnsafeUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (looksUnsafe(value)) out.push(value.slice(0, 80));
  } else if (Array.isArray(value)) {
    for (const v of value) findUnsafeUrls(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) findUnsafeUrls(v, out);
  }
  return out;
}
