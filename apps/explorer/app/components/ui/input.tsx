import * as React from "react"

import { cn } from "@/app/lib/utils"

// shadcn Input, restyled to the explorer's terminal look: faint white fill, a
// hairline border that shifts to indigo on focus — the same treatment the
// publish/search fields used inline. Callers add layout (w-full, pl-* for a
// leading icon) via className.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-indigo-400/50 focus:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
