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
import { thisMonday } from "../lib/date";
import { newUID } from "../lib/util";
import AlgorithmPage from "./algorithm";
import SetupPage, { PersonType } from "./setup";
import ViewPage from "./view";

export type Preset = {
  name: string;
  lengthOfMeeting: number;
  firstWeek: number;
  personTypes: PersonType[];
};

const createPreset = (name: string) => ({
  name,
  lengthOfMeeting: 90,
  firstWeek: thisMonday().getTime(),
  personTypes: [],
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

function MyTabLink({ icon, label }) {
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
      <Tab.Group>
        <Tab.List className="h-9 p-1 w-full flex items-center justify-between bg-slate-500">
          <div className="flex items-center">
            <MyTabLink icon="settings" label="Setup" />
            <MyTabLink icon="shapes" label="Algorithm" />
            <MyTabLink icon="show1" label="View" />
          </div>
          <div className="flex text-slate-50">
            <PresetChooser />
            <Button
              icon="edit"
              className="text-gray-400"
              onClick={() => setEditPresetDialogOpen(true)}
            ></Button>
          </div>
        </Tab.List>
        <Tab.Panels className="py-4 px-6 bg-slate-50 min-h-screen h-full">
          <Tab.Panel>
            <SetupPage />
          </Tab.Panel>
          <Tab.Panel>
            <AlgorithmPage />
          </Tab.Panel>
          <Tab.Panel>
            <ViewPage />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
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
