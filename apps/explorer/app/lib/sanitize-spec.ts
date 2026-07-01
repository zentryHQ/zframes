// Untrusted-render defense at the publish boundary. Community specs are rendered
// to other people; frames like image/link-grid render config strings as URLs
// (<img src>, <a href>). A javascript:/data:/vbscript:/file:/blob:/filesystem:
// URL there is stored XSS / phishing. We reject any such scheme anywhere in the
// spec on publish.
//
// We DON'T pattern-match the string — a regex can't see through the tricks the
// browser normalizes away (whitespace after the colon, tabs/newlines *inside*
// the scheme, leading C0 controls). Instead we parse each string with the
// WHATWG URL parser (`new URL`), which normalizes exactly like the browser, and
// denylist the resolved `.protocol`. Non-URL strings (titles, symbols like
// "BTC", "xyz:TSLA") either don't parse or resolve to a harmless protocol.
const DANGEROUS_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "filesystem:",
]);

function unsafeProtocol(s: string): boolean {
  let protocol: string;
  try {
    // new URL() strips leading/trailing C0 controls + spaces and tabs/newlines
    // anywhere (incl. inside the scheme), then exposes the true protocol.
    protocol = new URL(s).protocol.toLowerCase();
  } catch {
    return false; // not a URL — a plain title/label/symbol
  }
  return DANGEROUS_PROTOCOLS.has(protocol);
}

/** Every dangerous-protocol URL found anywhere in the value (truncated for display). */
export function findUnsafeUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (unsafeProtocol(value)) out.push(value.slice(0, 80));
  } else if (Array.isArray(value)) {
    for (const v of value) findUnsafeUrls(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) findUnsafeUrls(v, out);
  }
  return out;
}
