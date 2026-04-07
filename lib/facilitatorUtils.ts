import type { Base, Table } from '@airtable/blocks/models';
import { fromDate, Interval } from 'weekly-availabilities';
import type { Preset } from '../frontend';
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

  if (!preset.roundsStatusField || !preset.roundsStartDateField || !preset.roundsEndDateField) {
    return [];
  }

  // Fetch rounds and cohorts in parallel
  const roundFields = [preset.roundsStatusField, preset.roundsStartDateField, preset.roundsEndDateField];
  if (preset.roundsIntensityField) roundFields.push(preset.roundsIntensityField);
  if (preset.roundsNumUnitsField) roundFields.push(preset.roundsNumUnitsField);
  const [roundRecords, cohortRecords] = await Promise.all([
    roundsTable.selectRecordsAsync({ fields: roundFields }),
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
    const isActive = r.getCellValueAsString(preset.roundsStatusField!) === 'Active';
    if (!isActive) continue;
    const startDate = new Date(r.getCellValue(preset.roundsStartDateField!) as string);
    const endDate = new Date(r.getCellValue(preset.roundsEndDateField!) as string);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;
    const intensity = preset.roundsIntensityField ? r.getCellValueAsString(preset.roundsIntensityField) : '';
    const isIntensive = intensity === 'Intensive';
    const numUnits = preset.roundsNumUnitsField ? parseInt(r.getCellValueAsString(preset.roundsNumUnitsField)) || 0 : 0;
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

  if (!preset.roundsStartDateField || !preset.roundsEndDateField) return null;

  const roundFields = [preset.roundsStartDateField, preset.roundsEndDateField];
  if (preset.roundsIntensityField) roundFields.push(preset.roundsIntensityField);
  if (preset.roundsNumUnitsField) roundFields.push(preset.roundsNumUnitsField);
  const roundsData = await roundsTable.selectRecordsAsync({
    fields: roundFields,
  });

  const record = roundsData.records.find((r) => r.id === targetRoundId);
  roundsData.unloadData();

  if (!record) return null;

  const start = new Date(record.getCellValue(preset.roundsStartDateField) as string);
  const end = new Date(record.getCellValue(preset.roundsEndDateField) as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const intensity = preset.roundsIntensityField ? record.getCellValueAsString(preset.roundsIntensityField) : '';
  const isIntensive = intensity === 'Intensive';
  const numUnits = preset.roundsNumUnitsField ? parseInt(record.getCellValueAsString(preset.roundsNumUnitsField)) || 0 : 0;

  return { start, end, isIntensive, numUnits };
}
