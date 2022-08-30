import {
  Button,
  Dialog,
  Heading,
  Loader,
  useBase,
  useGlobalConfig
} from "@airtable/blocks/ui";
import React, { useEffect, useState } from "react";
import { MINUTE_IN_HOUR, UNIT_MINUTES } from "../lib/constants";
import { getDateFromCoord } from "../lib/date";
import { prettyPrintDayTime } from "../lib/format";
import { parseTimeAvString, unparseNumber } from "../lib/parse";
import { solve } from "../lib/scheduler";
import { wait } from "../lib/util";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { TimeAvWidgetOverlay } from "./components/TimeAvWidget";
import { Preset } from "./index";
import { PersonType } from "./setup";

const PersonBlob = (props) => {
  return (
    <div className={"rounded px-1 bg-blue-50 h-5 " + props.className}>
      {props.name}
    </div>
  );
};

const ViewCohort = ({
  viewedCohortIndex,
  setViewedCohortIndex,
  solution,
  lengthOfMeeting,
  personTypes,
}) => {
  const [hoveredPerson, setHoveredPerson] = useState(null);

  const goToNextCohort = () => {
    const newIndex = Math.min(solution.length - 1, viewedCohortIndex + 1);
    if (newIndex !== viewedCohortIndex) setHoveredPerson(null);
    setViewedCohortIndex(newIndex);
  };

  const goToPreviousCohort = () => {
    const newIndex = Math.max(0, viewedCohortIndex - 1);
    if (newIndex !== viewedCohortIndex) setHoveredPerson(null);
    setViewedCohortIndex(newIndex);
  };

  const allPeople = Object.keys(solution[viewedCohortIndex].people).reduce(
    (acc, personTypeName) => {
      const personType = personTypes.find(
        (personType) => personType.name === personTypeName
      );
      const people = solution[viewedCohortIndex].people[personTypeName].map(
        (personID) => personType.people.find((person) => person.id === personID)
      );
      return [...acc, ...people];
    },
    []
  );

  useEffect(() => {
    const f = (e) => {
      if (viewedCohortIndex !== null) {
        // if any arrow key
        if (
          e.keyCode == 38 ||
          e.keyCode == 40 ||
          e.keyCode == 37 ||
          e.keyCode == 39
        ) {
          e.preventDefault();
          // if arrow down
          if (e.keyCode === 40) {
            goToNextCohort();
          }
          // if arrow up
          if (e.keyCode === 38) {
            goToPreviousCohort();
          }
          // if arrow right
          if (e.keyCode === 39) {
            if (!hoveredPerson) {
              setHoveredPerson(allPeople[0]);
            } else {
              const index = allPeople.indexOf(hoveredPerson);
              if (index < allPeople.length - 1) {
                setHoveredPerson(allPeople[index + 1]);
              }
            }
          }
          // if arrow left
          if (e.keyCode === 37) {
            if (!hoveredPerson) {
              setHoveredPerson(allPeople[allPeople.length - 1]);
            } else {
              const index = allPeople.indexOf(hoveredPerson);
              if (index > 0) {
                setHoveredPerson(allPeople[index - 1]);
              }
            }
          }
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [viewedCohortIndex, hoveredPerson]);

  return (
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
      <div className="flex">
        <div className="w-28 shrink-0 font-semibold">Meeting time:</div>
        <div>
          {prettyPrintDayTime(
            unparseNumber(
              solution[viewedCohortIndex].time,
              MINUTE_IN_HOUR / UNIT_MINUTES
            )
          )}{" "}
          —{" "}
          {prettyPrintDayTime(
            unparseNumber(
              solution[viewedCohortIndex].time + lengthOfMeeting,
              MINUTE_IN_HOUR / UNIT_MINUTES
            )
          )}
        </div>
      </div>
      {personTypes.map((personType) => {
        return (
          <div className="flex">
            <div className="w-28 shrink-0 font-semibold">
              {personType.name}s:
            </div>
            <div className="flex flex-wrap">
              {solution[viewedCohortIndex].people[personType.name].map(
                (personID) => {
                  const person = personType.people.find(
                    (person) => person.id === personID
                  );
                  return (
                    <div
                      onMouseOver={() => {
                        setHoveredPerson(person);
                      }}
                      className={
                        "px-1 py-0.5 cursor-default hover:text-slate-500 " +
                        (hoveredPerson === person ? "text-slate-500" : "")
                      }
                    >
                      <PersonBlob key={personID} name={person.name} />
                    </div>
                  );
                }
              )}
            </div>
          </div>
        );
      })}
      <div>
        <span className="text-xs text-gray-400">
          {hoveredPerson
            ? `Overlaying ${hoveredPerson.name}`
            : "You can hover over people above to visually check that they can meet with their cohort"}
        </span>
        <TimeAvWidgetOverlay
          mainTimeAv={[
            [
              solution[viewedCohortIndex].time,
              solution[viewedCohortIndex].time + lengthOfMeeting,
            ],
          ]}
          overlayTimeAv={hoveredPerson?.timeAv || []}
          increment={UNIT_MINUTES}
        />
      </div>
    </Dialog>
  );
};

const Solution = ({ solution, personTypes, lengthOfMeeting }) => {
  const base = useBase();
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);

  const [viewedCohortIndex, setViewedCohortIndex] = useState(null);

  const [isAcceptDialogOpen, setAcceptDialogOpen] = useState(false);

  return (
    <>
      <div>
        <div className="w-full rounded border border-solid border-gray-200 h-72 overflow-auto">
          <div className="flex bg-slate-100 py-1 font-medium">
            <div className="w-4">({solution.length})</div>
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
                  className="flex items-center p-1 cursor-pointer hover:bg-slate-50 hover:text-gray-600"
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
          <div>some text</div>
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
        {viewedCohortIndex !== null && (
          <ViewCohort
            viewedCohortIndex={viewedCohortIndex}
            setViewedCohortIndex={setViewedCohortIndex}
            solution={solution}
            personTypes={personTypes}
            lengthOfMeeting={lengthOfMeeting}
          />
        )}
      </div>
      {isAcceptDialogOpen && (
        <Dialog
          onClose={() => {
            setAcceptDialogOpen(false);
          }}
          width="400px"
        >
          <Dialog.CloseButton />
          {solution.length} records will be created in the cohorts table. Are
          you sure?
          <div className="flex w-full justify-end space-x-2">
            <Button onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
            <Button
              //@ts-ignore
              type="asdf"
              variant="danger"
              onClick={async () => {
                const records = solution.map((cohort) => {
                  const start = cohort.time;
                  const end = cohort.time + lengthOfMeeting;
                  const fields = {
                    [preset.cohortsTableStartDateField]: getDateFromCoord(
                      unparseNumber(start, MINUTE_IN_HOUR / UNIT_MINUTES),
                      new Date(preset.firstWeek)
                    ),
                    [preset.cohortsTableEndDateField]: getDateFromCoord(
                      unparseNumber(end, MINUTE_IN_HOUR / UNIT_MINUTES),
                      new Date(preset.firstWeek)
                    ),
                  };

                  for (const personTypeID of Object.keys(preset.personTypes)) {
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
                setAcceptDialogOpen(false);
              }}
            >
              Confirm
            </Button>
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
            timeAv: parseTimeAvString(r.getCellValue(personType.timeAvField), {
              increment: UNIT_MINUTES,
            }),
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
