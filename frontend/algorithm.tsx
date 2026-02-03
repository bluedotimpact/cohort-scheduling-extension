import AirtableRecord from "@airtable/blocks/dist/types/src/models/record";
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
import { parseIntervals, toDate } from "weekly-availabilities";
import { MINUTES_IN_UNIT } from "../lib/constants";
import { expectInteger } from "../lib/expectInteger";
import { getEmailFieldId, getFacilitatorBlockedTimes, getTargetRoundDates } from "../lib/facilitatorUtils";
import { Cohort, SchedulerInput, PersonType as SchedulerPersonType, solve } from "../lib/scheduler";
import { subtractIntervals, wait } from "../lib/util";
import { PersonBlob } from "./components/Blobs";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { Preset } from "./index";
import { ViewCohort } from "./view";

interface SolutionProps {
  solution: Cohort[],
  personTypes: SchedulerPersonType[],
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
              const avgSize = 100 * (personType.min + personType.max) / 2;

              return (
                <div
                  key={personType.name}
                  className="text-center px-1"
                  style={{ flex: `0 1 ${avgSize}%`, minWidth: '80px' }}
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
                  {Object.keys(cohort.people).map((personTypeName) => {
                    const personType = personTypes.find((pt: SchedulerPersonType) => pt.name === personTypeName);
                    if (!personType) throw new Error('Person type in cohort but not configured');

                    const avgSize = 100 * (personType.min + personType.max) / 2;

                    return (
                      <div
                        key={personType.name}
                        className="flex flex-wrap gap-1 px-1"
                        style={{ flex: `0 1 ${avgSize}%`, minWidth: '80px' }}
                      >
                        {cohort.people[personTypeName]!.map((personId) => {
                          return (
                            <PersonBlob
                              key={personId}
                              name={personType.people.find((person) => person.id === personId)?.name!}
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
          <div className="h-2" />
          <div className="space-y-2">
            {personTypes.map((personType) => {
              const usedPeople = solution.map(cohort => cohort.people[personType.name]).flat();
              const unusedPeople = personType.people.filter((person) => !usedPeople.includes(person.id));
              return (<div key={personType.name}>
                <div className="w-24">{personType.name}s:</div>
                <div className="flex items-center">
                  <div className="flex flex-wrap p-1 w-full bg-white rounded-sm border gap-1">
                    {unusedPeople.length === 0
                      ? "None"
                      : unusedPeople.map((person) => <PersonBlob key={person.id} name={person.name} />)
                    }
                  </div>
                </div>
              </div>);
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
          <ViewCohort cohort={solution[viewedCohortIndex]!} />
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
                        const fields: Record<FieldId, unknown> = {
                          [preset.cohortsTableStartDateField!]: toDate(
                            cohort.startTime,
                            new Date(preset.firstWeek)
                          ),
                          [preset.cohortsTableEndDateField!]: toDate(
                            cohort.endTime,
                            new Date(preset.firstWeek)
                          ),
                        };

                        for (const personType of Object.values(preset.personTypes)) {
                          fields[personType.cohortsTableField!] = cohort.people[personType.name]!.map((id) => ({ id }));
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
        let targetRoundDates: { start: Date; end: Date } | null = null;
        const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!);
        const emailFieldId = getEmailFieldId(cohortsTable!, preset);

        const personTypes: SchedulerPersonType[] = [];

        for (const personType of Object.values(preset.personTypes)) {
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

          const fieldsToFetch = [
            table.primaryField.id,
            personType.timeAvField,
            typeof personType.howManyCohortsPerType === "string" && personType.howManyCohortsPerType,
            // For facilitators, also fetch email field and iteration field
            ...(personType.name === 'Facilitator' ? [emailFieldId, personType.iterationField] : []),
          ];

          const peopleRecords = (await source.selectRecordsAsync({
            fields: fieldsToFetch.filter(Boolean) as string[],
          })).records

          // Get target round from Facilitator's information
          if (personType.name === 'Facilitator' && personType.iterationField && peopleRecords.length > 0 && !targetRoundDates && cohortsTable) {
            const firstPersonRound = peopleRecords[0]?.getCellValue(personType.iterationField) as Array<{ id: string }> | null;
            const targetRoundId = firstPersonRound?.[0]?.id;

            if (targetRoundId) {
              targetRoundDates = await getTargetRoundDates(base, targetRoundId, cohortsTable, preset);
            }
          }

          // Process people, applying blocked time subtraction for facilitators
          const people = await Promise.all(peopleRecords.map(async (record) => {
            try {
              let timeAvMins = parseIntervals(record.getCellValueAsString(personType.timeAvField!));

              // For facilitators, subtract blocked times from other active rounds
              if (personType.name === 'Facilitator' && emailFieldId && targetRoundDates !== null) {
                const facilitatorEmail = record.getCellValueAsString(emailFieldId);
                if (facilitatorEmail) {
                  const blockedTimes = await getFacilitatorBlockedTimes({
                    base,
                    facilitatorEmail,
                    preset,
                    targetRoundDates,
                  });
                  timeAvMins = subtractIntervals(timeAvMins, blockedTimes);
                }
              }

              return {
                id: record.id,
                name: record.getCellValueAsString(table.primaryField.id),
                timeAvMins,
                timeAvUnits: timeAvMins.map(([s, e]) => [
                  expectInteger(s / MINUTES_IN_UNIT, 'Expected time availability to be aligned to 15 minute blocks'),
                  expectInteger(e / MINUTES_IN_UNIT, 'Expected time availability to be aligned to 15 minute blocks')
                ] as [number, number]),
                howManyCohorts:
                typeof personType.howManyCohortsPerType === "string"
                  ? record.getCellValue(personType.howManyCohortsPerType) as number
                  : personType.howManyCohortsPerType!,
              }
            } catch (throwable: unknown) {
              const prefix = `In processing person "${record.name}" (${record.id}): `;
              const error: Error = throwable instanceof Error ? throwable : new Error(String(throwable))
              error.message = prefix + error.message;
              (error as { record?: unknown }).record = record;
              throw error;
            }
          }));

          personTypes.push({
            name: personType.name,
            min: personType.howManyTypePerCohort[0],
            max: personType.howManyTypePerCohort[1],
            people,
          });
        }
        setGrandInput({
          lengthOfMeetingMins: preset.lengthOfMeeting,
          personTypes,
        });
      } catch (err) {
        console.error(err);
        setParsingError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    generateGrandInput();
  }, [base, preset]);

  const [solution, setSolution] = useState<null | Cohort[]>(null);
  const [error, setError] = useState<null | unknown>(null);
  const [solving, setSolving] = useState<boolean>(false);

  const [checking, setChecking] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);

  useEffect(() => {
    if (solution) {
      const checkSolution = (async () => {
        if (!solution || !grandInput) return;
        return solution.every((cohort) => {    
          return Object.keys(cohort.people).every((personTypeName) => {
            const personType = grandInput.personTypes.find(
              (pt) => pt.name === personTypeName
            );
            
            // Check that for every person in the cohort, they have a slot in their time availability which includes the cohort
            return cohort.people[personTypeName]!.every((personID) => {
              const timeAv = personType?.people?.find((person) => person.id === personID)?.timeAvMins ?? [];
              return timeAv.some(([b, e]) => b <= cohort.startTime && cohort.startTime <= e - grandInput.lengthOfMeetingMins);
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
  }, [grandInput, grandInput?.lengthOfMeetingMins, grandInput?.personTypes, solution]);

  return (
    <div>
      {parsingError ? (
        <Text className="text-red-500">
          Parsing error: {parsingError.message}
          {("record" in parsingError) && <> (<span className="text-blue-500 cursor-pointer" onClick={() => {
            expandRecord(parsingError.record as AirtableRecord)
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
                ? "Solution checked."
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
          {error && <div>Error: {error instanceof Error ? error.message : JSON.stringify(error, null, 2)}</div>}
        </div>
      )}
    </div>
  );
};

export default AlgorithmPage;
