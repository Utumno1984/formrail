// @vitest-environment node
// Golden values of the transactional documents (ticket #514): the exact records the stories,
// examples, e2e scenarios and visual baselines will inherit. Same rule as `golden.test.ts`: update
// these snapshots only on purpose, and say why in the PR (what changed and which stories or
// baselines are affected). Never just to turn a red test green.
import { daysBetween, DEMO_TODAY } from './dates';
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
        "number": "SO-2026-147000001",
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
        "SO-2026-147000001 cus-901 EUR | invoiced | 2026-05-27 -> 2026-06-10 | 3 lines | 414264 | emp-92",
        "SO-2026-018000002 cus-704 EUR | invoiced | 2026-01-18 -> 2026-03-03 | 6 lines | 1310306 | emp-80",
        "SO-2026-056000003 cus-524 EUR | invoiced | 2026-02-25 -> 2026-04-06 | 18 lines | 1104810 | emp-373",
        "SO-2026-038000004 cus-844 EUR | invoiced | 2026-02-07 -> 2026-03-07 | 6 lines | 176187 | emp-80",
        "SO-2026-144000005 cus-975 EUR | invoiced | 2026-05-24 -> 2026-06-29 | 1 lines | 33179 | emp-13",
        "SO-2026-282000006 cus-766 EUR | draft | 2026-10-09 -> 2026-11-08 | 2 lines | 417285 | emp-80",
        "SO-2026-245000007 cus-845 USD | invoiced | 2026-09-02 -> 2026-10-03 | 1 lines | 45850 | emp-67",
        "SO-2026-233000008 cus-144 EUR | shipped | 2026-08-21 -> 2026-09-25 | 2 lines | 434000 | emp-70",
        "SO-2026-088000009 cus-901 EUR | invoiced | 2026-03-29 -> 2026-05-05 | 4 lines | 756152 | emp-92",
        "SO-2026-062000010 cus-464 EUR | invoiced | 2026-03-03 -> 2026-03-23 | 1 lines | 38000 | emp-58",
        "SO-2026-247000011 cus-389 EUR | invoiced | 2026-09-04 -> 2026-09-20 | 18 lines | 1997760 | emp-350",
        "SO-2026-255000012 cus-813 EUR | shipped | 2026-09-12 -> 2026-10-26 | 4 lines | 2426034 | emp-350",
        "SO-2026-161000013 cus-96 USD | invoiced | 2026-06-10 -> 2026-07-08 | 4 lines | 422851 | emp-389",
        "SO-2026-248000014 cus-784 EUR | shipped | 2026-09-05 -> 2026-09-13 | 4 lines | 139055 | emp-355",
        "SO-2026-265000015 cus-610 EUR | confirmed | 2026-09-22 -> 2026-10-21 | 2 lines | 65185 | emp-353",
        "SO-2026-281000016 cus-181 EUR | draft | 2026-10-08 -> 2026-10-21 | 2 lines | 61370 | emp-355",
        "SO-2026-145000017 cus-9 EUR | invoiced | 2026-05-25 -> 2026-06-07 | 4 lines | 416110 | emp-360",
        "SO-2026-233000018 cus-31 EUR | invoiced | 2026-08-21 -> 2026-09-25 | 5 lines | 679919 | emp-378",
        "SO-2026-138000019 cus-976 EUR | invoiced | 2026-05-18 -> 2026-06-23 | 6 lines | 74873 | emp-359",
        "SO-2026-257000020 cus-313 EUR | shipped | 2026-09-14 -> 2026-09-30 | 5 lines | 1830525 | emp-352",
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
        "number": "PO-2026-264000001",
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
        "PO-2026-264000001 sup-83 EUR | received | 2026-09-21 -> 2026-10-11 | 8 lines | 4215100 | emp-150",
        "PO-2026-248000002 sup-94 EUR | sent | 2026-09-05 -> 2026-09-29 | 1 lines | 318345 | emp-155",
        "PO-2026-275000003 sup-143 EUR | sent | 2026-10-02 -> 2026-10-17 | 6 lines | 14139862 | emp-164",
        "PO-2026-283000004 sup-125 GBP | draft | 2026-10-10 -> 2026-10-15 | 2 lines | 481500 | emp-163",
        "PO-2026-013000005 sup-127 USD | closed | 2026-01-13 -> 2026-02-22 | 8 lines | 4087682 | emp-143",
        "PO-2025-298000006 sup-197 EUR | closed | 2025-10-25 -> 2025-11-11 | 1 lines | 283725 | emp-142",
        "PO-2026-216000007 sup-173 EUR | received | 2026-08-04 -> 2026-08-15 | 1 lines | 74812 | emp-134",
        "PO-2026-177000008 sup-86 EUR | closed | 2026-06-26 -> 2026-07-09 | 4 lines | 375380 | emp-25",
        "PO-2026-259000009 sup-67 EUR | sent | 2026-09-16 -> 2026-09-21 | 1 lines | 447300 | emp-140",
        "PO-2026-074000010 sup-141 EUR | closed | 2026-03-15 -> 2026-03-26 | 1 lines | 335700 | emp-132",
        "PO-2026-111000011 sup-48 GBP | closed | 2026-04-21 -> 2026-04-26 | 8 lines | 5638837 | emp-155",
        "PO-2026-174000012 sup-161 EUR | closed | 2026-06-23 -> 2026-07-05 | 2 lines | 201580 | emp-147",
        "PO-2026-211000013 sup-15 EUR | received | 2026-07-30 -> 2026-08-18 | 5 lines | 879495 | emp-148",
        "PO-2026-250000014 sup-142 EUR | sent | 2026-09-07 -> 2026-09-27 | 4 lines | 193217 | emp-152",
        "PO-2026-248000015 sup-167 USD | received | 2026-09-05 -> 2026-10-08 | 1 lines | 713575 | emp-27",
        "PO-2026-264000016 sup-199 EUR | received | 2026-09-21 -> 2026-10-07 | 5 lines | 1756662 | emp-161",
        "PO-2026-283000017 sup-61 EUR | draft | 2026-10-10 -> 2026-11-02 | 4 lines | 622031 | emp-27",
        "PO-2026-260000018 sup-80 EUR | sent | 2026-09-17 -> 2026-10-08 | 5 lines | 336766 | emp-136",
        "PO-2026-203000019 sup-5 EUR | closed | 2026-07-22 -> 2026-07-30 | 2 lines | 59350 | emp-153",
        "PO-2026-216000020 sup-199 EUR | received | 2026-08-04 -> 2026-08-20 | 2 lines | 106625 | emp-161",
      ]
    `);
  });

  it('invoices: the first one in full, then a compact line per row', () => {
    expect(makeInvoices(1)[0]).toMatchInlineSnapshot(`
      {
        "currency": "EUR",
        "customerId": "cus-901",
        "dueDate": "2026-07-12",
        "id": "inv-1",
        "issueDate": "2026-06-12",
        "number": "INV-2026-163000001",
        "paidOn": "2026-06-13",
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
        "INV-2026-163000001 so-1 cus-901 EUR | paid | 2026-06-12 due 2026-07-12 paid 2026-06-13 | 414264",
        "INV-2026-064000002 so-2 cus-704 EUR | paid | 2026-03-05 due 2026-04-04 paid 2026-04-15 | 1310306",
        "INV-2026-100000003 so-3 cus-524 EUR | overdue | 2026-04-10 due 2026-04-25 paid null | 1104810",
        "INV-2026-066000004 so-4 cus-844 EUR | paid | 2026-03-07 due 2026-05-06 paid 2026-04-04 | 176187",
        "INV-2026-185000005 so-5 cus-975 EUR | disputed | 2026-07-04 due 2026-08-03 paid null | 33179",
        "INV-2026-278000006 so-7 cus-845 USD | issued | 2026-10-05 due 2026-12-04 paid null | 45850",
        "INV-2026-127000007 so-9 cus-901 EUR | overdue | 2026-05-07 due 2026-06-06 paid null | 756152",
        "INV-2026-086000008 so-10 cus-464 EUR | paid | 2026-03-27 due 2026-04-11 paid 2026-04-09 | 38000",
        "INV-2026-268000009 so-11 cus-389 EUR | issued | 2026-09-25 due 2026-10-25 paid null | 1997760",
        "INV-2026-189000010 so-13 cus-96 USD | paid | 2026-07-08 due 2026-09-06 paid 2026-09-16 | 422851",
        "INV-2026-160000011 so-17 cus-9 EUR | paid | 2026-06-09 due 2026-07-24 paid 2026-07-27 | 416110",
        "INV-2026-270000012 so-18 cus-31 EUR | issued | 2026-09-27 due 2026-10-27 paid null | 679919",
        "INV-2026-179000013 so-19 cus-976 EUR | overdue | 2026-06-28 due 2026-08-12 paid null | 74873",
        "INV-2026-266000014 so-29 cus-88 EUR | paid | 2026-09-23 due 2026-10-08 paid 2026-09-23 | 258998",
        "INV-2026-052000015 so-31 cus-77 EUR | paid | 2026-02-21 due 2026-03-23 paid 2026-04-04 | 71343",
        "INV-2026-273000016 so-33 cus-174 EUR | paid | 2026-09-30 due 2026-10-30 paid 2026-10-10 | 378405",
        "INV-2026-244000017 so-34 cus-861 EUR | issued | 2026-09-01 due 2026-10-16 paid null | 1951114",
        "INV-2026-278000018 so-35 cus-510 EUR | paid | 2026-10-05 due 2026-11-04 paid 2026-10-12 | 3980",
        "INV-2026-241000019 so-36 cus-383 GBP | paid | 2026-08-29 due 2026-09-28 paid 2026-08-30 | 72650",
        "INV-2026-270000020 so-39 cus-188 GBP | issued | 2026-09-27 due 2026-11-11 paid null | 109295",
      ]
    `);
  });

  it('support cases: the first one with its comments, then a compact line per row', () => {
    expect(getSupportCase('cs-1')).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-109",
        "commentCount": 4,
        "comments": [
          {
            "authorId": "cus-779-con-3",
            "authorKind": "customer",
            "authorName": "Giulia Sala",
            "id": "cs-1-cmt-1",
            "postedAt": "2026-05-21T10:07",
            "text": "We would like to return the HYD-10544 we received, it is not what we need. The order was placed by e-mail last month.",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-2",
            "postedAt": "2026-05-21T13:41",
            "text": "I can arrange the return of HYD-10544; I am checking the return conditions of your order.",
          },
          {
            "authorId": "cus-779-con-3",
            "authorKind": "customer",
            "authorName": "Giulia Sala",
            "id": "cs-1-cmt-3",
            "postedAt": "2026-05-22T14:40",
            "text": "Could you give us an update today?",
          },
          {
            "authorId": "emp-109",
            "authorKind": "employee",
            "authorName": "Aaron Holloway",
            "id": "cs-1-cmt-4",
            "postedAt": "2026-05-26T16:28",
            "text": "The collection of HYD-10544 is booked with the carrier for your site. I am closing this case, please open a new one if you need anything else.",
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
        "CS-10001 cus-779 prd-544 | high closed | emp-109 | 2026-05-21 sla 2026-05-23 | 4 comments | Return request for HYD-10544",
        "CS-10002 cus-976 prd-333 | normal resolved | emp-125 | 2026-09-03 sla 2026-09-08 | 6 comments | Delivery of FAS-10333 is late",
        "CS-10003 cus-235 prd-831 | low pending | emp-117 | 2026-10-04 sla 2026-10-14 | 2 comments | Delivery of ABR-10831 is late",
        "CS-10004 cus-571 prd-262 | normal resolved | emp-119 | 2026-10-09 sla 2026-10-14 | 2 comments | Substitute needed for FAS-10262",
        "CS-10005 cus-811 prd-276 | normal open | emp-120 | 2026-10-06 sla 2026-10-11 | 5 comments | Certificate of conformity missing for BRG-10276",
        "CS-10006 cus-217 prd-918 | normal open | emp-101 | 2026-10-13 sla 2026-10-18 | 3 comments | Substitute needed for HYD-10918",
        "CS-10007 cus-32 prd-969 | normal resolved | emp-101 | 2026-09-21 sla 2026-09-26 | 6 comments | Return request for BRG-10969",
        "CS-10008 cus-82 prd-68 | high resolved | emp-105 | 2026-09-01 sla 2026-09-03 | 4 comments | Wrong quantity delivered for LUB-10068",
        "CS-10009 cus-133 prd-574 | high pending | emp-18 | 2026-10-06 sla 2026-10-08 | 4 comments | Quotation request for FAS-10574",
        "CS-10010 cus-670 prd-59 | high pending | emp-101 | 2026-10-09 sla 2026-10-11 | 6 comments | Damaged packaging on FAS-10059",
        "CS-10011 cus-136 prd-288 | normal open | emp-124 | 2026-10-01 sla 2026-10-06 | 3 comments | Technical data sheet needed for PPE-10288",
        "CS-10012 cus-979 prd-538 | low pending | emp-117 | 2026-09-15 sla 2026-09-25 | 4 comments | Wrong quantity delivered for FAS-10538",
        "CS-10013 cus-316 prd-887 | normal pending | emp-111 | 2026-09-17 sla 2026-09-22 | 6 comments | Quotation request for FAS-10887",
        "CS-10014 cus-483 prd-733 | normal open | emp-122 | 2026-09-27 sla 2026-10-02 | 3 comments | Invoice price of FAS-10733 does not match the quotation",
        "CS-10015 cus-932 prd-460 | normal pending | emp-102 | 2026-10-11 sla 2026-10-16 | 4 comments | Return request for ELE-10460",
        "CS-10016 cus-635 prd-711 | urgent open | emp-21 | 2026-10-12 sla 2026-10-13 | 3 comments | Quotation request for PPE-10711",
        "CS-10017 cus-508 prd-648 | normal pending | emp-107 | 2026-10-10 sla 2026-10-15 | 6 comments | Wrong quantity delivered for ELE-10648",
        "CS-10018 cus-251 prd-44 | high pending | emp-110 | 2026-10-09 sla 2026-10-11 | 4 comments | Technical data sheet needed for FAS-10044",
        "CS-10019 cus-819 prd-586 | normal open | emp-115 | 2026-09-26 sla 2026-10-01 | 5 comments | Return request for HTL-10586",
        "CS-10020 cus-714 prd-19 | normal open | emp-109 | 2026-09-26 sla 2026-10-01 | 3 comments | Invoice price of FAS-10019 does not match the quotation",
      ]
    `);
  });

  // The records below are picked by a rule, not by id, and are never cs-1 (the first record of the other
  // goldens): a thread, a young case with several comments (the tightest time budget) and a `new` case
  // that is already assigned (the branch that decides who owns a fresh case).
  it('a case with several comments, in full (thread order, authors, timestamps, text)', () => {
    const threaded = makeSupportCases(200).find((c) => c.id !== 'cs-1' && c.commentCount >= 4)!;
    expect(getSupportCase(threaded.id)).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-125",
        "commentCount": 6,
        "comments": [
          {
            "authorId": "cus-976-con-1",
            "authorKind": "customer",
            "authorName": "Åsa Lund",
            "id": "cs-2-cmt-1",
            "postedAt": "2026-09-03T08:14",
            "text": "The delivery of FAS-10333 has not arrived and the promised date has passed.",
          },
          {
            "authorId": "emp-125",
            "authorKind": "employee",
            "authorName": "Anouk de Vries",
            "id": "cs-2-cmt-2",
            "postedAt": "2026-09-03T12:21",
            "text": "I have checked the history of your orders. I can send FAS-10333 again by express courier, at our cost. Would that work for you?",
          },
          {
            "authorId": "cus-976-con-1",
            "authorKind": "customer",
            "authorName": "Åsa Lund",
            "id": "cs-2-cmt-3",
            "postedAt": "2026-09-03T17:30",
            "text": "That works for us, thank you.",
          },
          {
            "authorId": "emp-125",
            "authorKind": "employee",
            "authorName": "Anouk de Vries",
            "id": "cs-2-cmt-4",
            "postedAt": "2026-09-08T10:15",
            "text": "Thank you, I have started it and will confirm when it is done.",
          },
          {
            "authorId": "cus-976-con-1",
            "authorKind": "customer",
            "authorName": "Åsa Lund",
            "id": "cs-2-cmt-5",
            "postedAt": "2026-09-10T12:15",
            "text": "Could you give us an update today?",
          },
          {
            "authorId": "emp-125",
            "authorKind": "employee",
            "authorName": "Anouk de Vries",
            "id": "cs-2-cmt-6",
            "postedAt": "2026-09-10T14:42",
            "text": "The goods of FAS-10333 were sent by express courier and have arrived at your site. I have updated the records of your account. Your account manager has been informed of the solution. Please keep the case number for your records. The service team works from Monday to Friday. A colleague has double-checked the solution. The solution is recorded in the history of this case. Thank you for contacting us.",
          },
        ],
        "customerId": "cus-976",
        "id": "cs-2",
        "number": "CS-10002",
        "openedOn": "2026-09-03",
        "priority": "normal",
        "productId": "prd-333",
        "slaDueDate": "2026-09-08",
        "status": "resolved",
        "subject": "Delivery of FAS-10333 is late",
      }
    `);
  });

  it('a case opened 0-2 days ago with at least 3 comments, in full', () => {
    const young = makeSupportCases(500).find((c) => c.commentCount >= 3 && daysBetween(c.openedOn, DEMO_TODAY) <= 2)!;
    expect(getSupportCase(young.id)).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-101",
        "commentCount": 3,
        "comments": [
          {
            "authorId": "cus-217-con-1",
            "authorKind": "customer",
            "authorName": "Daiki Hayashi",
            "id": "cs-6-cmt-1",
            "postedAt": "2026-10-13T10:50",
            "text": "HYD-10918 is no longer available from our usual source, do you have an equivalent? We have already informed our purchasing manager.",
          },
          {
            "authorId": "emp-101",
            "authorKind": "employee",
            "authorName": "Olivia Holloway",
            "id": "cs-6-cmt-2",
            "postedAt": "2026-10-14T09:44",
            "text": "I am looking for an equivalent of HYD-10918 in our current catalogue. I have added a note to your account. I have asked a colleague to help me with it. You can reply to this message at any time. I have checked the history of your orders. I am available by phone during working hours. I will write again as soon as I have news. I will follow this case personally until it is solved.",
          },
          {
            "authorId": "cus-217-con-1",
            "authorKind": "customer",
            "authorName": "Daiki Hayashi",
            "id": "cs-6-cmt-3",
            "postedAt": "2026-10-15T12:18",
            "text": "Could you give us an update today?",
          },
        ],
        "customerId": "cus-217",
        "id": "cs-6",
        "number": "CS-10006",
        "openedOn": "2026-10-13",
        "priority": "normal",
        "productId": "prd-918",
        "slaDueDate": "2026-10-18",
        "status": "open",
        "subject": "Substitute needed for HYD-10918",
      }
    `);
  });

  it('a new case that is already assigned, in full', () => {
    const fresh = makeSupportCases(200).find((c) => c.status === 'new' && c.assigneeId !== null && c.commentCount === 1)!;
    expect(getSupportCase(fresh.id)).toMatchInlineSnapshot(`
      {
        "assigneeId": "emp-121",
        "commentCount": 1,
        "comments": [
          {
            "authorId": "cus-50-con-3",
            "authorKind": "customer",
            "authorName": "Mikkel Nyberg",
            "id": "cs-182-cmt-1",
            "postedAt": "2026-10-12T09:05",
            "text": "Could you send us a quotation for FAS-10643, for the quantity we usually order?",
          },
        ],
        "customerId": "cus-50",
        "id": "cs-182",
        "number": "CS-10182",
        "openedOn": "2026-10-12",
        "priority": "low",
        "productId": "prd-643",
        "slaDueDate": "2026-10-22",
        "status": "new",
        "subject": "Quotation request for FAS-10643",
      }
    `);
  });
});
