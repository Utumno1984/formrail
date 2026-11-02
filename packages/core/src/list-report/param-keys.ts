/** Names of the URL parameters of a report (pill, search, sort). */
export interface ListReportParamNames {
  /** Default `filter`. */
  filter?: string;
  /** Default `q`. */
  search?: string;
  /** Default `sort`. */
  sort?: string;
}

/** The three parameter names of a report, with the `prefix` applied: shared by the URL state and the scroll restoration. */
export function listReportParamKeys(prefix?: string, params?: ListReportParamNames): [string, string, string] {
  const scope = prefix ? `${prefix}.` : '';
  const filterKey = scope + (params?.filter ?? 'filter');
  const searchKey = scope + (params?.search ?? 'q');
  const sortKey = scope + (params?.sort ?? 'sort');
  return [filterKey, searchKey, sortKey];
}
