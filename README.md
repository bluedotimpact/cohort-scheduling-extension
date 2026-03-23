# cohort-scheduling-extension ![deployment automatic](https://img.shields.io/badge/deployment-automatic-success)

Airtable extension for flexibly finding overlapping cohorts from people's time availability. Integrates with data from the [time availability form](https://github.com/bluedotimpact/bluedot/tree/master/apps/availability).

## How it works

The algorithm uses a multi-phase approach to assign as many people as possible to cohorts, using the constraint solver [GLPK](https://github.com/jvail/glpk.js/).

### Phase 1 — Perfect match
Runs a Linear Programming (LP) solver to find cohorts where every assigned person has **full availability overlap** with the meeting time. This is the original algorithm and produces the highest-quality matches.

### Phase 2 — Check capacity
Checks if there are enough spots across existing cohorts for all remaining unassigned participants. If not, more groups are needed.

### Phase 3 — Create additional groups (cascading)
Creates the minimum number of new groups needed, trying progressively more permissive strategies:

- **3a:** Find times where the most unassigned people have **≥50% overlap**. Facilitators also need ≥50%.
- **3b:** Relax participants to **≥1 unit (30 min) overlap**. Facilitators stay at ≥50%.
- **3c:** **Expand participant availability** — take their submitted time-of-day windows and apply them to all 7 days of the week (e.g. "Monday 1–3pm" becomes "every day 1–3pm"). Facilitators are not expanded and still need ≥50% overlap.

New groups are only created if there are enough unassigned people of each type to meet the minimum constraints (e.g. at least 1 facilitator and enough participants). The number of new groups is capped by both participant need and facilitator availability.

### Phase 4 — Optimally fill remaining people
Runs a second LP to assign all remaining unassigned people (including those with no submitted availability) into groups. The solver optimises across everyone at once, using a weighted scoring system:

| Priority | Condition | Weight |
|----------|-----------|--------|
| 1st | Full overlap with meeting time | 10000 |
| 2nd | Partial overlap with original availability | 1000 |
| 3rd | Overlap with expanded availability | 100 |
| 4th | No availability, but meeting is in timezone reasonable hours (9am–9pm) | 1 |

### Tier 3 — People with no availability
People who didn't submit availability but have a timezone configured get synthetic availability (9am–9pm Mon–Fri in their timezone). They are placed into groups during Phase 4 with the lowest priority, ensuring they don't displace people with actual availability data.

### Colour coding
The solution view colour-codes each person by match quality:
- **Green** — full overlap (Tier 1)
- **Yellow** — partial overlap (Tier 2)
- **Grey** — no overlap / timezone only (Tier 3)

## Technologies used

- Airtable Blocks SDK
- React
- TailwindCSS

## Developer setup

To start developing this extension:

1. Clone this git repository
2. Install [Node.js](https://nodejs.org/)
3. Run `npm install`
4. Run `npm start` (for the '[local] Scheduling Extension' in the BlueDot Impact software AirTable account)
5. Load the relevant base, open the extensions panel, and click 'Edit extension'
6. Paste in the URL output in the terminal
7. Make changes to the code and see them reflected in the app!

If the changes don't appear to be updating the app, try clicking the extension name then 'Edit extension', then pasting in the server address printed to the console from step 4 (probably `https://localhost:9000`).

Changes merged into the default branch will automatically be deployed. You can manually deploy new versions using `npm run deploy`. If you get the error `airtableApiBlockNotFound`, set up the block CLI with `npx block set-api-key` with a [personal access token](https://airtable.com/developers/web/guides/personal-access-tokens).

If you want to install this on a new base see [these instructions](https://www.airtable.com/developers/apps/guides/run-in-multiple-bases).
