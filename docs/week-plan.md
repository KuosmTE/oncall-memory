# Contest week — the run sheet

Deadline: **Tue 2026-12-22, 12:00 pm PT = 22:00 EET**. Today is 2026-11-23: **29 days**.
Judging runs 2027-01-05 → 02-03, winners on/around 2027-02-15. Have the submission in by
**2026-12-15** — the submit button is the only thing you cannot fix afterwards.

Rules that shape this plan (checked 2026-11-23 against `codegeist2026.devpost.com/rules`):

- Three categories, one winner each for 1st/2nd/3rd. Ours: **Apps for Software Teams**.
- Four bonus prizes, $1,500 each, 6 winners each: Best Agents (Rovo/assignable), Best app with
  Atlassian MCP, Best Teamwork Graph integration, Best Marketplace published app.
- **One submission can win at most one Grand Prize and one Bonus Prize.**
- **An installation link is a hard requirement** ("Provide access to an installation link for the
  judges and review team"). A demo-site install is not that.
- An Entrant may submit **more than one** Submission, but each must be "unique and substantially
  different".
- Judging: five equally weighted criteria — Technological Implementation, Design, Potential Impact,
  Innovation/Idea, Presentation.

## Already done (do not redo)

- P6a (single-owner badge + draft the ask) — deployed and proven on `development` **4.6.0**.
- **Production** deploy **2.0.0** (2026-11-23) — the prerequisite for the installation link.
- `PRIVACY.md` (needed by the distribution form), `JUDGES.md` (the judge instructions the rules ask
  for), `SKILL.md` (for third-party agents, which the MCP bonus mentions), `docs/devpost.md` text,
  upload copy in `DEMO.md`.

## 1. Unblock the install link — 25 min

a. **Flip the repo public**: GitHub → `KuosmTE/oncall-memory` → Settings → General → Danger zone →
   Change visibility → Public. (Checked 2026-11-23: `.env` is git-ignored and no secret is committed;
   the only token-looking strings are documentation placeholders.)
b. Open
   <https://developer.atlassian.com/console/myapps/d0c1b623-3512-4219-8760-0b15e2bd80b2/manage/distribution>
c. **Distribution controls → Edit → Sharing** — not "Sharing within organization", the judges are
   outside your org.
d. Fill the form: company `bittisorvi.org`; support `https://github.com/KuosmTE/oncall-memory/issues`;
   privacy `https://github.com/KuosmTE/oncall-memory/blob/main/PRIVACY.md`; *stores personal data*
   → **No**. (The Atlassian **Developer Space** is still named "Minttu Labs" — that is the string the
   install page shows as the provider. Rename it in the console first if you want the two to match;
   it is a one-field change and costs nothing.)
e. Products: **Jira**. Save changes, then copy the generated installation link.
f. Paste the link into `JUDGES.md` (marker `INSTALL_LINK`) and into the Devpost **Access** field.
g. **Test it as a stranger**: incognito → the link → sign in as admin of a *second* free site →
   install → open an issue → the panel renders (the empty state counts). This also closes the
   "fresh-install check" box in the Devpost draft.

If the form refuses to generate a link: the app must be in production (done), not paid, carry no
license in the manifest (it does not), and not be submitted for Marketplace listing (it is not).

**Freeze rule:** once the link is in the submission, do not deploy to production again unless you mean
it. A new production version with new scopes makes every existing install (including a judge's) ask for
re-consent, and a judge who hits an approval prompt mid-review may simply not. If the TWG spike lands,
build and deploy it **before** the final link goes into the form, or after submission leave it alone.

## 2. Record the beats — 45 min

`node tools/demo-preflight.mjs` first → must be **6/6 PASS**.

Then the **panel smoke test, four checks** (no script can check inside the Forge iframe, and this is
what the 0:20–0:55 beats depend on):

1. Open MOBL-122 → **View app actions** → **On-Call Memory**. The panel appears above Activity with
   a `DEV` badge. This is a menu item, not a sidebar section — until it is clicked the app never runs.
2. The card shows three people with labelled receipts, the `Single owner: …` line and the
   **Draft the ask** button.
3. **Click a receipt key** (e.g. `MOBL-70`) → the issue opens in a new tab. If nothing happens, the
   `router.open` fix regressed and the 0:40 beat cannot be filmed.
4. Click **Draft the ask** → the message block appears under the top person.

Then follow `DEMO.md` → *Film-day run sheet*: one file per beat into `~/Videos/oncall-raw/`. The only
human-only prep there is the MCP toggle (step 3 of the weekend run book).

## 3. Upload and paste — 20 min

Title, description and chapters are in `DEMO.md` → *Upload copy*. Correct the chapter times against
the real cut. Public on YouTube; unlisted does not count.

## 4. The Devpost form — 30 min

Paste from `docs/devpost.md`: tagline, long description, category **Apps for Software Teams**, bonus
prizes **Best Agents + Best app with Atlassian MCP** (select both; only one can be won), the
technology-requirement blurb, the install link, `JUDGES.md` as the testing instructions, repo URL and
video URL. Submit — the participation swag is first-come for the first 300 eligible submissions.

## 5. Optional, gated: Teamwork Graph — 45 min spike

TWG moved to **Preview** on 2026-10-15: no EAP allowlist, curated GraphQL queries, one scope per
object type (`read:graph:issue:jira`, `read:graph:user:atlassian`, `read:graph:team:atlassian`, …).
It is a named bonus category and the contest theme is "build with context".

Spike on a branch: add those three scopes, deploy to `development`, run one curated query from a
probe script, and compare the answer against Jira.

- Returns sensible data → build the person-context line (team + open work next to a name), ~1 day.
- Empty or error → stop and ship what we have. Preview quirks are documented: a missing scope returns
  an *empty result, not an error*, so verify any empty answer against Jira before calling it a dead end.

## 6. What can change after you submit

- The rules freeze the **Submission** (video, text, links) at the end of the Submission Period; the
  **project** may keep evolving ("you may continue to update the Project in your Devpost portfolio").
- Judging runs **2027-01-05 → 02-03** and judges install from the link then. So the version that
  counts is whatever production holds during judging, not what it held on submit day.
- The video must "function as depicted". A feature that lands after the cut is invisible to judges; a
  feature that changes behaviour after the cut makes the video wrong. That is the real deadline, and it
  is the recording session, not the submit button.
- **Development is still yours.** The demo site is installed on `development`, so you can iterate,
  re-seed, break and redeploy there all day without touching a judge's install. Production is the
  artifact.
- After submit: bug fixes are fine; **new scopes are not** (existing installs would need re-consent
  during judging). Deploy code-only fixes.

## Not doing (decided, so it stops costing attention)

- **Second submission.** Allowed, but it must be "unique and substantially different": a reskin fails
  that test, and a genuinely different app is not a 29-day build for one person.
- **Marketplace listing.** It is a bonus category, but an app submitted for listing can no longer be
  shared via installation link — and the installation link is the hard requirement. Protect the thing
  we need.
- **Assignable agent (`rovo:agentConnector`).** Needs an externally hosted agent. Roadmap line, not a build.
