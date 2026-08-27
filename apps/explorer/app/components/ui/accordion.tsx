"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";

import { cn } from "@/app/lib/utils";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={className}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center justify-between gap-4 text-left",
          className,
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * Diverges from stock shadcn in two load-bearing ways.
 *
 * **`forceMount`.** The landing FAQ is marked up as `FAQPage` structured data,
 * and Google's policy requires the marked-up answers to exist in the page — so
 * closed answers must still be in the server HTML, where Radix would normally
 * unmount them. With the content always mounted the closed state is expressed
 * in CSS instead (`invisible`, which also keeps collapsed answers out of the
 * accessibility tree), and the open/close animation runs on top of it.
 *
 * **The collapse animates `grid-template-rows: 0fr → 1fr`, not `height`.** A
 * height animation needs a measured pixel target, and with `forceMount` Radix
 * never supplies one: `CollapsibleContentImpl` reads its own
 * `--radix-collapsible-content-height` from a ref DURING render, so the value is
 * always one render behind the measurement — and the only thing that would
 * flush it is `setIsPresent(present)`, which force-mounting pins to `true`, so
 * React bails out of the re-render and the var is never written at all. The
 * keyframe's `to` therefore fell back to `height: auto`, which Chrome cannot
 * interpolate from 0, so OPENING jumped (discrete) while closing still faded on
 * opacity alone — an accordion that animated one way only. The `fr` pair needs
 * no measurement, so both directions run: the row track carries the height and
 * the inner `min-h-0 overflow-hidden` div is what makes 0fr collapse.
 *
 * Still keyframes and not a transition: Radix's measuring layout effect pins
 * `transition-duration: 0s` on this node and forces a reflow, but restores
 * `animation-name`, which re-arms a keyframe animation. That is also why the
 * closing keyframes carry `visibility: visible` instead of this element having a
 * visibility transition — same reason, and the collapse has to stay on screen to
 * be worth animating.
 */
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      forceMount
      data-slot="accordion-content"
      className={cn(
        "grid",
        "data-[state=open]:animate-zf-accordion-down data-[state=open]:grid-rows-[1fr]",
        "data-[state=closed]:invisible data-[state=closed]:grid-rows-[0fr] data-[state=closed]:animate-zf-accordion-up",
      )}
      {...props}
    >
      {/* The clipper: a 0fr track only collapses if its item can be squeezed
          (`min-h-0`) and hides what does not fit. The caller's padding goes on
          the div inside it, so a collapsed answer leaves no residual strip. */}
      <div className="min-h-0 overflow-hidden">
        <div className={className}>{children}</div>
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
