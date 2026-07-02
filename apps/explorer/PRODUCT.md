# Product

## Register

brand

The explorer is a hybrid — a marketing front door (landing + curated/community gallery) wrapped around a working tool (frame catalogue, live dashboard viewer, browser editor, moderation). The **front door leads** the design: it is the public face of zframes, so its job is to communicate. The tool surfaces stay clean and usable but inherit the same market-terminal visual language rather than diverging into generic product-chrome.

## Users

Developers and market-curious builders who drive AI coding agents (Claude Code, Cursor, Codex, Gemini). They arrive from the repo, a share link, or word of mouth to answer one question: *what is this, and is it worth installing the skill?* Their context is a browser tab open next to their terminal. Secondary users: people who already use zframes, returning to browse the community gallery, preview a board with live data, publish their own, or fork someone else's onto their machine.

## Product Purpose

Prove, in the browser, that an agent-generated market terminal is real and good — then convert the visitor into someone who installs the skill and talks to their agent. It showcases live, keyless dashboards (real data, no signup), lets anyone preview/fork/publish, and browse the full frame catalogue. Success = a visitor understands the pitch in one fold, sees a genuinely premium live terminal, and copies the install command. It is the shop window for a CLI-first, own-your-`dashboard.json` product — never a hosted SaaS.

## Brand Personality

Confident, technical, and alive. Three words: **precise, agent-native, living.** The voice is a market desk at night — dark, focused, data-forward, with a living aurora behind the glass. It states capabilities plainly ("keyless", "stocks first", "yours to own") without hype. It should feel like the product it sells: the explorer *is* a zframes surface, not a marketing site that talks about one. Emotional goal: the quiet confidence of a professional terminal, warmed by motion so it reads as alive rather than sterile.

## Anti-references

- **Generic dark SaaS landing** (Linear/Vercel clone: pure-black, one indigo gradient CTA, three identical feature cards, a fake browser mockup). The explorer must not look like every other dev-tool homepage.
- **Glassmorphism-everywhere** — frosted translucent white cards as the default surface. The real dashboard uses opaque, navy-tinted terminal surfaces; the explorer should too.
- **Gradient display text** and **decorative uppercase eyebrows above every section** — AI-scaffolding tells the real dashboard never uses.
- **Hosted-dashboard-service framing.** This is not a Grafana/Retool competitor with a builder UI; nothing should imply a login-walled hosted product.
- **Crypto-casino neon.** Alive, not garish; the motion and glow stay disciplined.

## Design Principles

1. **The explorer is a zframes dashboard.** Its chrome should be indistinguishable in materials from a real generated board — same tokens, same surfaces, same living backdrop. Practice what you preach.
2. **Show the live thing.** Prefer real frames rendering real data over screenshots and prose. The proof is the product running.
3. **Terminal calm, not casino.** Dark and data-forward; motion and glow are disciplined accents that signal "alive," never decoration for its own sake.
4. **One cohesive material system.** A single surface, border, radius, and accent language shared across landing, gallery, viewer, and editor — no per-page reinvention.
5. **Confidence through specificity.** Plain, exact claims (keyless, stocks-first, one `dashboard.json`) beat adjectives.

## Accessibility & Inclusion

- Target WCAG 2.1 AA: body text ≥ 4.5:1, large text ≥ 3:1. On the dark terminal surface, keep body copy toward the ink end (`#e7ecf6`-class), not faint white-alpha grays that fail contrast.
- Full `prefers-reduced-motion` support: the aurora scene, marquees, entrance reveals, and pulse must have static/instant alternatives (the WebGL backdrop already degrades to the static gradient).
- The unicorn scene is decorative (`aria-hidden`) and must never gate content legibility — a contrast scrim sits over it and cards stay opaque, so text always wins even if the scene fails to load or the device is low-end.
- Semantic up/down color is reinforced by sign/label, never color alone.
