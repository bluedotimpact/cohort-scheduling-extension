import {
  Button,
  Dialog,
  Heading,
  Loader,
  useBase,
  useGlobalConfig
} from "@airtable/blocks/ui";
import React, { useEffect, useState } from "react";
import { UNIT_MINUTES } from "../lib/constants";
import { getDateFromCoord } from "../lib/date";
import { parseTimeAvString, unparseNumber } from "../lib/parse";
import { solve } from "../lib/scheduler";
import { wait } from "../lib/util";
import { PersonBlob } from "./components/Blobs";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { Preset } from "./index";
import { PersonType } from "./setup";
import { ViewCohort } from "./view";

const Solution = ({ solution, personTypes }) => {
  const base = useBase();
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);

  const [viewedCohortIndex, setViewedCohortIndex] = useState(null);

  const goToNextCohort = () => {
    setViewedCohortIndex(Math.min(solution.length - 1, viewedCohortIndex + 1));
  };

  const goToPreviousCohort = () => {
    setViewedCohortIndex(Math.max(0, viewedCohortIndex - 1));
  };

  useEffect(() => {
    const f = (e) => {
      if (viewedCohortIndex !== null) {
        // if any arrow key
        if (e.keyCode == 38 || e.keyCode == 40) {
          e.preventDefault();
          // if arrow down
          if (e.keyCode === 40) {
            goToNextCohort();
          }
          // if arrow up
          if (e.keyCode === 38) {
            goToPreviousCohort();
          }
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [viewedCohortIndex]);

  const [isAcceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <div>
        <div className="w-full rounded border border-solid border-gray-200 h-72 overflow-auto">
          <div className="flex bg-slate-100 py-1 font-medium">
            {personTypes.map((personType) => {
              const avgSize = (personType.min + personType.max) / 2;

              return (
                <div
                  key={personType.name}
                  className="text-center"
                  style={{ flex: `${avgSize} 1 0` }}
                >
                  {personType.name}
                </div>
              );
            })}
          </div>
          <div className="w-full bg-white divide-y divide-gray-200">
            {solution.map((cohort, i) => {
              return (
                <div
                  key={i}
                  className="flex items-center py-1 cursor-pointer hover:bg-slate-50 hover:text-gray-600"
                  onClick={() => setViewedCohortIndex(i)}
                >
                  <div className="w-4 text-center text-xs text-gray-400">
                    {i + 1}
                  </div>
                  {Object.keys(cohort.people).map((personTypeName) => {
                    const personType = personTypes.find(
                      (pt: PersonType) => pt.name === personTypeName
                    );
                    const table = base.getTableByIdIfExists(
                      personType.sourceTable
                    );
                    const source = personType.sourceView
                      ? table.getViewByIdIfExists(personType.sourceView)
                      : table;

                    const avgSize = (personType.min + personType.max) / 2;
                    return (
                      <div
                        key={personType.name}
                        className="flex space-x-1"
                        style={{ flex: `${avgSize} 1 0` }}
                      >
                        {cohort.people[personTypeName].map((personID) => {
                          return (
                            <PersonBlob
                              key={personID}
                              name={
                                personType.people.find(
                                  (person) => person.id === personID
                                ).name
                              }
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-4" />
        <div className="flex justify-between">
          <div className="text-xs text-gray-400">
            Click on a cohort to view its meeting time and visually check
            everyone's availability.
          </div>
          <Button
            //@ts-ignore
            type="asdf"
            icon="link"
            onClick={() => setAcceptDialogOpen(true)}
            variant="danger"
          >
            Save
          </Button>
        </div>
      </div>
      {viewedCohortIndex !== null && (
        <Dialog
          onClose={() => {
            setViewedCohortIndex(null);
          }}
        >
          <div className="flex justify-between">
            <div className="flex space-x-2 items-center">
              <div className="flex">
                <Button icon="chevronUp" onClick={goToPreviousCohort} />
                <Button icon="chevronDown" onClick={goToNextCohort} />
              </div>
              <div className="text-gray-400 text-xs">
                {viewedCohortIndex + 1} / {solution.length}
              </div>
            </div>
            <Dialog.CloseButton />
          </div>
          <ViewCohort cohort={solution[viewedCohortIndex]} />
        </Dialog>
      )}
      {isAcceptDialogOpen && (
        <Dialog
          onClose={() => {
            setAcceptDialogOpen(false);
          }}
          width="400px"
        >
          <Dialog.CloseButton />
          <div className="h-32">
            {!saving ? (
              <div className="flex h-full flex-col justify-between">
                <Heading>Save records?</Heading>
                {solution.length} records will be created in the cohorts table.
                Are you sure you want to continue?
                <div className="flex w-full justify-end space-x-2">
                  <Button onClick={() => setAcceptDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    //@ts-ignore
                    type="asdf"
                    variant="danger"
                    onClick={async () => {
                      setSaving(true);
                      const records = solution.map((cohort) => {
                        const start = cohort.time;
                        const end = cohort.time + preset.lengthOfMeeting;
                        const fields = {
                          [preset.cohortsTableStartDateField]: getDateFromCoord(
                            unparseNumber(start),
                            new Date(preset.firstWeek)
                          ),
                          [preset.cohortsTableEndDateField]: getDateFromCoord(
                            unparseNumber(end),
                            new Date(preset.firstWeek)
                          ),
                        };

                        for (const personTypeID of Object.keys(
                          preset.personTypes
                        )) {
                          const personType = preset.personTypes[personTypeID];
                          fields[personType.cohortsTableField] = cohort.people[
                            personType.name
                          ].map((id) => ({
                            id,
                          }));
                        }
                        return { fields };
                      });
                      console.log(records);
                      await cohortsTable.createRecordsAsync(records);
                      setSaving(false);
                      setAcceptDialogOpen(false);
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-full justify-center items-center">
                <Loader />
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
};

const AlgorithmPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  /* convert the preset into a form good for the algorithm
   { lengthOfMeeting: number, 
    personTypes: [
      { min, max, 
        people: [{ id: string, timeAv: [], howManyCohorts: number }, ...], 
      },
      ...
    ]
   } */

  const [grandInput, setGrandInput] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const argh = async () => {
      const personTypes = [];

      for (const key of Object.keys(preset.personTypes)) {
        const personType = preset.personTypes[key] as PersonType;

        const table = base.getTableByIdIfExists(personType.sourceTable);
        const source = personType.sourceView
          ? table.getViewByIdIfExists(personType.sourceView)
          : table;

        personTypes.push({
          name: personType.name,
          min: personType.howManyTypePerCohort[0],
          max: personType.howManyTypePerCohort[1],
          people: (
            await source.selectRecordsAsync({
              fields: [
                table.primaryField.id,
                personType.timeAvField,
                typeof personType.howManyCohortsPerType === "string" &&
                  personType.howManyCohortsPerType,
              ].filter(Boolean),
            })
          ).records.map((r) => ({
            id: r.id,
            name: r.getCellValue(table.primaryField.id),
            timeAv: parseTimeAvString(r.getCellValue(personType.timeAvField)),
            howManyCohorts:
              typeof personType.howManyCohortsPerType === "string"
                ? r.getCellValue(personType.howManyCohortsPerType)
                : personType.howManyCohortsPerType,
          })),
        });
      }
      setGrandInput({
        lengthOfMeeting: preset.lengthOfMeeting / UNIT_MINUTES,
        personTypes,
      });
    };

    argh();

    return () => {
      isMounted = false;
    };
  }, []);

  const [solution, setSolution] = useState(null);
  const [solving, setSolving] = useState(false);

  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const checkSolution = async () => {
    if (!solution) return;
    return solution.every((cohort) => {
      const t = cohort.time;

      return Object.keys(cohort.people).every((personTypeName) => {
        const personType = grandInput.personTypes.find(
          (pt) => pt.name === personTypeName
        );

        return cohort.people[personTypeName].every((personID) => {
          const timeAv = personType.people.find(
            (person) => person.id === personID
          ).timeAv;
          return timeAv.some(
            ([b, e]) => b <= t && t <= e - grandInput.lengthOfMeeting
          );
        });
      });
    });
  };

  useEffect(() => {
    if (solution) {
      setChecking(true);
      wait(100).then(() =>
        checkSolution().then((isValid) => {
          if (isValid) {
            setChecking(false);
            setChecked(true);
          }
        })
      );
    }
  }, [solution]);

  return (
    <div>
      {!grandInput ? (
        "Loading..."
      ) : (
        <div>
          <div>
            <Heading>Input description</Heading>
            {grandInput.personTypes.map((personType) => {
              return (
                <CollapsibleSection
                  key={personType.name}
                  size="xsmall"
                  title={`${personType.name} (${personType.people.length})`}
                >
                  <div className="flex flex-wrap w-full bg-white border p-1 rounded-sm">
                    {personType.people.map((person) => {
                      return (
                        <div className="px-1 py-0.5">
                          <PersonBlob key={person.name} name={person.name} />
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              );
            })}
          </div>
          <div className="h-4" />
          <div className="flex space-x-2 items-center">
            <Button
              //@ts-ignore
              type="asdf"
              icon="apps"
              onClick={async () => {
                setSolving(true);
                setSolution(await solve(grandInput));
                setSolving(false);
              }}
              variant="primary"
            >
              Run
            </Button>
            <div className="text-xs text-gray-400">
              {checking
                ? "Checking solution..."
                : checked
                ? "Everyone can meet with their cohort!"
                : ""}
            </div>
          </div>
          <div className="h-4" />
          {solving ? (
            <div className="flex w-full justify-center">
              <Loader />
            </div>
          ) : (
            solution && (
              <Solution
                solution={solution}
                personTypes={grandInput.personTypes}
                lengthOfMeeting={grandInput.lengthOfMeeting}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AlgorithmPage;
