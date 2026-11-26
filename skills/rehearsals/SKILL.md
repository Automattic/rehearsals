---
name: rehearsals
description: Use when verifying a change on a WordPress site in a real browser, writing a repeatable click-through check of wp-admin or the front end, re-running a check someone shared as a "?rehearsal=" link, or reporting a verified result in a PR description. Applies to sites with the Rehearsals plugin (Tools → Rehearsal, `wp rehearsal`), including Jurassic Ninja sites.
---

# Rehearsals

A rehearsal is a short JSON list of browser steps (go to a page, click, fill, expect) saved on a
WordPress site. It runs in a logged-in browser against that site, and every run is saved on the site
as a read-only record you can look up by run number or by a label (`ref`).

Use it to prove a change works the same way every time, and to hand the same check to a reviewer.

If the site doesn't have the plugin yet, or you have no way to log a browser in, follow
`docs/agent-setup.md` in https://github.com/Automattic/rehearsals first.

## Quick reference

| Need | Command |
| --- | --- |
| Is it installed? | `wp plugin is-active rehearsals && wp rehearsal list` |
| Save a rehearsal | `wp rehearsal save check.json --title="Tagline saves (changes the tagline)" --porcelain` (prints its ID; `-` or no file reads stdin) |
| Update one | `wp rehearsal save check.json --id=12` |
| Get its ID and run link | `wp rehearsal save … --format=json` → `id`, `runUrl`; later `wp rehearsal list --format=json` |
| Run it, headless | `node scripts/run-link.cjs "<run_url>" --ref=<label>` |
| Read the runs | `wp rehearsal runs --ref=<label> --format=json` → `{ runs: [ { id, status, log: [ { ok, msg, ms } ], errors } ], total, pages }` |
| Install a shared one | `wp rehearsal install "<share link>" --yes --porcelain` |
| PR description block | `wp rehearsal block <id>` |

`scripts/run-link.cjs` is next to this file. Run it by its full path, from a folder where the
`playwright` package is installed: it looks for Playwright in the current folder. When WP-CLI can't see
your files (`--ssh=…`, Docker), pipe the JSON in: `wp rehearsal save - --title=… < check.json`.

## Over MCP

On WordPress 7.1 and later, Rehearsals registers abilities. With the
[MCP Adapter](https://wordpress.org/plugins/mcp-adapter/) plugin active, an MCP client connected as an
administrator finds them through the adapter's `discover-abilities` tool and calls them with
`execute-ability` (`{ "ability_name": "rehearsals/…", "parameters": { … } }`). Results come back as
`{ "success": true, "data": … }`.

| Ability | Same as |
| --- | --- |
| `rehearsals/list-rehearsals` | `wp rehearsal list` |
| `rehearsals/get-rehearsal` `{ id }` | one rehearsal with its steps |
| `rehearsals/save-rehearsal` `{ title, rehearsal: { steps }, id? }` | `wp rehearsal save` |
| `rehearsals/install-rehearsal` `{ url }` | `wp rehearsal install --yes` |
| `rehearsals/get-run-link` `{ ids, ref? }` | a run link for one or more rehearsals |
| `rehearsals/find-runs` `{ rehearsal?, ref?, status?, page? }` | `wp rehearsal runs` |
| `rehearsals/get-report` `{ id }` | `wp rehearsal block` |

Abilities can't run a rehearsal: that needs a logged-in browser. Get a run link with
`rehearsals/get-run-link`, open it with `scripts/run-link.cjs`, then read the result with
`rehearsals/find-runs` and the same `ref`. The steps below work the same way with abilities in place of
WP-CLI.

## Verifying a change

1. **Write the steps** to `check.json`. End with an `expect` that only holds when the change works,
   and usually `{ "expectNoConsoleErrors": true }`. The vocabulary is in `reference.md`.

   Make the check fail when the change is missing. If the target value might already be in place (a
   setting already at 7), set something else first and then the value you are testing; otherwise the
   rehearsal passes without proving anything. Before a second save on the same page, `goto` it again,
   so the second "Settings saved" can't match the notice from the first.

   ```json
   {
     "steps": [
       { "goto": "/wp-admin/options-general.php" },
       { "fill": "#blogdescription", "value": "Tagline {{run}}" },
       { "click": "#submit" },
       { "expect": "#setting-error-settings_updated", "toContainText": "Settings saved" },
       { "expect": "#blogdescription", "toHaveValue": "Tagline {{run}}" },
       { "expectNoConsoleErrors": true }
     ]
   }
   ```

2. **Save it.** `wp rehearsal save check.json --title="…" --porcelain` prints its number. A validation
   error says which step is wrong; fix the JSON and save again. Saving identical title and steps
   returns the existing rehearsal, so re-running this is safe.

3. **Run it** with a `ref` you will search by, such as the task or PR:

   ```bash
   RUN_URL=$(wp rehearsal save - --title="…" --format=json < check.json | jq -r .runUrl)
   WP_USER=admin WP_PASS=… node /path/to/skills/rehearsals/scripts/run-link.cjs "$RUN_URL" --ref=pr-481
   ```

   Saving again with the same title and steps is harmless, so this is also how to re-run. The script prints `{"status":"pass","runIds":[233],…}` and
   exits 0 on pass, 1 on fail, 2 otherwise.
   Use `STORAGE_STATE=auth.json` instead of `WP_USER`/`WP_PASS` when you have a saved session.
   Without Node or Playwright, give the person the run link: opening it in their logged-in browser
   runs the rehearsal straight away.

4. **Read the result.** `wp rehearsal runs --ref=pr-481 --format=json` returns
   `{ "runs": [ … ], "total": n, "pages": n }`, newest first. Each run has its number (`id`), `status`, a `log` of
   steps (`ok`, `msg` with what it waited for and what the page showed instead, `ms`) and script
   `errors`. `ms` is how long the step waited; 0 means it held at once. Fix the code or the
   steps and repeat from step 2. Saving changed steps makes old results stale, which is what you want.

5. **Report it.** `wp rehearsal block 12` prints a summary with the latest result and the JSON folded
   away, ready for a PR description. Its links point at the site: on a public test site the share link
   lets a reviewer install the exact check on their own site; on a local site the links won't open for
   anyone else, but the folded JSON still works, since `wp rehearsal save` takes it.

   Share links (`?rehearsal=…`) are meant to be passed around; they reveal one rehearsal. Keep run links
   (`&run=…`) to yourself and the site's admins: they only work for a logged-in administrator, and the
   key in them is what stops another site from making an admin's browser run something.

## Results

| `status` | Means | Do |
| --- | --- | --- |
| `pass` | Every step held | Report it |
| `fail` | A step failed | Read the run's log; fix the change or the steps |
| `queued` | The rehearsal needs Playwright (`"needs": "playwright"`) | Export it (Tools → Rehearsal → Run in Playwright) |
| `error` | Nothing ran: a rehearsal is deleted, can't run here (missing plugin, theme or role), or the link's key is wrong | Read `message`; `wp rehearsal list` shows `can_run` (`missing` in JSON) |
| `timeout` / not logged in | The script never saw a result | Check the login and that the plugin is active |

## Common mistakes

- **Going to the next page before the save lands.** A `goto` straight after a click can cancel the
  request the click started. Expect the confirmation first.
- **Expecting on the old page.** A click that navigates isn't waited for. Next, expect something that
  only exists on the new page.
- **Colliding with earlier runs.** Put `{{run}}` in anything you create, then find it with
  `tr:has-text("Name {{run}}")`.
- **Typing with `press`.** `press` sends keys like `Enter`; use `fill` for text.
- **Matching too loosely.** `toContainText` on `body` passes on error pages too. Target the element
  that changed.
- **Running on a live site.** Steps really click and save. Use a test site, and say "(changes …)" in
  the title of any rehearsal that changes settings. Don't add steps that put the old value back: on a
  reviewer's site they would overwrite theirs. Say in your report what the run left changed.
- **Guessing front-end selectors.** Themes differ. Fetch the page first (`curl -s <site>/`) and pick a
  visible element, such as the header's site title link. Only visible elements match, so `<title>` and
  other `<head>` tags can't be expected; the `goto` line in the run log shows the page's title instead.
- **Inventing steps.** Only the steps and matchers in `reference.md` exist; saving rejects others.

The browser runner can't open other sites, take screenshots, or open CSS-only `:hover` menus. For
those, set `"needs": "playwright"` and use the Playwright export.
