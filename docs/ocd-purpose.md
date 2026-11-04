# What OCD is for

Decision: the demo/film project is **MOBL** (Atlassian sample "Mobile Dev"). OCD is not the stage.

OCD's job, in one line: **the clean-site test** — the place where we prove a stranger can install
the app and see it work with zero history.

## Its three real uses

1. **Fresh-install / non-owner test (Devpost checklist item).** Generate the distribution link,
   open it in an incognito window as a non-owner, install into OCD, open an issue: the panel must
   render and say "No receipts: nothing resolved looks like this ticket." That is the honest empty
   state, and it must not 404/blank. MOBL cannot test this — it is already full of seeded history.
2. **Judge hand-off site (optional).** If a judge wants to click something after the video, OCD is
   a private, empty site with no seeded or sample data to explain.
3. **Second install target for upgrades.** Adding a second install is how we notice a major-version
   approval flow breaking before a judge hits it.

## What it is NOT for

- Not the film set: it has one assignable user (Teemu), so "who knows" would show a single name,
  and zero history means the panel has nothing to cite.
- Not the eval target: the eval needs ~20 labelled resolved incidents and 6 people.

## If we ever do want the demo in OCD

Cost, known: invite 6 alias addresses you control (Gmail `+suffix`), seed ~20 resolved incidents
with `tools/seed-incidents.py --project OCD`, and re-run the eval there. Nothing else changes —
`buildCard` is project-agnostic. Note OCD HAS a notification scheme (`OCD: Simplified Notification
Scheme`), so invited aliases would receive real emails; MOBL has none, which is why nothing was
ever sent to the sample users.
