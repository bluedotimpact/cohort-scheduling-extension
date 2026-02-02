import type { Base } from '@airtable/blocks/models';
import { fromDate, type Interval } from 'weekly-availabilities';
import type { Preset } from '../frontend';

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

/** Check if two date ranges overlap */
function dateRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return start1 <= end2 && start2 <= end1;
}

/** Facilitators can facilitate multiple rounds simultaneously. We want to avoid scheduling a facilitator at a time they
 * are already unavailable. This matches by email since facilitators have different record IDs across rounds.
 *
 * If targetRoundStart/End are provided, only blocks times for rounds that overlap with that date range.
 * Otherwise (for view display), blocks times for all active rounds.
 */
export async function getFacilitatorBlockedTimes({
  base,
  facilitatorEmail,
  preset,
  targetRoundStart,
  targetRoundEnd,
}: {
  base: Base;
  facilitatorEmail: string;
  preset: Preset;
  targetRoundStart?: Date;
  targetRoundEnd?: Date;
}): Promise<Interval[]> {
  if (!facilitatorEmail || !preset.facilitatorEmailLookupField) {
    return [];
  }

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!);
  if (!cohortsTable) {
    throw new Error('Could not find cohorts table');
  }

  // Get the rounds table via iteration field's linked table
  const iterationField = cohortsTable.fields.find((f) => f.id === preset.cohortsIterationField!);
  const roundsTableId = iterationField?.options?.linkedTableId as string | undefined;
  if (!roundsTableId) {
    console.warn('Could not find rounds table - skipping blocked time calculation');
    return [];
  }
  const roundsTable = base.getTableByIdIfExists(roundsTableId);
  if (!roundsTable) {
    console.warn('Could not access rounds table - skipping blocked time calculation');
    return [];
  }

  // Fetch rounds and cohorts in parallel
  const [roundRecords, cohortRecords] = await Promise.all([
    roundsTable.selectRecordsAsync({ fields: ['Status', 'Start date', 'Last discussion date'] }),
    cohortsTable.selectRecordsAsync({
      fields: [
        preset.cohortsTableStartDateField!,
        preset.cohortsTableEndDateField!,
        preset.cohortsIterationField!,
        preset.facilitatorEmailLookupField,
      ],
    }),
  ]);

  // Build map of active round IDs -> { startDate, endDate }
  const roundInfo = new Map<string, { startDate: Date; endDate: Date }>();
  for (const r of roundRecords.records) {
    const isActive = r.getCellValueAsString('Status') === 'Active';
    if (!isActive) continue;
    const startDate = new Date(r.getCellValueAsString('Start date'));
    const endDate = new Date(r.getCellValueAsString('Last discussion date'));
    roundInfo.set(r.id, { startDate, endDate });
  }
  roundRecords.unloadData();

  const blockedIntervals: Interval[] = [];

  for (const group of cohortRecords.records) {
    // Check correct facilitator
    const cohortFacilitatorEmail = group.getCellValueAsString(preset.facilitatorEmailLookupField);
    if (cohortFacilitatorEmail !== facilitatorEmail) continue;

    // Get linked round info
    const linkedRound = group.getCellValue(preset.cohortsIterationField!) as Array<{ id: string }> | null;
    const roundId = linkedRound?.[0]?.id;
    if (!roundId) continue;

    const round = roundInfo.get(roundId);
    if (!round) continue;

    // If target round dates provided, check for overlap
    if (
      targetRoundStart &&
      targetRoundEnd &&
      !dateRangesOverlap(round.startDate, round.endDate, targetRoundStart, targetRoundEnd)
    ) {
      continue;
    }

    const startDate = new Date(group.getCellValueAsString(preset.cohortsTableStartDateField!));
    const endDate = new Date(group.getCellValueAsString(preset.cohortsTableEndDateField!));

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      continue;
    }

    blockedIntervals.push([fromDate(startDate), fromDate(endDate)]);
  }

  cohortRecords.unloadData();

  return blockedIntervals;
}

// TODO: move to `weekly-availabilities`
/** Subtract blocked intervals from availability intervals.
 * Returns new availability with blocked times removed. */
export function subtractIntervals(availability: Interval[], blocked: Interval[]): Interval[] {
  if (blocked.length === 0) return availability;

  const result: Interval[] = [];

  for (const [availStart, availEnd] of availability) {
    let remaining: Interval[] = [[availStart, availEnd]];

    for (const [blockStart, blockEnd] of blocked) {
      const newRemaining: Interval[] = [];

      for (const [remStart, remEnd] of remaining) {
        if (blockEnd <= remStart || blockStart >= remEnd) {
          newRemaining.push([remStart, remEnd]);
        } else {
          if (remStart < blockStart) {
            newRemaining.push([remStart, blockStart]);
          }
          if (remEnd > blockEnd) {
            newRemaining.push([blockEnd, remEnd]);
          }
        }
      }

      remaining = newRemaining;
    }

    result.push(...remaining);
  }

  return result;
}
