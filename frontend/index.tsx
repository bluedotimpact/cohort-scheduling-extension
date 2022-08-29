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
  useSynced
} from "@airtable/blocks/ui";
import { Tab } from "@headlessui/react";
import React, { Fragment, useMemo, useState } from "react";
import { thisMonday } from "../lib/date";
import { newUID } from "../lib/util";
import AlgorithmPage from "./algorithm";
import SetupPage from "./setup";
import ViewPage from "./view";

export type Preset = {
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
  return (
    <Tab.Group>
      <Tab.List className="h-9 p-1 w-full flex items-center justify-between bg-slate-500">
        <div className="flex items-center">
          <MyTabLink icon="settings" label="Setup" />
          <MyTabLink icon="shapes" label="Algorithm" />
          <MyTabLink icon="show1" label="View" />
        </div>
        <div className="text-slate-50">
          <PresetChooser />
        </div>
      </Tab.List>
      <Tab.Panels className="p-4 bg-slate-50 min-h-screen h-full">
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
  );
}

loadScriptFromURLAsync("https://cdn.tailwindcss.com").then(() => {
  initializeBlock(() => <App />);
});
