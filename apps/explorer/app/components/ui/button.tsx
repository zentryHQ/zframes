import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/app/lib/utils"

// shadcn Button, restyled to the explorer's terminal design language so it IS
// the app's button (not a generic shadcn one). Variants mirror the three looks
// the app already used — the translucent indigo CTA (accent/default), the white
// outline, and the quiet ghost — and every button inherits `.zf-press` for the
// ElevenLabs instant-press feel. `down` is the dashboard's semantic loss colour.
const buttonVariants = cva(
  "zf-press inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-indigo-400/40 bg-indigo-500/15 font-medium text-indigo-100 hover:bg-indigo-500/25",
        accent:
          "border border-indigo-400/40 bg-indigo-500/15 font-medium text-indigo-100 hover:bg-indigo-500/25",
        outline:
          "border border-white/15 text-white/80 hover:border-white/30 hover:text-white",
        ghost: "text-white/50 hover:text-white/75",
        secondary:
          "border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/[0.1]",
        destructive:
          "border border-down/40 bg-down/15 text-down hover:bg-down/25",
        link: "text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1.5",
        lg: "px-6 py-2.5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
