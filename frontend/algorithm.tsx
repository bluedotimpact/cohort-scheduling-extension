import {
    Button,
    Dialog,
    FormField,
    Heading,
    Input,
    Select,
    useGlobalConfig,
    useSynced
} from "@airtable/blocks/ui";
import React, { useMemo, useState } from "react";
import { newUID } from "../lib/util";

type Preset = {
  name: string;
};

const createPreset = (name: string) => ({ name });

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

const Preset = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset");
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
        <div className="rounded-lg border shadow bg-white w-full h-96 px-4 py-2">
          <div className="flex">
            <Heading>{preset.name}</Heading>
            <div className="w-2" />
            <Button
              icon="edit"
              className="text-gray-400"
              onClick={() => setEditPresetDialogOpen(true)}
            ></Button>
          </div>
        </div>
      )}
      {editPresetDialogOpen && (
        <Dialog onClose={closeEditPresetDialog} width="320px">
          <Dialog.CloseButton />
          <Heading>Edit preset</Heading>
          <FormField label="Name">
            <Input
              autoFocus={true}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
            />
          </FormField>
          <div className="flex w-full justify-between">
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
            >
              Delete preset
            </Button>
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
