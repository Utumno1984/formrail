import { useState } from 'react';
import { Pagination } from '@formrail/core';

export function InvoicePagination() {
  // Controlled: `onPageChange` is called only by a user gesture, with the requested page.
  // The current page button carries `aria-current="page"`.
  const [page, setPage] = useState(1);
  return <Pagination page={page} pageCount={24} onPageChange={setPage} />;
}
