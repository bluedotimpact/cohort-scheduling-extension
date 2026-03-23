import GLPK, { LP, Options } from "glpk.js";
import { Interval, WeeklyTime } from "weekly-availabilities";
import { MINUTES_IN_UNIT } from "./constants";
import { getOverlapUnits, expandAvailability, toTimeAvUnits } from "./util";

export interface SchedulerInput {
  lengthOfMeetingMins: number,
  personTypes: PersonType[],
}

export interface PersonType {
  name: string,
  min: number,
  max: number,
  people: Person[],
}

export interface Person {
  id: string,
  name: string,
  timeAvMins: Interval[],
  timeAvUnits: [number, number][],
  howManyCohorts: number,
  blockedTimes: Interval[] | undefined,
  tier: 1 | 3,
  timezone?: string | undefined,
}

export interface Cohort {
  startTime: WeeklyTime,
  endTime: WeeklyTime,
  /** Map from person type name -> person id */
  people: { [personType: string]: string[] },
  personTiers?: Record<string, 1 | 2 | 3>,
}

const toBinary = (personType: PersonType, person: Person, t: number): string => JSON.stringify([personType.name, person.id, t.toString()]);
const fromBinary = (binary: string): [string, string, string] => JSON.parse(binary);

const getCohortCount = (t: number): string => `cohortCount-${t}`;

/** Phase 1: Original LP solver — extracted from the previous solve() */
async function solvePhase1(
  { lengthOfMeetingMins, personTypes }: SchedulerInput,
  glpk: Awaited<ReturnType<typeof GLPK>>,
): Promise<null | Cohort[]> {
  const lengthOfMeetingInUnits = lengthOfMeetingMins / MINUTES_IN_UNIT;

  const personCount = personTypes.map(p => p.people.length).reduce((acc, cur) => acc + cur, 0);
  const timeLimitSeconds = Math.min(Math.max(personCount * 0.5, 5), 30);

  const options: Options = {
    msglev: glpk.GLP_MSG_ALL,
    presol: true,
    tmlim: timeLimitSeconds,
    cb: {
      call: (progress) => {
        console.log("progress", progress);
      },
      each: 1,
    },
  };

  let maxT = 0;
  for (const personType of personTypes)
    for (const person of personType.people)
      for (const interval of person.timeAvUnits)
        for (const t of interval) if (t > maxT) maxT = t;

  const times = Array.from({ length: maxT }, (_, i) => i);

  // VARIABLES
  const binaries: string[] = [];
  for (const personType of personTypes) {
    for (const person of personType.people) {
      for (const t of times) {
        binaries.push(toBinary(personType, person, t));
      }
    }
  }

  const cohortCounts: string[] = [];
  for (const t of times) {
    cohortCounts.push(getCohortCount(t));
  }

  const assignmentConstraints: LP["subjectTo"] = [];
  const availabilityConstraints: LP["subjectTo"] = [];
  const nonOverlappingConstraints: LP["subjectTo"] = [];
  for (const personType of personTypes) {
    for (const person of personType.people) {
      const personBinaries: string[] = [];
      for (const t of times) {
        const u = toBinary(personType, person, t);
        personBinaries.push(u);

        availabilityConstraints.push({
          name: u + "-availability",
          vars: [{ name: u, coef: 1 }],
          bnds: {
            type: glpk.GLP_UP,
            ub: person.timeAvUnits.some(
              ([b, e]) => b <= t && t <= e - lengthOfMeetingInUnits
            )
              ? 1
              : 0,
            lb: 0,
          },
        });

        const meetingVars: string[] = [];
        for (let i = 0; i < lengthOfMeetingInUnits; i++) {
          meetingVars.push(toBinary(personType, person, t + i));
        }
        nonOverlappingConstraints.push({
          name: u + "-non-overlapping",
          vars: meetingVars.map((u) => ({ name: u, coef: 1 })),
          bnds: {
            type: glpk.GLP_UP,
            ub: 1,
            lb: 0,
          },
        });
      }

      assignmentConstraints.push({
        name: person.id + "-howManyCohorts",
        vars: personBinaries.map((u) => ({ name: u, coef: 1 })),
        bnds: { type: glpk.GLP_UP, ub: person.howManyCohorts, lb: 0 },
      });
    }
  }

  const cohortCountConstraints: LP["subjectTo"] = [];
  for (const t of times) {
    for (const personType of personTypes) {
      const personBinaries = personType.people.map(person => toBinary(personType, person, t));

      cohortCountConstraints.push({
        name: personType.name + "-" + t + "-max",
        vars: [
          ...personBinaries.map((u) => ({ name: u, coef: 1 })),
          { name: getCohortCount(t), coef: -personType.max },
        ],
        bnds: { type: glpk.GLP_UP, ub: 0, lb: 0 },
      });
      cohortCountConstraints.push({
        name: personType.name + "-" + t + "-min",
        vars: [
          ...personBinaries.map((u) => ({ name: u, coef: 1 })),
          { name: getCohortCount(t), coef: -personType.min },
        ],
        bnds: { type: glpk.GLP_LO, ub: 0, lb: 0 },
      });
    }
  }

  const constraints = [
    ...assignmentConstraints,
    ...availabilityConstraints,
    ...nonOverlappingConstraints,
    ...cohortCountConstraints,
  ];

  try {
    const res = await glpk.solve(
      {
        name: "eh?",
        objective: {
          direction: glpk.GLP_MAX,
          name: "eh2?",
          vars: binaries.map((u) => ({ name: u, coef: 1 })),
        },
        subjectTo: constraints,
        generals: cohortCounts,
        binaries: binaries,
      },
      options
    );

    const timeslots: Record<string, Record<string, string[]>> = {};
    for (const binary of Object.keys(res.result.vars)) {
      if (binary.includes("cohortCount")) continue;
      const [personType, person, t] = fromBinary(binary);
      if (res.result.vars[binary] == 1) {
        if (!timeslots[t]) timeslots[t] = {};
        if (!timeslots[t]![personType]) timeslots[t]![personType] = [];
        timeslots[t]![personType]!.push(person);
      }
    }

    const largeCohorts: Cohort[] = [];
    for (const t of Object.keys(timeslots)) {
      largeCohorts.push({
        startTime: parseInt(t) * MINUTES_IN_UNIT as WeeklyTime,
        endTime: (parseInt(t) + lengthOfMeetingInUnits) * MINUTES_IN_UNIT as WeeklyTime,
        people: timeslots[t]!,
      });
    }

    const cohorts: Cohort[] = [];
    for (const largeCohort of largeCohorts) {
      const count = res.result.vars[getCohortCount(largeCohort.startTime / MINUTES_IN_UNIT)]!;
      const cohortCountsMap: Record<string, number[]> = {};
      for (const personType of personTypes) {
        const people = largeCohort.people[personType.name]!;
        const n = people.length;

        const r = n % count;
        const k = Math.floor(n / count);

        if (!cohortCountsMap[personType.name]) cohortCountsMap[personType.name] = [];
        for (let i = 0; i < count - r; i++) {
          cohortCountsMap[personType.name]!.push(k);
        }
        for (let i = 0; i < r; i++) {
          cohortCountsMap[personType.name]!.push(k + 1);
        }
      }
      for (let i = 0; i < count; i++) {
        const people: Record<string, string[]> = {};
        for (const personType of personTypes) {
          people[personType.name] = largeCohort.people[personType.name]!.slice(
            i * cohortCountsMap[personType.name]![i]!,
            (i + 1) * cohortCountsMap[personType.name]![i]!
          );
        }

        cohorts.push({
          startTime: largeCohort.startTime,
          endTime: largeCohort.endTime,
          people,
        });
      }
    }

    return cohorts;
  } catch (e) {
    console.log(e);
    return null;
  }
}

/** Find the best time slot where the most unassigned people can meet, subject to per-type minimums. */
function findBestTimeSlot(
  unassignedByType: Record<string, Person[]>,
  overlapThresholdByType: Record<string, number>,
  meetingLengthUnits: number,
  allTimeSlots: number[],
  personTypes: PersonType[],
): number | null {
  let bestTime: number | null = null;
  let bestTotal = 0;

  for (const t of allTimeSlots) {
    let totalEligible = 0;
    let allMinsMet = true;

    for (const pt of personTypes) {
      const people = unassignedByType[pt.name] ?? [];
      const threshold = overlapThresholdByType[pt.name] ?? 1;

      const eligible = people.filter(p => {
        const overlap = getOverlapUnits(p.timeAvUnits, t, meetingLengthUnits);
        return overlap >= threshold;
      });

      if (eligible.length < pt.min) {
        allMinsMet = false;
        break;
      }

      totalEligible += eligible.length;
    }

    if (allMinsMet && totalEligible > bestTotal) {
      bestTotal = totalEligible;
      bestTime = t;
    }
  }

  return bestTime;
}

// See https://www.notion.so/bluedot-impact/Cohort-scheduling-algorithm-5aea0c98fcbe4ddfac3321cd1afd56c3#e9efb553c9b3499e9669f08cda7dd322
export async function solve({ lengthOfMeetingMins, personTypes }: SchedulerInput): Promise<null | Cohort[]> {
  const lengthOfMeetingInUnits = lengthOfMeetingMins / MINUTES_IN_UNIT;

  const personTypeNames = new Set();
  personTypes.forEach(({ name }) => {
    if (personTypeNames.has(name)) {
      throw new Error("Duplicate person type name: " + name)
    }
    personTypeNames.add(name);
  })

  const glpk = await GLPK();

  // ── Phase 1: Run existing LP ──
  const phase1Cohorts = await solvePhase1({ lengthOfMeetingMins, personTypes }, glpk);
  if (phase1Cohorts === null) {
    return null;
  }

  // Build a lookup: personId -> Person and personId -> PersonType
  const personById: Record<string, Person> = {};
  const personTypeByPersonId: Record<string, PersonType> = {};
  for (const pt of personTypes) {
    for (const p of pt.people) {
      personById[p.id] = p;
      personTypeByPersonId[p.id] = pt;
    }
  }

  // Set tier 1 for all Phase 1 assigned people
  for (const cohort of phase1Cohorts) {
    cohort.personTiers = {};
    for (const ptName of Object.keys(cohort.people)) {
      for (const personId of cohort.people[ptName]!) {
        cohort.personTiers[personId] = 1;
      }
    }
  }

  // ── Phase 2: Check participant capacity ──
  const assignedIds = new Set<string>();
  for (const cohort of phase1Cohorts) {
    for (const ptName of Object.keys(cohort.people)) {
      for (const personId of cohort.people[ptName]!) {
        assignedIds.add(personId);
      }
    }
  }

  // Find the participant type (non-facilitator) and facilitator type
  const participantType = personTypes.find(pt => pt.name !== 'Facilitator');
  const facilitatorType = personTypes.find(pt => pt.name === 'Facilitator');

  if (!participantType || !facilitatorType) {
    return phase1Cohorts;
  }

  const unassignedParticipants = participantType.people.filter(p => !assignedIds.has(p.id));
  const unassignedFacilitators = facilitatorType.people.filter(p => !assignedIds.has(p.id));

  // Remaining capacity across existing cohorts
  let remainingParticipantCapacity = 0;
  for (const cohort of phase1Cohorts) {
    const currentCount = (cohort.people[participantType.name] ?? []).length;
    remainingParticipantCapacity += participantType.max - currentCount;
  }

  // ── Phase 3: Create additional groups if needed ──
  const deficit = unassignedParticipants.length - remainingParticipantCapacity;
  const maxNewGroupsByParticipants = Math.ceil(deficit / participantType.max);
  const maxNewGroupsByFacilitators = Math.floor(unassignedFacilitators.length / facilitatorType.min);
  let newGroupsNeeded = Math.min(maxNewGroupsByParticipants, maxNewGroupsByFacilitators);

  const newCohorts: Cohort[] = [];

  if (newGroupsNeeded > 0 && unassignedParticipants.length >= participantType.min) {
    // Compute maxT across all people for time slots
    let maxT = 0;
    for (const pt of personTypes)
      for (const p of pt.people)
        for (const interval of p.timeAvUnits)
          for (const t of interval) if (t > maxT) maxT = t;
    const allTimeSlots = Array.from({ length: maxT }, (_, i) => i);

    // Track which people have been consumed by new cohorts in Phase 3
    const phase3AssignedIds = new Set<string>();

    const halfMeeting = Math.ceil(lengthOfMeetingInUnits * 0.5);

    // Helper to get currently unassigned people (not assigned in Phase 1 or Phase 3)
    const getUnassignedByType = (): Record<string, Person[]> => {
      const result: Record<string, Person[]> = {};
      for (const pt of personTypes) {
        result[pt.name] = pt.people.filter(
          p => !assignedIds.has(p.id) && !phase3AssignedIds.has(p.id)
        );
      }
      return result;
    };

    // Helper to attempt creating groups with given thresholds and availability units
    const tryCreateGroups = (
      overlapThresholdByType: Record<string, number>,
      availabilityOverride?: Record<string, Map<string, [number, number][]>>,
    ): void => {
      while (newCohorts.length < newGroupsNeeded) {
        const unassignedByType = getUnassignedByType();

        // If using expanded availability, temporarily swap timeAvUnits
        if (availabilityOverride) {
          for (const ptName of Object.keys(unassignedByType)) {
            const overrideMap = availabilityOverride[ptName];
            if (overrideMap) {
              unassignedByType[ptName] = unassignedByType[ptName]!.map(p => {
                const expanded = overrideMap.get(p.id);
                if (expanded) {
                  return { ...p, timeAvUnits: expanded };
                }
                return p;
              });
            }
          }
        }

        // Check we still have enough unassigned participants
        if ((unassignedByType[participantType.name] ?? []).length < participantType.min) {
          break;
        }

        const bestTime = findBestTimeSlot(
          unassignedByType,
          overlapThresholdByType,
          lengthOfMeetingInUnits,
          allTimeSlots,
          personTypes,
        );

        if (bestTime === null) break;

        // Create empty cohort at this time
        const people: Record<string, string[]> = {};
        for (const pt of personTypes) {
          people[pt.name] = [];
        }

        newCohorts.push({
          startTime: bestTime * MINUTES_IN_UNIT as WeeklyTime,
          endTime: (bestTime + lengthOfMeetingInUnits) * MINUTES_IN_UNIT as WeeklyTime,
          people,
          personTiers: {},
        });

        // Mark no one as assigned yet — Phase 4 LP will do the actual assignment
        // But we need to "reserve" some facilitators so the cascading logic
        // properly counts remaining resources. Reserve the best facilitators.
        const unassignedFacs = unassignedByType[facilitatorType.name] ?? [];
        const eligibleFacs = unassignedFacs.filter(f => {
          const overlap = getOverlapUnits(f.timeAvUnits, bestTime, lengthOfMeetingInUnits);
          return overlap >= overlapThresholdByType[facilitatorType.name]!;
        });
        // Reserve min facilitators for this group
        for (let i = 0; i < Math.min(facilitatorType.min, eligibleFacs.length); i++) {
          phase3AssignedIds.add(eligibleFacs[i]!.id);
        }
      }
    };

    // 3a: Tier-1 people with >=50% overlap, facilitators >=50%
    tryCreateGroups({
      [participantType.name]: halfMeeting,
      [facilitatorType.name]: halfMeeting,
    });

    // 3b: Participants >=1 unit overlap, facilitators >=50%
    tryCreateGroups({
      [participantType.name]: 1,
      [facilitatorType.name]: halfMeeting,
    });

    // 3c: Expand participant availability, try >=50% then >=1 unit
    const expandedParticipantAvailability = new Map<string, [number, number][]>();
    for (const p of participantType.people) {
      if (!assignedIds.has(p.id) && !phase3AssignedIds.has(p.id)) {
        const expanded = expandAvailability(p.timeAvMins);
        expandedParticipantAvailability.set(p.id, toTimeAvUnits(expanded));
      }
    }

    const availabilityOverride: Record<string, Map<string, [number, number][]>> = {
      [participantType.name]: expandedParticipantAvailability,
    };

    tryCreateGroups(
      {
        [participantType.name]: halfMeeting,
        [facilitatorType.name]: halfMeeting,
      },
      availabilityOverride,
    );

    tryCreateGroups(
      {
        [participantType.name]: 1,
        [facilitatorType.name]: halfMeeting,
      },
      availabilityOverride,
    );
  }

  // Combine all cohorts
  const allCohorts = [...phase1Cohorts, ...newCohorts];

  // ── Phase 4: Optimally fill remaining people using second LP ──
  // Recompute unassigned after Phase 3 created new empty cohorts
  const phase4AssignedIds = new Set<string>(assignedIds);
  const unassignedPeople: { person: Person; personType: PersonType }[] = [];
  for (const pt of personTypes) {
    for (const p of pt.people) {
      if (!phase4AssignedIds.has(p.id)) {
        unassignedPeople.push({ person: p, personType: pt });
      }
    }
  }

  if (unassignedPeople.length === 0) {
    return allCohorts;
  }

  // Pre-compute expanded availability for all unassigned people
  const expandedAvByPerson = new Map<string, [number, number][]>();
  for (const { person } of unassignedPeople) {
    const expanded = expandAvailability(person.timeAvMins);
    expandedAvByPerson.set(person.id, toTimeAvUnits(expanded));
  }

  // Build Phase 4 LP
  const phase4Binaries: string[] = [];
  const phase4ObjVars: { name: string; coef: number }[] = [];

  // Track which cohorts are new (from Phase 3) — they need min constraints
  const phase1CohortCount = phase1Cohorts.length;

  for (const { person, personType } of unassignedPeople) {
    for (let ci = 0; ci < allCohorts.length; ci++) {
      const cohort = allCohorts[ci]!;
      const currentCount = (cohort.people[personType.name] ?? []).length;
      if (currentCount >= personType.max) continue;

      const varName = `assign-${person.id}-${ci}`;
      phase4Binaries.push(varName);

      // Compute fit score
      const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
      const overlapOriginal = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);
      const expandedUnits = expandedAvByPerson.get(person.id) ?? person.timeAvUnits;
      const overlapExpanded = getOverlapUnits(expandedUnits, timeUnit, lengthOfMeetingInUnits);

      let coef = 0;
      if (overlapOriginal >= lengthOfMeetingInUnits) {
        coef = 10000; // W1: full overlap
      } else if (overlapOriginal >= 1) {
        coef = 1000; // W2: partial overlap with original
      } else if (overlapExpanded >= 1) {
        coef = 100; // W3: overlap with expanded availability
      } else if (person.tier === 3) {
        coef = 1; // W4: tier 3, group time in reasonable hours
      }
      // else coef stays 0

      phase4ObjVars.push({ name: varName, coef });
    }
  }

  if (phase4Binaries.length === 0) {
    return allCohorts;
  }

  // Use a fast lookup set for binary existence
  const phase4BinarySet = new Set(phase4Binaries);

  // Constraints
  const phase4Constraints: LP["subjectTo"] = [];

  // Each person assigned to at most 1 group
  for (const { person } of unassignedPeople) {
    const personVars: { name: string; coef: number }[] = [];
    for (let ci = 0; ci < allCohorts.length; ci++) {
      const varName = `assign-${person.id}-${ci}`;
      if (phase4BinarySet.has(varName)) {
        personVars.push({ name: varName, coef: 1 });
      }
    }
    if (personVars.length > 0) {
      phase4Constraints.push({
        name: `person-${person.id}-max1`,
        vars: personVars,
        bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
      });
    }
  }

  // Each group respects max per type
  for (let ci = 0; ci < allCohorts.length; ci++) {
    const cohort = allCohorts[ci]!;
    for (const pt of personTypes) {
      const currentCount = (cohort.people[pt.name] ?? []).length;
      const room = pt.max - currentCount;
      if (room <= 0) continue;

      const cohortTypeVars: { name: string; coef: number }[] = [];
      for (const { person, personType } of unassignedPeople) {
        if (personType.name !== pt.name) continue;
        const varName = `assign-${person.id}-${ci}`;
        if (phase4BinarySet.has(varName)) {
          cohortTypeVars.push({ name: varName, coef: 1 });
        }
      }

      if (cohortTypeVars.length > 0) {
        phase4Constraints.push({
          name: `cohort-${ci}-${pt.name}-max`,
          vars: cohortTypeVars,
          bnds: { type: glpk.GLP_UP, ub: room, lb: 0 },
        });
      }
    }
  }

  // New groups (from Phase 3) must meet min per type
  for (let ci = phase1CohortCount; ci < allCohorts.length; ci++) {
    for (const pt of personTypes) {
      const cohortTypeVars: { name: string; coef: number }[] = [];
      for (const { person, personType } of unassignedPeople) {
        if (personType.name !== pt.name) continue;
        const varName = `assign-${person.id}-${ci}`;
        if (phase4BinarySet.has(varName)) {
          cohortTypeVars.push({ name: varName, coef: 1 });
        }
      }

      if (cohortTypeVars.length > 0) {
        phase4Constraints.push({
          name: `cohort-${ci}-${pt.name}-min`,
          vars: cohortTypeVars,
          bnds: { type: glpk.GLP_LO, ub: pt.max, lb: pt.min },
        });
      }
    }
  }

  const personCount = personTypes.map(p => p.people.length).reduce((acc, cur) => acc + cur, 0);
  const timeLimitSeconds = Math.min(Math.max(personCount * 0.5, 5), 30);

  const phase4Options: Options = {
    msglev: glpk.GLP_MSG_ALL,
    presol: true,
    tmlim: timeLimitSeconds,
    cb: {
      call: (progress) => {
        console.log("phase4 progress", progress);
      },
      each: 1,
    },
  };

  try {
    const res = await glpk.solve(
      {
        name: "phase4",
        objective: {
          direction: glpk.GLP_MAX,
          name: "phase4-obj",
          vars: phase4ObjVars,
        },
        subjectTo: phase4Constraints,
        binaries: phase4Binaries,
      },
      phase4Options,
    );

    // Process Phase 4 results: add assigned people to cohorts
    for (const varName of Object.keys(res.result.vars)) {
      if (res.result.vars[varName] !== 1) continue;

      const match = varName.match(/^assign-(.+)-(\d+)$/);
      if (!match) continue;

      const personId = match[1]!;
      const cohortIndex = parseInt(match[2]!);
      const person = personById[personId];
      const pt = personTypeByPersonId[personId];
      if (!person || !pt || !allCohorts[cohortIndex]) continue;

      const cohort = allCohorts[cohortIndex]!;
      if (!cohort.people[pt.name]) cohort.people[pt.name] = [];
      cohort.people[pt.name]!.push(personId);

      // Compute tier
      if (!cohort.personTiers) cohort.personTiers = {};
      const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
      const overlapOriginal = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);

      if (overlapOriginal >= lengthOfMeetingInUnits) {
        cohort.personTiers[personId] = 1;
      } else if (overlapOriginal >= 1) {
        cohort.personTiers[personId] = 2;
      } else {
        cohort.personTiers[personId] = 3;
      }
    }
  } catch (e) {
    console.log("Phase 4 LP failed:", e);
    // Return what we have from Phase 1 + empty Phase 3 cohorts
  }

  return allCohorts;
}
