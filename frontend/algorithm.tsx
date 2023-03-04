import Record from "@airtable/blocks/dist/types/src/models/record";
import { FieldId } from "@airtable/blocks/dist/types/src/types/field";
import {
  Button,
  Dialog,
  expandRecord,
  Heading,
  Loader,
  Text,
  useBase,
  useGlobalConfig
} from "@airtable/blocks/ui";
import React, { useCallback, useEffect, useState } from "react";
import { MINUTES_IN_UNIT } from "../lib/constants";
import { getDateFromCoord } from "../lib/date";
import { parseTimeAvString, unparseNumber } from "../lib/parse";
import { Cohort, PersonType, SchedulerInput, solve } from "../lib/scheduler";
import { wait } from "../lib/util";
import { PersonBlob } from "./components/Blobs";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { Preset } from "./index";
import { PersonType as SetupPersonType } from "./setup";
import { ViewCohort } from "./view";

interface SolutionProps {
  solution: Cohort[],
  personTypes: PersonType[],
}

const Solution = ({ solution, personTypes }: SolutionProps) => {
  const base = useBase();
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const preset = globalConfig.get(["presets", selectedPreset]) as Preset;

  const cohortsTable = preset.cohortsTable ? base.getTableByIdIfExists(preset.cohortsTable) : null;

  const [viewedCohortIndex, setViewedCohortIndex] = useState<number | undefined>();

  const goToNextCohort = useCallback(() => {
    setViewedCohortIndex(Math.min(solution.length - 1, (viewedCohortIndex ?? 0) + 1));
  }, [viewedCohortIndex, solution.length]);

  const goToPreviousCohort = useCallback(() => {
    setViewedCohortIndex(Math.max(0, (viewedCohortIndex ?? 0) - 1));
  }, [viewedCohortIndex]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (viewedCohortIndex !== undefined) {
        if (e.key == "ArrowDown" || e.key == "ArrowUp") {
          e.preventDefault();
          if (e.key === "ArrowDown") {
            goToNextCohort();
          }
          if (e.key === "ArrowUp") {
            goToPreviousCohort();
          }
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [viewedCohortIndex, goToNextCohort, goToPreviousCohort]);

  const [isAcceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <div>
        <div className="w-full rounded border border-solid border-gray-200">
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
                    const personType = personTypes.find((pt: PersonType) => pt.name === personTypeName);
                    if (!personType) throw new Error('Person type in cohort but not configured');

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
                              name={personType.people.find((person) => person.id === personID)?.name}
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
        <div className="h-2" />
        <div>
          <div className="text-md font-semibold">Unused people</div>
          <div className="space-y-2">
            {personTypes.map((personType) => {
              const usedPeople = solution.map(cohort => cohort.people[personType.name]).flat();
              const unusedPeople = personType.people.filter((person) => !usedPeople.includes(person.id));
              return (
                <div key={personType.name} className="flex items-center">
                  <div className="w-24">{personType.name}s:</div>
                  {unusedPeople.length === 0 ? (
                    <div>None</div>
                  ) : (
                    <div className="flex flex-wrap p-1 w-full bg-white rounded-sm border space-x-1">
                      {unusedPeople.map((person) => <PersonBlob key={person.id} name={person.name} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-4" />
        <div className="flex justify-between">
          <div className="text-xs text-gray-400">
            Click a cohort to view its meeting time and attendee&apos;s availability.
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
      {viewedCohortIndex !== undefined && (
        <Dialog
          onClose={() => {
            setViewedCohortIndex(undefined);
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
                        const end = cohort.time + preset.lengthOfMeeting / MINUTES_IN_UNIT;
                        const fields: Record<FieldId, unknown> = {
                          [preset.cohortsTableStartDateField]: getDateFromCoord(
                            unparseNumber(start),
                            new Date(preset.firstWeek)
                          ),
                          [preset.cohortsTableEndDateField]: getDateFromCoord(
                            unparseNumber(end),
                            new Date(preset.firstWeek)
                          ),
                        };

                        for (const personTypeID of Object.keys(preset.personTypes)) {
                          const personType = preset.personTypes[personTypeID];
                          fields[personType.cohortsTableField] = cohort.people[personType.name].map((id) => ({ id }));
                        }
                        return { fields };
                      });
                      if (!cohortsTable) throw new Error('Could not access cohorts table')
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
  const preset = globalConfig.get(path) as Preset;

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

  const [grandInput, setGrandInput] = useState<SchedulerInput | undefined>();
  const [parsingError, setParsingError] = useState<Error | undefined>();

  useEffect(() => {
    const generateGrandInput = async () => {
      try {
        const personTypes: PersonType[] = [];

        for (const key of Object.keys(preset.personTypes)) {
          const personType: SetupPersonType = preset.personTypes[key];

          const table = personType.sourceTable
            ? base.getTableByIdIfExists(personType.sourceTable)
            : null;
          const source = personType.sourceView
            ? table?.getViewByIdIfExists(personType.sourceView)
            : table;

          if (!table || !source) {
            throw new Error(`Failed to get source for personType ${personType.name}`)
          }

          if (!personType.howManyTypePerCohort) {
            throw new Error(`Missing howManyTypePerCohort for personType ${personType.name}`)
          }

          if (!personType.howManyCohortsPerType) {
            throw new Error(`Missing howManyCohortsPerType for personType ${personType.name}`)
          }

          if (!personType.timeAvField) {
            throw new Error(`Missing timeAvField for personType ${personType.name}`)
          }

          const peopleRecords = (await source.selectRecordsAsync({
            fields: [
              table.primaryField.id,
              personType.timeAvField,
              typeof personType.howManyCohortsPerType === "string" && personType.howManyCohortsPerType,
            ],
          })).records

          personTypes.push({
            name: personType.name,
            min: personType.howManyTypePerCohort[0],
            max: personType.howManyTypePerCohort[1],
            people: peopleRecords.map((record) => {
              try {
                return {
                  id: record.id,
                  name: record.getCellValueAsString(table.primaryField.id),
                  timeAv: parseTimeAvString(record.getCellValueAsString(personType.timeAvField!)),
                  howManyCohorts:
                  typeof personType.howManyCohortsPerType === "string"
                    ? record.getCellValue(personType.howManyCohortsPerType) as number
                    : personType.howManyCohortsPerType!,
                }
              } catch (throwable: unknown) {
                const prefix = `In processing person "${record.name}" (${record.id}): `;
                const error: Error = throwable instanceof Error ? throwable : new Error(String(throwable))
                error.message = prefix + error.message;
                (error as { record?: Record }).record = record;
                throw error;
              }
            }),
          });
        }
        setGrandInput({
          lengthOfMeeting: preset.lengthOfMeeting / MINUTES_IN_UNIT,
          personTypes,
        });
      } catch (err) {
        console.error(err);
        setParsingError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    generateGrandInput();
  }, [base, preset.lengthOfMeeting, preset.personTypes]);

  const [solution, setSolution] = useState<null | Cohort[]>(null);
  const [error, setError] = useState<null | unknown>(null);
  const [solving, setSolving] = useState<boolean>(false);

  const [checking, setChecking] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);

  useEffect(() => {
    if (solution) {
      const checkSolution = (async () => {
        if (!solution) return;
        return solution.every((cohort) => {
          const t = cohort.time;
    
          return Object.keys(cohort.people).every((personTypeName) => {
            const personType = grandInput?.personTypes.find(
              (pt) => pt.name === personTypeName
            );
    
            return cohort.people[personTypeName].every((personID) => {
              const timeAv = personType?.people?.find((person) => person.id === personID)?.timeAv ?? [];
              return grandInput && timeAv.some(([b, e]) => b <= t && t <= e - grandInput.lengthOfMeeting);
            });
          });
        });
      });

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
  }, [grandInput, grandInput?.lengthOfMeeting, grandInput?.personTypes, solution]);

  return (
    <div>
      {parsingError ? (
        <Text className="text-red-500">
          Parsing error: {parsingError.message}
          {("record" in parsingError) && <> (<span className="text-blue-500 cursor-pointer" onClick={() => {
            expandRecord(parsingError.record as Record)
          }}>view record</span>)</>}
        </Text>
      ) : !grandInput ? (
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
                        <div key={person.id} className="px-1 py-0.5">
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
                setError(null);
                try {
                  const solution = await solve(grandInput);
                  setSolution(solution);
                } catch (e) {
                  setError(e);
                  console.log(e);
                }
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
              />
            )
          )}
          {error && <div>{JSON.stringify(error, null, 2)}</div>}
        </div>
      )}
    </div>
  );
};

export default AlgorithmPage;
