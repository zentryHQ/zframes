# Fork a shared dashboard (from an explorer link)

Read this when the user gives you a zframes **explorer link** — a
`.../dashboard/<id>` URL, a `.../dashboard/<id>/dashboard.json` URL, or the
pasted fork prompt. They want that shared dashboard **on their own machine** to
own and personalize. Don't interview or build from scratch; fetch it, serve it,
then offer to tweak it. This is the web→local handoff: the explorer is the
showroom; forking pulls the artifact home.

1. **Fetch the spec.** Resolve the raw URL: if the link already ends in
   `/dashboard.json`, use it as-is; otherwise append `/dashboard.json`. Fetch it:

   ```bash
   curl -fsSL "<url>/dashboard.json" -o /tmp/zframes-fork.json
   ```

   (Or use your own web-fetch tool.) The result is a complete, valid
   `dashboard.json` — the whole dashboard, not a fragment.

2. **Land it in the store under a name.** Pick a short name from the title, `init`
   the store entry, then **replace its file wholesale** with the fetched spec:

   ```bash
   npx --yes zframes@latest init <name> --title "<title from the spec>"
   ```

   `init` prints the store path it created
   (`~/.config/zframes/dashboards/<name>/dashboard.json`). Overwrite that file with
   the contents of `/tmp/zframes-fork.json` — the fetched spec is the entire
   dashboard, so replace, don't merge.

3. **Lint + serve** (SKILL.md steps 5–6): `zframes lint <name>`, then
   `zframes serve <name>`. Now it's a real file they own, running live.

4. **Offer to personalize.** It's now an ordinary "update"
   (`references/design.md` rules) — "want me to swap in your tickers, add a
   frame, or retheme it?" Read the file, change only what they ask, re-lint,
   and the page reloads.
