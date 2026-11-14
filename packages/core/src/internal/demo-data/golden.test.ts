// @vitest-environment node
// Golden values: the exact records the stories, examples, e2e scenarios and visual baselines inherit.
// The property tests elsewhere prove the data is coherent; these prove it has not CHANGED. Any edit to
// a generator, a seed, a rate, a name pool or the RNG fails here first.
//
// RULE: update these snapshots only on purpose, and say why in the PR (what changed and which
// stories/baselines are affected). Never update them just to make a red test green.
import { DEMO_COMPANY } from './company';
import { makeCustomers } from './customers';
import { makeEmployees } from './employees';
import { makeProducts } from './products';
import { makeSuppliers } from './suppliers';

const ROWS = 20;

describe('demo-data golden values', () => {
  it('employees: the first record in full, then a compact line per row', () => {
    // The company domain is masked: its name may appear in company.ts only (see sources.test.ts).
    const ceo = makeEmployees(1)[0]!;
    expect({ ...ceo, email: ceo.email.replace(DEMO_COMPANY.domain, '<company domain>') }).toMatchInlineSnapshot(`
      {
        "code": "E-1001",
        "department": "management",
        "email": "magdalena.dabrowska@<company domain>",
        "endDate": null,
        "entityId": "ent-nl",
        "firstName": "Magdalena",
        "fullName": "Magdalena Dąbrowska",
        "hireDate": "2012-01-26",
        "id": "emp-1",
        "lastName": "Dąbrowska",
        "managerId": null,
        "status": "active",
        "title": "Chief Executive Officer",
      }
    `);
    expect(
      makeEmployees(ROWS).map((e) => `${e.id} ${e.fullName} | ${e.title} | ${e.entityId} | ${e.managerId} | ${e.status} | ${e.hireDate}`),
    ).toMatchInlineSnapshot(`
      [
        "emp-1 Magdalena Dąbrowska | Chief Executive Officer | ent-nl | null | active | 2012-01-26",
        "emp-2 Florian Müller | Head of Sales | ent-nl | emp-1 | active | 2010-02-13",
        "emp-3 Joost Smit | Head of Customer Service | ent-nl | emp-1 | active | 2009-04-12",
        "emp-4 Koen Brouwer | Head of Procurement | ent-nl | emp-1 | active | 2009-03-07",
        "emp-5 José Molina | Head of Logistics | ent-nl | emp-1 | active | 2018-08-05",
        "emp-6 Birgit Brandt | Chief Financial Officer | ent-nl | emp-1 | active | 2011-07-10",
        "emp-7 Stefan Müller | Chief Information Officer | ent-nl | emp-1 | active | 2026-05-29",
        "emp-8 Matthias Wagner | Head of People | ent-nl | emp-1 | active | 2016-09-08",
        "emp-9 Rubén Peña | Head of Marketing | ent-nl | emp-1 | active | 2016-05-26",
        "emp-10 Giulia Gatti | Regional Sales Manager | ent-nl | emp-2 | active | 2024-12-04",
        "emp-11 Grace Foster | Regional Sales Manager | ent-us | emp-2 | active | 2025-10-31",
        "emp-12 Owen Reed | Regional Sales Manager | ent-gb | emp-2 | active | 2011-04-29",
        "emp-13 Birgit Vogel | Regional Sales Manager | ent-de | emp-2 | active | 2023-09-05",
        "emp-14 Olivia Ramsey | Regional Sales Manager | ent-jp | emp-2 | active | 2016-06-10",
        "emp-15 Niccolò Caruso | Regional Sales Manager | ent-nl | emp-2 | active | 2023-11-07",
        "emp-16 Sander Bakker | Customer Service Manager | ent-nl | emp-3 | active | 2014-01-25",
        "emp-17 Patrick Thompson | Customer Service Manager | ent-us | emp-3 | active | 2023-08-17",
        "emp-18 Hannah Holloway | Customer Service Manager | ent-gb | emp-3 | active | 2018-09-16",
        "emp-19 Jana Köhler | Customer Service Manager | ent-de | emp-3 | active | 2011-02-28",
        "emp-20 Hannah Walker | Customer Service Manager | ent-jp | emp-3 | active | 2018-03-06",
      ]
    `);
    // Leave and departures start at the team level: the first of each, with their dates.
    const employees = makeEmployees(400);
    const firstOf = (status: string) => employees.find((e) => e.status === status)!;
    expect([firstOf('on-leave'), firstOf('inactive')].map((e) => `${e.id} ${e.status} ${e.hireDate} ${e.endDate}`)).toMatchInlineSnapshot(`
      [
        "emp-93 on-leave 2025-08-27 null",
        "emp-112 inactive 2016-01-18 2025-04-06",
      ]
    `);
  });

  it('customers: the first record in full, then a compact line per row and the first of each status', () => {
    expect(makeCustomers(1)[0]).toMatchInlineSnapshot(`
      {
        "accountManagerId": "emp-363",
        "billingAddress": {
          "city": "Mechelen",
          "country": "BE",
          "line1": "Industrielaan 192",
          "line2": null,
          "postalCode": "2809",
          "region": null,
        },
        "code": "C-10001",
        "contacts": [
          {
            "email": "jeroen.vandenberg@hoevenstrand-coatings.example",
            "firstName": "Jeroen",
            "fullName": "Jeroen van den Berg",
            "id": "cus-1-con-1",
            "lastName": "van den Berg",
            "phone": "+32 15 000 0990",
            "primary": true,
            "role": "Purchasing Manager",
          },
        ],
        "country": "BE",
        "createdOn": "2015-04-07",
        "creditLimitMinor": 5000000,
        "currency": "EUR",
        "entityId": "ent-nl",
        "id": "cus-1",
        "industry": "chemicals-and-plastics",
        "name": "Hoevenstrand Coatings BV",
        "paymentTerms": "net-30",
        "status": "active",
        "website": "https://www.hoevenstrand-coatings.example",
      }
    `);
    expect(
      makeCustomers(ROWS).map(
        (c) => `${c.id} ${c.name} | ${c.billingAddress.city} ${c.billingAddress.postalCode} | ${c.currency} ${c.creditLimitMinor} ${c.paymentTerms} | ${c.status} ${c.createdOn} | ${c.accountManagerId} | ${c.contacts.length}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "cus-1 Hoevenstrand Coatings BV | Mechelen 2809 | EUR 5000000 net-30 | active 2015-04-07 | emp-363 | 1",
        "cus-2 Alcorvena Dairy S.A. | Valencia 46021 | EUR 2500000 net-30 | active 2019-10-03 | emp-352 | 1",
        "cus-3 Quillenbrook Components Corp. | Detroit 48201 | USD 2700000 net-30 | active 2020-07-23 | emp-389 | 1",
        "cus-4 Borgavella Tooling S.r.l. | Bologna 40139 | EUR 10000000 net-30 | active 2022-09-05 | emp-375 | 2",
        "cus-5 Marvesnil Logistics S.A. | Nantes 44290 | EUR 0 due-on-receipt | active 2017-05-24 | emp-362 | 1",
        "cus-6 Sorakane Construction Co., Ltd. | Nagoya 459-3625 | JPY 810000 net-60 | active 2025-04-17 | emp-82 | 1",
        "cus-7 Hathermoor Maintenance Corp. | Houston 77053 | USD 11000000 net-30 | active 2025-12-11 | emp-400 | 3",
        "cus-8 Lindrøvik Precision Parts AB | Göteborg 413 86 | EUR 5000000 net-30 | active 2024-07-27 | emp-367 | 2",
        "cus-9 Valfiorita Plastics S.r.l. | Bologna 40131 | EUR 25000000 net-45 | active 2024-03-12 | emp-360 | 1",
        "cus-10 Łąkomirz Freight Sp. z o.o. | Gdańsk 80-735 | EUR 2500000 net-30 | active 2016-07-29 | emp-13 | 1",
        "cus-11 Schwertling Power Systems GmbH | Graz 8035 | EUR 2500000 net-30 | archived 2016-03-31 | emp-13 | 2",
        "cus-12 Pievarossa Fabrication S.p.A. | Milano 20121 | EUR 10000000 net-15 | active 2019-08-30 | emp-380 | 2",
        "cus-13 Haselwende Water Services AG | Stuttgart 70225 | EUR 5000000 net-30 | active 2019-12-31 | emp-77 | 2",
        "cus-14 Kuilerdijk Brewing B.V. | Groningen 9720 HP | EUR 5000000 net-60 | active 2023-01-07 | emp-378 | 3",
        "cus-15 Dornelfeld Energy GmbH | Salzburg 5025 | EUR 1000000 net-30 | active 2014-10-03 | emp-76 | 2",
        "cus-16 Wolkenrieth Machining AG | Köln 50953 | EUR 10000000 net-60 | active 2018-11-17 | emp-79 | 2",
        "cus-17 Rossenmarch Builders Ltd | Cork T23 K1X9 | EUR 500000 net-30 | on-hold 2018-07-21 | emp-74 | 1",
        "cus-18 Norrowcroft Chemicals plc | Sheffield S31 2EZ | GBP 8500000 net-15 | active 2019-04-17 | emp-73 | 1",
        "cus-19 Lowenbray Dairy Ltd | Manchester M9 3HF | GBP 2100000 net-30 | active 2016-06-01 | emp-72 | 1",
        "cus-20 Châtelvorne Civil Works S.A. | Lyon 69003 | EUR 25000000 net-30 | active 2020-12-09 | emp-90 | 1",
      ]
    `);
    const customers = makeCustomers(50);
    expect(
      ['active', 'on-hold', 'archived'].map((status) => {
        const c = customers.find((row) => row.status === status)!;
        return `${c.id} ${c.status} ${c.createdOn}`;
      }),
    ).toMatchInlineSnapshot(`
      [
        "cus-1 active 2015-04-07",
        "cus-17 on-hold 2018-07-21",
        "cus-11 archived 2016-03-31",
      ]
    `);
    // One customer per currency, with its credit limit (pins the exchange rates and the rounding).
    expect(
      ['EUR', 'USD', 'GBP', 'JPY'].map((currency) => {
        const c = makeCustomers(200).find((row) => row.currency === currency && row.creditLimitMinor > 0)!;
        return `${c.id} ${c.currency} ${c.creditLimitMinor}`;
      }),
    ).toMatchInlineSnapshot(`
      [
        "cus-1 EUR 5000000",
        "cus-3 USD 2700000",
        "cus-18 GBP 8500000",
        "cus-6 JPY 810000",
      ]
    `);
  });

  it('suppliers: the first record in full, then a compact line per row', () => {
    expect(makeSuppliers(1)[0]).toMatchInlineSnapshot(`
      {
        "address": {
          "city": "Jönköping",
          "country": "SE",
          "line1": "Hamngatan 62",
          "line2": null,
          "postalCode": "553 90",
          "region": null,
        },
        "buyerId": "emp-141",
        "category": "hand-tools",
        "code": "V-20001",
        "contacts": [
          {
            "email": "andres.fernandez@grasvalla-hand-tools.example",
            "firstName": "Andrés",
            "fullName": "Andrés Fernández",
            "id": "sup-1-con-1",
            "lastName": "Fernández",
            "phone": "+46 36 000 0552",
            "primary": true,
            "role": "Accounts Receivable",
          },
        ],
        "country": "SE",
        "createdOn": "2014-09-25",
        "currency": "EUR",
        "id": "sup-1",
        "leadTimeDays": 20,
        "name": "Gräsvalla Hand Tools AB",
        "paymentTerms": "net-30",
        "status": "active",
        "website": "https://www.grasvalla-hand-tools.example",
      }
    `);
    expect(
      makeSuppliers(ROWS).map((s) => `${s.id} ${s.name} | ${s.category} | ${s.address.city} | ${s.currency} ${s.paymentTerms} | ${s.status} | ${s.buyerId}`),
    ).toMatchInlineSnapshot(`
      [
        "sup-1 Gräsvalla Hand Tools AB | hand-tools | Jönköping | EUR net-30 | active | emp-141",
        "sup-2 Quillenbrook Oil Works LLC | lubricants | Charlotte | USD net-30 | active | emp-25",
        "sup-3 Fontanérac Oil Works S.A. | lubricants | Toulouse | EUR net-30 | active | emp-137",
        "sup-4 Falkenzirn Hydraulics GmbH | hydraulics | Düsseldorf | EUR net-60 | onboarding | emp-165",
        "sup-5 Castelmirto Screw Works S.p.A. | fasteners | Milano | EUR net-30 | active | emp-153",
        "sup-6 Łąkomirz Air Systems Sp. z o.o. | pneumatics | Poznań | EUR net-60 | active | emp-26",
        "sup-7 Peñascura Lubricants S.L. | lubricants | Barcelona | EUR net-30 | active | emp-154",
        "sup-8 Holmskjær Sealants AS | adhesives | Oslo | EUR net-45 | active | emp-142",
        "sup-9 Benaguril Bearings S.A. | bearings | Barcelona | EUR net-45 | active | emp-24",
        "sup-10 Bjørkenvik Oil Works AS | lubricants | Trondheim | EUR net-45 | active | emp-25",
        "sup-11 Marvesnil Abrasives S.A. | abrasives | Lille | EUR net-30 | active | emp-131",
        "sup-12 Schwertling Hand Tools GmbH | hand-tools | Linz | EUR net-30 | active | emp-152",
        "sup-13 Pellingstow Cable Works Ltd | electrical | Galway | EUR net-30 | active | emp-130",
        "sup-14 Hathermoor Motion Parts Ltd | bearings | Galway | EUR net-30 | active | emp-164",
        "sup-15 Hoevenstrand Grinding Products B.V. | abrasives | Tilburg | EUR net-45 | active | emp-148",
        "sup-16 Brakkevliet Cable Works NV | electrical | Leuven | EUR net-30 | blocked | emp-146",
        "sup-17 Jaworzyczek Pneumatics Sp. z o.o. | pneumatics | Wrocław | EUR net-30 | active | emp-136",
        "sup-18 Borgavella Hydraulics S.r.l. | hydraulics | Milano | EUR net-30 | active | emp-139",
        "sup-19 Grabnowiecz Grinding Products Sp. z o.o. | abrasives | Wrocław | EUR net-60 | active | emp-150",
        "sup-20 Sorakane Oil Works Co., Ltd. | lubricants | Hamamatsu | JPY net-30 | active | emp-151",
      ]
    `);
  });

  it('products: the first record in full, then a compact line per row', () => {
    expect(makeProducts(1)[0]).toMatchInlineSnapshot(`
      {
        "category": "fasteners",
        "createdOn": "2022-02-09",
        "id": "prd-1",
        "listPriceMinor": {
          "EUR": 8745,
          "GBP": 7430,
          "JPY": 14170,
          "USD": 9445,
        },
        "name": "Socket head cap screw M16 × 12 mm, grade A2-70, box of 100",
        "reorderPoint": 20,
        "sku": "FAS-10001",
        "status": "active",
        "stock": [
          {
            "onHand": 44,
            "reserved": 11,
            "warehouseId": "wh-rtm",
          },
          {
            "onHand": 124,
            "reserved": 13,
            "warehouseId": "wh-cmh",
          },
          {
            "onHand": 29,
            "reserved": 1,
            "warehouseId": "wh-osa",
          },
        ],
        "supplierId": "sup-5",
        "unit": "box",
        "unitCostMinor": {
          "EUR": 6210,
          "GBP": 5280,
          "JPY": 10060,
          "USD": 6705,
        },
      }
    `);
    expect(
      makeProducts(ROWS).map(
        (p) =>
          `${p.sku} ${p.name} | ${p.status} | ${p.listPriceMinor.EUR}/${p.listPriceMinor.USD}/${p.listPriceMinor.GBP}/${p.listPriceMinor.JPY} | ${p.stock.map((s) => `${s.warehouseId}:${s.onHand}/${s.reserved}`).join(',')} | ${p.supplierId}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "FAS-10001 Socket head cap screw M16 × 12 mm, grade A2-70, box of 100 | active | 8745/9445/7430/14170 | wh-rtm:44/11,wh-cmh:124/13,wh-osa:29/1 | sup-5",
        "ELE-10002 Cable 4 × 6 mm², H05VV-F, 100 m | active | 64395/69545/54735/104320 | wh-rtm:209/40,wh-dui:113/0,wh-bhm:306/41 | sup-143",
        "ABR-10003 Cutting disc 125 × 3.0 mm for stone, box of 25 | active | 5285/5710/4495/8560 | wh-rtm:111/27,wh-dui:14/1,wh-bhm:290/6 | sup-155",
        "ELE-10004 Circuit breaker B40 A, 3-pole | active | 7380/7970/6275/11960 | wh-rtm:12/0,wh-dui:38/4,wh-bhm:92/21 | sup-143",
        "PTR-10005 V-belt SPZ 2000 mm | active | 5615/6060/4770/9090 | wh-rtm:0/0,wh-dui:247/42,wh-osa:213/55 | sup-43",
        "ELE-10006 Cable 2 × 1.5 mm², H07RN-F, 100 m | active | 18740/20240/15930/30360 | wh-rtm:0/0,wh-cmh:37/2,wh-osa:196/2 | sup-171",
        "FAS-10007 Hex bolt M5 × 50 mm, stainless A4, box of 100 | active | 1660/1790/1410/2690 | wh-rtm:110/20,wh-dui:242/7,wh-bhm:70/4,wh-cmh:75/9,wh-osa:186/36 | sup-189",
        "PNE-10008 Pneumatic cylinder ⌀63 × 160 mm | discontinued | 30050/32455/25545/48680 | wh-rtm:23/4 | sup-172",
        "FAS-10009 Hex bolt M10 × 30 mm, stainless A4, box of 100 | active | 5680/6135/4830/9200 | wh-bhm:1/0,wh-cmh:40/11 | sup-74",
        "FAS-10010 Hex bolt M6 × 40 mm, stainless A4, box of 100 | draft | 3310/3575/2815/5360 |  | sup-60",
        "HYD-10011 Hydraulic hose DN8, 350 bar, 2 m | active | 5515/5960/4690/8940 | wh-rtm:15/4,wh-dui:28/5,wh-bhm:28/1,wh-cmh:25/0 | sup-41",
        "BRG-10012 Deep-groove ball bearing 6302-ZZ | active | 1265/1365/1075/2050 | wh-rtm:12/4,wh-dui:40/5,wh-osa:34/8 | sup-137",
        "FAS-10013 Socket head cap screw M5 × 16 mm, grade 12.9, box of 100 | active | 2250/2430/1915/3650 | wh-rtm:0/0,wh-cmh:21/4,wh-osa:54/3 | sup-196",
        "FAS-10014 Socket head cap screw M12 × 30 mm, grade 10.9, box of 100 | active | 6975/7535/5930/11300 | wh-rtm:15/5,wh-dui:68/1,wh-bhm:42/4 | sup-178",
        "PNE-10015 Pneumatic cylinder ⌀63 × 100 mm | active | 32310/34895/27465/52340 | wh-rtm:0/0,wh-dui:2/0,wh-bhm:35/7 | sup-94",
        "PNE-10016 Polyurethane tubing 10 mm, black, 50 m | active | 7080/7645/6015/11470 | wh-rtm:52/17,wh-bhm:72/24,wh-cmh:29/2,wh-osa:35/4 | sup-128",
        "FAS-10017 Hex bolt M6 × 40 mm, hot-dip galvanized, box of 100 | active | 3325/3595/2830/5390 | wh-dui:158/39,wh-bhm:22/3,wh-cmh:95/31,wh-osa:111/22 | sup-5",
        "BRG-10018 Deep-groove ball bearing 6209, open | active | 4645/5020/3950/7530 | wh-rtm:14/2,wh-bhm:17/0 | sup-184",
        "FAS-10019 Socket head cap screw M6 × 20 mm, grade A2-70, box of 100 | active | 3535/3820/3005/5730 | wh-rtm:53/8,wh-dui:160/50,wh-cmh:85/19 | sup-126",
        "PTR-10020 Roller chain 06B-1, 5 m | active | 4120/4450/3505/6680 | wh-rtm:23/3,wh-cmh:69/20 | sup-43",
      ]
    `);
  });
});
