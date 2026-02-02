import AirtableRecord from "@airtable/blocks/dist/types/src/models/record";
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
import { Cohort } from "../lib/scheduler";
import { CohortBlob, PersonBlob } from "./components/Blobs";
import { TimeAvWidget, TimeAvWidgetProps } from "./components/TimeAvWidget";
import { PersonType } from "./setup";
import { format, fromDate, parseIntervals, Interval, calculateScheduleOverlap } from "weekly-availabilities";
import { getFacilitatorBlockedTimes } from "../lib/util";

const ViewPerson: React.FC<{ tableId: string, recordId: string }> = ({ tableId, recordId }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const table = base.getTableByIdIfExists(tableId)!;
  const record = useRecordById(table, recordId)!;

  const personType: PersonType = Object.values(preset.personTypes)
    .find((pt) => pt.sourceTable === tableId)!;

  const personTimeAv = parseIntervals(record.getCellValueAsString(personType.timeAvField!));

  const [overlapType, setOverlapType] = useState<"full" | "partial">("full");

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!)!;

  // Get email field ID from the lookup field's options
  const facilitatorEmailLookupField = preset.facilitatorEmailLookupField
    ? cohortsTable.fields.find((f) => f.id === preset.facilitatorEmailLookupField)
    : null;
  const emailFieldId = facilitatorEmailLookupField?.options?.fieldIdInLinkedTable as string | undefined;

  const rawCohorts = useRecords(cohortsTable, {
    fields: [
      preset.cohortsTableStartDateField,
      preset.cohortsTableEndDateField,
      preset.cohortsIterationField,
      preset.cohortsBucketField,
      personType.cohortsTableField,
      preset.facilitatorEmailLookupField,
    ].filter(Boolean) as string[],
  });

  const [facilitatorBlockedTimes, setFacilitatorBlockedTimes] = useState<Interval[]>([]);

  useEffect(() => {
    if (!emailFieldId) {
      setFacilitatorBlockedTimes([]);
      return;
    }

    const fetchBlockedTimes = async () => {
      const facilitatorEmail = record.getCellValueAsString(emailFieldId);
      const times = await getFacilitatorBlockedTimes({
        base,
        facilitatorEmail,
        preset,
      });

      setFacilitatorBlockedTimes(times);
    }

    fetchBlockedTimes();
  }, [base, record, cohortsTable, preset, emailFieldId]);

  const cohortsWithTimes = rawCohorts.flatMap((cohort) => {
    const meetingDates = [
      // getCellValueAsString returns something that can't be parsed by the date constructor
      // this returns an ISO timestamp that can
      new Date(cohort.getCellValue(preset.cohortsTableStartDateField!) as string),
      new Date(cohort.getCellValue(preset.cohortsTableEndDateField!) as string),
    ];

    if (meetingDates.some(d => isNaN(d.getTime()))) {
      return [];
    }

    return {
      id: cohort.id,
      name: cohort.name,
      iteration: cohort.getCellValueAsString(preset.cohortsIterationField!),
      timeAv: meetingDates.map((d) => fromDate(d)) as Interval,
      bucket: preset.cohortsBucketField ? cohort.getCellValueAsString(preset.cohortsBucketField) : "Unknown",
      participantCount: (cohort.getCellValue(personType.cohortsTableField!) as string[])?.length,
    };
  });

  const iterationCohorts = cohortsWithTimes.filter(c => c.iteration === record.getCellValueAsString(personType.iterationField!))

  const cohortsFull = iterationCohorts.filter((cohort) => {
    const [mb, me] = cohort.timeAv;
    return personTimeAv.some(([b, e]) => mb >= b && me <= e);
  });

  const cohortsPartial = iterationCohorts.filter((cohort) => {
    const [mb, me] = cohort.timeAv;
    return personTimeAv.some(
      ([b, e]) => (mb >= b && mb < e) || (me > b && me <= e)
    );
  });

  const [hoveredCohort, setHoveredCohort] = useState<typeof iterationCohorts[number] | null>(null);

  if (personTimeAv.length === 0) {
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
            intervals: personTimeAv,
            class: "bg-green-500",
          }, { intervals: facilitatorBlockedTimes,
            class: "bg-red-500",
            opacity: 0.9,
          }, {
            intervals: hoveredCohort ? [hoveredCohort.timeAv] : [],
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
        <div className="w-full rounded border border-solid border-gray-200 overflow-auto">
          <div className="flex bg-slate-100 p-1 font-medium">
            <div style={{ flex: "3 1 0" }}>Cohort</div>
            <div style={{ flex: "2 1 0" }}>Bucket</div>
            <div style={{ flex: "1 1 0" }}># participants</div>
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
                      style={{ flex: "3 1 0" }}
                      onClick={() =>
                        expandRecord(rawCohorts.find((c) => c.id === cohort.id)!)
                      }
                    >
                      <CohortBlob name={cohort.name} />
                    </div>
                    <div style={{ flex: "2 1 0" }}>
                      {cohort.bucket}
                    </div>
                    <div style={{ flex: "1 1 0" }}>{cohort.participantCount}</div>
                    <div style={{ flex: "1 1 0" }}>
                      {format(cohort.timeAv).replace(" ", " – ")}
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

export const ViewCohort = ({ cohort, facilitatorEmail }: { cohort: Cohort; facilitatorEmail?: string | undefined }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();

  const [hoveredPerson, setHoveredPerson] = useState<null | (AirtableRecord & { timeAv: Interval[] })>(null);
  const [facilitatorBlockedTimes, setFacilitatorBlockedTimes] = useState<Interval[]>([]);

  useEffect(() => {
    setHoveredPerson(null);
  }, [cohort]);

  const peopleRecords: { [personTypeId: string]: (AirtableRecord & { timeAv: Interval[] })[] } = {};
  const allPeople = Object.keys(cohort.people).reduce<(AirtableRecord & { timeAv: Interval[] })[]>((acc, personTypeName) => {
    const personTypeId = Object.keys(preset.personTypes).find(
      (id) => preset.personTypes[id]?.name === personTypeName
    )!;
    const personType = preset.personTypes[personTypeId]!;

    const table = base.getTableByIdIfExists(personType.sourceTable!)!;

    // TODO: we shouldn't use a hook here
    // If the set of person types changes, there will be undefined behaviour!
    // In practice this is very rare though
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const records = useRecords(table) as (AirtableRecord & { timeAv: Interval[] })[];
    peopleRecords[personTypeId] = records;
    const people = cohort.people[personTypeName]!.map((personID) => {
      const person = records.find((person) => person.id === personID)!
      person.timeAv = parseIntervals(person.getCellValueAsString(personType.timeAvField!));
      return person;
    });
    return [...acc, ...people];
  }, []);

  useEffect(() => {
    if (!facilitatorEmail) {
      setFacilitatorBlockedTimes([]);
      return;
    }

    const fetchBlockedTimes = async () => {
      const times = await getFacilitatorBlockedTimes({
        base,
        facilitatorEmail,
        preset,
      });

      setFacilitatorBlockedTimes(times);
    }

    fetchBlockedTimes();
  }, [facilitatorEmail, base, preset]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key == "ArrowLeft" || e.key == "ArrowRight") {
        e.preventDefault();

        if (e.key === "ArrowRight") {
          if (!hoveredPerson) {
            setHoveredPerson(allPeople[0]!);
          } else {
            const index = allPeople.indexOf(hoveredPerson);
            if (index < allPeople.length - 1) {
              setHoveredPerson(allPeople[index + 1]!);
            }
          }
        }

        if (e.key === "ArrowLeft") {
          if (!hoveredPerson) {
            setHoveredPerson(allPeople[allPeople.length - 1]!);
          } else {
            const index = allPeople.indexOf(hoveredPerson);
            if (index > 0) {
              setHoveredPerson(allPeople[index - 1]!);
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

  const combinedIntervals = calculateScheduleOverlap(allPeople.map(({ timeAv }) => timeAv));

  const availabilitiesByCount = combinedIntervals.reduce<{ [count: number]: Interval[] }>((acc, cur) => {
    acc[cur.count] = acc[cur.count] ?? []
    acc[cur.count]!.push(cur.interval)
    return acc;
  }, {})

  const agreedTime: TimeAvWidgetProps["availabilities"][number] = {
    intervals: [[cohort.startTime, cohort.endTime]],
    class: "bg-purple-500",
  }
  const [showAgreedTime, setShowAgreedTime] = useState(true);
  const availabilities: TimeAvWidgetProps["availabilities"] = [
    (hoveredPerson ? [{
      intervals: hoveredPerson.timeAv,
      class: "bg-green-500",
      opacity: 0.3,
    }] : Object.entries(availabilitiesByCount).map(([count, intervals]) => ({
      intervals,
      class: "bg-green-500",
      opacity: parseInt(count) / allPeople.length,
    }))),
    [{
      intervals: facilitatorBlockedTimes,
      class: "bg-red-500",
      opacity: 0.9,
    }],
    (showAgreedTime ? [agreedTime] : []),
  ].flat(1)

  return (
    <>
      <div className="flex">
        <div className="w-28 shrink-0 font-semibold">Meeting time:</div>
        <div>
          {format([cohort.startTime, cohort.endTime])}
        </div>
      </div>
      {Object.entries(preset.personTypes).map(([personTypeId, personType]) => {
        return (
          <div key={personTypeId} className="flex">
            <div className="w-28 shrink-0 font-semibold">
              {personType.name}s:
            </div>
            <div className="flex flex-wrap">
              {cohort.people[personType.name]!.map((personID) => {
                const person = peopleRecords[personTypeId]!.find(
                  (person) => person.id === personID
                )!;

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

const ViewCohortWrapper = ({ recordId }: { recordId: string }) => {
  const globalConfig = useGlobalConfig();
  const selectedPreset = globalConfig.get("selectedPreset") as string;
  const path = ["presets", selectedPreset];
  const preset = globalConfig.get([...path]) as Preset;

  const base = useBase();
  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!)!;
  const cohortRecord = useRecordById(cohortsTable, recordId)!;

  const people: Record</* personType */ string, string[]> = {};
  for (const personType of Object.values(preset.personTypes)) {
    people[personType.name] = (
      cohortRecord.getCellValue(personType.cohortsTableField!) as any[]
    ).map(({ id }: { id: string }) => id);
  }

  const cohort: Cohort = {
    startTime: fromDate(new Date(cohortRecord.getCellValue(preset.cohortsTableStartDateField!) as string)),
    endTime: fromDate(new Date(cohortRecord.getCellValue(preset.cohortsTableEndDateField!) as string)),
    people,
  };

  const facilitatorEmail = preset.facilitatorEmailLookupField
    ? cohortRecord.getCellValueAsString(preset.facilitatorEmailLookupField)
    : undefined;

  return <ViewCohort cohort={cohort} facilitatorEmail={facilitatorEmail} />;
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

  const personTables = Object.values(preset.personTypes).map((personType) => personType.sourceTable!);
  const configuredTables = [preset.cohortsTable!, ...personTables];

  const helpText = `Go to any of your configured tables (${configuredTables
    .map((tid) => base.getTableByIdIfExists(tid)!.name)
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
        tableId={cursor.activeTableId!}
        recordId={cursor.selectedRecordIds[0]!}
      />
    );
  } else {
    return <ViewCohortWrapper recordId={cursor.selectedRecordIds[0]!} />;
  }
};

export default ViewPage;
