import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ListReport, useListReport, useListReportScrollRestoration } from '../../packages/core/dist/index.js';

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `Row ${i}` }));
const COLUMNS = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({
  id,
  header: id,
  accessor: (r: Row) => `${r.name} ${id}`,
  width: 500,
}));
const LABELS = {
  loading: 'Loading',
  empty: 'Empty',
  noResults: 'None',
  error: 'Error',
  retry: 'Retry',
  clearFilters: 'Clear',
  resultCount: (n: number) => `${n} results`,
  count: (a: number, b: number) => `(${a}/${b})`,
};

function Report({ title, prefix, delay, empty }: { title: string; prefix?: string; delay: number; empty?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  const scroll = useListReportScrollRestoration({ ready: loaded && !empty, prefix });
  const table = useListReport<Row>({ rows: loaded && !empty ? ROWS : [], columns: COLUMNS, getRowId: (r) => r.id });
  return (
    <div style={{ width: 600, height: 250, marginBottom: 20 }}>
      <ListReport
        title={title}
        table={table}
        status={loaded ? 'ready' : 'loading'}
        labels={LABELS}
        filtersLabel="Filters"
        searchLabel="Search"
        showSearch={false}
        scrollerRef={scroll.ref}
      />
    </div>
  );
}

function App() {
  const [page, setPage] = useState<'list' | 'other'>('list');
  const params = new URLSearchParams(window.location.search);
  const delay = Number(params.get('delay') ?? 300);
  const two = params.get('two') === '1';
  const empty = params.get('empty') === '1';
  useMemo(() => {
    (window as unknown as { __go: (p: 'list' | 'other') => void }).__go = setPage;
  }, []);
  if (page === 'other') return <p>other page</p>;
  return two ? (
    <>
      <Report title="Alpha" prefix="a" delay={delay} />
      <Report title="Beta" prefix="b" delay={delay} />
    </>
  ) : (
    <Report title="Solo" delay={delay} empty={empty} />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
