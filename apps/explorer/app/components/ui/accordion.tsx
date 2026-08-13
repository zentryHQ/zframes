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
 * Diverges from stock shadcn in one load-bearing way: `forceMount`. The landing
 * FAQ is marked up as `FAQPage` structured data, and Google's policy requires
 * the marked-up answers to exist in the page — so closed answers must still be
 * in the server HTML, where Radix would normally unmount them. With the content
 * always mounted, the closed state is expressed in CSS instead (`h-0` +
 * `invisible`, which also keeps collapsed answers out of the accessibility
 * tree), and the open/close height animation runs on top of it. The keyframes
 * are the local `zf-accordion-*` pair, NOT tw-animate's `accordion-up`: that
 * one falls back to `height: auto` when Radix hasn't measured yet, which
 * flashes every answer open for a frame on a pre-hydration paint.
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
        "overflow-hidden [transition:visibility_0.3s]",
        "data-[state=open]:animate-zf-accordion-down",
        "data-[state=closed]:invisible data-[state=closed]:h-0 data-[state=closed]:animate-zf-accordion-up",
      )}
      {...props}
    >
      <div className={className}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
