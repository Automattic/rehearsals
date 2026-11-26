# Setting up Rehearsals for an agent

This gets an AI agent (Claude Code, Codex, or any agent with a shell) to the point where it can write a
rehearsal, run it headless against a WordPress site, and read the result. It takes four things: the
skill, the plugin on the site, a browser, and a way to log that browser in.

When everything below works, the agent follows [the skill](../skills/rehearsals/SKILL.md).

## 1. Give the agent the skill

The skill is the `skills/rehearsals/` folder: `SKILL.md`, the step vocabulary in `reference.md`, and
`scripts/run-link.cjs`.

**Claude Code**, as a plugin:

```
/plugin install rehearsals --marketplace Automattic/rehearsals
```

On Claude Code older than 2.1.275, add the marketplace first:
`/plugin marketplace add Automattic/rehearsals`, then `/plugin install rehearsals@rehearsals`.

**Any other agent**, or Claude Code without the plugin system: copy the folder to where the agent reads
skills, for example:

```bash
git clone --depth=1 https://github.com/Automattic/rehearsals /tmp/rehearsals
cp -R /tmp/rehearsals/skills/rehearsals ~/.claude/skills/      # Claude Code, every project
cp -R /tmp/rehearsals/skills/rehearsals .claude/skills/        # Claude Code, this project only
cp -R /tmp/rehearsals/skills/rehearsals ~/.agents/skills/      # Codex, Copilot CLI, Gemini CLI
```

An agent without skills support can be pointed at `skills/rehearsals/SKILL.md` directly.

## 2. Put the plugin on the site

Use a test or staging site: rehearsals really click and save.

```bash
wp plugin install rehearsals --activate
# or, before it is on wordpress.org, or for the latest trunk:
wp plugin install https://github.com/Automattic/rehearsals/archive/refs/heads/trunk.zip --activate
```

**Jurassic Ninja sites** already have Rehearsal through the Companion plugin. Check with
`wp rehearsal list`. If both copies are installed, the standalone plugin steps aside.

Check it works:

```bash
wp rehearsal list          # an empty table is fine
```

**No test site yet?** The Playground demo starts a throwaway WordPress with Rehearsals and runs a
front-end and a wp-admin rehearsal, all on your machine:

```bash
npx @wp-playground/cli@latest server --blueprint=https://raw.githubusercontent.com/Automattic/rehearsals/trunk/playground/blueprint.json
```

Then open `http://127.0.0.1:9400/wp-admin/tools.php?page=rehearsal`; Playground logs you in. It's good for
seeing a run, but it has no WP-CLI from outside, so use a real test site for the steps below.

The agent needs WP-CLI on the site: locally, through `wp --ssh=user@host/path`, or through the
host's own shell. Without WP-CLI, the REST routes under `/wp-json/rehearsal/v1/` and the screen at
Tools → Rehearsal do the same things.

## 3. Install a browser

The run script uses Playwright's Chromium. Install it once, in the folder you'll run the script from:

```bash
mkdir -p ~/rehearsal-runner && cd ~/rehearsal-runner
npm init -y >/dev/null && npm i -D playwright && npx playwright install chromium
```

`run-link.cjs` finds Playwright in the current folder or next to itself, so run it from there.

No Node? The agent can still save rehearsals and read results with WP-CLI, and hand the run link to
a person: opening it in their logged-in browser runs the rehearsal and saves the result.

## 4. Log the browser in

Rehearsals run as an administrator. Pick one:

- **A saved session.** A person logs in once and saves it:
  `npx playwright open --save-storage=auth.json https://<site>/wp-login.php`, then closes the browser.
  The agent runs with `STORAGE_STATE=auth.json`. Sessions expire; save again when runs report
  "not logged in".
- **A test administrator.** On a throwaway or local site, create one for the agent and pass it as
  `WP_USER` and `WP_PASS`:

  ```bash
  wp user create rehearsal-agent agent@example.test --role=administrator --user_pass="$(openssl rand -hex 12)" --porcelain
  ```

  Keep the password in the environment or a local `.env`, not in prompts, rehearsals or PRs. Never give
  the agent a person's own password or a production login.

## 5. First check

Save a rehearsal that passes on any site, run it, and read the result:

```bash
cat > front-page.json <<'JSON'
{ "steps": [ { "goto": "/" }, { "expect": "body", "toBeVisible": true }, { "expectNoConsoleErrors": true } ] }
JSON
RUN_URL=$(wp rehearsal save front-page.json --title="Front page renders" --format=json | jq -r .runUrl)
cd ~/rehearsal-runner && STORAGE_STATE=auth.json node /path/to/skills/rehearsals/scripts/run-link.cjs "$RUN_URL" --ref=setup-check
wp rehearsal runs --ref=setup-check --format=json
```

The script prints `{"status":"pass",…}` and exits 0. If so, the agent is set up.

Tools → Rehearsal → **Add example rehearsals** adds a few more that work on any site, including one
that tests the Rehearsal screen itself.

## In CI

- Run the rehearsals for a change with the run script against a test site, using a stored
  `STORAGE_STATE` or a test administrator from the CI's secrets, and `--ref=<PR number>`.
- Or export them with **Run in Playwright** (or a share link with `&format=playwright`) and run them
  with `npx playwright test`. That export also takes screenshots and can open other sites, which the
  browser runner can't. The README's "Running rehearsals in Playwright" section has the steps.
- `"covers"` labels on rehearsals let a CI job pick the ones that match the files a PR changed.

## When it doesn't work

| Symptom | Cause |
| --- | --- |
| `Error: 'rehearsal' is not a registered wp command` | The plugin isn't active on that site, or WP-CLI points at another install (`--path`, `--ssh`). |
| `{"status":"error","message":"No Rehearsal screen at …/wp-login.php…"}` | The browser isn't logged in. Save the session again, or check `WP_USER`/`WP_PASS`. |
| `Playwright is not installed here` | Run the script from the folder where you installed Playwright. |
| `status: "error"` with "can't run on this site" | The rehearsal `requires` a plugin, theme or role this site lacks. `wp rehearsal list` shows which. |
| `status: "queued"` | The rehearsal has `"needs": "playwright"`. Use the Playwright export. |
| `status: "timeout"` | A step waited a long time; raise `--timeout`, or look at the run in Tools → Rehearsal → Recent runs. |
