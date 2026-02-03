import type { Base, Table } from '@airtable/blocks/models';
import type { Preset } from '../frontend';

export function getEmailFieldId(cohortsTable: Table | null, preset: Preset): string | undefined {
  if (!preset.facilitatorEmailLookupField || !cohortsTable) return undefined;

  const lookupField = cohortsTable.fields.find((f) => f.id === preset.facilitatorEmailLookupField);
  return lookupField?.options?.fieldIdInLinkedTable as string | undefined;
}

/** Fetches 'Rounds' table via iteration field's linked table */
export function getRoundsTable(base: Base, cohortsTable: Table | null, preset: Preset) {
  if (!cohortsTable) return null;
  if (!preset.cohortsIterationField) return null;

  const iterationField = cohortsTable.fields.find((f) => f.id === preset.cohortsIterationField);
  const roundsTableId = iterationField?.options?.linkedTableId as string | undefined;
  return roundsTableId ? base.getTableByIdIfExists(roundsTableId) : null;
}
