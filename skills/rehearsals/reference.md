# Rehearsal step reference

The full vocabulary a rehearsal can use. Saving (`wp rehearsal save`) validates against all of it and says what is wrong.

A rehearsal is a JSON object with a `steps` array and optional settings. Each step has exactly one action.

## Steps

| Step | What it does |
| --- | --- |
| `{ "goto": "/wp-admin/…" }` | Loads a page of this site. Paths under `/wp-admin/` use the admin URL, others the home URL. |
| `{ "click": sel }` | Clicks once the element is enabled, as Playwright does. A link that opens a new tab loads in the frame instead. |
| `{ "fill": sel, "value": "…" }` | Types into an input or textarea (works with React-controlled fields). |
| `{ "check": sel }` / `{ "uncheck": sel }` | Sets a checkbox or radio. A label or wrapper works too. |
| `{ "selectOption": sel, "value": "…" }` | Picks an option by its value, or else its label. |
| `{ "hover": sel }` | Sends the mouse events a pointer would. |
| `{ "press": "Enter", "on": sel }` | Sends a key, such as `Enter`, `Escape`, `Tab` or `Control+A`. |
| `{ "expect": sel, <matcher> }` | Waits until the matcher holds, or fails with what the page showed. |
| `{ "waitFor": sel }` | Waits until something is visible. |
| `{ "expectText": "…", "in": sel }` | Waits until the page (or `in`) contains the text. |
| `{ "expectNoConsoleErrors": true }` | Fails on script errors so far: `console.error`, uncaught errors, rejected promises. Use `{ "ignore": [ "regex" ] }` to skip known ones. |
| `{ "snapshot": sel }` | Saves the element's HTML with the run. |
| `{ "dialog": "accept", "value": "…" }` / `{ "dialog": "dismiss" }` | Answers the next alert, confirm or prompt (`value` is the prompt's text). Put it before the step that opens the dialog. Without one, dialogs are dismissed, as in Playwright. |
| `{ "screenshot": "name" }` | Playwright only; mark the rehearsal `"needs": "playwright"`. |

`expect` takes one matcher, named after Playwright's: `toBeVisible`, `toHaveText` (whole text),
`toContainText`, `toHaveCount`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveValue`. Add
`"not": true` to invert it. The yes-or-no matchers only take `true`: `"toBeVisible": false` is rejected,
because it used to check for visible; write `"toBeVisible": true, "not": true`.

## Selectors

- CSS: `#submit`, `.notice`, `form.contact-form input[type=email]`
- `text=Save settings`: an element containing that text, or whose `aria-label` does (icon buttons)
- `role=button`, `role=table`, … (`role=tab:has-text("Settings")` works too; the Playwright export turns
  it into `.filter( { hasText } )`, since Playwright's own `role=` rejects `:has-text`)
- `:has-text("…")` on the last part of a CSS selector: `tr:has-text("Ada")`
- `a >> b`: `b` inside `a`. When `a` is an iframe, `b` is looked up inside it, which is how you reach
  the block editor: `iframe[name="editor-canvas"] >> [data-type="jetpack/contact-form"]`

Steps act on the first **visible** match.

## Step options

Any step takes `"optional": true` (a failure is logged as skipped, useful for welcome guides that only
sometimes appear) and `"timeout"` in milliseconds. The rehearsal-level `"timeout"` sets the default
(10 seconds). `{{run}}` anywhere in a step becomes a value unique to each run, so a rehearsal can find
the form, page or response it just created.

## Rehearsal settings

| Key | Example | Effect |
| --- | --- | --- |
| `requires` | `[ "jetpack" ]` | Plugins that must be active (folder names or text domains). `"jetpack or jetpack-premium-analytics"` is met by either. Otherwise the rehearsal is disabled. |
| `theme` | `"twentytwentyfour"` or a list | The active theme (a child of it counts). Otherwise disabled. |
| `viewport` | `"desktop"` | Runs only at that size, `"desktop"` or `"mobile"`, whatever the Desktop / Mobile switch says. For steps that only work at one size, such as a button that moves into a menu on phones. |
| `role` | `"editor"` | Runs as a test user with that role (see below). |
| `budgets` | `{ "lcp": 2500, "weight": 2097152 }` | Measures every page load and flags the ones over budget. Without it nothing is measured. |
| `covers` | `[ "packages/forms" ]` | Labels for what the rehearsal exercises, so a CI job can pick rehearsals by what changed. |
| `needs` | `"playwright"` | Skips the browser runner; for rehearsals that need screenshots or other sites. |
| `timeout` | `20000` | Default step timeout in ms. |
| `format` | `1` | The oldest rehearsal format that can run it. Added when the rehearsal is saved; you don't write it. |

## Tips

- Make what you create unique with `{{run}}`, then find it again: `tr:has-text("Ada Verify {{run}}")`.
- Before leaving a page, wait for its confirmation. A `goto` straight after a click can cancel the save
  that click started.
- A click that loads another page isn't waited for, here or in Playwright. Next, expect something that
  is only on the new page; otherwise the step can still match the old one.
- Close welcome guides with an optional step:
  `{ "click": "[role=dialog] button[aria-label=\"Close\"]", "optional": true, "timeout": 4000 }`.
- Steps that change the site say so in the title, like the examples do.


Budget keys are `ttfb`, `fcp`, `lcp` (ms), `cls`, `requests`, `weight` and `js` (compressed bytes). Going over is a notice, never a failure.
