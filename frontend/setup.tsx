import {
  Button,
  Dialog,
  FieldPickerSynced,
  FormField,
  Heading,
  Icon,
  Input,
  InputSynced,
  Switch,
  TablePickerSynced,
  Text,
  useBase,
  useGlobalConfig,
  useSynced,
  ViewPickerSynced
} from "@airtable/blocks/ui";
import { FieldType } from "@airtable/blocks/models";
import React, { useMemo, useState } from "react";
import { Preset } from ".";
import { MS_IN_WEEK, MINUTES_IN_UNIT } from "../lib/constants";
import { renderDuration } from "../lib/renderDuration";
import { newUID } from "../lib/util";
import { FixedNumberInput } from "./components/FixedNumberInput";

export type PersonType = {
  name: string;
  sourceTable?: string;
  sourceView?: string;
  timeAvField?: string;
  cohortOverlapFullField?: string;
  cohortOverlapPartialField?: string;
  iterationField?: string,
  howManyTypePerCohort?: [number, number];
  howManyCohortsPerType?: number | string;
  cohortsTableField?: string;
};

const createPersonType = (): PersonType => ({
  name: "",
  sourceTable: "",
  sourceView: "",
  timeAvField: "",
  howManyTypePerCohort: [3, 4],
  howManyCohortsPerType: 1,
});

const PersonTypeComp: React.FC<{ personTypeId: string }> = (props) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;

  const path = ["presets", selectedPreset, "personTypes", props.personTypeId];
  const [personType, setPersonType] = useSynced(path) as [
    PersonType,
    (personTypes: PersonType) => void,
    boolean
  ];

  const lowercaseName = useMemo(
    () => personType.name.toLowerCase(),
    [personType]
  );

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(
    personType.name === "" ? true : false
  );

  const base = useBase();
  const sourceTable = base.getTableByIdIfExists(
    globalConfig.get([...path, "sourceTable"]) as string
  );

  const sourceView = sourceTable?.getViewByIdIfExists(
    globalConfig.get([...path, "sourceView"]) as string
  );

  const cohortsTable = base.getTableByIdIfExists(
    globalConfig.get(["presets", selectedPreset, "cohortsTable"]) as string
  );

  const [isTrashDialogOpen, setIsTrashDialogOpen] = useState(false);

  return (
    <>
      <div className="flex justify-between items-center px-2 py-1 gap-1 border bg-white rounded shadow">
        <div className="flex flex-1 items-center w-24">
          <div>
            <div className="text-slate-700 font-semibold">
              {personType.name}
            </div>
            {sourceTable && (
              <div className="text-[11px] text-slate-400">
                {sourceTable.name} {sourceView && `(${sourceView?.name})`}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center w-1/2 space-x-2">
          <div className="hidden sm:block text-gray-400">
            <Icon size={16} name="link1" />
          </div>
          <FieldPickerSynced
            table={cohortsTable}
            placeholder="Pick cohort link field..."
            allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
            globalConfigKey={[...path, "cohortsTableField"]}
          />
        </div>
        <div className="flex">
          <Button
            className="px-2 text-gray-600 hover:bg-slate-200 hover:text-gray-800"
            icon="edit"
            onClick={() => setIsEditDialogOpen(true)}
            aria-label="Edit person type"
          />
          <Button
            className="px-2 text-gray-600 hover:bg-slate-200 hover:text-gray-800"
            icon="trash"
            onClick={() => setIsTrashDialogOpen(true)}
            aria-label="Delete person type"
          />
        </div>
      </div>
      {isTrashDialogOpen && (
        <Dialog onClose={() => setIsTrashDialogOpen(false)} width="350px">
          <Text>Are you sure you want to delete this person type?</Text>
          <div className="w-full flex justify-end">
            <Button
              onClick={() => {
                setIsTrashDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await globalConfig.setAsync(path, undefined);
                setIsTrashDialogOpen(false);
                setIsEditDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </div>
        </Dialog>
      )}
      {isEditDialogOpen && (
        <Dialog onClose={() => setIsEditDialogOpen(false)}>
          <Dialog.CloseButton />
          <Heading>Edit person type</Heading>

          <div className="divide-y">
            <div className="py-2 w-1/2">
              <FormField label="Name">
                <InputSynced globalConfigKey={[...path, "name"]}></InputSynced>
              </FormField>
            </div>
            <div className="py-2 flex w-full">
              <div className="w-1/2 pr-4">
                <FormField label="Source table">
                  <TablePickerSynced
                    globalConfigKey={[...path, "sourceTable"]}
                    onChange={() => {
                      globalConfig.setPathsAsync([
                        { path: [...path, "sourceView"], value: null },
                      ]);
                    }}
                  />
                </FormField>
                {sourceTable && (
                  <FormField label="Source view (optional)">
                    <ViewPickerSynced
                      table={sourceTable}
                      globalConfigKey={[...path, "sourceView"]}
                      shouldAllowPickingNone={true}
                    />
                  </FormField>
                )}
              </div>
              {sourceTable && (
                <div className="w-1/2">
                  <FormField label="Time availability field">
                    <FieldPickerSynced
                      table={sourceTable}
                      allowedTypes={[FieldType.SINGLE_LINE_TEXT]}
                      globalConfigKey={[...path, "timeAvField"]}
                    />
                  </FormField>
                  <FormField label="Iteration field">
                    <FieldPickerSynced
                      table={sourceTable}
                      allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                      globalConfigKey={[...path, "iterationField"]}
                    />
                  </FormField>
                  <FormField label="Cohort full overlap field (optional)">
                    <FieldPickerSynced
                      table={sourceTable}
                      allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                      globalConfigKey={[...path, "cohortOverlapFullField"]}
                    />
                  </FormField>
                  <FormField label="Cohort partial overlap field (optional)">
                    <FieldPickerSynced
                      table={sourceTable}
                      allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                      globalConfigKey={[...path, "cohortOverlapPartialField"]}
                    />
                  </FormField>
                </div>
              )}
            </div>
            <div className="py-2 ">
              <FormField label={`Number of ${lowercaseName}s per one cohort`}>
                <div className="flex w-full space-x-3">
                  <div>
                    <span className="pr-1">Min: </span>
                    <Input
                      type="number"
                      width="80px"
                      value={personType.howManyTypePerCohort?.[0].toString() ?? ''}
                      onChange={(e) => {
                        const n = parseInt(e.target.value);

                        // min shouldn't be greater than max
                        if (personType.howManyTypePerCohort?.[1] && n > personType.howManyTypePerCohort[1]) {
                          return;
                        }

                        setPersonType({
                          ...personType,
                          howManyTypePerCohort: [
                            n,
                            personType.howManyTypePerCohort?.[1] ?? n,
                          ],
                        });
                        }
                      }
                    />
                  </div>
                  <div>
                    <span className="pr-1">Max: </span>
                    <Input
                      type="number"
                      width="80px"
                      value={personType.howManyTypePerCohort?.[1].toString() ?? ''}
                      onChange={(e) => {
                        const n = parseInt(e.target.value);

                        // max shouldn't be less than min
                        if (personType.howManyTypePerCohort?.[0] && n < personType.howManyTypePerCohort[0]) {
                          return;
                        }

                        setPersonType({
                          ...personType,
                          howManyTypePerCohort: [
                            personType.howManyTypePerCohort?.[0] ?? n,
                            n,
                          ],
                        });
                      }}
                    />
                  </div>
                </div>
              </FormField>
              <FormField label={`Number of cohorts per one ${lowercaseName}`}>
                <div className="flex space-x-2">
                  <Switch
                    value={typeof personType.howManyCohortsPerType === "string"}
                    onChange={() => {
                      if (
                        typeof personType.howManyCohortsPerType === "number"
                      ) {
                        setPersonType({
                          ...personType,
                          howManyCohortsPerType: "",
                        });
                      } else {
                        setPersonType({
                          ...personType,
                          howManyCohortsPerType: 1,
                        });
                      }
                    }}
                    label={
                      typeof personType.howManyCohortsPerType === "number"
                        ? "Static"
                        : "Dynamic"
                    }
                    width="110px"
                  />
                  {typeof personType.howManyCohortsPerType === "number" ? (
                    <Input
                      type="number"
                      width="200px"
                      value={personType.howManyCohortsPerType + ""}
                      onChange={(e) => {
                        setPersonType({
                          ...personType,
                          howManyCohortsPerType: parseInt(e.target.value),
                        });
                      }}
                    />
                  ) : sourceTable ? (
                    <FieldPickerSynced
                      table={sourceTable}
                      width="200px"
                      globalConfigKey={[...path, "howManyCohortsPerType"]}
                    />
                  ) : (
                    "You need to configure source table first"
                  )}
                </div>
              </FormField>
            </div>
          </div>
          <div className="w-full flex justify-end">
            <Button onClick={() => setIsEditDialogOpen(false)}>Save</Button>
          </div>
        </Dialog>
      )}
    </>
  );
};

const SetupPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([
    "presets",
    selectedPreset as string,
  ]) as Preset;

  const [lengthOfMeetingMins, setLengthOfMeeting] = useSynced([
    ...path,
    "lengthOfMeeting",
  ]);

  const [firstWeek, setFirstWeek] = useSynced([...path, "firstWeek"]) as [Preset["firstWeek"], (v: Preset["firstWeek"]) => void, boolean];
  const [personTypes, setPersonTypes] = useSynced([...path, "personTypes"]) as [Preset["personTypes"], (v: Preset["personTypes"]) => void, boolean];

  const base = useBase();
  const cohortsTable = base.getTableByIdIfExists(
    globalConfig.get([...path, "cohortsTable"]) as string
  );

  const cohortsTableConfigured =
    preset.cohortsTable &&
    preset.cohortsTableStartDateField &&
    preset.cohortsTableEndDateField &&
    preset.cohortsIterationField;

  const typesOfPeopleConfigured =
    Object.keys(preset.personTypes).length > 0 &&
    Object.values(preset.personTypes).every((personType) => (
        personType.name &&
        personType.sourceTable &&
        personType.timeAvField &&
        personType.howManyTypePerCohort &&
        personType.howManyCohortsPerType &&
        personType.cohortsTableField
    ));

  return (
    <>
      <div className="space-y-3">
        <div>
          <Heading>General settings</Heading>
          <div className="grid sm:grid-cols-2 gap-1">
            <FormField label="Meeting length">
              <FixedNumberInput
                value={lengthOfMeetingMins as number}
                increment={() =>
                  setLengthOfMeeting((lengthOfMeetingMins as number) + MINUTES_IN_UNIT)
                }
                decrement={() =>
                  setLengthOfMeeting(
                    Math.max(
                      (lengthOfMeetingMins as number) - MINUTES_IN_UNIT,
                      MINUTES_IN_UNIT
                    )
                  )
                }
                render={(mins) => renderDuration(mins * 60_000)}
              />
            </FormField>
            <FormField label="First week of meetings">
              <FixedNumberInput
                value={firstWeek}
                increment={() =>
                  setFirstWeek((firstWeek as number) + MS_IN_WEEK)
                }
                decrement={() =>
                  setFirstWeek((firstWeek as number) - MS_IN_WEEK)
                }
                render={(ms) => "Week of " + new Date(ms).toLocaleDateString()}
              />
            </FormField>
          </div>
        </div>
        <div>
          <div className="flex space-x-2 items-center">
            <Heading>Cohorts table</Heading>
            {!cohortsTableConfigured && (
              <span className="text-xs text-gray-500">
                Please finish configuring the cohorts table
              </span>
            )}
          </div>
          <FormField label="Cohorts table">
            <TablePickerSynced
              globalConfigKey={[...path, "cohortsTable"]}
              onChange={() => {
                globalConfig.setPathsAsync([
                  { path: [...path, "cohortsTableStartDateField"], value: null },
                  { path: [...path, "cohortsTableEndDateField"], value: null },
                  { path: [...path, "cohortsIterationField"], value: null },
                ]);
              }}
            />
          </FormField>
          {cohortsTable && (
            <div className="grid sm:grid-cols-2 gap-1">
              <FormField label="First session start time field">
                <FieldPickerSynced
                  table={cohortsTable}
                  allowedTypes={[FieldType.DATE_TIME]}
                  globalConfigKey={[...path, "cohortsTableStartDateField"]}
                />
              </FormField>
              <FormField label="First session end time field">
                <FieldPickerSynced
                  table={cohortsTable}
                  allowedTypes={[FieldType.DATE_TIME]}
                  globalConfigKey={[...path, "cohortsTableEndDateField"]}
                />
              </FormField>
              <FormField label="Iteration field">
                <FieldPickerSynced
                  table={cohortsTable}
                  allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                  globalConfigKey={[...path, "cohortsIterationField"]}
                />
              </FormField>
              <FormField label="Bucket field">
                <FieldPickerSynced
                  table={cohortsTable}
                  allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS, FieldType.MULTIPLE_LOOKUP_VALUES]}
                  globalConfigKey={[...path, "cohortsBucketField"]}
                />
              </FormField>
            </div>
          )}
        </div>
        <div>
          <div className="flex space-x-2 items-center">
            <Heading>Person types</Heading>
            <div className="text-xs text-gray-500">
              {Object.keys(preset.personTypes).length === 0
                ? "Please add at least one type"
                : !typesOfPeopleConfigured &&
                  "Please finish configuring the types"}
            </div>
          </div>
          <div className="pl-1 space-y-1">
            {Object.keys(personTypes || {}).map((id, index) => (
              <PersonTypeComp key={index} personTypeId={id} />
            ))}
            <Button
              icon="plus"
              onClick={() => {
                setPersonTypes({
                  ...((personTypes as {
                    [key: string]: PersonType;
                  }) || {}),
                  [newUID()]: createPersonType(),
                });
              }}
            >
              Add new person type
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SetupPage;
