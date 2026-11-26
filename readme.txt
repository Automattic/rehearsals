=== Rehearsals ===
Contributors: automattic, enej
Tags: testing, qa, end-to-end, playwright, development
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.21.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Repeatable, shareable step-by-step checks of your site, run in your browser from Tools → Rehearsal.

== Description ==

Rehearsal lets anyone who verifies a change (the author, a reviewer, or an agent) repeat the same check the same way.

A rehearsal is a short list of steps written as JSON: go to a page, click, fill in a field, expect some text. It runs in your browser, against the site you are logged into, and every run is saved on the site as a read-only record.

* **Run from wp-admin.** Tick the rehearsals you want under Tools → Rehearsal and press Run. Each step's page loads in a frame beside the list, with a progress bar and a time estimate.
* **Clear results.** Each step's log says what it waited for and what the page showed instead. Script errors are grouped by page and script, ready to copy into a bug report.
* **Share.** Every rehearsal has a share link. Another site can install it from that link and keep the same rehearsal ID, so results compare across sites.
* **Desktop or mobile.** Pages render at desktop size or at a phone's 390 × 844.
* **Run as a role.** A rehearsal can run as an editor, author, or any other role, using a test user that Rehearsal creates for it.
* **Requirements.** A rehearsal can say which plugins, theme or role it needs, and warns before running on a site without them.
* **Playwright export.** Turn selected rehearsals into a standalone Playwright test for CI. The test saves its results back to the site.
* **WP-CLI, REST and abilities.** `wp rehearsal`, the `rehearsal/v1` REST routes and, on WordPress 7.1 and later, abilities for the Abilities API and MCP save, list, install and report on rehearsals without a browser.
* **Made for AI agents too.** A ready-made agent skill teaches coding agents to write a rehearsal for a change, run it headless and put the result in a pull request.

Only administrators can see, edit or run rehearsals.

Development happens on GitHub: https://github.com/Automattic/rehearsals

== Installation ==

1. Install and activate the plugin from Plugins → Add New, or upload the `rehearsals` folder to `wp-content/plugins`.
2. Go to Tools → Rehearsal.
3. Press **Add example rehearsals** to get a few that work on any site, then tick some and press **Run**.

== Frequently Asked Questions ==

= What does a rehearsal look like? =

    {
      "steps": [
        { "goto": "/wp-admin/options-discussion.php" },
        { "expect": "h1", "toHaveText": "Discussion Settings" },
        { "check": "#thread_comments" },
        { "expectNoConsoleErrors": true }
      ]
    }

Saving checks the JSON and tells you what is wrong. The full list of steps and options is in the README on GitHub.

= Does it change my site? =

Only if the rehearsal's steps do, just as if you clicked through those steps yourself. Run rehearsals on test or staging sites, not on a live site.

= How does "run as a role" work? =

The first time a rehearsal needs a role, Rehearsal creates a test user for it (for example `rehearsal-editor`) and marks the user as its own. It never uses an existing account. While that rehearsal runs, pages loaded in the Rehearsal frame act as the test user. Only an administrator can start this, and it ends when the rehearsal does.

= Why is there a script on every page? =

A small recorder collects script errors and page-load timings for the run. It is only printed for administrators and for pages loaded while a rehearsal runs as a role, and it does nothing outside the Rehearsal frame.

= What can't the browser runner do? =

It cannot open other sites, take screenshots, open menus that only appear on CSS `:hover`, or type characters with `press`. Export the rehearsal to Playwright for those.

= Can AI agents use it? =

Yes. The GitHub repository has an agent skill (`skills/rehearsals`) and a setup guide (`docs/agent-setup.md`). With them, an agent such as Claude Code or Codex can save a rehearsal with WP-CLI, run it in a headless browser through a run link, and read the saved result. In Claude Code, install the skill with `/plugin install rehearsals --marketplace Automattic/rehearsals`.

= Does it work over MCP? =

On WordPress 7.1 and later, yes. Rehearsals registers abilities for listing, saving and installing rehearsals, making run links, reading runs and writing a pull request report. With the MCP Adapter plugin active, an AI agent connected to your site as an administrator can use them. Running a rehearsal still happens in a browser, through the run link.

= Can I try it without installing it? =

Yes. Press Live Preview on this page, or open the demo from the GitHub README in WordPress Playground. It runs two rehearsals, one on the front end and one in wp-admin, as soon as Tools → Rehearsal opens.

= Is there a WP-CLI command? =

Yes. Run `wp rehearsal` to see its subcommands: `save`, `list`, `install`, `runs` and `block`.

== External services ==

Rehearsal does not contact any service on its own.

When an administrator installs a rehearsal from a share link (**Install from link**, or `wp rehearsal install`), the site fetches that link to read the rehearsal. The request goes only to the address the administrator entered, which is usually another site running Rehearsal, and it sends nothing about this site.

Share links on this site (`/?rehearsal=<id>.<key>`) return a single rehearsal's title and steps to anyone who has the link. Each link has its own key, so one link reveals no other rehearsal.

== Screenshots ==

1. Tools → Rehearsal after a run: rehearsals on the left, the test frame on the right.
2. A run in progress, with the progress bar and the current step's page.
3. A page rendered at mobile size.
4. Script errors from a run, grouped by page and script.
5. The rehearsal dialog, with its share links.
6. Exporting rehearsals to Playwright.

== Changelog ==

= 0.21.0 =
* First release as a standalone plugin. Rehearsal used to ship inside the Jurassic Ninja Companion plugin, and it keeps the same data, so existing rehearsals and runs carry over.
