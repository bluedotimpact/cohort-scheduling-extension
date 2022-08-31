import {
  expandRecord,
  Heading,
  Switch,
  useBase,
  useCursor,
  useGlobalConfig,
  useLoadable,
  useRecordById,
  useRecords,
  useWatchable
} from "@airtable/blocks/ui";
import React, { useEffect, useState } from "react";
import { Preset } from ".";
import { UNIT_MINUTES } from "../lib/constants";
import { dateToCoord } from "../lib/date";
import { prettyPrintDayTime } from "../lib/format";
import { parseDayTime, parseTimeAvString, unparseNumber } from "../lib/parse";
import { CohortBlob, PersonBlob } from "./components/Blobs";
import { TimeAvWidgetOverlay } from "./components/TimeAvWidget";
import { PersonType } from "./setup";

const ViewPerson = ({ tableId, recordId }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const table = base.getTableByIdIfExists(tableId);
  const record = useRecordById(table, recordId);

  const personTypeId = Object.keys(preset.personTypes).find((id) => {
    const personType = preset.personTypes[id];
    return personType.sourceTable === tableId;
  });
  const personType = preset.personTypes[personTypeId] as PersonType;

  const timeAv = record.getCellValue(personType.timeAvField);
  const parsedTimeAv = parseTimeAvString(timeAv);

  const [overlapType, setOverlapType] = useState<"full" | "partial">("full");

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);

  const rawCohorts = useRecords(cohortsTable, {
    fields: [
      preset.cohortsTableStartDateField,
      preset.cohortsTableEndDateField,
    ],
  });
  const allCohorts = rawCohorts.map((cohort) => {
    const meetingDates = [
      new Date(
        cohort.getCellValue(preset.cohortsTableStartDateField) as string
      ),
      new Date(cohort.getCellValue(preset.cohortsTableEndDateField) as string),
    ];
    const timeAv = meetingDates
      .map(dateToCoord)
      .map(prettyPrintDayTime)
      .join(" ");
    return {
      id: cohort.id,
      name: cohort.name,
      timeAv,
    };
  });

  const cohortsFull = allCohorts.filter((cohort) => {
    const [[mb, me]] = parseTimeAvString(cohort.timeAv);
    return parsedTimeAv.some(([b, e]) => mb >= b && me <= e);
  });

  const cohortsPartial = allCohorts.filter((cohort) => {
    const [[mb, me]] = parseTimeAvString(cohort.timeAv);
    return parsedTimeAv.some(
      ([b, e]) => (mb >= b && mb < e) || (me > b && me <= e)
    );
  });

  const [hoveredCohort, setHoveredCohort] = useState(null);

  if (!timeAv) {
    return (
      <div className="text-gray-700">
        Participant hasn't filled out the time availability form.
      </div>
    );
  } else {
    return (
      <div>
        <Heading>
          {record.name} ({personType.name})
        </Heading>
        <TimeAvWidgetOverlay
          primaryTimeAv={parseTimeAvString(timeAv)}
          primaryClass="bg-green-500"
          secondaryTimeAv={
            hoveredCohort ? parseTimeAvString(hoveredCohort.timeAv) : []
          }
          secondaryClass="bg-purple-400 opacity-70"
        />
        <div className="h-4" />
        <div className="flex items-center space-x-3">
          <Heading size="small">Overlap with cohorts</Heading>
          <Switch
            value={overlapType === "full"}
            onChange={(value) => setOverlapType(value ? "full" : "partial")}
            label={overlapType === "full" ? "Full" : "Partial"}
            width="100px"
          />
          {hoveredCohort && (
            <span className="text-xs text-gray-500">
              Overlaying cohort {hoveredCohort.name}
            </span>
          )}
        </div>
        <div className="h-2" />
        <div className="w-full rounded border border-solid border-gray-200 max-h-72 overflow-auto">
          <div className="flex bg-slate-100 p-1 font-medium">
            <div style={{ flex: "4 1 0" }}>Cohort</div>
            <div style={{ flex: "1 1 0" }}>Meeting time</div>
          </div>
          <div className="w-full bg-white divide-y divide-gray-200">
            {(overlapType === "full" ? cohortsFull : cohortsPartial).map(
              (cohort) => {
                return (
                  <div
                    className="flex p-1 items-center cursor-pointer hover:bg-slate-50 hover:text-gray-600"
                    onMouseEnter={() => setHoveredCohort(cohort)}
                    onMouseLeave={() => setHoveredCohort(null)}
                  >
                    <div
                      className="flex"
                      style={{ flex: "4 1 0" }}
                      onClick={() =>
                        expandRecord(rawCohorts.find((c) => c.id === cohort.id))
                      }
                    >
                      <CohortBlob name={cohort.name} />
                    </div>
                    <div style={{ flex: "1 1 0" }}>
                      {cohort.timeAv.replace(" ", " – ")}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>
    );
  }
};

export const ViewCohort = ({ cohort }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const [hoveredPerson, setHoveredPerson] = useState(null);
  useEffect(() => {
    setHoveredPerson(null);
  }, [cohort]);

  const allPeople = Object.keys(cohort.people).reduce((acc, personTypeName) => {
    const personTypeID = Object.keys(preset.personTypes).find(
      (id) => preset.personTypes[id].name === personTypeName
    );
    const personType = preset.personTypes[personTypeID];

    const table = base.getTableByIdIfExists(personType.sourceTable);

    const records = useRecords(table);
    const people = cohort.people[personTypeName].map((personID) => {
      const person = records.find((person) => person.id === personID);
      //@ts-ignore
      person.timeAv = parseTimeAvString(
        person.getCellValue(personType.timeAvField)
      );
      return person;
    });
    return [...acc, ...people];
  }, []);

  useEffect(() => {
    const f = (e) => {
      // if any arrow key
      if (e.keyCode == 37 || e.keyCode == 39) {
        e.preventDefault();

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
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [hoveredPerson]);

  return (
    <>
      <div className="flex">
        <div className="w-28 shrink-0 font-semibold">Meeting time:</div>
        <div>
          {prettyPrintDayTime(unparseNumber(cohort.time))} —{" "}
          {prettyPrintDayTime(
            unparseNumber(cohort.time + preset.lengthOfMeeting / UNIT_MINUTES)
          )}
        </div>
      </div>
      {Object.keys(preset.personTypes).map((personTypeID) => {
        const personType = preset.personTypes[personTypeID];
        return (
          <div className="flex">
            <div className="w-28 shrink-0 font-semibold">
              {personType.name}s:
            </div>
            <div className="flex flex-wrap">
              {cohort.people[personType.name].map((personID) => {
                const table = base.getTableByIdIfExists(personType.sourceTable);

                const records = useRecords(table);

                const person = records.find((person) => person.id === personID);
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
              })}
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
          primaryTimeAv={[
            [cohort.time, cohort.time + preset.lengthOfMeeting / UNIT_MINUTES],
          ]}
          primaryClass="bg-purple-500"
          secondaryTimeAv={hoveredPerson?.timeAv || []}
          secondaryClass="bg-green-500 opacity-30"
        />
      </div>
    </>
  );
};

const ViewCohortWrapper = ({ recordId }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();
  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);

  const cohortRecord = useRecordById(cohortsTable, recordId);
  const startDate = cohortRecord.getCellValue(
    preset.cohortsTableStartDateField
  );

  const people = {};
  for (const personTypeId of Object.keys(preset.personTypes)) {
    const personType = preset.personTypes[personTypeId];
    people[personType.name] = (
      cohortRecord.getCellValue(personType.cohortsTableField) as any[]
    ).map(({ id }) => id);
  }

  const cohort = {
    time: parseDayTime(
      prettyPrintDayTime(dateToCoord(new Date(startDate as string)))
    ),
    people,
  };

  return <ViewCohort cohort={cohort} />;
};

const ViewPage = () => {
  const globalConfig = useGlobalConfig();
  const cursor = useCursor();

  useLoadable(cursor);
  useWatchable(cursor, ["selectedRecordIds"]);

  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const personTables = Object.keys(preset.personTypes).map(
    (personTypeID) => preset.personTypes[personTypeID].sourceTable
  );
  const configuredTables = [preset.cohortsTable, ...personTables];

  const helpText = `Go to any of your configured tables (${configuredTables
    .map((tid) => base.getTableByIdIfExists(tid).name)
    .join(", ")}) and select any record (by clicking on any cell).`;

  if (cursor.selectedRecordIds.length === 0) {
    return (
      <div className="space-y-2 text-gray-700">
        <p>No records selected.</p>
        <p>{helpText}</p>
      </div>
    );
  } else if (!configuredTables.some((tid) => tid === cursor.activeTableId)) {
    return (
      <div className="space-y-2 text-gray-700">
        <p>Current table is not configured.</p>
        <p>{helpText}</p>
      </div>
    );
  } else if (personTables.some((tid) => tid === cursor.activeTableId)) {
    return (
      <ViewPerson
        tableId={cursor.activeTableId}
        recordId={cursor.selectedRecordIds[0]}
      />
    );
  } else {
    return <ViewCohortWrapper recordId={cursor.selectedRecordIds[0]} />;
  }
};

export default ViewPage;
