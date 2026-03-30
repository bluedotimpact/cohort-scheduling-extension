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

  // Determine the neutral rank (highest numeric rank across ALL people)
  // Used to prevent neutral/strong-yes mixing in Phase 1 carry-forwards
  const globalRanks: number[] = [];
  for (const pt of personTypes) {
    for (const p of pt.people) {
      if (p.rank !== undefined) globalRanks.push(p.rank);
    }
  }
  const neutralRank = globalRanks.length > 0 ? Math.max(...globalRanks) : undefined;

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

    // ── Phase 2: Check capacity ──
    const unassignedInPool = participantPool.filter(p => !assignedIds.has(p.id));
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
    const deficit = unassignedInPool.length - remainingCapacity;

    // ── Phase 3: Create additional groups if needed ──
    if (deficit > 0 && unassignedInPool.length >= participantType.min) {
      const unassignedFacs = facilitatorType.people.filter(f => !assignedFacIds.has(f.id));
      if (unassignedFacs.length >= facilitatorType.min) {
        const maxNewGroupsByParticipants = Math.ceil(deficit / participantType.max);
        const maxNewGroupsByFacilitators = Math.floor(unassignedFacs.length / facilitatorType.min);
        const newGroupsNeeded = Math.min(maxNewGroupsByParticipants, maxNewGroupsByFacilitators);

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
            // Non-last cycle: only >=50% overlap
            tryCreateGroups({
              [participantType.name]: halfMeeting,
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
      }
    }

    // Carry forward: unassigned people remain in the pool for next cycle automatically
    // (they are not in assignedIds so will be picked up)
  }

  // ── Phase 4: Two-pass assignment LP with rank-distance scoring ──

  // Rank-distance weight tables
  const fullOverlapWeights = [20000, 15000, 10000];
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

        let coef = 0;
        if (overlapOriginal >= lengthOfMeetingInUnits) {
          coef = getRankWeight(fullOverlapWeights, rankDistance);
        } else if (overlapOriginal >= 1) {
          coef = getRankWeight(partialOverlapWeights, rankDistance);
        } else if (overlapExpanded >= 1) {
          coef = getRankWeight(expandedOverlapWeights, rankDistance);
        } else if (person.tier === 3) {
          coef = 1;
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

  return allCohorts;
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
