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
import { prettyPrintDayTime } from "../lib/format";
import { parseTimeAvString, unparseNumber } from "../lib/parse";
import { solve } from "../lib/scheduler";
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
  lenghtOfMeeting,
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
              solution[viewedCohortIndex].time + lenghtOfMeeting,
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
              solution[viewedCohortIndex].time + lenghtOfMeeting,
            ],
          ]}
          overlayTimeAv={hoveredPerson?.timeAv || []}
          increment={UNIT_MINUTES}
        />
      </div>
    </Dialog>
  );
};

const Solution = ({ solution, personTypes, lenghtOfMeeting }) => {
  const base = useBase();

  const [viewedCohortIndex, setViewedCohortIndex] = useState(null);

  return (
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
          onClick={() => {}}
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
          lenghtOfMeeting={lenghtOfMeeting}
        />
      )}
    </div>
  );
};

const AlgorithmPage = () => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  /* convert the preset into a form good for the algorithm
   { lenghtOfMeeting: number, 
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
                lenghtOfMeeting={grandInput.lengthOfMeeting}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AlgorithmPage;
