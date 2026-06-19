// Loads the self-hosted UnicornStudio UMD (apps/playground/public/) exactly
// once and resolves when `window.UnicornStudio` is live. Self-hosted (not the
// jsDelivr CDN) so the orb scene runs against the SDK version it was authored
// for, the whole thing stays keyless/offline, and it ships in the prebuilt
// bundle. The background's <UnicornScene sdkUrl> points at the same file, so
// there is a single SDK global — no version clash.

const SDK_SRC = "/unicornStudio.umd.mjs";
const SCRIPT_ID = "_unicorn-script";

let loading: Promise<void> | null = null;

function hasGlobal(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { UnicornStudio?: unknown }).UnicornStudio)
  );
}

/** Resolve once the UnicornStudio global is available (loading the UMD if needed). */
export function loadUnicornSdk(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined")
    return Promise.resolve();
  if (hasGlobal()) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    // Another loader (e.g. the background's <UnicornScene>) may have injected
    // the script already; attach to it rather than adding a duplicate.
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const done = () =>
      hasGlobal() ? resolve() : reject(new Error("UnicornStudio missing"));
    script.addEventListener("load", done);
    script.addEventListener("error", () =>
      reject(new Error("failed to load UnicornStudio")),
    );
    if (!existing) {
      script.src = SDK_SRC;
      script.id = SCRIPT_ID;
      script.async = true;
      document.body.appendChild(script);
    } else if (hasGlobal()) {
      resolve();
    }
  });
  return loading;
}
