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
import { newUID } from "../lib/util";
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
  howMany?: number;
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

  const [howMany, setHowMany] = useState(personType.howMany || 0);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(
    personType.name === "" ? true : false
  );

  const base = useBase();
  const sourceTable = base.getTableByIdIfExists(
    globalConfig.get([...path, "sourceTable"]) as string
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
              {personType.name} {`(${personType.howMany} per cohort)`}
            </div>
            {sourceTable && (
              <div className="text-[11px] text-slate-400">
                {sourceTable.name}{" "}
                {globalConfig.get([...path, "sourceView"]) &&
                  `(${
                    sourceTable.getViewByIdIfExists(
                      globalConfig.get([...path, "sourceView"]) as string
                    ).name
                  })`}
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
            globalConfigKey={[
              "presets",
              selectedPreset,
              "typesOfPeople",
              props.personTypeId,
              "cohortsTableField",
            ]}
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
            <FormField label="How many in cohort">
              <div className="flex w-full space-x-3">
                <Input
                  type="number"
                  className="w-20"
                  value={howMany + ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    setHowMany(n);
                    setPersonType({ ...personType, howMany: n });
                  }}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value);
                    if (n >= 1) {
                      setPersonType({ ...personType, howMany: n });
                    } else {
                      setHowMany(personType.howMany);
                    }
                  }}
                />
                <Switch
                  value={personType.canBeUnused}
                  onChange={(newValue) =>
                    setPersonType({ ...personType, canBeUnused: newValue })
                  }
                  label={"Can be unused"}
                  width="150px"
                />
              </div>
            </FormField>
          </div>
          <div className="h-8" />
          <div className="flex w-full">
            <div className="w-1/3">
              <FormField label="Source table">
                <TablePickerSynced globalConfigKey={[...path, "sourceTable"]} />
              </FormField>
              {sourceTable && (
                <FormField label="Source view (optional)">
                  <ViewPickerSynced
                    table={sourceTable}
                    globalConfigKey={[...path, "sourceView"]}
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

  const [lengthOfMeeting, setLengthOfMeeting] = useSynced([
    "presets",
    selectedPreset,
    "lengthOfMeeting",
  ]);

  const [firstWeek, setFirstWeek] = useSynced([
    "presets",
    selectedPreset,
    "firstWeek",
  ]);

  const [typesOfPeople, setTypesOfPeople] = useSynced([
    "presets",
    selectedPreset,
    "typesOfPeople",
  ]);

  const base = useBase();
  const cohortsTable = base.getTableByIdIfExists(
    globalConfig.get(["presets", selectedPreset, "cohortsTable"]) as string
  );

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
                        setLengthOfMeeting(
                          Math.max((lengthOfMeeting as number) - 30, 30)
                        )
                      }
                      render={(l) => renderDuration(l * MS_IN_MINUTE)}
                    />
                  </FormField>
                  <FormField className="w-1/2" label="First week of meetings">
                    <FixedNumberInput
                      value={firstWeek}
                      increment={() =>
                        setFirstWeek((firstWeek as number) + MS_IN_WEEK)
                      }
                      decrement={() =>
                        setFirstWeek((firstWeek as number) - MS_IN_WEEK)
                      }
                      render={(ms) =>
                        "Week of " + new Date(ms).toLocaleDateString()
                      }
                    />
                  </FormField>
                </div>
                <div>
                  <FormField label="Cohorts table">
                    <TablePickerSynced
                      globalConfigKey={[
                        "presets",
                        selectedPreset,
                        "cohortsTable",
                      ]}
                      width="300px"
                    />
                  </FormField>
                  {cohortsTable && (
                    <div className="flex space-x-2">
                      <FormField label="Cohorts table start date field">
                        <FieldPickerSynced
                          table={cohortsTable}
                          globalConfigKey={[
                            "presets",
                            selectedPreset,
                            "cohortsTableStartDateField",
                          ]}
                          width="300px"
                        />
                      </FormField>
                      <FormField label="Cohorts table end date field">
                        <FieldPickerSynced
                          table={cohortsTable}
                          globalConfigKey={[
                            "presets",
                            selectedPreset,
                            "cohortsTableEndDateField",
                          ]}
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
                <div className="h-3" />
              </CollapsibleSection>
              <CollapsibleSection title="Running the algorithm">
                <pre>
                  {JSON.stringify(
                    globalConfig.get(["presets", selectedPreset]),
                    undefined,
                    2
                  )}
                </pre>
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

const Algorithm = () => {
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

export default Algorithm;
