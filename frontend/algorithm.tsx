import { Heading, useGlobalConfig } from "@airtable/blocks/ui";
import React from "react";
import { Preset } from "./index";

const AlgorithmPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  // convert the preset into a form good for the algorithm
  // {lenghtOfMeeting: number, types: [{ howManyPerCohort: number, sourceTable, sourceView, people: [{id: string, timeAv: [], howManyCohorts: number}], }]}
  return (
    <div>
      <Heading>Review your data</Heading>
    </div>
  );
};

export default AlgorithmPage;
