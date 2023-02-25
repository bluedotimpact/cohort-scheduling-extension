# Cohort scheduling extension

Airtable extension for flexibly finding overlapping cohorts from people's time availability. Integrates with data from the [Time availability from](https://github.com/bluedot-impact-software/time-availability-form).

The algorithm backing the cohort finding is a conversion of the problem into a Linear Programming (LP) form and then using the constraint solver [GLPK](https://github.com/jvail/glpk.js/).

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
5. Load the relevant base
6. Make changes to the code and see them reflected in the app!

If the changes don't appear to be updating the app, try clicking the extension name then 'Edit extension', then pasting in the server address printed to the console from step 4 (probably `https://localhost:9000`).

Release new versions using `npm run release`. If you get the error `airtableApiBlockNotFound`, set up the block CLI with `npx block set-api-key`, getting your API key from the [AirTable account settings page](https://airtable.com/account).

If you want to install this on a new base see [these instructions](https://www.airtable.com/developers/apps/guides/run-in-multiple-bases).
