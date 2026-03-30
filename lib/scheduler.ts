import GLPK, { LP, Options } from "glpk.js";
import { Interval, WeeklyTime } from "weekly-availabilities";
import { MINUTES_IN_UNIT } from "./constants";
import { getOverlapUnits, expandAvailability, toTimeAvUnits, generateDefaultAvailability } from "./util";

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
  rank?: number | undefined,
}

export interface Cohort {
  startTime: WeeklyTime,
  endTime: WeeklyTime,
  /** Map from person type name -> person id */
  people: { [personType: string]: string[] },
  personTiers?: Record<string, 1 | 2 | 3>,
  majorityRank?: number | undefined,
}

const getCohortCount = (t: number): string => `cc_${t}`;

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

  // Build person index for fast variable naming (avoids JSON.stringify)
  const personIndex: { personType: PersonType; person: Person; idx: number }[] = [];
  for (const personType of personTypes) {
    for (const person of personType.people) {
      personIndex.push({ personType, person, idx: personIndex.length });
    }
  }

  // Pre-compute available time slots per person (only where full overlap exists)
  // This eliminates ~90% of variables that would be forced to 0 by availability constraints
  const availableTimesPerPerson: Set<number>[] = personIndex.map(({ person }) => {
    const available = new Set<number>();
    for (const [b, e] of person.timeAvUnits) {
      for (let t = b; t <= e - lengthOfMeetingInUnits; t++) {
        available.add(t);
      }
    }
    return available;
  });

  // Collect all time slots where at least one person is available
  const activeTimeSlots = new Set<number>();
  for (const times of availableTimesPerPerson) {
    for (const t of times) activeTimeSlots.add(t);
  }

  // Variable naming: v_{personIdx}_{t} — simple string concatenation, no JSON
  const varName = (pIdx: number, t: number): string => `v_${pIdx}_${t}`;

  // VARIABLES — only create for (person, time) pairs where the person is available
  const binaries: string[] = [];
  const binarySet = new Set<string>();
  for (const { idx } of personIndex) {
    for (const t of availableTimesPerPerson[idx]!) {
      const v = varName(idx, t);
      binaries.push(v);
      binarySet.add(v);
    }
  }

  const cohortCounts: string[] = [];
  for (const t of activeTimeSlots) {
    cohortCounts.push(getCohortCount(t));
  }

  // CONSTRAINTS
  const assignmentConstraints: LP["subjectTo"] = [];
  const nonOverlappingConstraints: LP["subjectTo"] = [];

  for (const { person, idx } of personIndex) {
    const availableTimes = availableTimesPerPerson[idx]!;
    if (availableTimes.size === 0) continue;

    // Assignment constraint: sum of all this person's variables <= howManyCohorts
    const personVars: { name: string; coef: number }[] = [];
    for (const t of availableTimes) {
      personVars.push({ name: varName(idx, t), coef: 1 });
    }
    assignmentConstraints.push({
      name: `a_${idx}`,
      vars: personVars,
      bnds: { type: glpk.GLP_UP, ub: person.howManyCohorts, lb: 0 },
    });

    // Non-overlapping constraints: for each available time, the meeting window can only be used once
    for (const t of availableTimes) {
      const meetingVars: { name: string; coef: number }[] = [];
      for (let i = 0; i < lengthOfMeetingInUnits; i++) {
        const v = varName(idx, t + i);
        if (binarySet.has(v)) {
          meetingVars.push({ name: v, coef: 1 });
        }
      }
      if (meetingVars.length > 1) {
        nonOverlappingConstraints.push({
          name: `no_${idx}_${t}`,
          vars: meetingVars,
          bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
        });
      }
    }
  }

  // Cohort count constraints: link person assignments to cohortCount variables
  const cohortCountConstraints: LP["subjectTo"] = [];
  for (const t of activeTimeSlots) {
    for (let ptIdx = 0; ptIdx < personTypes.length; ptIdx++) {
      const pt = personTypes[ptIdx]!;
      const personVars: { name: string; coef: number }[] = [];
      for (const { idx, personType } of personIndex) {
        if (personType !== pt) continue;
        if (availableTimesPerPerson[idx]!.has(t)) {
          personVars.push({ name: varName(idx, t), coef: 1 });
        }
      }

      cohortCountConstraints.push({
        name: `cx_${ptIdx}_${t}`,
        vars: [
          ...personVars,
          { name: getCohortCount(t), coef: -pt.max },
        ],
        bnds: { type: glpk.GLP_UP, ub: 0, lb: 0 },
      });
      cohortCountConstraints.push({
        name: `cn_${ptIdx}_${t}`,
        vars: [
          ...personVars,
          { name: getCohortCount(t), coef: -pt.min },
        ],
        bnds: { type: glpk.GLP_LO, ub: 0, lb: 0 },
      });
    }
  }

  const constraints = [
    ...assignmentConstraints,
    ...nonOverlappingConstraints,
    ...cohortCountConstraints,
  ];

  try {
    const res = await glpk.solve(
      {
        name: "phase1",
        objective: {
          direction: glpk.GLP_MAX,
          name: "obj",
          vars: binaries.map((u) => ({ name: u, coef: 1 })),
        },
        subjectTo: constraints,
        generals: cohortCounts,
        binaries: binaries,
      },
      options
    );

    // Parse results using variable name format v_{personIdx}_{t}
    const timeslots: Record<string, Record<string, string[]>> = {};
    for (const v of Object.keys(res.result.vars)) {
      if (v.startsWith("cc_")) continue;
      if (res.result.vars[v] !== 1) continue;

      const parts = v.split("_");
      const pIdx = parseInt(parts[1]!);
      const t = parts[2]!;
      const { personType, person } = personIndex[pIdx]!;

      if (!timeslots[t]) timeslots[t] = {};
      if (!timeslots[t]![personType.name]) timeslots[t]![personType.name] = [];
      timeslots[t]![personType.name]!.push(person.id);
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

/** Find the best time slot where the most unassigned people can meet, subject to per-type minimums.
 *  When preferredRank is provided and two slots tie on totalEligible, prefer the one with more
 *  eligible people whose rank matches preferredRank. */
function findBestTimeSlot(
  unassignedByType: Record<string, Person[]>,
  overlapThresholdByType: Record<string, number>,
  meetingLengthUnits: number,
  allTimeSlots: number[],
  personTypes: PersonType[],
  preferredRank?: number,
): number | null {
  let bestTime: number | null = null;
  let bestTotal = 0;
  let bestSameRank = 0;

  for (const t of allTimeSlots) {
    let totalEligible = 0;
    let sameRankCount = 0;
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

      if (preferredRank !== undefined) {
        for (const p of eligible) {
          if (p.rank === preferredRank) {
            sameRankCount++;
          }
        }
      }
    }

    if (!allMinsMet) continue;

    if (
      totalEligible > bestTotal ||
      (totalEligible === bestTotal && sameRankCount > bestSameRank)
    ) {
      bestTotal = totalEligible;
      bestSameRank = sameRankCount;
      bestTime = t;
    }
  }

  return bestTime;
}

/** Minimum number of participants to justify creating a new group.
 *  If fewer people need spots, they'll be overfilled into existing groups instead. */
const MIN_FILL_THRESHOLD = 5;

/** Determine how many new groups need to be created.
 *  Returns 0 if existing capacity is sufficient (including overfill tolerance),
 *  no facilitators are available, or there aren't enough unassigned people. */
function computeNewGroupsNeeded(
  unassignedCount: number,
  allCohorts: Cohort[],
  participantType: PersonType,
  facilitatorType: PersonType,
  unassignedFacilitators: Person[],
  personById: Record<string, Person>,
  isNeutralOrLater: boolean,
): number {
  // Compute remaining capacity in existing cohorts (at max, before overfill)
  let remainingCapacity = 0;
  for (const cohort of allCohorts) {
    // In neutral+ cycles, skip cohorts that have strong-yes members — neutrals can't use them
    if (isNeutralOrLater) {
      const hasStrongYes = Object.values(cohort.people).flat().some(pid => {
        const p = personById[pid];
        return p && p.rank === 0;
      });
      if (hasStrongYes) continue;
    }
    const currentCount = (cohort.people[participantType.name] ?? []).length;
    remainingCapacity += participantType.max - currentCount;
  }

  // Include overfill tolerance: up to half the existing groups can take +1
  const numExistingGroups = allCohorts.length;
  const overfillSlots = Math.floor(numExistingGroups / 2);
  const totalCapacity = remainingCapacity + overfillSlots;

  const deficit = unassignedCount - totalCapacity;
  if (deficit <= 0) return 0;
  if (deficit < MIN_FILL_THRESHOLD) return 0;
  if (unassignedFacilitators.length < facilitatorType.min) return 0;

  // Only create groups we can fill to at least MIN_FILL_THRESHOLD
  const numFullGroups = Math.floor(deficit / participantType.max);
  const remainder = deficit - (numFullGroups * participantType.max);
  const extraGroup = remainder >= MIN_FILL_THRESHOLD ? 1 : 0;
  const maxByParticipants = numFullGroups + extraGroup;

  const maxByFacilitators = Math.floor(unassignedFacilitators.length / facilitatorType.min);
  return Math.min(maxByParticipants, maxByFacilitators);
}

/** Compute the majority rank of a cohort's participants. */
function computeMajorityRank(
  cohort: Cohort,
  personById: Record<string, Person>,
  participantTypeName: string,
): number | undefined {
  const participants = cohort.people[participantTypeName] ?? [];
  if (participants.length === 0) return undefined;
  const rankCounts: Record<number, number> = {};
  for (const pid of participants) {
    const rank = personById[pid]?.rank;
    if (rank !== undefined) {
      rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
    }
  }
  let bestRank: number | undefined;
  let bestCount = 0;
  for (const [rank, count] of Object.entries(rankCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestRank = parseInt(rank);
    }
  }
  return bestRank;
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

  // Exclude people with no availability and no timezone — they can't be meaningfully scheduled.
  // They remain in the caller's personTypes for the "Unused people" UI display.
  personTypes = personTypes.map(pt => ({
    ...pt,
    people: pt.people.filter(p => p.timeAvUnits.length > 0 || p.timezone),
  }));

  // Build lookups
  const personById: Record<string, Person> = {};
  const personTypeByPersonId: Record<string, PersonType> = {};
  for (const pt of personTypes) {
    for (const p of pt.people) {
      personById[p.id] = p;
      personTypeByPersonId[p.id] = pt;
    }
  }

  const participantType = personTypes.find(pt => pt.name !== 'Facilitator');
  const facilitatorType = personTypes.find(pt => pt.name === 'Facilitator');

  if (!participantType || !facilitatorType) {
    // Without both types, fall back to a single Phase 1 run
    const phase1Cohorts = await solvePhase1({ lengthOfMeetingMins, personTypes }, glpk);
    return phase1Cohorts;
  }

  // ── Determine rank levels ──
  const rankSet = new Set<number>();
  for (const p of participantType.people) {
    if (p.rank !== undefined) {
      rankSet.add(p.rank);
    }
  }
  const sortedRanks: number[] = Array.from(rankSet).sort((a, b) => a - b);

  // Neutral rank is hardcoded to match the rank mapping in algorithm.tsx:
  // "Strong yes" = 0, "Weak yes" = 1, "Neutral" = 2
  // This ensures isolation rules only apply when someone actually has the "Neutral" label,
  // not just because they have the highest rank present in the data.
  const neutralRank = 2;

  // Compute maxT across all people for time slots (used in Phase 3)
  let maxT = 0;
  for (const pt of personTypes)
    for (const p of pt.people)
      for (const interval of p.timeAvUnits)
        for (const t of interval) if (t > maxT) maxT = t;
  const allTimeSlots = Array.from({ length: maxT }, (_, i) => i);

  const allCohorts: Cohort[] = [];
  const assignedIds = new Set<string>();

  // Track which facilitators are assigned
  const assignedFacIds = new Set<string>();

  // Track Phase 3 cohorts created during neutral+ cycles (rank 0 should not be assigned to these)
  const neutralCyclePhase3Indices = new Set<number>();

  for (let i = 0; i < sortedRanks.length; i++) {
    const rankLevel = sortedRanks[i]!;
    const isLastCycle = i === sortedRanks.length - 1;

    // ── Build participant pool: this rank's people + carry-forwards ──
    // Neutral isolation: don't carry rank 0 (strong yes) people into neutral+ cycles.
    // They'll be handled by Phase 4a instead, which respects neutral isolation.
    const isNeutralOrLater = neutralRank !== undefined && rankLevel >= neutralRank;
    const participantPool = participantType.people.filter(p => {
      if (assignedIds.has(p.id)) return false;
      if (p.rank === rankLevel) return true;
      // Carry-forwards: unassigned people from previous ranks
      if (p.rank !== undefined && p.rank < rankLevel) {
        // Don't carry rank 0 into neutral+ cycles
        if (isNeutralOrLater && p.rank === 0) return false;
        return true;
      }
      return false;
    });

    if (participantPool.length === 0) continue;

    // ── Facilitator cascading ──
    const facilitatorGroups: Person[][] = getFacilitatorGroupsForCycle(
      rankLevel,
      isLastCycle,
      sortedRanks,
      facilitatorType.people,
      assignedFacIds,
    );

    for (const facilitatorGroup of facilitatorGroups) {
      // Check if there are unassigned participants left in the pool
      const unassignedPool = participantPool.filter(p => !assignedIds.has(p.id));
      if (unassignedPool.length === 0) break;

      // Filter facilitator group to only unassigned facilitators
      const availableFacs = facilitatorGroup.filter(f => !assignedFacIds.has(f.id));
      if (availableFacs.length < facilitatorType.min) continue;

      // ── Phase 1: Run LP with this pool + facilitator group ──
      const phase1Input: SchedulerInput = {
        lengthOfMeetingMins,
        personTypes: [
          { ...participantType, people: unassignedPool },
          { ...facilitatorType, people: availableFacs },
        ],
      };
      const cohorts = await solvePhase1(phase1Input, glpk);
      if (cohorts === null || cohorts.length === 0) continue;

      // Process results
      for (const cohort of cohorts) {
        cohort.personTiers = {};
        for (const ptName of Object.keys(cohort.people)) {
          for (const personId of cohort.people[ptName]!) {
            cohort.personTiers[personId] = 1;
            assignedIds.add(personId);
            if (ptName === facilitatorType.name) {
              assignedFacIds.add(personId);
            }
          }
        }

        // Compute majorityRank
        cohort.majorityRank = computeMajorityRank(cohort, personById, participantType.name);

        allCohorts.push(cohort);


      }
    }

    // ── Phase 2 + 3: Check capacity and create additional groups if needed ──
    const unassignedInPool = participantPool.filter(p => !assignedIds.has(p.id));
    const unassignedFacs = facilitatorType.people.filter(f => !assignedFacIds.has(f.id));
    const newGroupsNeeded = computeNewGroupsNeeded(
      unassignedInPool.length,
      allCohorts,
      participantType,
      facilitatorType,
      unassignedFacs,
      personById,
      isNeutralOrLater,
    );

    if (newGroupsNeeded > 0) {
      const newCohorts: Cohort[] = [];
      const phase3AssignedFacIds = new Set<string>();

      const halfMeeting = Math.ceil(lengthOfMeetingInUnits * 0.5);

      // Helper to get currently unassigned people for Phase 3
      const getUnassignedByType = (): Record<string, Person[]> => ({
        [participantType.name]: unassignedInPool.filter(p => !assignedIds.has(p.id)),
        [facilitatorType.name]: facilitatorType.people.filter(
          f => !assignedFacIds.has(f.id) && !phase3AssignedFacIds.has(f.id)
        ),
      });

      // Check if all eligible participants at a time slot are grey (no overlap)
      const allEligibleAreGrey = (
        unassignedByType: Record<string, Person[]>,
        time: number,
        overlapThresholdByType: Record<string, number>,
      ): boolean => {
        const participants = unassignedByType[participantType.name] ?? [];
        const threshold = overlapThresholdByType[participantType.name] ?? 1;
        const eligible = participants.filter(p => {
          const overlap = getOverlapUnits(p.timeAvUnits, time, lengthOfMeetingInUnits);
          return overlap >= threshold;
        });
        if (eligible.length === 0) return true;
        // Check if every eligible participant has no original overlap at all
        return eligible.every(p => {
          const origOverlap = getOverlapUnits(p.timeAvUnits, time, lengthOfMeetingInUnits);
          return origOverlap < 1;
        });
      };

      // Helper to attempt creating groups with given thresholds
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

          if ((unassignedByType[participantType.name] ?? []).length < participantType.min) {
            break;
          }

          // Find best time slot, skipping grey-only slots
          let bestTime: number | null = null;
          const triedTimes = new Set<number>();
          for (;;) {
            const candidateTime = findBestTimeSlot(
              unassignedByType,
              overlapThresholdByType,
              lengthOfMeetingInUnits,
              allTimeSlots.filter(t => !triedTimes.has(t)),
              [
                { ...participantType, people: unassignedByType[participantType.name] ?? [] },
                { ...facilitatorType, people: unassignedByType[facilitatorType.name] ?? [] },
              ],
              rankLevel,
            );
            if (candidateTime === null) break;
            triedTimes.add(candidateTime);

            // Check grey-only prevention
            if (!allEligibleAreGrey(unassignedByType, candidateTime, overlapThresholdByType)) {
              bestTime = candidateTime;
              break;
            }
            // Otherwise try next best time
          }

          if (bestTime === null) break;

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

          // Assign facilitators directly to the new cohort
          const availFacs = unassignedByType[facilitatorType.name] ?? [];
          const eligibleFacs = availFacs.filter(f => {
            const overlap = getOverlapUnits(f.timeAvUnits, bestTime!, lengthOfMeetingInUnits);
            return overlap >= overlapThresholdByType[facilitatorType.name]!;
          });
          const newCohort = newCohorts[newCohorts.length - 1]!;
          for (let j = 0; j < Math.min(facilitatorType.min, eligibleFacs.length); j++) {
            const fac = eligibleFacs[j]!;
            newCohort.people[facilitatorType.name]!.push(fac.id);
            newCohort.personTiers![fac.id] = 1;
            phase3AssignedFacIds.add(fac.id);
            assignedFacIds.add(fac.id);
          }

          // Assign participants greedily to the new cohort (best overlap first)
          const availParticipants = unassignedByType[participantType.name] ?? [];
          const scoredParticipants = availParticipants
            .map(p => {
              const overlap = getOverlapUnits(p.timeAvUnits, bestTime!, lengthOfMeetingInUnits);
              return { person: p, overlap };
            })
            .filter(({ overlap }) => overlap >= overlapThresholdByType[participantType.name]!)
            .sort((a, b) => b.overlap - a.overlap);

          for (let j = 0; j < Math.min(participantType.max, scoredParticipants.length); j++) {
            const { person, overlap } = scoredParticipants[j]!;
            newCohort.people[participantType.name]!.push(person.id);
            if (overlap >= lengthOfMeetingInUnits) {
              newCohort.personTiers![person.id] = 1;
            } else if (overlap >= 1) {
              newCohort.personTiers![person.id] = 2;
            } else {
              newCohort.personTiers![person.id] = 3;
            }
            assignedIds.add(person.id);
          }

          // Compute majorityRank now that participants are assigned
          newCohort.majorityRank = computeMajorityRank(newCohort, personById, participantType.name);
        }
      };

      if (isLastCycle) {
        // Full cascade: >=50% -> >=1 unit -> expanded 50% -> expanded 1 unit
        tryCreateGroups({
          [participantType.name]: halfMeeting,
          [facilitatorType.name]: halfMeeting,
        });

        tryCreateGroups({
          [participantType.name]: 1,
          [facilitatorType.name]: halfMeeting,
        });

        // Expanded availability
        const expandedParticipantAvailability = new Map<string, [number, number][]>();
        for (const p of unassignedInPool) {
          if (!assignedIds.has(p.id)) {
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
      } else {
        // Non-last cycle: >=50% overlap first, then >=1 unit if more groups still needed
        tryCreateGroups({
          [participantType.name]: halfMeeting,
          [facilitatorType.name]: halfMeeting,
        });

        tryCreateGroups({
          [participantType.name]: 1,
          [facilitatorType.name]: halfMeeting,
        });
      }

      // Add new cohorts to allCohorts
      for (const cohort of newCohorts) {
        // Track neutral-cycle Phase 3 groups so Phase 4a won't assign rank 0 to them
        if (isNeutralOrLater) {
          neutralCyclePhase3Indices.add(allCohorts.length);
        }
        allCohorts.push(cohort);
      }
    }

    // Carry forward: unassigned people remain in the pool for next cycle automatically
    // (they are not in assignedIds so will be picked up)
  }

  // ── Phase 4: Two-pass assignment LP with rank-distance scoring ──

  // Rank-distance weight tables
  const fullOverlapWeights = [20000, 15000, 10000];
  const halfOverlapWeights = [12000, 9000, 6000];
  const partialOverlapWeights = [8000, 5000, 3000];
  const expandedOverlapWeights = [800, 500, 100];

  const getRankWeight = (weights: number[], rankDistance: number) =>
    weights[Math.min(rankDistance, weights.length - 1)]!;

  const MAX_GREY_PER_COHORT = 3;

  /** Run a single Phase 4 LP pass for a subset of unassigned people.
   *  `blockedCohortIndices` prevents assignment to specific cohorts (coef = 0).
   *  `isPersonBlockedFromCohort` optionally provides per-person blocking (e.g., rank 0 blocked from neutral cohorts). */
  async function runPhase4Pass(
    passName: string,
    people: { person: Person; personType: PersonType }[],
    blockedCohortIndices: Set<number>,
    enforceNewGroupMins: boolean,
    isPersonBlockedFromCohort?: (person: Person, cohortIndex: number) => boolean,
  ): Promise<void> {
    if (people.length === 0) return;

    // Pre-compute expanded availability
    const expandedAvByPerson = new Map<string, [number, number][]>();
    for (const { person } of people) {
      const expanded = expandAvailability(person.timeAvMins);
      expandedAvByPerson.set(person.id, toTimeAvUnits(expanded));
    }

    // Pre-compute timezone-based 9am-9pm availability (fallback for people with no overlap)
    const timezoneAvByPerson = new Map<string, [number, number][]>();
    for (const { person } of people) {
      if (person.timezone) {
        try {
          const tzAv = generateDefaultAvailability(person.timezone);
          timezoneAvByPerson.set(person.id, toTimeAvUnits(tzAv));
        } catch {
          // Invalid timezone, skip
        }
      }
    }

    const binaries: string[] = [];
    const objVars: { name: string; coef: number }[] = [];

    for (const { person, personType } of people) {
      for (let ci = 0; ci < allCohorts.length; ci++) {
        const cohort = allCohorts[ci]!;
        const currentCount = (cohort.people[personType.name] ?? []).length;
        if (currentCount >= personType.max) continue;

        const varName = `${passName}-${person.id}-${ci}`;

        // Blocked cohort → skip variable entirely (don't create it)
        // Using coef=0 is insufficient because the LP solver can still set
        // a zero-coefficient variable to 1 when it's indifferent.
        if (blockedCohortIndices.has(ci) || isPersonBlockedFromCohort?.(person, ci)) {
          continue;
        }

        binaries.push(varName);

        // Compute fit score with rank-distance awareness
        const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
        const overlapOriginal = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);
        const expandedUnits = expandedAvByPerson.get(person.id) ?? person.timeAvUnits;
        const overlapExpanded = getOverlapUnits(expandedUnits, timeUnit, lengthOfMeetingInUnits);

        const majorityRank = cohort.majorityRank ?? 0;
        const personRank = person.rank ?? 999;
        const rankDistance = Math.abs(personRank - majorityRank);

        const halfMeetingLength = Math.ceil(lengthOfMeetingInUnits * 0.5);

        let coef = 0;
        if (overlapOriginal >= lengthOfMeetingInUnits) {
          coef = getRankWeight(fullOverlapWeights, rankDistance);
        } else if (overlapOriginal >= halfMeetingLength) {
          coef = getRankWeight(halfOverlapWeights, rankDistance);
        } else if (overlapOriginal >= 1) {
          coef = getRankWeight(partialOverlapWeights, rankDistance);
        } else if (overlapExpanded >= 1) {
          coef = getRankWeight(expandedOverlapWeights, rankDistance);
        } else {
          // No real or expanded overlap — fall back to timezone-based 9am-9pm availability
          const tzUnits = timezoneAvByPerson.get(person.id);
          if (tzUnits) {
            const overlapTz = getOverlapUnits(tzUnits, timeUnit, lengthOfMeetingInUnits);
            if (overlapTz >= 1) {
              coef = 1;
            }
          }
        }

        objVars.push({ name: varName, coef });
      }
    }

    if (binaries.length === 0) return;

    const binarySet = new Set(binaries);
    const constraints: LP["subjectTo"] = [];

    // Each person assigned to at most 1 group
    for (const { person } of people) {
      const personVars: { name: string; coef: number }[] = [];
      for (let ci = 0; ci < allCohorts.length; ci++) {
        const varName = `${passName}-${person.id}-${ci}`;
        if (binarySet.has(varName)) {
          personVars.push({ name: varName, coef: 1 });
        }
      }
      if (personVars.length > 0) {
        constraints.push({
          name: `${passName}-person-${person.id}-max1`,
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
        for (const { person, personType } of people) {
          if (personType.name !== pt.name) continue;
          const varName = `${passName}-${person.id}-${ci}`;
          if (binarySet.has(varName)) {
            cohortTypeVars.push({ name: varName, coef: 1 });
          }
        }

        if (cohortTypeVars.length > 0) {
          constraints.push({
            name: `${passName}-cohort-${ci}-${pt.name}-max`,
            vars: cohortTypeVars,
            bnds: { type: glpk.GLP_UP, ub: room, lb: 0 },
          });
        }
      }
    }

    // New groups (from Phase 3) must meet min per type — only if enough people available
    if (enforceNewGroupMins) {
      for (let ci = 0; ci < allCohorts.length; ci++) {
        const cohort = allCohorts[ci]!;
        const totalPeople = Object.values(cohort.people).reduce((sum, arr) => sum + arr.length, 0);
        if (totalPeople > 0) continue;

        // Check if there are enough people with positive scores to meet min for all types
        let canMeetAllMins = true;
        for (const pt of personTypes) {
          const eligibleCount = people.filter(({ person, personType }) => {
            if (personType.name !== pt.name) return false;
            const varName = `${passName}-${person.id}-${ci}`;
            if (!binarySet.has(varName)) return false;
            // Check if the person has a positive score for this cohort
            const obj = objVars.find(v => v.name === varName);
            return obj && obj.coef > 0;
          }).length;
          if (eligibleCount < pt.min) {
            canMeetAllMins = false;
            break;
          }
        }

        if (!canMeetAllMins) continue; // Skip min constraints — let LP fill what it can

        for (const pt of personTypes) {
          const cohortTypeVars: { name: string; coef: number }[] = [];
          for (const { person, personType } of people) {
            if (personType.name !== pt.name) continue;
            const varName = `${passName}-${person.id}-${ci}`;
            if (binarySet.has(varName)) {
              cohortTypeVars.push({ name: varName, coef: 1 });
            }
          }

          if (cohortTypeVars.length > 0) {
            constraints.push({
              name: `${passName}-cohort-${ci}-${pt.name}-min`,
              vars: cohortTypeVars,
              bnds: { type: glpk.GLP_LO, ub: pt.max, lb: pt.min },
            });
          }
        }
      }
    }

    // Grey cap: max grey per cohort
    for (let ci = 0; ci < allCohorts.length; ci++) {
      const greyVars: { name: string; coef: number }[] = [];
      for (const { person, personType } of people) {
        if (personType.name === facilitatorType!.name) continue;
        const timeUnit = allCohorts[ci]!.startTime / MINUTES_IN_UNIT;
        const overlapOrig = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);
        const expandedUnits = expandedAvByPerson.get(person.id) ?? person.timeAvUnits;
        const overlapExp = getOverlapUnits(expandedUnits, timeUnit, lengthOfMeetingInUnits);
        if (overlapOrig >= 1 || overlapExp >= 1) continue;

        const varName = `${passName}-${person.id}-${ci}`;
        if (binarySet.has(varName)) {
          greyVars.push({ name: varName, coef: 1 });
        }
      }
      if (greyVars.length > 0) {
        // Account for existing grey members already in the cohort
        const existingGrey = countExistingGrey(allCohorts[ci]!, personById, participantType!.name, lengthOfMeetingInUnits);
        const remainingGreyRoom = Math.max(0, MAX_GREY_PER_COHORT - existingGrey);
        constraints.push({
          name: `${passName}-cohort-${ci}-grey-cap`,
          vars: greyVars,
          bnds: { type: glpk.GLP_UP, ub: remainingGreyRoom, lb: 0 },
        });
      }
    }

    const pCount = personTypes.map(p => p.people.length).reduce((acc, cur) => acc + cur, 0);
    const tmlim = Math.min(Math.max(pCount * 0.5, 5), 30);

    try {
      const res = await glpk.solve(
        {
          name: passName,
          objective: {
            direction: glpk.GLP_MAX,
            name: `${passName}-obj`,
            vars: objVars,
          },
          subjectTo: constraints,
          binaries,
        },
        {
          msglev: glpk.GLP_MSG_ALL,
          presol: true,
          tmlim,
          cb: { call: (progress) => console.log(`${passName} progress`, progress), each: 1 },
        },
      );

      // Process results: add assigned people to cohorts
      const varPrefix = `${passName}-`;
      for (const varName of Object.keys(res.result.vars)) {
        if (res.result.vars[varName] !== 1) continue;
        if (!varName.startsWith(varPrefix)) continue;

        const match = varName.slice(varPrefix.length).match(/^(.+)-(\d+)$/);
        if (!match) continue;

        const personId = match[1]!;
        const cohortIndex = parseInt(match[2]!);
        const person = personById[personId];
        const pt = personTypeByPersonId[personId];
        if (!person || !pt || !allCohorts[cohortIndex]) continue;

        const cohort = allCohorts[cohortIndex]!;
        if (!cohort.people[pt.name]) cohort.people[pt.name] = [];
        cohort.people[pt.name]!.push(personId);
        assignedIds.add(personId);

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
      console.log(`${passName} LP failed:`, e);
    }
  }

  // Helper to count existing grey members in a cohort
  function countExistingGrey(
    cohort: Cohort,
    pById: Record<string, Person>,
    ptName: string,
    meetingLengthUnits: number,
  ): number {
    let count = 0;
    for (const pid of (cohort.people[ptName] ?? [])) {
      const p = pById[pid];
      if (!p) continue;
      const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
      const overlap = getOverlapUnits(p.timeAvUnits, timeUnit, meetingLengthUnits);
      const expanded = expandAvailability(p.timeAvMins);
      const expandedUnits = toTimeAvUnits(expanded);
      const overlapExp = getOverlapUnits(expandedUnits, timeUnit, meetingLengthUnits);
      if (overlap < 1 && overlapExp < 1) count++;
    }
    return count;
  }

  // Collect all unassigned people
  const allUnassigned: { person: Person; personType: PersonType }[] = [];
  for (const pt of personTypes) {
    for (const p of pt.people) {
      if (!assignedIds.has(p.id)) {
        allUnassigned.push({ person: p, personType: pt });
      }
    }
  }

  if (allUnassigned.length > 0) {
    // Phase 4a: Assign non-neutral people (neutralRank computed earlier from ALL people)
    // Rank 0 people are blocked from cohorts that contain any neutral members (bidirectional isolation)
    const cohortsWithNeutrals = new Set<number>();
    if (neutralRank !== undefined) {
      for (let ci = 0; ci < allCohorts.length; ci++) {
        const hasNeutral = Object.values(allCohorts[ci]!.people).flat().some(pid => {
          const p = personById[pid];
          return p && p.rank === neutralRank;
        });
        if (hasNeutral) cohortsWithNeutrals.add(ci);
      }
    }
    const nonNeutralPeople = allUnassigned.filter(({ person }) => person.rank !== neutralRank);
    await runPhase4Pass("phase4a", nonNeutralPeople, new Set(), true,
      (person, ci) => person.rank === 0 && (
        cohortsWithNeutrals.has(ci) || neutralCyclePhase3Indices.has(ci)
      ),
    );

    // Recompute majority ranks after Phase 4a
    for (const cohort of allCohorts) {
      cohort.majorityRank = computeMajorityRank(cohort, personById, participantType.name);
    }



    // Phase 4b: Assign neutral people, blocking cohorts that have any strong yes (rank 0) members
    const neutralPeople = allUnassigned.filter(({ person }) => person.rank === neutralRank && !assignedIds.has(person.id));
    const blockedCohorts = new Set<number>();
    for (let ci = 0; ci < allCohorts.length; ci++) {
      const cohort = allCohorts[ci]!;
      // Check if any member in this cohort has strong-yes rank
      const hasStrongYes = Object.values(cohort.people).flat().some(pid => {
        const p = personById[pid];
        return p && p.rank === 0;
      });
      if (hasStrongYes) {
        blockedCohorts.add(ci);
      }
    }
    await runPhase4Pass("phase4b", neutralPeople, blockedCohorts, false);

    // Recompute majority ranks after Phase 4b
    for (const cohort of allCohorts) {
      cohort.majorityRank = computeMajorityRank(cohort, personById, participantType.name);
    }


  }

  // ── Post-Phase 4 validation: remove invalid groups and greedy fill ──

  // Step A: Remove cohorts that have facilitator(s) but no participants, or vice versa
  const validCohorts: Cohort[] = [];
  for (const cohort of allCohorts) {
    const participantCount = (cohort.people[participantType.name] ?? []).length;
    const facilitatorCount = (cohort.people[facilitatorType.name] ?? []).length;

    if ((facilitatorCount > 0 && participantCount === 0) || (participantCount > 0 && facilitatorCount === 0)) {
      // Invalid group — un-assign all members so they can be redistributed
      for (const ptName of Object.keys(cohort.people)) {
        for (const pid of cohort.people[ptName]!) {
          assignedIds.delete(pid);
          assignedFacIds.delete(pid);
        }
      }
    } else {
      validCohorts.push(cohort);
    }
  }
  allCohorts.length = 0;
  allCohorts.push(...validCohorts);

  // Step B: Greedy fill for still-unassigned people (with overfill support)
  // Overfill rules: a group can go +1 over max, but no more than half the groups can be overfilled.
  const stillUnassigned: { person: Person; personType: PersonType }[] = [];
  for (const pt of personTypes) {
    for (const p of pt.people) {
      if (!assignedIds.has(p.id)) {
        stillUnassigned.push({ person: p, personType: pt });
      }
    }
  }

  if (stillUnassigned.length > 0) {
    const MAX_GREY_PER_COHORT = 3;
    const maxOverfilledGroups = Math.floor(allCohorts.length / 2);
    const overfilledGroups = new Set<number>();

    for (const { person, personType: pt } of stillUnassigned) {
      let bestCohortIdx = -1;
      let bestOverlap = -1;

      for (let ci = 0; ci < allCohorts.length; ci++) {
        const cohort = allCohorts[ci]!;
        const currentCount = (cohort.people[pt.name] ?? []).length;
        const isOverfill = currentCount >= pt.max;

        // Check capacity: allow +1 overfill if this group isn't already overfilled
        // and we haven't hit the max number of overfilled groups
        if (isOverfill) {
          if (currentCount >= pt.max + 1) continue; // already overfilled
          if (overfilledGroups.has(ci)) continue; // already counted as overfilled
          if (overfilledGroups.size >= maxOverfilledGroups) continue; // too many overfilled
        }

        // Rank isolation: strong-yes can't go into neutral cohorts, and vice versa
        if (person.rank === 0) {
          const hasNeutral = Object.values(cohort.people).flat().some(pid => {
            const p = personById[pid];
            return p && p.rank === neutralRank;
          });
          if (hasNeutral) continue;
        }
        if (person.rank === neutralRank) {
          const hasStrongYes = Object.values(cohort.people).flat().some(pid => {
            const p = personById[pid];
            return p && p.rank === 0;
          });
          if (hasStrongYes) continue;
        }

        const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
        const overlapOrig = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);
        const expanded = expandAvailability(person.timeAvMins);
        const expandedUnits = toTimeAvUnits(expanded);
        const overlapExp = getOverlapUnits(expandedUnits, timeUnit, lengthOfMeetingInUnits);

        // Grey cap check: if person would be grey, check existing grey count
        if (overlapOrig < 1 && overlapExp < 1 && pt.name !== facilitatorType.name) {
          const existingGrey = countExistingGrey(cohort, personById, participantType.name, lengthOfMeetingInUnits);
          if (existingGrey >= MAX_GREY_PER_COHORT) continue;
        }

        // Prefer non-overfill slots over overfill slots
        const overlap = Math.max(overlapOrig, overlapExp);
        const adjustedOverlap = isOverfill ? overlap - 100000 : overlap;
        if (adjustedOverlap > bestOverlap) {
          bestOverlap = adjustedOverlap;
          bestCohortIdx = ci;
        }
      }

      if (bestCohortIdx >= 0) {
        const cohort = allCohorts[bestCohortIdx]!;
        if (!cohort.people[pt.name]) cohort.people[pt.name] = [];
        const wasAtMax = (cohort.people[pt.name]!.length >= pt.max);
        cohort.people[pt.name]!.push(person.id);
        assignedIds.add(person.id);
        if (pt.name === facilitatorType.name) assignedFacIds.add(person.id);
        if (wasAtMax) overfilledGroups.add(bestCohortIdx);

        // Compute tier
        if (!cohort.personTiers) cohort.personTiers = {};
        const timeUnit = cohort.startTime / MINUTES_IN_UNIT;
        const overlapOrig = getOverlapUnits(person.timeAvUnits, timeUnit, lengthOfMeetingInUnits);
        if (overlapOrig >= lengthOfMeetingInUnits) {
          cohort.personTiers[person.id] = 1;
        } else if (overlapOrig >= 1) {
          cohort.personTiers[person.id] = 2;
        } else {
          cohort.personTiers[person.id] = 3;
        }
      }
    }

    // Recompute majority ranks after greedy fill
    for (const cohort of allCohorts) {
      cohort.majorityRank = computeMajorityRank(cohort, personById, participantType.name);
    }
  }

  // ── Spread groups across days ──
  spreadGroupsAcrossDays(allCohorts, personById, lengthOfMeetingInUnits, allTimeSlots, participantType.name);

  return allCohorts;
}

/** Compute tier from overlap units. */
function computeTier(overlap: number, meetingLengthUnits: number): 1 | 2 | 3 {
  if (overlap >= meetingLengthUnits) return 1;
  if (overlap >= 1) return 2;
  return 3;
}

const MINUTES_IN_DAY = 24 * 60;
const UNITS_PER_DAY = MINUTES_IN_DAY / MINUTES_IN_UNIT;

/** Post-processing: try to move groups from crowded days to less crowded days.
 *  A day is "crowded" if it has more groups than ceil(totalGroups / 7).
 *  Moves are only allowed if at most 1 person drops a tier and no one goes tier 2 → 3. */
function spreadGroupsAcrossDays(
  allCohorts: Cohort[],
  personById: Record<string, Person>,
  lengthOfMeetingInUnits: number,
  allTimeSlots: number[],
  participantTypeName: string,
): void {
  if (allCohorts.length <= 1) return;

  const getDay = (cohort: Cohort): number => Math.floor(cohort.startTime / MINUTES_IN_DAY);

  for (;;) {
    const idealPerDay = Math.ceil(allCohorts.length / 7);

    // Count groups per day
    const dayCounts: Record<number, number> = {};
    for (const cohort of allCohorts) {
      const day = getDay(cohort);
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }

    // Find crowded days (count > ideal), sorted by most crowded first
    const crowdedDays = Object.entries(dayCounts)
      .filter(([, count]) => count > idealPerDay)
      .sort((a, b) => b[1] - a[1])
      .map(([day]) => parseInt(day));

    if (crowdedDays.length === 0) break;

    let moved = false;

    for (const crowdedDay of crowdedDays) {
      if (moved) break;

      // Get groups on this day, smallest first (easier to move)
      const groupsOnDay = allCohorts
        .filter(c => getDay(c) === crowdedDay)
        .sort((a, b) => {
          const sizeA = Object.values(a.people).flat().length;
          const sizeB = Object.values(b.people).flat().length;
          return sizeA - sizeB;
        });

      for (const cohort of groupsOnDay) {
        if (moved) break;

        // Target days: days with fewer groups than ideal, sorted by fewest first
        const targetDays = Array.from({ length: 7 }, (_, i) => i)
          .filter(d => d !== crowdedDay && (dayCounts[d] ?? 0) < idealPerDay)
          .sort((a, b) => (dayCounts[a] ?? 0) - (dayCounts[b] ?? 0));

        if (targetDays.length === 0) continue;

        // Get all members and their current tiers
        const members: { id: string; person: Person; currentTier: 1 | 2 | 3 }[] = [];
        for (const ptName of Object.keys(cohort.people)) {
          for (const pid of cohort.people[ptName]!) {
            const person = personById[pid];
            if (!person) continue;
            const currentTier = cohort.personTiers?.[pid] ?? 1;
            members.push({ id: pid, person, currentTier });
          }
        }

        let bestSlot: { time: number; drops: number; totalOverlap: number } | null = null;

        for (const targetDay of targetDays) {
          const dayStartUnit = targetDay * UNITS_PER_DAY;
          const dayEndUnit = dayStartUnit + UNITS_PER_DAY;

          // Only consider time slots on this target day
          const candidateSlots = allTimeSlots.filter(
            t => t >= dayStartUnit && t + lengthOfMeetingInUnits <= dayEndUnit
          );

          for (const t of candidateSlots) {
            const candidateStartMins = t * MINUTES_IN_UNIT;
            const candidateEndMins = (t + lengthOfMeetingInUnits) * MINUTES_IN_UNIT;

            let valid = true;
            let drops = 0;
            let totalOverlap = 0;

            for (const { person, currentTier } of members) {
              // Check facilitator blocked times
              if (person.blockedTimes) {
                const conflicts = person.blockedTimes.some(
                  ([bStart, bEnd]) => candidateStartMins < bEnd && bStart < candidateEndMins
                );
                if (conflicts) { valid = false; break; }
              }

              const overlap = getOverlapUnits(person.timeAvUnits, t, lengthOfMeetingInUnits);
              const newTier = computeTier(overlap, lengthOfMeetingInUnits);
              totalOverlap += overlap;

              if (newTier > currentTier) {
                // Tier dropped (higher number = worse)
                if (currentTier === 2 && newTier === 3) {
                  // Not allowed: partial → none
                  valid = false; break;
                }
                drops++;
                if (drops > 1) { valid = false; break; }
              }
            }

            if (!valid) continue;

            // Prefer: fewest drops, then highest total overlap
            if (
              bestSlot === null ||
              drops < bestSlot.drops ||
              (drops === bestSlot.drops && totalOverlap > bestSlot.totalOverlap)
            ) {
              bestSlot = { time: t, drops, totalOverlap };
            }
          }

          // If we found a perfect slot (0 drops) on this target day, no need to check other days
          if (bestSlot && bestSlot.drops === 0) break;
        }

        if (bestSlot) {
          // Move the cohort
          cohort.startTime = (bestSlot.time * MINUTES_IN_UNIT) as typeof cohort.startTime;
          cohort.endTime = ((bestSlot.time + lengthOfMeetingInUnits) * MINUTES_IN_UNIT) as typeof cohort.endTime;

          // Recompute tiers for all members
          if (!cohort.personTiers) cohort.personTiers = {};
          for (const { id, person } of members) {
            const overlap = getOverlapUnits(person.timeAvUnits, bestSlot.time, lengthOfMeetingInUnits);
            cohort.personTiers[id] = computeTier(overlap, lengthOfMeetingInUnits);
          }

          // Recompute majority rank
          cohort.majorityRank = computeMajorityRank(cohort, personById, participantTypeName);

          moved = true;
        }
      }
    }

    if (!moved) break; // No more improvements possible
  }
}

/** Determine facilitator groups to try for a given rank cycle.
 *  Returns arrays of facilitator pools to attempt in order. */
function getFacilitatorGroupsForCycle(
  rankLevel: number,
  isLastCycle: boolean,
  sortedRanks: number[],
  allFacilitators: Person[],
  assignedFacIds: Set<string>,
): Person[][] {
  const availableFacs = allFacilitators.filter(f => !assignedFacIds.has(f.id));

  if (isLastCycle) {
    // Last cycle: try all remaining facilitators at once
    return [availableFacs];
  }

  const groups: Person[][] = [];

  if (sortedRanks.length > 0 && rankLevel === sortedRanks[0]) {
    // First rank (rank 0 cycle):
    // Try with rank 0 facilitators
    const rank0Facs = availableFacs.filter(f => f.rank === rankLevel);
    if (rank0Facs.length > 0) groups.push(rank0Facs);

    // Try with rank 1 facilitators (next rank only)
    if (sortedRanks.length > 1) {
      const rank1Facs = availableFacs.filter(f => f.rank === sortedRanks[1]);
      if (rank1Facs.length > 0) groups.push(rank1Facs);
    }
  } else if (sortedRanks.length > 1 && rankLevel === sortedRanks[1]) {
    // Second rank (rank 1 cycle):
    // Try with remaining rank 0 facilitators (use up higher-ranked first)
    const rank0Facs = availableFacs.filter(f => f.rank === sortedRanks[0]);
    if (rank0Facs.length > 0) groups.push(rank0Facs);

    // Try with rank 1 facilitators
    const rank1Facs = availableFacs.filter(f => f.rank === rankLevel);
    if (rank1Facs.length > 0) groups.push(rank1Facs);

    // Stop here — do not try rank 2+ (neutral) facilitators.
    // This prevents neutral facilitators from being placed with rank 0 carry-forward participants.
    // Neutral facilitators will be used in the neutral cycle or assigned via Phase 4b.
  } else {
    // Other rank cycles:
    // Try with same-rank facilitators first
    const sameRankFacs = availableFacs.filter(f => f.rank === rankLevel);
    if (sameRankFacs.length > 0) groups.push(sameRankFacs);

    // Try with all remaining
    const otherFacs = availableFacs.filter(f => f.rank !== rankLevel);
    if (otherFacs.length > 0) groups.push(otherFacs);
  }

  // If no groups were built (e.g., no facilitators with matching ranks),
  // fall back to all available facilitators
  if (groups.length === 0 && availableFacs.length > 0) {
    groups.push(availableFacs);
  }

  return groups;
}
