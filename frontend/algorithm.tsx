import {
  Button,
  Dialog,
  Heading,
  useBase,
  useGlobalConfig
} from "@airtable/blocks/ui";
import React, { useEffect, useState } from "react";
import { MINUTE_IN_HOUR, UNIT_MINUTES } from "../lib/constants";
import { parseTimeAvString, unparseNumber } from "../lib/parse";
import { solve } from "../lib/scheduler";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { TimeAvWidget } from "./components/TimeAvWidget";
import { Preset } from "./index";
import { PersonType } from "./setup";

const PersonBlob = ({ name }) => {
  return <div className="rounded px-1 bg-blue-50 h-5">{name}</div>;
};

const Solution = ({ solution, personTypes }) => {
  const base = useBase();

  const [viewedCohortIndex, setViewedCohortIndex] = useState(null);

  const [hoveredPerson, setHoveredPerson] = useState(null);

  return (
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
                className="flex p-1 cursor-pointer hover:bg-slate-50 hover:text-gray-600"
                onClick={() => setViewedCohortIndex(i)}
              >
                {Object.keys(cohort.people).map((personTypeName) => {
                  const personType = personTypes.find(
                    (pt: PersonType) => pt.name === personTypeName
                  ) as PersonType;
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
      {viewedCohortIndex !== null && (
        <Dialog onClose={() => setViewedCohortIndex(null)}>
          <Dialog.CloseButton />
          <div>
            Meeting time:
            {JSON.stringify(
              unparseNumber(
                solution[viewedCohortIndex].time,
                MINUTE_IN_HOUR / UNIT_MINUTES
              ),
              null,
              2
            )}
          </div>
          <div>
            {personTypes.map((personType) => {
              return (
                <div className="flex">
                  {personType.name}
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
                        >
                          <PersonBlob key={personID} name={person.name} />
                        </div>
                      );
                    }
                  )}
                  {}
                </div>
              );
            })}
          </div>
          {hoveredPerson && (
            <div>
              {hoveredPerson.name}
              <TimeAvWidget
                timeAv={hoveredPerson.timeAv}
                increment={UNIT_MINUTES}
              />
            </div>
          )}
        </Dialog>
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
      console.log(preset.personTypes);

      for (const key of Object.keys(preset.personTypes)) {
        const personType = preset.personTypes[key] as PersonType;
        console.log("personType", personType);

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
              setSolution(await solve(grandInput));
            }}
            variant="primary"
          >
            Run!
          </Button>
          {solution && (
            <Solution
              solution={solution}
              personTypes={grandInput.personTypes}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default AlgorithmPage;
