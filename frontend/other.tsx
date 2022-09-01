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
import { PersonType } from "./setup";

const OtherPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const configuredPersonTypes = Object.keys(preset.personTypes)
    .filter(
      (id) =>
        preset.personTypes[id].cohortOverlapFullField ||
        preset.personTypes[id].cohortOverlapPartialField
    )
    .map((id) => preset.personTypes[id] as PersonType);

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);
  const rawCohorts = useRecords(cohortsTable, {
    fields: [
      preset.cohortsTableStartDateField,
      preset.cohortsTableEndDateField,
    ],
  });
  const allCohorts = rawCohorts.map((cohort) => {
    const meetingDates = [
      new Date(
        cohort.getCellValue(preset.cohortsTableStartDateField) as string
      ),
      new Date(cohort.getCellValue(preset.cohortsTableEndDateField) as string),
    ];
    const timeAv = meetingDates
      .map(dateToCoord)
      .map(prettyPrintDayTime)
      .join(" ");
    return {
      id: cohort.id,
      name: cohort.name,
      timeAv,
    };
  });

  const [recalculating, setRecalculating] = useState(false);
  const recalculateOverlap = async () => {
    for (const personType of configuredPersonTypes) {
      const table = base.getTableByIdIfExists(personType.sourceTable);
      const source = personType.sourceView
        ? table.getViewByIdIfExists(personType.sourceView)
        : table;

      const records = (await source.selectRecordsAsync()).records;
      const updatedRecords = [];
      for (const record of records) {
        const parsedTimeAv = parseTimeAvString(
          record.getCellValue(personType.timeAvField)
        );

        const fields = {};
        if (personType.cohortOverlapFullField) {
          fields[personType.cohortOverlapFullField] = allCohorts
            .filter((cohort) => {
              const [[mb, me]] = parseTimeAvString(cohort.timeAv);
              return parsedTimeAv.some(([b, e]) => mb >= b && me <= e);
            })
            .map(({ id }) => ({ id }));
        }

        if (personType.cohortOverlapPartialField) {
          fields[personType.cohortOverlapPartialField] = allCohorts
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
      await table.updateRecordsAsync(updatedRecords);
    }
  };

  return (
    <div className="space-y-2">
      <Heading>Cohort overlap</Heading>
      <Text width="400px">
        For each configured person type, this will recalculate their cohort
        overlap field and save/update the result in the table.
      </Text>
      <Text>
        In your case, the following person types are configured:{" "}
        {configuredPersonTypes.map(({ name }) => name).join(", ")}.
      </Text>
      <div className="flex items-center space-x-2">
        <Button
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
        </Button>
        {recalculating && <Loader />}
      </div>
    </div>
  );
};

export default OtherPage;
