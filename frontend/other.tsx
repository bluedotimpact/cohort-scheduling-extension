import {
  Button,
  Heading,
  Loader,
  Text,
  useBase,
  useGlobalConfig,
  useRecords
} from "@airtable/blocks/ui";
import React, { useState } from "react";
import { Preset } from ".";
import { dateToCoord } from "../lib/date";
import { prettyPrintDayTime } from "../lib/format";
import { parseTimeAvString } from "../lib/parse";

const OtherPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const configuredPersonTypes = Object.values(preset.personTypes)
    .filter((personType) =>
      personType.cohortOverlapFullField ||
      personType.cohortOverlapPartialField
    )

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);
  const rawCohorts = useRecords(cohortsTable, {
    fields: [
      preset.cohortsTableStartDateField,
      preset.cohortsTableEndDateField,
    ],
  });
  const cohortsWithTimes = rawCohorts.flatMap((cohort) => {
    const meetingDates = [
      // getCellValueAsString returns something that can't be parsed by the date constructor
      // this returns an ISO timestamp that can
      new Date(cohort.getCellValue(preset.cohortsTableStartDateField) as string),
      new Date(cohort.getCellValue(preset.cohortsTableEndDateField) as string),
    ];
    if (meetingDates.some(v => isNaN(v.getTime()))) {
      return []
    }
    const timeAv = meetingDates
      .map(dateToCoord)
      .map(prettyPrintDayTime)
      .join(" ");
    return [{
      id: cohort.id,
      name: cohort.name,
      timeAv,
    }];
  });

  const [recalculating, setRecalculating] = useState(false);
  const recalculateOverlap = async () => {
    for (const personType of configuredPersonTypes) {
      console.log("updating", personType.name);

      const table = base.getTableByIdIfExists(personType.sourceTable);

      const records = (await table.selectRecordsAsync()).records;
      const updatedRecords = [];
      for (const record of records) {
        const parsedTimeAv = parseTimeAvString(
          record.getCellValueAsString(personType.timeAvField)
        );

        const fields = {};
        if (personType.cohortOverlapFullField) {
          fields[personType.cohortOverlapFullField] = cohortsWithTimes
            .filter((cohort) => {
              const [[mb, me]] = parseTimeAvString(cohort.timeAv);
              return parsedTimeAv.some(([b, e]) => mb >= b && me <= e);
            })
            .map(({ id }) => ({ id }));
        }

        if (personType.cohortOverlapPartialField) {
          fields[personType.cohortOverlapPartialField] = cohortsWithTimes
            .filter((cohort) => {
              const [[mb, me]] = parseTimeAvString(cohort.timeAv);
              return parsedTimeAv.some(
                ([b, e]) => (mb >= b && mb < e) || (me > b && me <= e)
              );
            })
            .map(({ id }) => ({ id }));
        }

        const newRecord = {
          id: record.id,
          fields,
        };
        updatedRecords.push(newRecord);
      }
      const chunkSize = 49;
      for (let i = 0; i < updatedRecords.length; i += chunkSize) {
        await table.updateRecordsAsync(updatedRecords.slice(i, i + chunkSize));
      }
    }
  };

  return (
    <div className="space-y-2">
      <Heading>Cohort overlap</Heading>
      <Text>
        For each configured person type, this will recalculate their cohort
        overlap field and save/update the result in the table.
      </Text>
      <Text>
        In your case, the following person types are configured:{" "}
        {configuredPersonTypes.map(({ name }) => name).join(", ")}.
      </Text>
      <div className="flex items-center space-x-2">
        {recalculating
          ? <Loader />
          : <Button
            //@ts-ignore
            type="asdf"
            variant="primary"
            onClick={async () => {
              setRecalculating(true);
              await recalculateOverlap();
              setRecalculating(false);
            }}
          >
            Recalculate
          </Button>}
      </div>
    </div>
  );
};

export default OtherPage;
