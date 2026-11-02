/** Names of the URL parameters of a report (defaults `filter`, `q`, `sort`). */
export interface ListReportParamNames {
  filter?: string;
  search?: string;
  sort?: string;
}

/** The three parameter names of a report, with the `prefix` applied: shared by the URL state and the scroll restoration. */
export function listReportParamKeys(prefix?: string, params?: ListReportParamNames): [string, string, string] {
  const scope = prefix ? `${prefix}.` : '';
  return [scope + (params?.filter ?? 'filter'), scope + (params?.search ?? 'q'), scope + (params?.sort ?? 'sort')];
}
