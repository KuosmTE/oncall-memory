# Demo filming protocol — On-Call Memory

The video is 20% of the score and it is **assembled last, directed from day one**.
A beat that can't be filmed is a feature that isn't finished.

## Rule

At the end of every phase, record **one unscripted take, 30–60s**, of the thing that
just started working. No intro, no talking, no editing. Name it `raw-P<n>-<what>.mp4`
and drop it in `~/Videos/oncall-raw/`. These are B-roll and proof; most will be cut.

Total raw footage by submission time: ~5 minutes. Final cut: **2:40–2:55**.

## Beats (from SPEC §9)

| Time | Shot | Must be visible |
|---|---|---|
| 0:00 | The pain | A Jira search over ONE realistic project (~40–60 issues, 6–8 people, ~18 months) returning many near-identical issues; no name, no answer |
| 0:20 | The panel | Issue opened, panel loads "Ask these three" — a name, a claim, a date |
| 0:40 | The receipt | Click one person → the exact issue that proves it |
| 1:10 | The radar | New ticket created → comment arrives with the previous fix |
| 1:50 | The agent | Rovo chat: "who should I ask about PROJ-123" → it calls our tool and cites keys |
| 2:30 | Outside Atlassian | Terminal: same question from Claude Code/Hermes over MCP — **show the admin toggle first** (one cut, 3s), never say "zero config" |
| 2:50 | The line | "Read-only except one comment. One admin toggle. Install link in the description." |

## Shot continuity

The 0:00 pain shot and the 0:40 panel shot must be **the same project**. Five seeded
tickets in one shot and the same five in the next reads as staged. Seed once, film both
from that one project.

## Hard constraints

- **≤ 5 min total, but judges are not required to watch past 3.** Front-load.
- **Public on YouTube.** Upload one throwaway 10s clip **unlisted** in week 4 — that
  proves the channel and the upload path work before deadline week.
- **No third-party trademarks, no copyrighted music.** Silence or a generated bed only.
- **Screen recording, 16:9, 1080p minimum.** No webcam, no slides.
- **Fix nothing while filming.** If it breaks on camera, that is the bug list for the
  next phase — film it again after the fix.

## Film-day run sheet (2026-11-05)

Record the beats as **separate files**, one per beat, in `~/Videos/oncall-raw/`. Separate takes
make the cut trivial and let one bad beat be redone without losing the rest.

### Before the camera rolls

1. `oncall-eval` fixtures out of the way: delete the batch, keep the two that appear on camera —
   `project = MOBL AND labels = oncall-eval AND key not in (MOBL-122, MOBL-127)`.
2. **Panel**: open MOBL-122 and scroll the right column past **Automation**. The **On-Call
   Memory** card sits below the field sections; it must show three people with kinds and dates.
   *If that card is not there, stop — that is a bug to fix before filming, not a filming problem.*
3. **Agent**: Rovo chat → **Change agent** → search `On-Call` → **On-Call Memory**; dismiss the
   "Try Rovo on your phone" promo card (it covers the answer).
4. **MCP**: admin toggle ON (Atlassian Admin → Apps → Sites → one-atlas-boys → Connected apps →
   On-Call Memory → Tools), and one successful client connection **tested before recording** —
   never debug the MCP beat on camera.
5. Browser: 1920×1080 (or 2560×1440), zoom 100 %, notifications off, bookmark bar hidden,
   one tab only.

### The beats

| Beat | File | Do exactly this | Must be on screen |
|---|---|---|---|
| 0:00 pain | `raw-P6-pain.mp4` | Jira search, JQL `project = MOBL AND text ~ "checkout broken" ORDER BY created DESC` | A wall of 20+ near-identical resolved tickets and no name to ask |
| 0:20 panel | `raw-P6-panel.mp4` | Open MOBL-122 (scroll the right column to the On-Call Memory card) | Three names, each with `resolved` / `diagnosed` / `wrote up`, key and date |
| 0:40 receipt | `raw-P6-receipt.mp4` | Click the receipt key on the first person (MOBL-74) | The issue that proves it: its summary, assignee, and the fix comment |
| 0:55 ask (after P6a) | `raw-P6-ask.mp4` | Back on MOBL-122, click **Draft the ask** under the top person | The message with the person, the query key, the receipt key and the fix, ready to send |
| 1:10 radar | `raw-P6-radar.mp4` | Create → project MOBL → summary "Checkout failing again after this morning's build" → Create, then open the new issue and wait | The radar comment arriving with the previous fix and who to ask (≤ 3 min platform lag — keep the take long or cut after it lands) |
| 1:50 agent | `raw-P5-agent.mp4` ✅ | Already recorded | Agent name, question, cited MOBL-70/71/74 |
| 2:30 outside | `raw-P6-mcp.mp4` | 3 s on the admin toggle, then the terminal: `claude mcp add --transport http oncall https://mcp.atlassian.com/forge/d0c1b623-3512-4219-8760-0b15e2bd80b2` → connect → ask "who should I ask about the checkout rollback in MOBL" | The same answer from outside Atlassian, with the tool call visible |
| 2:50 line | — | Text card or VO only | "Read-only except one comment. One admin toggle. Install link in the description." |

### Rules that keep it honest on camera

- The radar beat needs a **real new issue**; `ignoreSelf` means the app's own writes never fire it,
  and a radar comment that appears on a ticket created by a script looks staged.
- Do not fix, retry or edit anything mid-take. If a beat fails, stop the take, fix, start again —
  the footage is disposable, the honesty is not.
- Never say "zero config". The MCP beat exists precisely to show the one admin toggle.

## Voice-over

Recorded in P6, after the cut exists. English, calm, one sentence per beat, no
adjectives you couldn't defend to a judge. Script lives in `~/Videos/oncall-raw/vo.md`.
