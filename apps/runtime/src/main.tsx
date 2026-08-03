import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
    {/*
      Annotation toolbar for visual feedback, dev-only — it portals itself to
      <body>, so mounting it here is placement-neutral. `agentation` declares
      sideEffects:false and inlines its CSS into the JS, so the DEV guard alone
      is enough for rollup to drop it from the production bundle that
      `pnpm build:cli` vendors into the published CLI.

      Footgun: WITHOUT an explicit `endpoint`, <Agentation /> is localStorage-only
      — annotations never reach the MCP server and the agent's watch loop sees
      nothing.
    */}
    {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
  </StrictMode>,
);
