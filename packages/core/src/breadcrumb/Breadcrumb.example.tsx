import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage } from '@formrail/core';

export function InvoiceBreadcrumb() {
  // Real links. In an app with a router, render your router's link instead:
  // `<BreadcrumbLink asChild><Link to="/invoices">Invoices</Link></BreadcrumbLink>`.
  // The last item is the current page: not a link, with `aria-current="page"`.
  // Here the links do not leave the page, so the example can be tried in place.
  return (
    <Breadcrumb>
      <BreadcrumbItem>
        <BreadcrumbLink href="#home" onClick={(event) => event.preventDefault()}>
          Home
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbItem>
        <BreadcrumbLink href="#invoices" onClick={(event) => event.preventDefault()}>
          Invoices
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbItem>
        <BreadcrumbPage>2026-0142</BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  );
}
