# cohort-scheduling-extension ![deployment automatic](https://img.shields.io/badge/deployment-automatic-success)

Airtable extension for flexibly finding overlapping cohorts from people's time availability. Integrates with data from the [time availability form](https://github.com/bluedotimpact/bluedot/tree/master/apps/availability).

## How it works

The algorithm uses a multi-phase approach to assign as many people as possible to cohorts, using the constraint solver [GLPK](https://github.com/jvail/glpk.js/). It groups people by rank (human opinion), prioritises availability overlap, and ensures cohort viability.

### Bucket-aware cycling

If a **bucket field** is configured, the algorithm runs a full scheduling cycle per bucket — processing each bucket in order. This keeps people from the same bucket together where possible.

Each cycle runs Phases 1–3 for that bucket's participants (plus unmatched carry-forwards from earlier cycles). Early cycles only try high-quality matches; the last cycle tries everything.

If no bucket field is configured, a single cycle runs for everyone.

### Phase 1 — Perfect match
Runs a Linear Programming (LP) solver to find cohorts where every assigned person has **full availability overlap** with the meeting time.

### Phase 2 — Check capacity
Checks if there are enough spots across existing cohorts for remaining unassigned participants. If not, more groups are needed.

### Phase 3 — Create additional groups
Creates the minimum number of new groups needed, trying progressively more permissive strategies:

- **≥50% overlap** for both participants and facilitators
- **≥1 unit (30 min) overlap** for participants, facilitators stay at ≥50%
- **Expanded availability** — replicate submitted time-of-day windows across all 7 days (e.g. "Monday 1–3pm" becomes "every day 1–3pm")

Non-last rank cycles only try ≥50% overlap. The full cascade (including expanded availability) only runs on the last cycle. New groups are capped by both participant need and facilitator availability.

### Phase 4 — Optimally fill remaining people
Runs a second LP to assign all remaining unassigned people into groups, optimising across everyone at once. Scoring considers both **availability overlap** and **bucket proximity** (whether the person is in the same bucket as the cohort's majority). Same-bucket matches score higher than cross-bucket ones at the same overlap level.

### Safeguards
- **Grey cap:** Each cohort can have at most `min - 1` people with no availability overlap, ensuring enough reliable members for the group to be viable.
- **No grey-only groups:** Phase 3 will not create a group where all members lack availability overlap.
- **Timezone fallback:** People without submitted availability but with a timezone get synthetic availability (9am–9pm Mon–Fri in their timezone) and are placed with lowest priority.

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
