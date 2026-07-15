/**
 * API Connector (Mock)
 *
 * Simulates a paginated REST API that returns documents.
 * In production, this would hit a real endpoint (SharePoint, Confluence, etc.)
 *
 * The mock demonstrates:
 *  - Paginated listing with cursor
 *  - Authentication via API key
 *  - Rate limiting awareness
 *  - Error handling for missing/forbidden documents
 */

import { BaseConnector } from './base.js';

// Mock document store — simulates a remote API's backing data
const MOCK_API_DOCS = [
  {
    id: 'api-doc-001',
    name: 'Client Intake Form — Johnson Estate',
    type: 'txt',
    size: 2340,
    modified: '2025-02-15T10:30:00Z',
    content: `CLIENT INTAKE FORM\n\nMatter: Johnson Estate Planning\nClient: Robert and Sarah Johnson\nMatter Type: Estate Planning — Trust and Will\nDate Opened: February 15, 2025\n\nAssets:\n- Primary residence (Fair Market Value: $1,200,000)\n- Investment portfolio ($850,000 — managed by Schwab)\n- 401(k) retirement accounts ($620,000 combined)\n- Life insurance policies ($500,000 term, $250,000 whole life)\n- Vacation property in Lake Tahoe ($475,000)\n\nEstate Planning Goals:\n1. Establish revocable living trust to avoid probate\n2. Minimize estate tax exposure (current estate ~$3.9M)\n3. Provide for minor children (ages 8 and 12) with testamentary trust\n4. Designate healthcare proxy and durable power of attorney\n5. Charitable giving provisions for local community foundation\n\nSpecial Considerations:\n- Sarah has a child from prior marriage — needs separate provisions\n- Robert owns 30% of a closely-held business (valuation pending)\n- Both clients want no-contest clause (in terrorem) in the will`,
  },
  {
    id: 'api-doc-002',
    name: 'Deposition Summary — Martinez v. ABC Corp',
    type: 'txt',
    size: 3100,
    modified: '2025-03-01T14:22:00Z',
    content: `DEPOSITION SUMMARY\n\nCase: Martinez v. ABC Corporation\nCase No: 2024-CV-5678\nDeponent: James Chen, VP of Operations\nDate: February 28, 2025\n\nKey Testimony:\n1. Mr. Chen confirmed that safety inspections were conducted quarterly, not monthly\n   as required by OSHA regulations (29 CFR 1910).\n2. The last inspection before the incident occurred on October 15, 2024 — six weeks\n   before the plaintiff's injury on November 28, 2024.\n3. Mr. Chen acknowledged receiving three internal complaints about the conveyor belt\n   guard mechanism in the six months prior to the incident.\n4. He testified that budget constraints delayed the replacement of the guard mechanism,\n   which was originally scheduled for Q3 2024.\n5. The witness was evasive regarding the existence of prior incident reports at the\n   same facility.\n\nExhibits Referenced:\n- Exhibit 12: OSHA inspection schedule (2023-2024)\n- Exhibit 15: Internal maintenance request log\n- Exhibit 18: Email chain between Chen and plant manager re: budget reallocation\n\nImpeachment Opportunities:\n- Chen's deposition testimony contradicts his earlier interrogatory answers regarding\n  inspection frequency (Interrogatory Response No. 14).\n- Production documents show Chen received monthly safety reports, contradicting his\n  claim of being "unaware" of the deficiency.`,
  },
  {
    id: 'api-doc-003',
    name: 'Legal Research Memo — Force Majeure',
    type: 'txt',
    size: 2800,
    modified: '2025-01-20T09:15:00Z',
    content: `LEGAL RESEARCH MEMORANDUM\n\nTO: Sarah Williams, Partner\nFROM: Associate Research Team\nRE: Applicability of Force Majeure Clause — CloudVault Contract\nDATE: January 20, 2025\n\nQUESTION PRESENTED:\nWhether the cybersecurity breach experienced by CloudVault Inc. constitutes a\nforce majeure event under Section 14.3 of the Master Services Agreement.\n\nSHORT ANSWER:\nUnlikely. The force majeure clause enumerates specific triggering events (acts of God,\nwar, government action, pandemic) and includes a general catch-all for events "beyond\nreasonable control." A cybersecurity breach is generally considered a foreseeable risk\nthat can be mitigated through reasonable security measures, and courts have consistently\nheld that force majeure does not excuse performance failures attributable to the\nbreaching party's own systems.\n\nANALYSIS:\n1. Hess Corp. v. Port Authority (2d Cir. 2021): Force majeure requires the event to\n   be truly beyond the party's control. System failures due to inadequate security\n   do not qualify.\n2. JN Contemporary Art v. Phillips (S.D.N.Y. 2020): The court held that the party\n   invoking force majeure bears the burden of proving the event was unforeseeable\n   and that reasonable steps were taken to mitigate.\n3. The MSA's force majeure clause uses "including but not limited to" language, but\n   the ejusdem generis canon limits the catch-all to events similar in nature to the\n   enumerated events.\n\nRECOMMENDATION:\nAdvise CloudVault that invoking force majeure carries significant litigation risk.\nRecommend alternative arguments under the impracticability doctrine or negotiated\nresolution.`,
  },
  {
    id: 'api-doc-004',
    name: 'Board Resolution — Stock Option Plan',
    type: 'txt',
    size: 1900,
    modified: '2025-03-10T16:45:00Z',
    content: `BOARD RESOLUTION\n\nRESOLVED, that the Board of Directors of TechVenture Inc. hereby approves the\n2025 Equity Incentive Plan ("Plan") on the following terms:\n\n1. AUTHORIZED SHARES: 2,000,000 shares of common stock reserved for issuance\n   under the Plan, representing approximately 8% of fully-diluted capitalization.\n\n2. ELIGIBLE PARTICIPANTS: All full-time employees, directors, and consultants\n   of the Company and its subsidiaries.\n\n3. OPTION TYPES:\n   (a) Incentive Stock Options (ISOs) per IRC Section 422;\n   (b) Non-Qualified Stock Options (NQSOs);\n   (c) Restricted Stock Units (RSUs).\n\n4. VESTING SCHEDULE: Standard four-year vesting with one-year cliff (25% after\n   12 months, monthly thereafter).\n\n5. EXERCISE PRICE: Not less than 100% of fair market value on the date of grant,\n   as determined by an independent 409A valuation.\n\n6. CHANGE OF CONTROL: Upon a Change of Control event (as defined in the Plan),\n   all outstanding awards shall accelerate and become fully vested ("double-trigger"\n   acceleration requires both CoC and termination within 12 months).\n\n7. ADMINISTRATION: The Compensation Committee of the Board shall administer\n   the Plan with full authority to determine grant recipients, amounts, and terms.\n\nFURTHER RESOLVED, that the officers of the Company are authorized to take all\nactions necessary to implement the Plan, including filing the Plan with the SEC\nand obtaining shareholder approval at the next annual meeting.`,
  },
  {
    id: 'api-doc-005',
    name: 'Regulatory Filing Cover Letter',
    type: 'txt',
    size: 1500,
    modified: '2025-02-28T11:00:00Z',
    content: `REGULATORY FILING COVER LETTER\n\nVia Electronic Submission (EDGAR)\n\nSecurities and Exchange Commission\n100 F Street, NE\nWashington, D.C. 20549\n\nRe: TechVenture Inc. — Form S-1 Registration Statement\n    File No. 333-XXXXXX\n\nDear Sir or Madam:\n\nOn behalf of TechVenture Inc. (the "Company"), we hereby submit the Company's\nRegistration Statement on Form S-1 (the "Registration Statement") for the\nregistration of 5,000,000 shares of common stock, par value $0.001 per share,\nfor the Company's proposed initial public offering.\n\nEnclosed please find:\n1. Registration Statement on Form S-1 (including prospectus)\n2. Exhibits 1.1 through 23.1 as listed in the Exhibit Index\n3. Consent of Independent Registered Public Accounting Firm\n4. Powers of Attorney (previously filed)\n\nThe Company requests confidential treatment of certain commercial terms in\nExhibits 10.1 through 10.5 pursuant to Rule 406 of the Securities Act of 1933.\nA redacted version of each exhibit is filed herewith, and unredacted versions\nhave been submitted separately.\n\nPlease direct any questions regarding this filing to the undersigned at\n(415) 555-0199 or counsel@legaltechsolutions.com.\n\nRespectfully submitted,\nLegalTech Solutions Inc.\nOutside Counsel for TechVenture Inc.`,
  },
];

export class ApiConnector extends BaseConnector {
  constructor(config = {}) {
    super(config);
    this.name = 'api';
    this.endpoint = config.endpoint || 'https://api.mock-dms.example.com/v1';
    this.apiKey = config.apiKey || 'mock-api-key-12345';
    this.pageSize = config.pageSize || 10;
    this._rateLimitRemaining = 100;
  }

  async connect() {
    // Simulate API authentication check
    if (!this.apiKey || this.apiKey.length < 5) {
      return { ok: false, message: 'Invalid API key' };
    }

    // Simulate network latency
    await this._simulateLatency(50);

    this._connected = true;
    return {
      ok: true,
      message: `Connected to ${this.endpoint} (mock)`,
    };
  }

  async listDocuments(page = 1) {
    if (!this._connected) await this.connect();
    this._checkRateLimit();

    await this._simulateLatency(30);

    const start = (page - 1) * this.pageSize;
    const slice = MOCK_API_DOCS.slice(start, start + this.pageSize);

    return slice.map(({ content, ...meta }) => meta);
  }

  async fetchDocument(id) {
    if (!this._connected) await this.connect();
    this._checkRateLimit();

    await this._simulateLatency(40);

    const doc = MOCK_API_DOCS.find((d) => d.id === id);
    if (!doc) {
      throw new Error(`Document ${id} not found (HTTP 404)`);
    }

    const { content, ...metadata } = doc;
    return {
      content,
      metadata: { ...metadata, source: `api:${this.endpoint}` },
    };
  }

  /**
   * Paginated listing — returns documents + cursor for next page.
   * This is the pattern real APIs use (Notion, SharePoint, Confluence).
   */
  async listDocumentsPaginated(cursor = null) {
    if (!this._connected) await this.connect();
    this._checkRateLimit();

    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const slice = MOCK_API_DOCS.slice(startIndex, startIndex + this.pageSize);
    const hasMore = startIndex + this.pageSize < MOCK_API_DOCS.length;

    return {
      documents: slice.map(({ content, ...meta }) => meta),
      nextCursor: hasMore ? String(startIndex + this.pageSize) : null,
      hasMore,
      total: MOCK_API_DOCS.length,
    };
  }

  _checkRateLimit() {
    this._rateLimitRemaining--;
    if (this._rateLimitRemaining <= 0) {
      this._rateLimitRemaining = 100;
      // In production, would throw or wait
    }
  }

  _simulateLatency(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
