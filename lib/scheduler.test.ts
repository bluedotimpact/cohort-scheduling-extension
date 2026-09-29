import { describe, expect, test } from 'vitest';
import { Interval } from 'weekly-availabilities';
import { Person, PersonType, solve } from './scheduler';
import { toTimeAvUnits } from './util';

/** Minutes since Monday 00:00 for hour:minute on Monday */
const mon = (hour: number, minute = 0) => hour * 60 + minute;

function person(id: string, timeAvMins: Interval[], rank: number, howManyCohorts = 1): Person {
  return {
    id,
    name: id,
    timeAvMins,
    timeAvUnits: toTimeAvUnits(timeAvMins),
    howManyCohorts,
    blockedTimes: undefined,
    tier: 1,
    rank,
  };
}

function facilitatorCohortCount(cohorts: { people: Record<string, string[]> }[], facId: string): number {
  return cohorts.filter((c) => (c.people['Facilitator'] ?? []).includes(facId)).length;
}

describe('solve: facilitator capacity across rank cycles', () => {
  test('a facilitator keeps taking groups in later cycles until howManyCohorts is reached', async () => {
    // One facilitator with capacity 3, free all day. Three waves of participants
    // (Strong yes / Weak yes / Neutral) in disjoint windows, so each rank cycle
    // needs its own group. Previously the facilitator was consumed after the
    // first cycle, stranding the other two waves.
    const fac = person('fac', [[mon(8), mon(18)] as Interval], 0, 3);
    const participants = [
      ...[1, 2, 3, 4].map((i) => person(`sy${i}`, [[mon(8), mon(10)] as Interval], 0)),
      ...[1, 2, 3, 4].map((i) => person(`wy${i}`, [[mon(11), mon(13)] as Interval], 1)),
      ...[1, 2, 3, 4].map((i) => person(`n${i}`, [[mon(14), mon(16)] as Interval], 2)),
    ];
    const personTypes: PersonType[] = [
      { name: 'Participant', min: 3, max: 4, people: participants },
      { name: 'Facilitator', min: 1, max: 1, people: [fac] },
    ];

    const solution = await solve({ lengthOfMeetingMins: 120, personTypes, isIntensive: true });

    expect(solution).not.toBeNull();
    expect(facilitatorCohortCount(solution!, 'fac')).toBe(3);
    const assigned = new Set(solution!.flatMap((c) => c.people['Participant'] ?? []));
    expect(assigned.size).toBe(12);
  });

  test('a facilitator is never double-booked into overlapping groups across cycles', async () => {
    // Facilitator with capacity 2 but only one 2h window. Two waves of
    // participants both wanting that window: only one group can exist.
    const fac = person('fac', [[mon(9), mon(11)] as Interval], 0, 2);
    const participants = [
      ...[1, 2, 3, 4].map((i) => person(`sy${i}`, [[mon(9), mon(11)] as Interval], 0)),
      ...[1, 2, 3, 4].map((i) => person(`wy${i}`, [[mon(9), mon(11)] as Interval], 1)),
    ];
    const personTypes: PersonType[] = [
      { name: 'Participant', min: 3, max: 4, people: participants },
      { name: 'Facilitator', min: 1, max: 1, people: [fac] },
    ];

    const solution = await solve({ lengthOfMeetingMins: 120, personTypes, isIntensive: true });

    expect(solution).not.toBeNull();
    const facCohorts = solution!.filter((c) => (c.people['Facilitator'] ?? []).includes('fac'));
    // No two of the facilitator's groups may overlap in time
    for (let i = 0; i < facCohorts.length; i++) {
      for (let j = i + 1; j < facCohorts.length; j++) {
        const a = facCohorts[i]!;
        const b = facCohorts[j]!;
        expect(a.startTime < b.endTime && b.startTime < a.endTime).toBe(false);
      }
    }
    expect(facCohorts.length).toBe(1);
  });

  test('multiple groups within a single cycle still work (capacity in one LP run)', async () => {
    const fac = person('fac', [[mon(8), mon(18)] as Interval], 0, 2);
    const participants = [
      ...[1, 2, 3, 4].map((i) => person(`a${i}`, [[mon(8), mon(10)] as Interval], 0)),
      ...[1, 2, 3, 4].map((i) => person(`b${i}`, [[mon(11), mon(13)] as Interval], 0)),
    ];
    const personTypes: PersonType[] = [
      { name: 'Participant', min: 3, max: 4, people: participants },
      { name: 'Facilitator', min: 1, max: 1, people: [fac] },
    ];

    const solution = await solve({ lengthOfMeetingMins: 120, personTypes, isIntensive: true });

    expect(solution).not.toBeNull();
    expect(facilitatorCohortCount(solution!, 'fac')).toBe(2);
    const assigned = new Set(solution!.flatMap((c) => c.people['Participant'] ?? []));
    expect(assigned.size).toBe(8);
  });
});
