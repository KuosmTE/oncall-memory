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
| 0:00 | The pain | A Jira search returning dozens of near-identical issues; no name, no answer |
| 0:20 | The panel | Issue opened, panel loads "Ask these three" — a name, a claim, a date |
| 0:40 | The receipt | Click one person → the exact issue that proves it |
| 1:10 | The radar | New ticket created → comment arrives with the previous fix |
| 1:50 | The agent | Rovo chat: "who should I ask about PROJ-123" → it calls our tool and cites keys |
| 2:30 | Outside Atlassian | Terminal: same question from Claude Code/Hermes over MCP |
| 2:50 | The line | "Read-only. Zero config. Install link below." |

## Hard constraints

- **≤ 5 min total, but judges are not required to watch past 3.** Front-load.
- **Public on YouTube.** Upload one throwaway 10s clip **unlisted** in week 4 — that
  proves the channel and the upload path work before deadline week.
- **No third-party trademarks, no copyrighted music.** Silence or a generated bed only.
- **Screen recording, 16:9, 1080p minimum.** No webcam, no slides.
- **Fix nothing while filming.** If it breaks on camera, that is the bug list for the
  next phase — film it again after the fix.

## Voice-over

Recorded in P6, after the cut exists. English, calm, one sentence per beat, no
adjectives you couldn't defend to a judge. Script lives in `~/Videos/oncall-raw/vo.md`.
