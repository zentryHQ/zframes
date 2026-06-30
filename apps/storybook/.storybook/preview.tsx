import { THEME_PRESETS } from "@zframes/core";
import type { Preview } from "@storybook/react-vite";
import "./preview.css";

/** Toolbar-driven cosmetics applied to every story via the story factory. */
export type StoryGlobals = {
  themePreset: string;
  frameSize: "sm" | "default" | "wide" | "tall";
  density: "compact" | "normal" | "comfortable";
};

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    // We paint our own dark backdrop in preview.css; keep the backgrounds addon
    // from covering it.
    backgrounds: { disable: true },
    options: {
      // Group the sidebar by category. Storybook STATICALLY parses storySort, so
      // this MUST be an inline literal array (a computed .map() or even a const
      // reference throws "Unknown node type"). Keep in sync with FRAME_CATEGORIES.
      storySort: {
        order: [
          "Prices & Markets",
          "Crypto & On-chain",
          "Bitcoin Network",
          "Derivatives & Options",
          "Macro & Rates",
          "Equities & Filings",
          "Sentiment & News",
          "Portfolio",
          "Decision Journal",
          "Tools & Utility",
          "Layout & Media",
          "Games",
        ],
      },
    },
  },
  globalTypes: {
    themePreset: {
      description: "Cosmetic preset",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: THEME_PRESETS.map((p) => ({ value: p.key, title: p.label })),
      },
    },
    frameSize: {
      description: "Frame size",
      toolbar: {
        title: "Size",
        icon: "grow",
        dynamicTitle: true,
        items: [
          { value: "sm", title: "Small" },
          { value: "default", title: "Default" },
          { value: "wide", title: "Wide" },
          { value: "tall", title: "Tall" },
        ],
      },
    },
    density: {
      description: "Card density",
      toolbar: {
        title: "Density",
        icon: "component",
        dynamicTitle: true,
        items: [
          { value: "compact", title: "Compact" },
          { value: "normal", title: "Normal" },
          { value: "comfortable", title: "Comfortable" },
        ],
      },
    },
  },
  initialGlobals: {
    themePreset: "zframes",
    frameSize: "default",
    density: "normal",
  },
};

export default preview;
