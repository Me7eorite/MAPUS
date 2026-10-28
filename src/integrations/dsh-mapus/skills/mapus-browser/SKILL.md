# MAPUS browser playbook

Load this skill only when the job is "read something in a real browser / click
something / prove something". Tool names carry the `mapus_` prefix; the actual
work happens inside the user Chrome extension.

## When to use it

- You need the real content of the current tab (URL, title, visible text, DOM, storage, cookies).
- You need what MAPUS already found (sensitive data, endpoint surface, fingerprints, anti-honeypot state).
- You need to actually operate the page (click, type, select, scroll, hover) to confirm a conclusion.
- You need network requests, console errors, a screenshot, or to run JS inside the page.

Skip these tools when the task is only reading public material, computing, or writing code.

## Opening move

1. `mapus_page_context` — get the lay of the land first: URL, title, scan counts, fingerprints, protection state.
2. Then pick a direction:
   - business semantics → `mapus_page_text`
   - structure / forms / hidden elements → `mapus_dom_query`
   - credentials and session state → `mapus_scan_findings` (credentials / cookies / jwts), `mapus_page_storage`
   - endpoint surface → `mapus_collect_endpoints`, then `mapus_browser_network`
   - fingerprints and backend → `mapus_fingerprints`

## Driving the page

Take `mapus_browser_snapshot` first: it returns the interactive elements, each
with a `ref` such as `e3`. Then act by `ref` or a CSS selector:

- click `mapus_browser_click` (real mouse event, `isTrusted=true`)
- type `mapus_browser_type` (`clear` empties first, `submit` presses Enter)
- keyboard `mapus_browser_key` (combos such as `Control+A` supported)
- select `mapus_browser_select`, hover `mapus_browser_hover`, scroll `mapus_browser_scroll`
- navigate `mapus_browser_navigate` (`goto` / `back` / `forward` / `reload`)

After every action, **take a fresh snapshot** before deciding the next step. Once
the page structure changes, old `ref` values are dead.

## Hard rules

1. **One action at a time.** Never click three buttons in one turn and only then
   discover the first click was wrong.
2. **Conclusions need evidence.** Before saying "an unauthenticated endpoint
   exists", you need at least one response from `mapus_probe_http` or
   `mapus_browser_network`. Before saying "the page throws errors", check
   `mapus_browser_console`.
3. **Look unknown tools up first.** `mapus_catalog` lists every capability;
   anything not listed there goes through `mapus_tool`:
   `{ name: "<extension-side tool name>", args: {...} }`.
4. **Use the native dsh tools for local commands, nothing else.** Run shell with
   `bash` (`pwsh` on Windows), read and write files with `read` / `write` / `edit`,
   search with `glob` / `grep`. Those are the only local execution entry points,
   they run with the current user permissions, so judge how destructive a command
   is before running it.
5. **Classify tool errors first**: bad argument → fix the argument; page state →
   take a snapshot or read the context; capability off → tell the user which
   switch turns it on. Never fire the same command three times.

## Output

Separate "verified" from "unverified" in every conclusion. For verified claims,
name the call that produced the evidence. For unverified ones, say what is still
missing and how you plan to fill the gap.
