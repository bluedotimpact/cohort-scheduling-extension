# Cohort scheduling extension

Airtable extension for flexibly finding overlapping cohorts from people's time availability. Integrates with data from the [Time availability from](https://github.com/bluedot-impact-software/time-availability-form).

The algorithm backing the cohort finding is a conversion of the problem into a Linear Programming (LP) form and then using the constraint solver [GLPK](https://github.com/jvail/glpk.js/).

## Technologies used

- Airtable Blocks SDK
- React
- TailwindCSS

## Developer setup

You need to have Node, npm and the Airtable Blocks SDK (`npm install -g @airtable/blocks-cli`) installed.

`npm install` to install necessary packages.

`block run` to run the dev server.

`block add-remote [baseid]/[blockid] [name]` to add a new remote/base.

`block release --remote [name]` to release to a base.

---

If you have questions, feel free to contact Adam Krivka (krivka.adam@gmail.com).
