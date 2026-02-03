import type { Base, Table } from '@airtable/blocks/models';
import { Interval, fromDate } from 'weekly-availabilities';
import type { Preset } from '../frontend';
import { dateRangesOverlap } from './util';
import { ROUND_END_DATE_FIELD_NAME, ROUND_START_DATE_FIELD_NAME } from './constants';

/** Facilitators can facilitate multiple rounds simultaneously. We want to avoid scheduling a facilitator at a time they
 * are already unavailable. This matches by email since facilitators have different record IDs across rounds.
 *
 * If targetRoundDates are provided, only blocks times for rounds that overlap with that date range.
 * Otherwise (for view display), blocks times for all active rounds.
 */
export async function getFacilitatorBlockedTimes({
  base,
  facilitatorEmail,
  preset,
  targetRoundDates,
}: {
  base: Base;
  facilitatorEmail: string;
  preset: Preset;
  targetRoundDates?: { start: Date; end: Date };
}): Promise<Interval[]> {
  if (!facilitatorEmail || !preset.facilitatorEmailLookupField) {
    return [];
  }

  const cohortsTable = base.getTableByIdIfExists(preset.cohortsTable!);
  if (!cohortsTable) {
    throw new Error('Could not find cohorts table');
  }

  const roundsTable = getRoundsTable(base, cohortsTable, preset);
  if (!roundsTable) {
    throw new Error('Could not find rounds table');
  }

  // Fetch rounds and cohorts in parallel
  const [roundRecords, cohortRecords] = await Promise.all([
    roundsTable.selectRecordsAsync({ fields: ['Status', ROUND_START_DATE_FIELD_NAME, ROUND_END_DATE_FIELD_NAME] }),
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
    const startDate = new Date(r.getCellValueAsString(ROUND_START_DATE_FIELD_NAME));
    const endDate = new Date(r.getCellValueAsString(ROUND_END_DATE_FIELD_NAME));
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
      targetRoundDates &&
      !dateRangesOverlap(round.startDate, round.endDate, targetRoundDates.start, targetRoundDates.end)
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

export function getEmailFieldId(cohortsTable: Table | null, preset: Preset): string | undefined {
  if (!preset.facilitatorEmailLookupField || !cohortsTable) return undefined;

  const lookupField = cohortsTable.fields.find((f) => f.id === preset.facilitatorEmailLookupField);
  return lookupField?.options?.fieldIdInLinkedTable as string | undefined;
}

/** Fetches 'Rounds' table via iteration field's linked table */
function getRoundsTable(base: Base, cohortsTable: Table | null, preset: Preset) {
  if (!cohortsTable) return null;
  if (!preset.cohortsIterationField) return null;

  const iterationField = cohortsTable.fields.find((f) => f.id === preset.cohortsIterationField);
  const roundsTableId = iterationField?.options?.linkedTableId as string | undefined;
  return roundsTableId ? base.getTableByIdIfExists(roundsTableId) : null;
}

/** Gets the 'Start date' and 'Last discussion date' for a round */
export async function getTargetRoundDates(
  base: Base,
  targetRoundId: string | null,
  cohortsTable: Table | null,
  preset: Preset,
) {
  if (!targetRoundId) return null;

  const roundsTable = getRoundsTable(base, cohortsTable, preset);
  if (!roundsTable) return null;

  const roundsData = await roundsTable.selectRecordsAsync({
    fields: [ROUND_START_DATE_FIELD_NAME, ROUND_END_DATE_FIELD_NAME],
  });

  const record = roundsData.records.find((r) => r.id === targetRoundId);
  roundsData.unloadData();

  if (!record) return null;

  return {
    start: new Date(record.getCellValueAsString(ROUND_START_DATE_FIELD_NAME)),
    end: new Date(record.getCellValueAsString(ROUND_END_DATE_FIELD_NAME)),
  };
}
