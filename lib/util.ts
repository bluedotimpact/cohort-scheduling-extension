import type { Base } from '@airtable/blocks/models';
import { fromDate, type Interval } from 'weekly-availabilities';
import type { Preset } from '../frontend';

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function newUID() {
  return Math.random().toString(36).substring(2, 10);
}

/** Facilitators can facilitate multiple rounds simultaneously. We want to avoid scheduling a facilitator at a time they
 * are already unavailable. This matches by email since facilitators have different record IDs across rounds. */
export async function getFacilitatorBlockedTimes({
  base,
  facilitatorEmail,
  preset,
}: {
  base: Base;
  facilitatorEmail: string;
  preset: Preset;
}): Promise<Interval[]> {
  if (!facilitatorEmail) {
    return [];
  }

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!);
  if (!cohortsTable) {
    throw new Error('Could not find cohorts table');
  }

  // Get the rounds table from the iteration field's linked table
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

  const roundRecords = await roundsTable.selectRecordsAsync({
    fields: ['Status'],
  });

  // Get active round IDs
  const activeRoundIds = new Set(
    roundRecords.records.filter((r) => r.getCellValueAsString('Status') === 'Active').map((r) => r.id),
  );
  roundRecords.unloadData();

  const cohortRecords = await cohortsTable.selectRecordsAsync({
    fields: [
      preset.cohortsTableStartDateField!,
      preset.cohortsTableEndDateField!,
      preset.cohortsIterationField!,
      '[>] Facilitator email',
    ],
  });

  const blockedIntervals: Interval[] = [];

  for (const group of cohortRecords.records) {
    // Check correct facilitator
    const cohortFacilitatorEmail = group.getCellValueAsString('[>] Facilitator email');
    if (cohortFacilitatorEmail !== facilitatorEmail) continue;

    // Check linked round is active
    const linkedRound = group.getCellValue(preset.cohortsIterationField!) as Array<{ id: string }> | null;
    const roundId = linkedRound?.[0]?.id;
    if (!roundId || !activeRoundIds.has(roundId)) continue;

    const startDate = new Date(group.getCellValue(preset.cohortsTableStartDateField!) as string);
    const endDate = new Date(group.getCellValue(preset.cohortsTableEndDateField!) as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      continue;
    }

    blockedIntervals.push([fromDate(startDate), fromDate(endDate)]);
  }

  cohortRecords.unloadData();

  return blockedIntervals;
}
