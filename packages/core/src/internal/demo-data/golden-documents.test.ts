// @vitest-environment node
// Golden values of the transactional documents (ticket #514): the exact records the stories,
// examples, e2e scenarios and visual baselines will inherit. Same rule as `golden.test.ts`: update
// these snapshots only on purpose, and say why in the PR (what changed and which stories or
// baselines are affected). Never just to turn a red test green.
import { getPurchaseOrder, getSalesOrder, getSupportCase, makeInvoices, makePurchaseOrders, makeSalesOrders, makeSupportCases } from './index';

const ROWS = 20;

describe('demo-data golden values: documents', () => {
  it('sales orders: the first one with its lines, then a compact line per row', () => {
    expect(getSalesOrder('so-1')).toMatchInlineSnapshot(`
      {
        "accountManagerId": "emp-92",
        "currency": "EUR",
        "customerId": "cus-901",
        "customerReference": "REQ-46374",
        "id": "so-1",
        "lineCount": 3,
        "lines": [
          {
            "discountPercent": 5,
            "id": "so-1-line-1",
            "lineTotalMinor": 18639,
            "productId": "prd-527",
            "quantity": 1,
            "unitPriceMinor": 19620,
          },
          {
            "discountPercent": 15,
            "id": "so-1-line-2",
            "lineTotalMinor": 257125,
            "productId": "prd-115",
            "quantity": 50,
            "unitPriceMinor": 6050,
          },
          {
            "discountPercent": 0,
            "id": "so-1-line-3",
            "lineTotalMinor": 138500,
            "productId": "prd-787",
            "quantity": 10,
            "unitPriceMinor": 13850,
          },
        ],
        "number": "SO-2026-10001",
        "orderDate": "2026-05-27",
        "requestedDeliveryDate": "2026-06-10",
        "status": "invoiced",
        "totalMinor": 414264,
      }
    `);
    expect(
      makeSalesOrders(ROWS).map(
        (o) => `${o.number} ${o.customerId} ${o.currency} | ${o.status} | ${o.orderDate} -> ${o.requestedDeliveryDate} | ${o.lineCount} lines | ${o.totalMinor} | ${o.accountManagerId}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "SO-2026-10001 cus-901 EUR | invoiced | 2026-05-27 -> 2026-06-10 | 3 lines | 414264 | emp-92",
        "SO-2026-10002 cus-704 EUR | invoiced | 2026-01-18 -> 2026-03-03 | 6 lines | 1310306 | emp-80",
        "SO-2026-10003 cus-524 EUR | invoiced | 2026-02-25 -> 2026-04-06 | 18 lines | 1104810 | emp-373",
        "SO-2026-10004 cus-844 EUR | invoiced | 2026-02-07 -> 2026-03-07 | 6 lines | 176187 | emp-80",
        "SO-2026-10005 cus-975 EUR | invoiced | 2026-05-24 -> 2026-06-29 | 1 lines | 33179 | emp-13",
        "SO-2026-10006 cus-762 EUR | draft | 2026-10-09 -> 2026-11-08 | 2 lines | 417285 | emp-10",
        "SO-2026-10007 cus-845 USD | invoiced | 2026-09-02 -> 2026-10-08 | 1 lines | 45850 | emp-67",
        "SO-2026-10008 cus-144 EUR | shipped | 2026-08-21 -> 2026-09-25 | 2 lines | 434000 | emp-70",
        "SO-2026-10009 cus-901 EUR | invoiced | 2026-03-29 -> 2026-05-05 | 4 lines | 756152 | emp-92",
        "SO-2026-10010 cus-464 EUR | invoiced | 2026-03-03 -> 2026-03-23 | 1 lines | 38000 | emp-58",
        "SO-2026-10011 cus-389 EUR | invoiced | 2026-09-04 -> 2026-09-23 | 18 lines | 1997760 | emp-350",
        "SO-2026-10012 cus-812 EUR | shipped | 2026-09-12 -> 2026-10-26 | 4 lines | 2426034 | emp-350",
        "SO-2026-10013 cus-96 USD | invoiced | 2026-06-10 -> 2026-07-08 | 4 lines | 422851 | emp-389",
        "SO-2026-10014 cus-780 EUR | shipped | 2026-09-05 -> 2026-09-13 | 4 lines | 139055 | emp-80",
        "SO-2026-10015 cus-605 EUR | confirmed | 2026-09-22 -> 2026-10-21 | 2 lines | 65185 | emp-352",
        "SO-2026-10016 cus-180 GBP | draft | 2026-10-08 -> 2026-10-21 | 2 lines | 52165 | emp-70",
        "SO-2026-10017 cus-9 EUR | invoiced | 2026-05-25 -> 2026-06-07 | 4 lines | 416110 | emp-360",
        "SO-2026-10018 cus-31 EUR | invoiced | 2026-08-21 -> 2026-09-25 | 5 lines | 679919 | emp-378",
        "SO-2026-10019 cus-976 EUR | invoiced | 2026-05-18 -> 2026-06-23 | 6 lines | 74873 | emp-359",
        "SO-2026-10020 cus-311 USD | shipped | 2026-09-14 -> 2026-09-30 | 5 lines | 1976975 | emp-395",
      ]
    `);
  });

  it('purchase orders: the first one with its lines, then a compact line per row', () => {
    expect(getPurchaseOrder('po-1')).toMatchInlineSnapshot(`
      {
        "buyerId": "emp-150",
        "currency": "EUR",
        "expectedDeliveryDate": "2026-10-11",
        "id": "po-1",
        "lineCount": 8,
        "lines": [
          {
            "discountPercent": 0,
            "id": "po-1-line-1",
            "lineTotalMinor": 209000,
            "productId": "prd-92",
            "quantity": 20,
            "unitPriceMinor": 10450,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-2",
            "lineTotalMinor": 131000,
            "productId": "prd-349",
            "quantity": 50,
            "unitPriceMinor": 2620,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-3",
            "lineTotalMinor": 99500,
            "productId": "prd-787",
            "quantity": 10,
            "unitPriceMinor": 9950,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-4",
            "lineTotalMinor": 1668500,
            "productId": "prd-152",
            "quantity": 50,
            "unitPriceMinor": 33370,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-5",
            "lineTotalMinor": 18600,
            "productId": "prd-809",
            "quantity": 20,
            "unitPriceMinor": 930,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-6",
            "lineTotalMinor": 565300,
            "productId": "prd-638",
            "quantity": 20,
            "unitPriceMinor": 28265,
          },
          {
            "discountPercent": 0,
            "id": "po-1-line-7",
            "lineTotalMinor": 1336000,
            "productId": "prd-512",
            "quantity": 50,
            "unitPriceMinor": 26720,
          },
          {
            "discountPercent": 10,
            "id": "po-1-line-8",
            "lineTotalMinor": 187200,
            "productId": "prd-40",
            "quantity": 100,
            "unitPriceMinor": 2080,
          },
        ],
        "number": "PO-2026-10001",
        "orderDate": "2026-09-21",
        "status": "received",
        "supplierId": "sup-83",
        "totalMinor": 4215100,
      }
    `);
    expect(
      makePurchaseOrders(ROWS).map(
        (o) => `${o.number} ${o.supplierId} ${o.currency} | ${o.status} | ${o.orderDate} -> ${o.expectedDeliveryDate} | ${o.lineCount} lines | ${o.totalMinor} | ${o.buyerId}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "PO-2026-10001 sup-83 EUR | received | 2026-09-21 -> 2026-10-11 | 8 lines | 4215100 | emp-150",
        "PO-2026-10002 sup-94 EUR | sent | 2026-09-05 -> 2026-09-29 | 1 lines | 318345 | emp-155",
        "PO-2026-10003 sup-143 EUR | sent | 2026-10-02 -> 2026-10-17 | 6 lines | 14139862 | emp-164",
        "PO-2026-10004 sup-125 GBP | draft | 2026-10-10 -> 2026-10-15 | 2 lines | 481500 | emp-163",
        "PO-2026-10005 sup-127 USD | closed | 2026-01-13 -> 2026-02-22 | 8 lines | 4087682 | emp-143",
        "PO-2025-10006 sup-197 EUR | closed | 2025-10-25 -> 2025-11-11 | 1 lines | 283725 | emp-142",
        "PO-2026-10007 sup-173 EUR | received | 2026-08-04 -> 2026-08-15 | 1 lines | 74812 | emp-134",
        "PO-2026-10008 sup-86 EUR | closed | 2026-06-26 -> 2026-07-09 | 4 lines | 375380 | emp-25",
        "PO-2026-10009 sup-67 EUR | sent | 2026-09-16 -> 2026-09-21 | 1 lines | 447300 | emp-140",
        "PO-2026-10010 sup-141 EUR | closed | 2026-03-15 -> 2026-03-26 | 1 lines | 335700 | emp-132",
        "PO-2026-10011 sup-48 GBP | closed | 2026-04-21 -> 2026-04-26 | 8 lines | 5638837 | emp-155",
        "PO-2026-10012 sup-161 EUR | closed | 2026-06-23 -> 2026-07-05 | 2 lines | 201580 | emp-147",
        "PO-2026-10013 sup-15 EUR | received | 2026-07-30 -> 2026-08-18 | 5 lines | 879495 | emp-148",
        "PO-2026-10014 sup-142 EUR | sent | 2026-09-07 -> 2026-09-27 | 4 lines | 193217 | emp-152",
        "PO-2026-10015 sup-167 USD | received | 2026-09-05 -> 2026-10-08 | 1 lines | 713575 | emp-27",
        "PO-2026-10016 sup-199 EUR | received | 2026-09-21 -> 2026-10-07 | 5 lines | 1756662 | emp-161",
        "PO-2026-10017 sup-61 EUR | draft | 2026-10-10 -> 2026-11-02 | 4 lines | 622031 | emp-27",
        "PO-2026-10018 sup-80 EUR | sent | 2026-09-17 -> 2026-10-08 | 5 lines | 336766 | emp-136",
        "PO-2026-10019 sup-5 EUR | closed | 2026-07-22 -> 2026-07-30 | 2 lines | 59350 | emp-153",
        "PO-2026-10020 sup-199 EUR | received | 2026-08-04 -> 2026-08-20 | 2 lines | 106625 | emp-161",
      ]
    `);
  });

  it('invoices: the first one in full, then a compact line per row', () => {
    expect(makeInvoices(1)[0]).toMatchInlineSnapshot(`
      {
        "currency": "EUR",
        "customerId": "cus-901",
        "dueDate": "2026-07-04",
        "id": "inv-1",
        "issueDate": "2026-06-04",
        "number": "INV-2026-10001",
        "paidOn": "2026-06-05",
        "salesOrderId": "so-1",
        "status": "paid",
        "totalMinor": 414264,
      }
    `);
    expect(
      makeInvoices(ROWS).map(
        (i) => `${i.number} ${i.salesOrderId} ${i.customerId} ${i.currency} | ${i.status} | ${i.issueDate} due ${i.dueDate} paid ${i.paidOn} | ${i.totalMinor}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "INV-2026-10001 so-1 cus-901 EUR | paid | 2026-06-04 due 2026-07-04 paid 2026-06-05 | 414264",
        "INV-2026-10002 so-2 cus-704 EUR | paid | 2026-01-27 due 2026-02-26 paid 2026-03-09 | 1310306",
        "INV-2026-10003 so-3 cus-524 EUR | overdue | 2026-03-14 due 2026-03-29 paid null | 1104810",
        "INV-2026-10004 so-4 cus-844 EUR | paid | 2026-02-09 due 2026-04-10 paid 2026-03-09 | 176187",
        "INV-2026-10005 so-5 cus-975 EUR | disputed | 2026-06-10 due 2026-07-10 paid null | 33179",
        "INV-2026-10006 so-7 cus-845 USD | issued | 2026-09-12 due 2026-11-11 paid null | 45850",
        "INV-2026-10007 so-9 cus-901 EUR | overdue | 2026-04-07 due 2026-05-07 paid null | 756152",
        "INV-2026-10008 so-10 cus-464 EUR | paid | 2026-03-20 due 2026-04-04 paid 2026-04-02 | 38000",
        "INV-2026-10009 so-11 cus-389 EUR | issued | 2026-09-23 due 2026-10-23 paid null | 1997760",
        "INV-2026-10010 so-13 cus-96 USD | paid | 2026-06-13 due 2026-08-12 paid 2026-08-22 | 422851",
        "INV-2026-10011 so-17 cus-9 EUR | paid | 2026-06-03 due 2026-07-18 paid 2026-07-21 | 416110",
        "INV-2026-10012 so-18 cus-31 EUR | paid | 2026-08-31 due 2026-09-30 paid 2026-10-07 | 679919",
        "INV-2026-10013 so-19 cus-976 EUR | overdue | 2026-06-05 due 2026-07-20 paid null | 74873",
        "INV-2026-10014 so-29 cus-88 EUR | paid | 2026-09-02 due 2026-09-17 paid 2026-09-02 | 258998",
        "INV-2026-10015 so-31 cus-77 EUR | paid | 2026-01-22 due 2026-02-21 paid 2026-03-05 | 71343",
        "INV-2026-10016 so-33 cus-174 EUR | paid | 2026-10-03 due 2026-11-02 paid 2026-10-11 | 378405",
        "INV-2026-10017 so-34 cus-861 EUR | overdue | 2026-08-03 due 2026-09-17 paid null | 1951114",
        "INV-2026-10018 so-35 cus-510 EUR | paid | 2026-09-23 due 2026-10-23 paid 2026-10-08 | 3980",
        "INV-2026-10019 so-36 cus-383 GBP | paid | 2026-07-29 due 2026-08-28 paid 2026-07-30 | 72650",
        "INV-2026-10020 so-39 cus-188 GBP | issued | 2026-09-05 due 2026-10-20 paid null | 109295",
      ]
    `);
  });

  it('support cases: the first one with its comments, then a compact line per row', () => {
    expect(getSupportCase('cs-1')).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-109",
        "commentCount": 5,
        "comments": [
          {
            "authorId": "cus-779-con-1",
            "authorKind": "customer",
            "authorName": "Martina Conti",
            "id": "cs-1-cmt-1",
            "postedAt": "2026-05-21T01:31",
            "text": "Thank you for the quick reply, that solves it for us.",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-2",
            "postedAt": "2026-05-21T12:17",
            "text": "Could you send a photo of the label and of the damaged packaging?",
          },
          {
            "authorId": "cus-779-con-3",
            "authorKind": "customer",
            "authorName": "Giulia Sala",
            "id": "cs-1-cmt-3",
            "postedAt": "2026-05-21T23:47",
            "text": "Our quality department needs the batch certificate before the goods can be released.",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-4",
            "postedAt": "2026-05-22T11:38",
            "text": "I have asked the supplier for the certificate and will forward it as soon as I have it. Please let me know if the replacement arrives complete, and I will close the case. The item is back in stock at our distribution center and can ship tomorrow.",
          },
          {
            "authorId": "cus-779-con-2",
            "authorKind": "customer",
            "authorName": "Matteo Costa",
            "id": "cs-1-cmt-5",
            "postedAt": "2026-05-24T01:09",
            "text": "Please send a credit note or a replacement, whichever is faster.",
          },
        ],
        "customerId": "cus-779",
        "id": "cs-1",
        "number": "CS-10001",
        "openedOn": "2026-05-21",
        "priority": "high",
        "productId": "prd-544",
        "slaDueDate": "2026-05-23",
        "status": "closed",
        "subject": "Return request for HYD-10544",
      }
    `);
    expect(
      makeSupportCases(ROWS).map(
        (c) => `${c.number} ${c.customerId} ${c.productId} | ${c.priority} ${c.status} | ${c.assigneeId} | ${c.openedOn} sla ${c.slaDueDate} | ${c.commentCount} comments | ${c.subject}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "CS-10001 cus-779 prd-544 | high closed | emp-109 | 2026-05-21 sla 2026-05-23 | 5 comments | Return request for HYD-10544",
        "CS-10002 cus-975 prd-333 | normal resolved | emp-125 | 2026-09-03 sla 2026-09-08 | 6 comments | Delivery of FAS-10333 is late",
        "CS-10003 cus-232 prd-831 | low pending | emp-117 | 2026-10-04 sla 2026-10-14 | 2 comments | Delivery of ABR-10831 is late",
        "CS-10004 cus-566 prd-262 | normal resolved | emp-119 | 2026-10-09 sla 2026-10-14 | 3 comments | Substitute for FAS-10262 after the order was cancelled",
        "CS-10005 cus-809 prd-276 | normal open | emp-120 | 2026-10-06 sla 2026-10-11 | 6 comments | Certificate of conformity missing for BRG-10276",
        "CS-10006 cus-215 prd-918 | normal open | emp-101 | 2026-10-13 sla 2026-10-18 | 3 comments | Substitute for HYD-10918 after the order was cancelled",
        "CS-10007 cus-33 prd-969 | normal resolved | emp-101 | 2026-09-21 sla 2026-09-26 | 5 comments | Return request for BRG-10969",
        "CS-10008 cus-80 prd-68 | high resolved | emp-105 | 2026-09-01 sla 2026-09-03 | 5 comments | Wrong quantity delivered for LUB-10068",
        "CS-10009 cus-133 prd-574 | high pending | emp-18 | 2026-10-06 sla 2026-10-08 | 3 comments | Quotation request for FAS-10574",
        "CS-10010 cus-665 prd-59 | high pending | emp-101 | 2026-10-09 sla 2026-10-11 | 6 comments | Damaged packaging on FAS-10059",
        "CS-10011 cus-137 prd-288 | normal open | emp-124 | 2026-10-01 sla 2026-10-06 | 3 comments | Technical data sheet needed for PPE-10288",
        "CS-10012 cus-979 prd-538 | low pending | emp-117 | 2026-09-15 sla 2026-09-25 | 4 comments | Wrong quantity delivered for FAS-10538",
        "CS-10013 cus-314 prd-887 | normal pending | emp-111 | 2026-09-17 sla 2026-09-22 | 6 comments | Quotation request for FAS-10887",
        "CS-10014 cus-479 prd-733 | normal open | emp-122 | 2026-09-27 sla 2026-10-02 | 3 comments | Invoice price of FAS-10733 does not match the quotation",
        "CS-10015 cus-930 prd-460 | normal pending | emp-102 | 2026-10-11 sla 2026-10-16 | 3 comments | Return request for ELE-10460",
        "CS-10016 cus-630 prd-711 | urgent open | emp-21 | 2026-10-12 sla 2026-10-13 | 4 comments | Quotation request for PPE-10711",
        "CS-10017 cus-503 prd-648 | normal pending | emp-107 | 2026-10-10 sla 2026-10-15 | 5 comments | Wrong quantity delivered for ELE-10648",
        "CS-10018 cus-247 prd-44 | high pending | emp-110 | 2026-10-09 sla 2026-10-11 | 3 comments | Technical data sheet needed for FAS-10044",
        "CS-10019 cus-818 prd-586 | normal open | emp-115 | 2026-09-26 sla 2026-10-01 | 4 comments | Return request for HTL-10586",
        "CS-10020 cus-709 prd-19 | normal open | emp-109 | 2026-09-26 sla 2026-10-01 | 2 comments | Invoice price of FAS-10019 does not match the quotation",
      ]
    `);
  });

  it('a case with several comments, in full (thread order, authors, timestamps, text)', () => {
    const threaded = makeSupportCases(50).find((c) => c.commentCount >= 4)!;
    expect(getSupportCase(threaded.id)).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-109",
        "commentCount": 5,
        "comments": [
          {
            "authorId": "cus-779-con-1",
            "authorKind": "customer",
            "authorName": "Martina Conti",
            "id": "cs-1-cmt-1",
            "postedAt": "2026-05-21T01:31",
            "text": "Thank you for the quick reply, that solves it for us.",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-2",
            "postedAt": "2026-05-21T12:17",
            "text": "Could you send a photo of the label and of the damaged packaging?",
          },
          {
            "authorId": "cus-779-con-3",
            "authorKind": "customer",
            "authorName": "Giulia Sala",
            "id": "cs-1-cmt-3",
            "postedAt": "2026-05-21T23:47",
            "text": "Our quality department needs the batch certificate before the goods can be released.",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-4",
            "postedAt": "2026-05-22T11:38",
            "text": "I have asked the supplier for the certificate and will forward it as soon as I have it. Please let me know if the replacement arrives complete, and I will close the case. The item is back in stock at our distribution center and can ship tomorrow.",
          },
          {
            "authorId": "cus-779-con-2",
            "authorKind": "customer",
            "authorName": "Matteo Costa",
            "id": "cs-1-cmt-5",
            "postedAt": "2026-05-24T01:09",
            "text": "Please send a credit note or a replacement, whichever is faster.",
          },
        ],
        "customerId": "cus-779",
        "id": "cs-1",
        "number": "CS-10001",
        "openedOn": "2026-05-21",
        "priority": "high",
        "productId": "prd-544",
        "slaDueDate": "2026-05-23",
        "status": "closed",
        "subject": "Return request for HYD-10544",
      }
    `);
  });
});
