import { globalConfig } from "@airtable/blocks";
import {
  Button,
  Dialog,
  FormField,
  Heading,
  Icon,
  initializeBlock,
  Input,
  loadScriptFromURLAsync,
  Select,
  useGlobalConfig,
  useSynced
} from "@airtable/blocks/ui";
import { Tab } from "@headlessui/react";
import React, { Fragment, useMemo, useState } from "react";
import { newUID } from "../lib/util";
import AlgorithmPage from "./algorithm";
import OtherPage from "./other";
import SetupPage, { PersonType } from "./setup";
import ViewPage from "./view";
import { parseWeeklyTime, toDate } from "weekly-availabilities";
import { IconName } from "@airtable/blocks/dist/types/src/ui/icon_config";

export type Preset = {
  name: string;
  lengthOfMeeting: number;
  firstWeek: number;
  personTypes: { [personTypeId: string]: PersonType };
  cohortsTable?: string;
  cohortsTableStartDateField?: string;
  cohortsTableEndDateField?: string;
  cohortsIterationField?: string;
  cohortsBucketField?: string;
};

const createPreset = (name: string) => ({
  name,
  lengthOfMeeting: 90,
  firstWeek: toDate(parseWeeklyTime('M00:00')).getTime(),
  personTypes: [],
});

const PresetChooser = () => {
  const [selectedPreset, setSelectedPreset] = useSynced("selectedPreset");
  const [presets, setPresets] = useSynced("presets");

  const presetOptions = useMemo(() => {
    if (!presets) return [];

    return Object.keys(presets).map((presetId) => ({
      label: (presets as Record<string, Preset>)[presetId]!.name,
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
      <span className="hidden sm:block mr-2">Preset:</span>
      <div>
        <Select
          className="min-w-[5rem] rounded-r-none"
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
                    ...(presets as Record<string, Preset>),
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

const MyTabLink: React.FC<{ icon: IconName, label: React.ReactNode }> = ({ icon, label }) => {
  return (
    <Tab as={Fragment}>
      {({ selected }) => (
        <button
          className={
            "flex px-2 py-1 " + (selected ? "text-slate-50" : "text-slate-400")
          }
        >
          <Icon name={icon} size={16} />
          <span className="ml-1 tracking-widest uppercase text-xs font-medium">
            {label}
          </span>
        </button>
      )}
    </Tab>
  );
}

function App() {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const preset = globalConfig.get(["presets", selectedPreset]) as Preset;

  const [editPresetDialogOpen, setEditPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState(preset?.name);
  const closeEditPresetDialog = () => {
    setEditPresetDialogOpen(false);
    setNewPresetName(preset.name);
  };

  const isConfigured =
    preset.lengthOfMeeting > 0 &&
    preset.firstWeek > 0 &&
    preset.cohortsTable &&
    preset.cohortsTableStartDateField &&
    preset.cohortsTableEndDateField &&
    preset.cohortsIterationField &&
    Object.keys(preset.personTypes).length > 0 &&
    Object.values(preset.personTypes).every((personType) => (
        personType.name &&
        personType.sourceTable &&
        personType.timeAvField &&
        personType.howManyTypePerCohort &&
        personType.howManyCohortsPerType &&
        personType.iterationField &&
        personType.cohortsTableField
    ));

  const showDeletePreset = Object.keys(globalConfig.get("presets") as Record<string, Preset>).length > 1

  return (
    <main className="bg-slate-50 min-h-screen">
      <Tab.Group>
        <Tab.List className="p-1 w-auto flex gap-2 sm:gap-4 overflow-x-auto items-center justify-between bg-slate-500">
          <div className="flex items-center">
            <MyTabLink icon="settings" label="Setup" />
            {isConfigured && (
              <>
                <MyTabLink icon="shapes" label="Algo" />
                <MyTabLink icon="show1" label="View" />
                <MyTabLink icon="lightbulb" label="Other"></MyTabLink>
              </>
            )}
          </div>
          <div className="flex text-slate-50">
            <PresetChooser />
            <Button
              icon="edit"
              className={`bg-slate-200 text-slate-700 h-7 rounded-l-none border-solid border border-y-0 border-r-0 ${showDeletePreset ? "rounded-none" : ""}`}
              onClick={() => setEditPresetDialogOpen(true)}
              aria-label="Edit preset"
            ></Button>
            {showDeletePreset && (
              <Button
                icon="trash"
                className="bg-slate-200 text-slate-700 h-7 rounded-l-none border-solid border border-y-0 border-r-0 border-slate-700"
                onClick={async () => {
                  closeEditPresetDialog();
                  await globalConfig.setAsync(
                    "selectedPreset",
                    Object.keys(globalConfig.get("presets") as Record<string, Preset>)[0]
                  );

                  await globalConfig.setAsync(
                    ["presets", selectedPreset as string],
                    undefined
                  );
                }}
                aria-label="Delete preset"
              ></Button>
            )}
          </div>
        </Tab.List>
        <Tab.Panels className="p-4 sm:p-6">
          <Tab.Panel>
            <SetupPage />
          </Tab.Panel>
          {isConfigured && (
            <>
              <Tab.Panel>
                <AlgorithmPage />
              </Tab.Panel>
              <Tab.Panel>
                <ViewPage />
              </Tab.Panel>
              <Tab.Panel>
                <OtherPage />
              </Tab.Panel>
            </>
          )}
        </Tab.Panels>
      </Tab.Group>
      {editPresetDialogOpen && (
        <Dialog onClose={closeEditPresetDialog} width="320px">
          <Dialog.CloseButton />
          <div className="flex">
            <Heading>Edit preset</Heading>
            <div className="w-2" />
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
    </main>
  );
}

loadScriptFromURLAsync("https://cdn.tailwindcss.com").then(async () => {
  if (!globalConfig.get("selectedPreset")) {
    const id = newUID();
    const newPreset = createPreset("My preset");
    await globalConfig.setAsync("presets", { [id]: newPreset });
    await globalConfig.setAsync("selectedPreset", id);
  }
  initializeBlock(() => <App />);
});
