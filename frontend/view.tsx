import Record from "@airtable/blocks/dist/types/src/models/record";
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
import { MINUTES_IN_UNIT } from "../lib/constants";
import { dateToCoord } from "../lib/date";
import { prettyPrintDayTime } from "../lib/format";
import { Interval, parseDayTime, parseTimeAvString, Unit, unparseNumber } from "../lib/parse";
import { Cohort } from "../lib/scheduler";
import { combineIntervals } from "../lib/util";
import { CohortBlob, PersonBlob } from "./components/Blobs";
import { TimeAvWidget, TimeAvWidgetProps } from "./components/TimeAvWidget";
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
  const personType: PersonType = preset.personTypes[personTypeId];

  const timeAv = parseTimeAvString(record.getCellValueAsString(personType.timeAvField));

  const [overlapType, setOverlapType] = useState<"full" | "partial">("full");

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable);

  const rawCohorts = useRecords(cohortsTable, {
    fields: [
      preset.cohortsTableStartDateField,
      preset.cohortsTableEndDateField,
    ],
  });
  const cohortsWithTimes = rawCohorts.map((cohort) => {
    const meetingDates = [
      // getCellValueAsString returns something that can't be parsed by the date constructor
      // this returns an ISO timestamp that can
      new Date(cohort.getCellValue(preset.cohortsTableStartDateField) as string),
      new Date(cohort.getCellValue(preset.cohortsTableEndDateField) as string),
    ];

    // Meeting interval
    // e.g. M10:00 M11:30
    const timeAv = meetingDates
      .map(dateToCoord)
      .map(prettyPrintDayTime)
      .join(" ");
    return {
      id: cohort.id,
      name: cohort.name,
      timeAv: meetingDates.some(d => isNaN(d.getTime())) ? null : timeAv,
    };
  }).filter(c => c.timeAv);

  const cohortsFull = cohortsWithTimes.filter((cohort) => {
    const [[mb, me]] = parseTimeAvString(cohort.timeAv);
    return timeAv.some(([b, e]) => mb >= b && me <= e);
  });

  const cohortsPartial = cohortsWithTimes.filter((cohort) => {
    const [[mb, me]] = parseTimeAvString(cohort.timeAv);
    return timeAv.some(
      ([b, e]) => (mb >= b && mb < e) || (me > b && me <= e)
    );
  });

  const [hoveredCohort, setHoveredCohort] = useState(null);

  if (timeAv.length === 0) {
    return (
      <div className="text-gray-700">
        Participant hasn&apos;t filled out the time availability form.
      </div>
    );
  } else {
    return (
      <div>
        <Heading>
          {record.name} ({personType.name})
        </Heading>
        <TimeAvWidget
          availabilities={[{
            intervals: timeAv,
            class: "bg-green-500",
          }, {
            intervals: hoveredCohort ? parseTimeAvString(hoveredCohort.timeAv) : [],
            class: "bg-purple-500",
            opacity: 0.7,
          }]}
        />
        <div className="h-4" />
        <div className="flex items-center space-x-3">
          <Heading size="small" className="flex-1">Overlap with cohorts</Heading>
          <Switch
            value={overlapType === "full"}
            onChange={(value) => setOverlapType(value ? "full" : "partial")}
            label={overlapType === "full" ? "Full" : "Partial"}
            width="auto"
          />
        </div>
        <span className="text-xs text-gray-500">
          {hoveredCohort ? `Overlaying cohort ${hoveredCohort.name}` : "Hover over a cohort to view its overlap"}
        </span>
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
                    key={cohort.id}
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

interface ViewCohortProps {
  cohort: Cohort
}

export const ViewCohort = ({ cohort }: ViewCohortProps) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const [hoveredPerson, setHoveredPerson] = useState<null | (Record & { timeAv: Interval[] })>(null);
  useEffect(() => {
    setHoveredPerson(null);
  }, [cohort]);

  const peopleRecords: { [personTypeId: string]: (Record & { timeAv: Interval[] })[] } = {};
  const allPeople = Object.keys(cohort.people).reduce<(Record & { timeAv: Interval[] })[]>((acc, personTypeName) => {
    const personTypeID = Object.keys(preset.personTypes).find(
      (id) => preset.personTypes[id].name === personTypeName
    );
    const personType = preset.personTypes[personTypeID];

    const table = base.getTableByIdIfExists(personType.sourceTable);

    // TODO: we shouldn't use a hook here
    // If the set of person types changes, there will be undefined behaviour!
    // In practice this is very rare though
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const records = useRecords(table) as (Record & { timeAv: Interval[] })[];
    peopleRecords[personTypeID] = records;
    const people = cohort.people[personTypeName].map((personID) => {
      const person = records.find((person) => person.id === personID)
      person.timeAv = parseTimeAvString(person.getCellValueAsString(personType.timeAvField));
      return person;
    });
    return [...acc, ...people];
  }, []);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key == "ArrowLeft" || e.key == "ArrowRight") {
        e.preventDefault();

        if (e.key === "ArrowRight") {
          if (!hoveredPerson) {
            setHoveredPerson(allPeople[0]);
          } else {
            const index = allPeople.indexOf(hoveredPerson);
            if (index < allPeople.length - 1) {
              setHoveredPerson(allPeople[index + 1]);
            }
          }
        }

        if (e.key === "ArrowLeft") {
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
  // TODO: correct dependencies after nested useRecord call above is removed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredPerson]);

  const combinedIntervals = combineIntervals(allPeople.map(({ timeAv }) => timeAv));

  const availabilitiesByCount = combinedIntervals.reduce<{ [count: number]: Interval[] }>((acc, cur) => {
    acc[cur.count] = acc[cur.count] ?? []
    acc[cur.count].push(cur.interval)
    return acc;
  }, {})

  const agreedTime: TimeAvWidgetProps["availabilities"][number] = {
    intervals: [[cohort.time, cohort.time + preset.lengthOfMeeting / MINUTES_IN_UNIT as Unit]],
    class: "bg-purple-500",
  }
  const [showAgreedTime, setShowAgreedTime] = useState(true);
  const availabilities: TimeAvWidgetProps["availabilities"] = [(hoveredPerson ? [{
    intervals: hoveredPerson.timeAv,
    class: "bg-green-500",
    opacity: 0.3,
  }] : Object.entries(availabilitiesByCount).map(([count, intervals]) => ({
    intervals,
    class: "bg-green-500",
    opacity: parseInt(count) / allPeople.length,
  }))), (showAgreedTime ? [agreedTime] : [])].flat(1)

  return (
    <>
      <div className="flex">
        <div className="w-28 shrink-0 font-semibold">Meeting time:</div>
        <div>
          {prettyPrintDayTime(unparseNumber(cohort.time))} —{" "}
          {prettyPrintDayTime(
            unparseNumber(cohort.time + preset.lengthOfMeeting / MINUTES_IN_UNIT)
          )}
        </div>
      </div>
      {Object.keys(preset.personTypes).map((personTypeID) => {
        const personType = preset.personTypes[personTypeID];
        return (
          <div key={personTypeID} className="flex">
            <div className="w-28 shrink-0 font-semibold">
              {personType.name}s:
            </div>
            <div className="flex flex-wrap">
              {cohort.people[personType.name].map((personID) => {
                const person = peopleRecords[personTypeID].find(
                  (person) => person.id === personID
                );

                return (
                  <div
                    key={personID}
                    onMouseEnter={() => {
                      setHoveredPerson(person);
                    }}
                    onMouseLeave={() => {
                      setHoveredPerson(null);
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
            : "Hover over someone to view their individual availability"}
        </span>
        <TimeAvWidget availabilities={availabilities} />
        <Switch
            value={showAgreedTime}
            onChange={(value) => setShowAgreedTime(value)}
            label={"Show agreed time"}
            width="auto"
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
