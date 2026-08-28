"use client";

import { useSyncExternalStore } from "react";

// Standby holds for the site's chrome Aurora (UnicornBackground). While any
// surface holds one, the chrome scene freezes its render loop (paused, not
// destroyed) so the page never runs two live WebGL scenes at once. Same
// reason AppShell unmounts the chrome backdrop on /dashboard and /editor,
// applied to the landing's showcase, where the second scene lives inside an
// iframe AppShell can't see.

let holds = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const cb of listeners) cb();
};

export function acquireAuroraStandby(): () => void {
  holds += 1;
  if (holds === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) notify();
  };
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};
const getSnapshot = () => holds > 0;
const getServerSnapshot = () => false;

/** True while any surface is running its own scene over the chrome Aurora. */
export function useAuroraStandby(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
