// Story-only: the neutral rows and columns of the `Data/ListReportTable` stories (and of the e2e that read them).
// The rows are `makeRecords` of the demo universe (`internal/demo-data`), no business domain. Only the records in
// euro are kept, so that the "Amount" column can show `€ 1234.50` and sort on the number it shows. Not exported by
// the package.
import { makeRecords, type DemoRecord } from '../internal/demo-data';
import type { ListReportColumn, ListReportSortDirection } from './types';

export type Row = DemoRecord;

const EUR_RECORDS: readonly Row[] = makeRecords(600).filter((r) => r.currency === 'EUR');

/** The first `count` records in euro, always the same ones (a prefix of the same list). */
export function makeRows(count: number): Row[] {
  return EUR_RECORDS.slice(0, count);
}

/** Records whose description is over 120 characters: they truncate in every column width of the stories. */
export const LONG_TEXT_ROWS: Row[] = EUR_RECORDS.filter((r) => r.description.length > 120).slice(0, 8);

/** `€ 1234.50` from minor units (the rows of `makeRows` are all in euro). */
export const money = (amountMinor: number): string => `€ ${(amountMinor / 100).toFixed(2)}`;

export function columns(firstDateDirection: ListReportSortDirection = 'desc'): ListReportColumn<Row>[] {
  return [
    { id: 'code', header: 'Code', accessor: (r) => r.code, width: 110 },
    { id: 'name', header: 'Name', accessor: (r) => r.name, minWidth: 160 },
    { id: 'description', header: 'Description', accessor: (r) => r.description, sortable: false, minWidth: 200 },
    { id: 'amount', header: 'Amount', accessor: (r) => r.amountMinor, cell: (r) => money(r.amountMinor), align: 'end', width: 120 },
    { id: 'date', header: 'Date', accessor: (r) => r.createdOn, firstSortDirection: firstDateDirection, width: 120 },
  ];
}
