import type { Table } from '@airtable/blocks/models';
import type { Preset } from '../frontend';

export function getEmailFieldId(cohortsTable: Table | null, preset: Preset): string | undefined {
  if (!preset.facilitatorEmailLookupField || !cohortsTable) return undefined;

  const lookupField = cohortsTable.fields.find((f) => f.id === preset.facilitatorEmailLookupField);
  return lookupField?.options?.fieldIdInLinkedTable as string | undefined;
}
