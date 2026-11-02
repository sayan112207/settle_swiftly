import type {
  AdvocatesResponse,
  EligibleResponse,
  MatterDetail,
  MatterSummary,
  ThreadEntry,
} from "@/lib/schemas/legal";

/**
 * Fixture data for Legal escalation and the matter record under
 * `VITE_USE_MOCKS=true`.
 *
 * The eligible list is exactly the reports fixture's 90+ aged debt — the same
 * six invoices, ₹3,00,000.00 in all — so the two screens never disagree about
 * the same money. A test holds them together. Pinned to the dashboard's
 * Monday, 17 Aug 2026.
 *
 * Advocates and the client businesses on the advocate side are fictional.
 */

export const LEGAL_AS_OF = "2026-08-17T09:12:00+05:30";

/** The org's name as the advocate side sees it. */
export const MOCK_CLIENT_NAME = "Meridian Traders Co";

const ACCOUNT_IDS = {
  sharma: "acc00007-0000-4000-8000-000000000007",
  bhavani: "acc00008-0000-4000-8000-000000000008",
  kaveri: "acc00009-0000-4000-8000-000000000009",
  vertex: "acc00010-0000-4000-8000-000000000010",
  raghav: "acc00012-0000-4000-8000-000000000012",
  pinnacle: "acc00005-0000-4000-8000-000000000005",
} as const;

/** Shared with the reports fixture's aged debt. */
export const LEGAL_INVOICE_IDS = {
  inv2103: "d0c00042-0000-4000-8000-000000002103",
  inv1876: "d0c00043-0000-4000-8000-000000001876",
  inv1733: "d0c00044-0000-4000-8000-000000001733",
  inv2015: "d0c00017-0000-4000-8000-000000002015",
  inv1691: "d0c00045-0000-4000-8000-000000001691",
  inv2008: "d0c00018-0000-4000-8000-000000002008",
  inv1290: "d0c00063-0000-4000-8000-000000001290",
} as const;

export const ADVOCATE_IDS = {
  meera: "ad000001-0000-4000-8000-000000000001",
  vikram: "ad000002-0000-4000-8000-000000000002",
  farhan: "ad000003-0000-4000-8000-000000000003",
  rohan: "ad000004-0000-4000-8000-000000000004",
} as const;

export const MATTER_IDS = {
  sharma: "4a7e0001-0000-4000-8000-000000000001",
  bhavani: "4a7e0002-0000-4000-8000-000000000002",
  pinnacle: "4a7e0003-0000-4000-8000-000000000003",
  // Advocate-side matters from other client businesses.
  orbit: "4a7e0004-0000-4000-8000-000000000004",
  lakshmi: "4a7e0005-0000-4000-8000-000000000005",
  delta: "4a7e0006-0000-4000-8000-000000000006",
} as const;

const OPEN_MATTER = "A matter is already open for this invoice.";

export const eligibleFixture: EligibleResponse = {
  as_of: LEGAL_AS_OF,
  seller: { udyam_registered: true, enterprise_size: "small", is_trader: false },
  open_matter_count: 2,
  items: [
    {
      invoice_id: LEGAL_INVOICE_IDS.inv1876,
      invoice_number: "INV-1876",
      account_id: ACCOUNT_IDS.kaveri,
      account_name: "Kaveri & Sons",
      amount_outstanding: "72000.00",
      days_overdue: 108,
      follow_ups: 5,
      last_contact_on: "2026-07-08",
      lock: null,
    },
    {
      invoice_id: LEGAL_INVOICE_IDS.inv1733,
      invoice_number: "INV-1733",
      account_id: ACCOUNT_IDS.raghav,
      account_name: "Raghav & Co Traders",
      amount_outstanding: "45000.00",
      days_overdue: 102,
      follow_ups: 7,
      last_contact_on: "2026-07-31",
      lock: null,
    },
    {
      invoice_id: LEGAL_INVOICE_IDS.inv2103,
      invoice_number: "INV-2103",
      account_id: ACCOUNT_IDS.vertex,
      account_name: "Vertex Labs Pvt Ltd",
      amount_outstanding: "110000.00",
      days_overdue: 96,
      follow_ups: 4,
      last_contact_on: "2026-07-20",
      lock: {
        reason: "Disputed — resolve the customer's query before escalating.",
        matter_id: null,
      },
    },
    {
      invoice_id: LEGAL_INVOICE_IDS.inv2015,
      invoice_number: "INV-2015",
      account_id: ACCOUNT_IDS.sharma,
      account_name: "Sharma Traders Pvt Ltd",
      amount_outstanding: "30000.00",
      days_overdue: 94,
      follow_ups: 6,
      last_contact_on: "2026-07-24",
      lock: { reason: OPEN_MATTER, matter_id: MATTER_IDS.sharma },
    },
    {
      invoice_id: LEGAL_INVOICE_IDS.inv1691,
      invoice_number: "INV-1691",
      account_id: ACCOUNT_IDS.bhavani,
      account_name: "Bhavani Traders",
      amount_outstanding: "25000.00",
      days_overdue: 93,
      follow_ups: 4,
      last_contact_on: "2026-07-22",
      lock: { reason: OPEN_MATTER, matter_id: MATTER_IDS.bhavani },
    },
    {
      invoice_id: LEGAL_INVOICE_IDS.inv2008,
      invoice_number: "INV-2008",
      account_id: ACCOUNT_IDS.sharma,
      account_name: "Sharma Traders Pvt Ltd",
      amount_outstanding: "18000.00",
      days_overdue: 91,
      follow_ups: 5,
      last_contact_on: "2026-07-24",
      lock: { reason: "A matter is already open for this account.", matter_id: MATTER_IDS.sharma },
    },
  ],
};

export const advocatesFixture: AdvocatesResponse = {
  jurisdiction: "Bengaluru · Karnataka",
  items: [
    {
      advocate_id: ADVOCATE_IDS.meera,
      name: "Meera Raghavan",
      enrolment_number: "KAR/1842/2011",
      practice: "Commercial recovery, MSME disputes · 14 years",
      location: "Bengaluru · Karnataka High Court, City Civil Court",
      notice_fee: "4500.00",
      responds_in_days: 2,
      languages: ["English", "Kannada"],
      facts: ["Also files MSEFC references"],
      note: "I read the full follow-up history before I draft anything. Where the client is a registered MSE, I usually pair the notice with an MSEFC filing so the timelines run together.",
    },
    {
      advocate_id: ADVOCATE_IDS.vikram,
      name: "Vikram Shenoy",
      enrolment_number: "KAR/0411/1998",
      practice: "Commercial litigation, summary suits · 27 years",
      location: "Bengaluru · Karnataka High Court, Commercial Courts",
      notice_fee: "6000.00",
      responds_in_days: 4,
      languages: ["English", "Kannada", "Konkani"],
      facts: [],
      note: "I take on fewer matters and appear in each one myself. Better suited to matters you expect the other side to contest.",
    },
    {
      advocate_id: ADVOCATE_IDS.farhan,
      name: "Farhan Qureshi",
      enrolment_number: "KAR/2290/2014",
      practice: "Debt recovery, commercial suits · 11 years",
      location: "Bengaluru · City Civil Court, Commercial Courts",
      notice_fee: "4000.00",
      responds_in_days: 3,
      languages: ["English", "Hindi", "Urdu"],
      facts: ["Staged fees for suits over ₹5L"],
      note: "For larger matters I bill per stage — notice, filing, hearings — rather than a single retainer upfront. Each stage is agreed in writing before it starts.",
    },
    {
      advocate_id: ADVOCATE_IDS.rohan,
      name: "Rohan D'Souza",
      enrolment_number: "KAR/5520/2022",
      practice: "Commercial recovery · 4 years",
      location: "Bengaluru · City Civil Court",
      notice_fee: "3500.00",
      responds_in_days: 1,
      languages: ["English", "Kannada", "Hindi"],
      facts: [],
      note: "I keep fees low and turn notices around quickly. If a matter goes to court, I work on it alongside a senior colleague and tell you before any fee changes.",
    },
  ],
};

const MEERA = {
  advocate_id: ADVOCATE_IDS.meera,
  name: "Meera Raghavan",
  enrolment_number: "KAR/1842/2011",
};

/** The business side's matters. */
export const mattersFixture: MatterSummary[] = [
  {
    matter_id: MATTER_IDS.sharma,
    account_id: ACCOUNT_IDS.sharma,
    account_name: "Sharma Traders Pvt Ltd",
    client_name: MOCK_CLIENT_NAME,
    invoice_numbers: ["INV-2015"],
    amount: "30000.00",
    route: "advocate_notice",
    advocate: MEERA,
    stage: "awaiting_response",
    last_update_on: "2026-08-12",
    next_step: "Response due 21 Aug",
    unread: false,
  },
  {
    matter_id: MATTER_IDS.bhavani,
    account_id: ACCOUNT_IDS.bhavani,
    account_name: "Bhavani Traders",
    client_name: MOCK_CLIENT_NAME,
    invoice_numbers: ["INV-1691"],
    amount: "25000.00",
    route: "section_43bh_notice",
    advocate: null,
    stage: "client_responded",
    last_update_on: "2026-08-12",
    next_step: "Review their reply",
    unread: false,
  },
  {
    matter_id: MATTER_IDS.pinnacle,
    account_id: ACCOUNT_IDS.pinnacle,
    account_name: "Pinnacle Industries LLP",
    client_name: MOCK_CLIENT_NAME,
    invoice_numbers: ["INV-1290"],
    amount: "58000.00",
    route: "advocate_notice",
    advocate: {
      advocate_id: ADVOCATE_IDS.rohan,
      name: "Rohan D'Souza",
      enrolment_number: "KAR/5520/2022",
    },
    stage: "recovered",
    last_update_on: "2026-07-22",
    next_step: "Recovered ₹58,000.00 · closed",
    unread: false,
  },
];

/** A document reference, for brevity below. */
function doc(
  id: string,
  name: string,
  size: number,
  by: "business" | "advocate",
  on: string,
): MatterDetail["documents"][number] {
  return { document_id: id, name, size_bytes: size, added_by: by, added_on: on };
}

const SHARMA_DOCS = {
  invoice: doc(
    "f11e0001-0000-4000-8000-000000000001",
    "INV-2015.pdf",
    184_320,
    "business",
    "2026-07-28",
  ),
  ledger: doc(
    "f11e0002-0000-4000-8000-000000000002",
    "Ledger_Statement_FY26-27.pdf",
    225_280,
    "business",
    "2026-07-28",
  ),
  log: doc(
    "f11e0003-0000-4000-8000-000000000003",
    "Followup_Log_Sharma.pdf",
    419_840,
    "business",
    "2026-07-28",
  ),
  delivery: doc(
    "f11e0004-0000-4000-8000-000000000004",
    "Delivery_Proof_May2026.pdf",
    1_363_148,
    "business",
    "2026-07-28",
  ),
  udyam: doc(
    "f11e0005-0000-4000-8000-000000000005",
    "Udyam_Certificate.pdf",
    153_600,
    "business",
    "2026-07-28",
  ),
  po: doc(
    "f11e0006-0000-4000-8000-000000000006",
    "PO_Sharma_Apr2026.pdf",
    2_202_009,
    "business",
    "2026-07-28",
  ),
  notice: doc(
    "f11e0007-0000-4000-8000-000000000007",
    "Legal_Notice_Sharma_03Aug.pdf",
    348_160,
    "advocate",
    "2026-08-03",
  ),
};

const sharmaThread: ThreadEntry[] = [
  {
    type: "event",
    entry_id: "e0000001-0000-4000-8000-000000000001",
    at: "2026-07-28T09:15:00+05:30",
    label: "Matter opened · 5 documents attached · 28 Jul, 09:15",
    attachments: [],
  },
  {
    type: "message",
    entry_id: "e0000002-0000-4000-8000-000000000002",
    author: { role: "advocate", name: "Meera Raghavan" },
    sent_at: "2026-07-28T10:02:00+05:30",
    body: "Good morning. I've reviewed the matter — invoice INV-2015, the ledger statement, and the follow-up log showing 6 emails and 2 WhatsApp messages. The demand period will be 15 days from service of the notice.\n\nBefore I issue it: is there a signed purchase order or contract beyond the invoice itself? It isn't essential, but it helps if they contest the terms.",
    attachments: [],
    withdrawn_at: null,
  },
  {
    type: "message",
    entry_id: "e0000003-0000-4000-8000-000000000003",
    author: { role: "business", name: "Priya Nair" },
    sent_at: "2026-07-28T11:20:00+05:30",
    body: "Yes — their purchase order from April covers the full supply, with quantities and the 30-day payment term. Attached.",
    attachments: [SHARMA_DOCS.po],
    withdrawn_at: null,
  },
  {
    type: "message",
    entry_id: "e0000004-0000-4000-8000-000000000004",
    author: { role: "advocate", name: "Meera Raghavan" },
    sent_at: "2026-07-28T12:05:00+05:30",
    body: "Thank you. The purchase order sets out the quantities and the 30-day term in writing, which strengthens the position considerably. Their accounts contact's email is bouncing, so I'll serve the notice by speed post as well as email.",
    attachments: [],
    withdrawn_at: null,
  },
  {
    type: "event",
    entry_id: "e0000005-0000-4000-8000-000000000005",
    at: "2026-08-03T16:30:00+05:30",
    label: "Notice issued · 03 Aug, 16:30",
    attachments: [SHARMA_DOCS.notice],
  },
  {
    type: "event",
    entry_id: "e0000006-0000-4000-8000-000000000006",
    at: "2026-08-06T12:00:00+05:30",
    label: "Delivery confirmed · Speed post EA123456789IN · 06 Aug",
    attachments: [],
  },
  {
    type: "message",
    entry_id: "e0000007-0000-4000-8000-000000000007",
    author: { role: "advocate", name: "Meera Raghavan" },
    sent_at: "2026-08-12T11:42:00+05:30",
    body: "Sharma Traders' accountant, Mr Rajesh Kumar, called me this morning. They are not disputing the invoice as a whole, but say ₹6,000 relates to a quantity shortfall on line 3 — 400 units invoiced, 320 received.\n\nDo you have a delivery acknowledgement for that line, such as a signed delivery note? If so, the dispute is unlikely to hold, and I'll reply to them in writing before the 21 Aug deadline.",
    attachments: [],
    withdrawn_at: null,
  },
];

/** The Sharma matter as the business sees it. */
export const sharmaMatterFixture: MatterDetail = {
  ...mattersFixture[0]!,
  viewer: "business",
  opened_on: "2026-07-28",
  demand_period_days: 15,
  next_deadline: { on: "2026-08-21", label: "Client response" },
  advocate_accepted: true,
  closed_on: null,
  linked_invoices: [
    {
      invoice_id: LEGAL_INVOICE_IDS.inv2015,
      invoice_number: "INV-2015",
      amount_outstanding: "30000.00",
      days_overdue: 94,
    },
  ],
  costs: [
    { label: "Advocate fee", amount: "4500.00", paid_on: "2026-07-28" },
    { label: "Settle Swiftly matter fee", amount: "999.00", paid_on: "2026-07-28" },
  ],
  documents: Object.values(SHARMA_DOCS),
  thread: sharmaThread,
  brief: null,
  client_contact: null,
};

/** The same matter as Meera Raghavan sees it: the brief and client contact added. */
export const sharmaAdvocateMatterFixture: MatterDetail = {
  ...sharmaMatterFixture,
  viewer: "advocate",
  brief: {
    claim: "₹30,000.00 · INV-2015 · issued 21 Apr 2026, due 21 May 2026",
    debtor: "Sharma Traders Pvt Ltd · Bengaluru",
    creditor: `${MOCK_CLIENT_NAME} · Udyam registered Small Enterprise`,
    prior_demand: "6 emails, 2 WhatsApp messages, 28 May – 24 Jul · log attached",
    statutory: "43B(h) applies · 45-day limit passed 5 Jul",
    documents: "Invoice, purchase order, ledger statement, follow-up log, delivery proof",
  },
  client_contact: {
    name: "Priya Nair",
    role: "Finance",
    email: "priya@meridiantraders.example",
    phone: "+91 98860 44120",
  },
};

/** A short matter for the advocate list, with one opening event. */
function shortMatter(
  summary: MatterSummary,
  openedOn: string,
  openedAt: string,
  entryId: string,
): MatterDetail {
  return {
    ...summary,
    viewer: "advocate",
    opened_on: openedOn,
    demand_period_days: 15,
    next_deadline: null,
    advocate_accepted: summary.stage !== "awaiting_acceptance",
    closed_on: summary.stage === "recovered" ? summary.last_update_on : null,
    linked_invoices: [],
    costs: [
      {
        label: "Advocate fee",
        amount: "4500.00",
        // The client pays once the advocate accepts.
        paid_on: summary.stage === "awaiting_acceptance" ? null : openedOn,
      },
    ],
    documents: [],
    thread: [
      {
        type: "event",
        entry_id: entryId,
        at: openedAt,
        label: `Matter opened · ${summary.invoice_numbers.join(", ")}`,
        attachments: [],
      },
    ],
    brief: {
      claim: `${summary.invoice_numbers.join(", ")}`,
      debtor: summary.account_name,
      creditor: summary.client_name,
      prior_demand: "Follow-up log attached",
      statutory: "Assess on review",
      documents: "Invoice, ledger statement, follow-up log",
    },
    client_contact: {
      name: "Accounts team",
      role: "Accounts payable",
      email: "accounts@client.example",
      phone: "+91 80 4000 0000",
    },
  };
}

const ORBIT: MatterSummary = {
  matter_id: MATTER_IDS.orbit,
  account_id: "acc00091-0000-4000-8000-000000000091",
  account_name: "Orbit Labs Pvt Ltd",
  client_name: "Northline Creative",
  invoice_numbers: ["NC-0412"],
  amount: "94000.00",
  route: "advocate_notice",
  advocate: MEERA,
  stage: "notice_drafting",
  last_update_on: "2026-08-16",
  next_step: "Draft the notice",
  unread: false,
};

const LAKSHMI: MatterSummary = {
  matter_id: MATTER_IDS.lakshmi,
  account_id: "acc00092-0000-4000-8000-000000000092",
  account_name: "Lakshmi Textiles Pvt Ltd",
  client_name: "Vertex Fabrication",
  invoice_numbers: ["VF-1188", "VF-1203"],
  amount: "240000.00",
  route: "advocate_notice",
  advocate: MEERA,
  stage: "awaiting_acceptance",
  last_update_on: "2026-08-15",
  next_step: "Review and accept",
  unread: true,
};

const DELTA: MatterSummary = {
  matter_id: MATTER_IDS.delta,
  account_id: "acc00093-0000-4000-8000-000000000093",
  account_name: "Delta Print House",
  client_name: "Anand Agencies",
  invoice_numbers: ["AA-2207"],
  amount: "115000.00",
  route: "advocate_notice",
  advocate: MEERA,
  stage: "recovered",
  last_update_on: "2026-07-30",
  next_step: "Recovered ₹1,15,000.00 · closed",
  unread: false,
};

/** Meera Raghavan's matters, across every business that sent her one. */
export const advocateMattersFixture: MatterSummary[] = [
  { ...mattersFixture[0]!, unread: false },
  LAKSHMI,
  ORBIT,
  DELTA,
];

/** Advocate-side details by matter id. */
export const advocateMatterDetailsFixture: Record<string, MatterDetail> = {
  [MATTER_IDS.sharma]: sharmaAdvocateMatterFixture,
  [MATTER_IDS.orbit]: shortMatter(
    ORBIT,
    "2026-08-14",
    "2026-08-14T10:00:00+05:30",
    "e0000101-0000-4000-8000-000000000101",
  ),
  [MATTER_IDS.lakshmi]: shortMatter(
    LAKSHMI,
    "2026-08-15",
    "2026-08-15T15:40:00+05:30",
    "e0000102-0000-4000-8000-000000000102",
  ),
  [MATTER_IDS.delta]: shortMatter(
    DELTA,
    "2026-07-02",
    "2026-07-02T09:30:00+05:30",
    "e0000103-0000-4000-8000-000000000103",
  ),
};

/** Business-side details by matter id. */
export const businessMatterDetailsFixture: Record<string, MatterDetail> = {
  [MATTER_IDS.sharma]: sharmaMatterFixture,
  [MATTER_IDS.bhavani]: {
    ...mattersFixture[1]!,
    viewer: "business",
    opened_on: "2026-07-24",
    demand_period_days: null,
    next_deadline: null,
    advocate_accepted: false,
    closed_on: null,
    linked_invoices: [
      {
        invoice_id: LEGAL_INVOICE_IDS.inv1691,
        invoice_number: "INV-1691",
        amount_outstanding: "25000.00",
        days_overdue: 93,
      },
    ],
    costs: [],
    documents: [
      doc(
        "f11e0011-0000-4000-8000-000000000011",
        "43Bh_Notice_Bhavani.pdf",
        96_256,
        "business",
        "2026-07-25",
      ),
      doc(
        "f11e0012-0000-4000-8000-000000000012",
        "Bhavani_Reply_12Aug.pdf",
        71_680,
        "business",
        "2026-08-12",
      ),
    ],
    thread: [
      {
        type: "event",
        entry_id: "e0000201-0000-4000-8000-000000000201",
        at: "2026-07-25T10:10:00+05:30",
        label: "43B(h) notice sent by you · 25 Jul, 10:10",
        attachments: [],
      },
      {
        type: "event",
        entry_id: "e0000202-0000-4000-8000-000000000202",
        at: "2026-08-12T17:05:00+05:30",
        label: "Client responded by email · 12 Aug, 17:05",
        attachments: [],
      },
    ],
    brief: null,
    client_contact: null,
  },
  [MATTER_IDS.pinnacle]: {
    ...mattersFixture[2]!,
    viewer: "business",
    opened_on: "2026-06-30",
    demand_period_days: 15,
    next_deadline: null,
    advocate_accepted: true,
    closed_on: "2026-07-22",
    linked_invoices: [
      {
        invoice_id: LEGAL_INVOICE_IDS.inv1290,
        invoice_number: "INV-1290",
        amount_outstanding: "0.00",
        days_overdue: 0,
      },
    ],
    costs: [
      { label: "Advocate fee", amount: "3500.00", paid_on: "2026-06-30" },
      { label: "Settle Swiftly matter fee", amount: "999.00", paid_on: "2026-06-30" },
    ],
    documents: [],
    thread: [
      {
        type: "event",
        entry_id: "e0000301-0000-4000-8000-000000000301",
        at: "2026-06-30T11:00:00+05:30",
        label: "Matter opened · 30 Jun, 11:00",
        attachments: [],
      },
      {
        type: "message",
        entry_id: "e0000302-0000-4000-8000-000000000302",
        author: { role: "advocate", name: "Rohan D'Souza" },
        sent_at: "2026-07-22T16:20:00+05:30",
        body: "Payment confirmed in full. I've closed the matter on my side.",
        attachments: [],
        withdrawn_at: null,
      },
      {
        type: "event",
        entry_id: "e0000303-0000-4000-8000-000000000303",
        at: "2026-07-22T16:25:00+05:30",
        label: "Matter closed by Rohan D'Souza · 22 Jul, 16:25",
        attachments: [],
      },
    ],
    brief: null,
    client_contact: null,
  },
};

/**
 * The mock store. Writes under `VITE_USE_MOCKS=true` land here, so a sent
 * message or a new matter shows up on the next fetch.
 */
type LegalMockStore = {
  eligible: EligibleResponse;
  matters: MatterSummary[];
  businessDetails: Record<string, MatterDetail>;
  advocateMatters: MatterSummary[];
  advocateDetails: Record<string, MatterDetail>;
};

/**
 * A deep copy of the fixtures, so the store never edits them. Each part is
 * cloned on its own: the two sides of a matter are built from shared arrays,
 * and one structuredClone call would keep them shared, so a message posted
 * once would appear twice.
 */
function freshStore(): LegalMockStore {
  return {
    eligible: structuredClone(eligibleFixture),
    matters: structuredClone(mattersFixture),
    businessDetails: structuredClone(businessMatterDetailsFixture),
    advocateMatters: structuredClone(advocateMattersFixture),
    advocateDetails: structuredClone(advocateMatterDetailsFixture),
  };
}

let store: LegalMockStore = freshStore();

/** The live mock store. */
export function legalMockStore(): LegalMockStore {
  return store;
}

/** Puts the mock store back to the fixtures. For tests. */
export function resetLegalMockStore(): void {
  store = freshStore();
}
