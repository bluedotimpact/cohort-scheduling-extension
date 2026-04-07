import type { Base, Table } from '@airtable/blocks/models';
import { fromDate, Interval } from 'weekly-availabilities';
import type { Preset } from '../frontend';
import { ROUND_END_DATE_FIELD_NAME, ROUND_START_DATE_FIELD_NAME } from './constants';
import { collapseAvailabilityToMonday, dateRangesOverlap, expandAvailabilityToDays } from './util';

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
  isCurrentRunIntensive,
}: {
  base: Base;
  facilitatorEmail: string;
  preset: Preset;
  targetRoundDates?: { start: Date; end: Date };
  isCurrentRunIntensive?: boolean;
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
    roundsTable.selectRecordsAsync({ fields: ['Status', ROUND_START_DATE_FIELD_NAME, ROUND_END_DATE_FIELD_NAME, 'Intensity', 'Num units'] }),
    cohortsTable.selectRecordsAsync({
      fields: [
        preset.cohortsTableStartDateField!,
        preset.cohortsTableEndDateField!,
        preset.cohortsIterationField!,
        preset.facilitatorEmailLookupField,
      ],
    }),
  ]);

  // Build map of active round IDs -> { startDate, endDate, isIntensive, numUnits }
  const roundInfo = new Map<string, { startDate: Date; endDate: Date; isIntensive: boolean; numUnits: number }>();
  for (const r of roundRecords.records) {
    const isActive = r.getCellValueAsString('Status') === 'Active';
    if (!isActive) continue;
    const startDate = new Date(r.getCellValue(ROUND_START_DATE_FIELD_NAME) as string);
    const endDate = new Date(r.getCellValue(ROUND_END_DATE_FIELD_NAME) as string);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;
    const intensity = r.getCellValueAsString('Intensity');
    const isIntensive = intensity === 'Intensive';
    const numUnits = parseInt(r.getCellValueAsString('Num units')) || 0;
    roundInfo.set(r.id, { startDate, endDate, isIntensive, numUnits });
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

    const startDate = new Date(group.getCellValue(preset.cohortsTableStartDateField!) as string);
    const endDate = new Date(group.getCellValue(preset.cohortsTableEndDateField!) as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      continue;
    }

    const interval: Interval = [fromDate(startDate), fromDate(endDate)];

    // If the existing cohort is from an intensive round, expand the blocked time
    // to the first N days of the week (since the course meets daily)
    if (round.isIntensive && round.numUnits > 0) {
      blockedIntervals.push(...expandAvailabilityToDays([interval], round.numUnits));
    } else {
      blockedIntervals.push(interval);
    }
  }

  cohortRecords.unloadData();

  // If the current scheduling run is intensive, collapse all blocked times to Monday
  // so they're comparable to the collapsed participant availability
  if (isCurrentRunIntensive) {
    return collapseAvailabilityToMonday(blockedIntervals);
  }

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

/** Gets the 'Start date', 'Last discussion date', intensity, and num units for a round */
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
    fields: [ROUND_START_DATE_FIELD_NAME, ROUND_END_DATE_FIELD_NAME, 'Intensity', 'Num units'],
  });

  const record = roundsData.records.find((r) => r.id === targetRoundId);
  roundsData.unloadData();

  if (!record) return null;

  const start = new Date(record.getCellValue(ROUND_START_DATE_FIELD_NAME) as string);
  const end = new Date(record.getCellValue(ROUND_END_DATE_FIELD_NAME) as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const intensity = record.getCellValueAsString('Intensity');
  const isIntensive = intensity === 'Intensive';
  const numUnits = parseInt(record.getCellValueAsString('Num units')) || 0;

  return { start, end, isIntensive, numUnits };
}
