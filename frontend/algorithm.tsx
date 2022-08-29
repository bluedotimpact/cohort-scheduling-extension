import {
  Button,
  Dialog,
  FieldPickerSynced,
  FormField,
  Heading,
  Icon,
  Input,
  InputSynced,
  Select,
  Switch,
  TablePickerSynced,
  Text,
  useBase,
  useGlobalConfig,
  useSynced,
  ViewPickerSynced
} from "@airtable/blocks/ui";
import React, { useMemo, useState } from "react";
import { MS_IN_MINUTE, MS_IN_WEEK } from "../lib/constants";
import { thisMonday } from "../lib/date";
import { renderDuration } from "../lib/format";
import { newUID, parseCommaSeparatedNumberList } from "../lib/util";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { FixedNumberInput } from "./components/FixedNumberInput";

type Preset = {
  name: string;
  lengthOfMeeting: number;
  firstWeek: number;
};

const createPreset = (name: string) => ({
  name,
  lengthOfMeeting: 90,
  firstWeek: thisMonday().getTime(),
});

const PresetChooser = () => {
  const [selectedPreset, setSelectedPreset] = useSynced("selectedPreset");
  const [presets, setPresets] = useSynced("presets");

  const presetOptions = useMemo(() => {
    if (!presets) return [];
    else
      return Object.keys(presets).map((presetId) => ({
        label: presets[presetId].name,
        value: presetId,
      }));
  }, [presets]);

  const [newPresetDialogOpen, setNewPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const closeNewPresetDialog = () => {
    setNewPresetDialogOpen(false);
    setNewPresetName("");
  };

  return (
    <div className="flex items-center">
      Change preset:
      <div className="w-2" />
      <div>
        <Select
          options={[
            ...(presetOptions || []),
            { label: "+ Create new preset", value: "new" },
          ]}
          value={selectedPreset as string}
          onChange={(value) => {
            if (value === "new") {
              setNewPresetDialogOpen(true);
            } else {
              setSelectedPreset(value);
            }
          }}
          size="small"
        />
        {newPresetDialogOpen && (
          <Dialog onClose={() => closeNewPresetDialog()} width="320px">
            <Dialog.CloseButton />
            <Heading>Create new preset</Heading>
            <FormField label="Name">
              <Input
                autoFocus={true}
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
              />
            </FormField>
            <div className="flex w-full justify-end">
              <Button
                onClick={() => {
                  closeNewPresetDialog();
                  const newPresetId = newUID();
                  setPresets({
                    ...(presets as { [presetID: string]: Preset }),
                    [newPresetId]: createPreset(newPresetName),
                  });
                  setSelectedPreset(newPresetId);
                }}
              >
                Create
              </Button>
            </div>
          </Dialog>
        )}
      </div>
    </div>
  );
};

type PersonType = {
  name: string;
  sourceTable?: string;
  sourceView?: string;
  timeAvField?: string;
  howManyTypePerCohort?: number[];
  howManyCohortsPerType?: number | string;
  canBeUnused?: boolean;
};

const createPersonType = () => ({
  name: "",
  sourceTable: "",
  sourceView: "",
  timeAvField: "",
  howMany: 1,
  canBeUnused: false,
});

const PersonTypeComp = (props) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;

  const path = ["presets", selectedPreset, "typesOfPeople", props.personTypeId];
  const [personType, setPersonType] = useSynced(path) as [
    PersonType,
    (personTypes: PersonType) => void,
    boolean
  ];

  const lowercaseName = useMemo(
    () => personType.name.toLowerCase(),
    [personType]
  );

  const [howManyTypePerCohort, setHowManyTypePerCohort] = useState(
    personType.howManyTypePerCohort
      ? personType.howManyTypePerCohort.join(", ")
      : ""
  );

  const [howManyCohortPerType, setHowManyCohortPerType] = [null, null];

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(
    personType.name === "" ? true : false
  );

  const base = useBase();
  const sourceTable = base.getTableByIdIfExists(
    globalConfig.get([...path, "sourceTable"]) as string
  );

  const sourceView = sourceTable.getViewByIdIfExists(
    globalConfig.get([...path, "sourceView"]) as string
  );

  const cohortsTable = base.getTableByIdIfExists(
    globalConfig.get(["presets", selectedPreset, "cohortsTable"]) as string
  );

  const [isTrashDialogOpen, setIsTrashDialogOpen] = useState(false);

  return (
    <>
      <div className="flex justify-between items-center px-3 py-1 border bg-white rounded shadow">
        <div className="flex items-center w-56">
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
          <div className="w-2" />
        </div>
        <div className="w-4" />
        <div className="flex items-center w-1/2 space-x-2">
          <Icon size={16} name="right"></Icon>
          <FieldPickerSynced
            table={cohortsTable}
            placeholder="Pick a cohorts table linked reference field..."
            globalConfigKey={[...path, "cohortsTableField"]}
            width="300px"
          />
        </div>
        <div className="text-gray-400 ml-3">
          <Button
            icon="edit"
            onClick={() => setIsEditDialogOpen(true)}
          ></Button>
          <Button
            icon="trash"
            onClick={() => setIsTrashDialogOpen(true)}
          ></Button>
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
          <div className="flex">
            <Heading>Edit person type</Heading>
            <div className="w-2" />
            <Button
              icon="trash"
              onClick={async () => {
                setIsTrashDialogOpen(true);
                setIsEditDialogOpen(false);
              }}
            ></Button>
          </div>

          <div className="space-y-1 w-1/2">
            <FormField label="Name (just for bookkeeping purposes)">
              <InputSynced globalConfigKey={[...path, "name"]}></InputSynced>
            </FormField>
            <FormField
              label={`How many ${lowercaseName}s per cohort (comma-separated list, e.g. "3, 4")`}
            >
              <div className="flex w-full space-x-3">
                <Input
                  type="text"
                  className="w-32"
                  value={howManyTypePerCohort}
                  onChange={(e) => {
                    if (parseCommaSeparatedNumberList(e.target.value))
                      setHowManyTypePerCohort(e.target.value);
                  }}
                  onBlur={(e) => {
                    const typePerCohort = parseCommaSeparatedNumberList(
                      e.target.value
                    );
                    console.log(typePerCohort);

                    if (typePerCohort) {
                      setPersonType({
                        ...personType,
                        howManyTypePerCohort: typePerCohort,
                      });
                      setHowManyTypePerCohort(typePerCohort.join(", "));
                    } else {
                      setHowManyTypePerCohort(
                        personType.howManyTypePerCohort.join(", ")
                      );
                    }
                  }}
                />
              </div>
            </FormField>
            <FormField label={`How many cohorts per ${lowercaseName}`}>
              <div className="flex space-x-2">
                <Switch
                  value={typeof personType.howManyCohortsPerType === "string"}
                  onChange={() => {
                    if (typeof personType.howManyCohortsPerType === "number") {
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
                  "Need to configure source table first"
                )}
              </div>
            </FormField>
          </div>
          <div className="h-8" />
          <div className="flex w-full">
            <div className="w-1/3">
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
            <div className="w-4" />
            {sourceTable && (
              <div className="w-1/3">
                <FormField label="Time availability field">
                  <FieldPickerSynced
                    table={sourceTable}
                    globalConfigKey={[...path, "timeAvField"]}
                  />
                </FormField>
              </div>
            )}
          </div>
          <div className="w-full flex justify-end">
            <Button onClick={() => setIsEditDialogOpen(false)}>Save</Button>
          </div>
        </Dialog>
      )}
    </>
  );
};

const Settings = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];

  const [lengthOfMeeting, setLengthOfMeeting] = useSynced([
    ...path,
    "lengthOfMeeting",
  ]);

  const [firstWeek, setFirstWeek] = useSynced([...path, "firstWeek"]);

  const [typesOfPeople, setTypesOfPeople] = useSynced([
    ...path,
    "typesOfPeople",
  ]);

  const base = useBase();
  const cohortsTable = base.getTableByIdIfExists(
    globalConfig.get([...path, "cohortsTable"]) as string
  );

  return (
    <>
      <div className="flex w-full">
        <FormField
          className="w-1/2"
          label="Length of meeting (only 30min increments)"
        >
          <FixedNumberInput
            value={lengthOfMeeting}
            increment={() =>
              setLengthOfMeeting((lengthOfMeeting as number) + 30)
            }
            decrement={() =>
              setLengthOfMeeting(Math.max((lengthOfMeeting as number) - 30, 30))
            }
            render={(l) => renderDuration(l * MS_IN_MINUTE)}
          />
        </FormField>
        <FormField className="w-1/2" label="First week of meetings">
          <FixedNumberInput
            value={firstWeek}
            increment={() => setFirstWeek((firstWeek as number) + MS_IN_WEEK)}
            decrement={() => setFirstWeek((firstWeek as number) - MS_IN_WEEK)}
            render={(ms) => "Week of " + new Date(ms).toLocaleDateString()}
          />
        </FormField>
      </div>
      <div>
        <FormField label="Cohorts table">
          <TablePickerSynced
            globalConfigKey={[...path, "cohortsTable"]}
            width="300px"
            onChange={() => {
              globalConfig.setPathsAsync([
                { path: [...path, "cohortsView"], value: null },
                { path: [...path, "cohortsTableStartDateField"], value: null },
                { path: [...path, "cohortsTableEndDateField"], value: null },
              ]);
            }}
          />
        </FormField>
        {cohortsTable && (
          <div className="flex space-x-2">
            <FormField label="Cohorts table start date field">
              <FieldPickerSynced
                table={cohortsTable}
                globalConfigKey={[...path, "cohortsTableStartDateField"]}
                width="300px"
              />
            </FormField>
            <FormField label="Cohorts table end date field">
              <FieldPickerSynced
                table={cohortsTable}
                globalConfigKey={[...path, "cohortsTableEndDateField"]}
                width="300px"
              />
            </FormField>
          </div>
        )}
      </div>
      <div>
        <div className="text-md font-semibold text-gray-500">
          Types of people
        </div>
        <div className="pl-1 space-y-1">
          {Object.keys(typesOfPeople || {}).map((id, index) => (
            <PersonTypeComp key={index} personTypeId={id} />
          ))}
          <Button
            icon="plus"
            onClick={() => {
              setTypesOfPeople({
                ...((typesOfPeople as {
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
    </>
  );
};

const RunningTheAlgorithm = () => {
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

const Preset = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const preset = globalConfig.get([
    "presets",
    selectedPreset as string,
  ]) as Preset;

  const [editPresetDialogOpen, setEditPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState(preset?.name);
  const closeEditPresetDialog = () => {
    setEditPresetDialogOpen(false);
    setNewPresetName(preset?.name);
  };

  return (
    <>
      {preset && (
        <>
          <div className="rounded-lg border shadow bg-white w-full px-4 py-3">
            <div className="flex justify-between">
              <Heading>{preset.name}</Heading>
              <Button
                icon="edit"
                className="text-gray-400"
                onClick={() => setEditPresetDialogOpen(true)}
              ></Button>
            </div>
            <div className="h-2" />
            <div className="space-y-2">
              <CollapsibleSection title="Settings" startOpen={true}>
                <Settings />
              </CollapsibleSection>
              <div className="h-3" />
              <CollapsibleSection title="Running the algorithm">
                <RunningTheAlgorithm />
              </CollapsibleSection>
            </div>
          </div>
        </>
      )}
      {editPresetDialogOpen && (
        <Dialog onClose={closeEditPresetDialog} width="320px">
          <Dialog.CloseButton />
          <div className="flex">
            <Heading>Edit preset</Heading>
            <div className="w-2" />
            <Button
              icon="trash"
              onClick={async () => {
                closeEditPresetDialog();
                await globalConfig.setAsync(
                  ["presets", selectedPreset as string],
                  undefined
                );
                await globalConfig.setAsync("selectedPreset", undefined);
              }}
            ></Button>
          </div>
          <FormField label="Name">
            <Input
              autoFocus={true}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
            />
          </FormField>
          <div className="flex w-full justify-end">
            <Button
              onClick={() => {
                closeEditPresetDialog();
                globalConfig.setAsync(
                  ["presets", selectedPreset as string, "name"],
                  newPresetName
                );
              }}
            >
              Save
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
};

const AlgorithmPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset");
  return (
    <div>
      <PresetChooser />
      <div className="h-2" />
      {selectedPreset && <Preset />}
    </div>
  );
};

export default AlgorithmPage;
