// The demo universe: one fictional company, its staff, customers, suppliers and products, generated
// deterministically for stories, examples, e2e scenarios and visual baselines. Internal to the
// repository: not exported by `src/index.ts` nor by the `/internal` facade, never in `dist`
// (asserted by `test/package-contract.test.ts`).
//
// Contract shared by every generator (`makeX(n)`):
// - deterministic: no `Math.random`, no clock; dates are relative to `DEMO_TODAY`;
// - row `i` is a pure function of `i`: `makeX(200)` is a prefix of `makeX(100000)`;
// - cached per `n` (same `n`, same array instance) and deeply frozen (a caller cannot alter the cache);
// - `n` must be a non-negative integer, anything else throws;
// - references to another domain point into its first `DEMO_REFERENCE_POOL[domain]` rows;
// - money is an integer amount of minor units next to an ISO 4217 code; e-mails and web sites use the
//   reserved `.example` domain only.

export { DEMO_COMPANY, DEMO_LEGAL_ENTITIES, type DemoCompany, type DemoLegalEntity, type DemoWarehouse } from './company';
export { CURRENCY_MINOR_DIGITS, DEMO_CURRENCIES, DEMO_FX_PER_EUR, convertFromEurMinor, type DemoCurrency } from './currency';
export { DEMO_REFERENCE_POOL } from './dataset';
export { DEMO_TODAY, addDays, daysAgo, daysBetween, isoToDayNumber, parseIsoDate } from './dates';
export { DEMO_LOCALE, formatDate, formatMoney } from './format';
export { createRng, type Rng } from './rng';
export {
  AREA_COUNTRIES,
  COUNTRY_NAME,
  DEMO_COUNTRIES,
  POSTAL_CODE_PATTERN,
  type DemoAddress,
  type DemoCountry,
  type DemoCountryCode,
  type DemoLanguageArea,
} from './geo';
export { PAYMENT_TERMS_DAYS, PAYMENT_TERMS_LABEL, type DemoPaymentTerms } from './terms';
export type { DemoContact } from './contacts';
export {
  DEPARTMENT_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  getEmployee,
  makeEmployees,
  type DemoDepartment,
  type DemoEmployee,
  type DemoEmployeeStatus,
} from './employees';
export {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  CUSTOMER_UNIQUE_NAMES,
  INDUSTRY_LABEL,
  getCustomer,
  makeCustomers,
  type DemoCustomer,
  type DemoCustomerStatus,
  type DemoIndustry,
} from './customers';
export {
  SUPPLIER_STATUS_LABEL,
  SUPPLIER_STATUS_TONE,
  SUPPLIER_UNIQUE_NAMES,
  getSupplier,
  makeSuppliers,
  type DemoSupplier,
  type DemoSupplierStatus,
} from './suppliers';
export {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_CODE,
  PRODUCT_CATEGORY_LABEL,
  type DemoProductCategory,
  type DemoProductUnit,
} from './catalog';
export {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_TONE,
  PRODUCT_UNIQUE_NAMES,
  getProduct,
  makeProducts,
  type DemoPrices,
  type DemoProduct,
  type DemoProductStatus,
  type DemoStockLevel,
} from './products';
export { discountMinor, lineTotalMinor, type DemoOrderLine } from './order-lines';
export {
  SALES_ORDER_STATUS_LABEL,
  SALES_ORDER_STATUS_TONE,
  getSalesOrder,
  makeSalesOrders,
  type DemoSalesOrder,
  type DemoSalesOrderDetail,
  type DemoSalesOrderStatus,
} from './sales-orders';
export {
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  getPurchaseOrder,
  makePurchaseOrders,
  type DemoPurchaseOrder,
  type DemoPurchaseOrderDetail,
  type DemoPurchaseOrderStatus,
} from './purchase-orders';
export {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  getInvoice,
  makeInvoices,
  type DemoInvoice,
  type DemoInvoiceStatus,
} from './invoices';
export {
  SUPPORT_CASE_PRIORITY_LABEL,
  SUPPORT_CASE_PRIORITY_TONE,
  SUPPORT_CASE_STATUS_LABEL,
  SUPPORT_CASE_STATUS_TONE,
  getSupportCase,
  makeSupportCases,
  type DemoCaseComment,
  type DemoSupportCase,
  type DemoSupportCaseDetail,
  type DemoSupportCasePriority,
  type DemoSupportCaseStatus,
} from './support-cases';
