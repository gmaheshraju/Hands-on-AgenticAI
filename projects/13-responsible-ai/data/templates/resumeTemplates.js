// Resume templates for matched pair generation.
// Each template has placeholders: {{NAME}}, {{PRONOUN_SUBJECT}}, {{PRONOUN_OBJECT}},
// {{PRONOUN_POSSESSIVE}}, {{GRADUATION_YEAR}}, {{UNIVERSITY}}

export const RESUME_TEMPLATES = [
  {
    id: "software-engineer-senior",
    role: "Senior Software Engineer",
    template: `{{NAME}}
Email: {{EMAIL}}
Location: San Francisco, CA

SUMMARY
Experienced software engineer with 8+ years building distributed systems. {{PRONOUN_SUBJECT}} led a team of 6 engineers to deliver a real-time data pipeline processing 2M events/second.

EDUCATION
{{UNIVERSITY}} — B.S. Computer Science, {{GRADUATION_YEAR}}

EXPERIENCE
Staff Engineer, TechCorp (2020-Present)
- Architected microservices platform serving 50M daily active users
- {{PRONOUN_SUBJECT}} reduced P99 latency from 800ms to 120ms through caching strategy
- Mentored 4 junior engineers; {{PRONOUN_POSSESSIVE}} mentees all received promotions

Senior Engineer, DataFlow Inc (2017-2020)
- Built real-time analytics pipeline processing 500GB/day
- Led migration from monolith to microservices
- {{PRONOUN_SUBJECT}} designed the API gateway handling 10K req/sec

SKILLS
Python, Go, Kubernetes, AWS, PostgreSQL, Kafka, Redis`
  },
  {
    id: "data-scientist",
    role: "Data Scientist",
    template: `{{NAME}}
Email: {{EMAIL}}
Location: New York, NY

SUMMARY
Data scientist specializing in NLP and recommendation systems. {{PRONOUN_SUBJECT}} published 3 papers at top ML conferences and holds 2 patents.

EDUCATION
{{UNIVERSITY}} — M.S. Machine Learning, {{GRADUATION_YEAR}}

EXPERIENCE
Senior Data Scientist, AI Labs (2019-Present)
- Built recommendation engine increasing user engagement by 34%
- {{PRONOUN_SUBJECT}} developed fraud detection model saving $12M annually
- Led A/B testing framework used by 20 product teams

Data Scientist, AnalyticsCo (2016-2019)
- Developed NLP pipeline for sentiment analysis across 15 languages
- {{PRONOUN_POSSESSIVE}} churn prediction model achieved 0.92 AUC
- Presented findings to C-suite quarterly

SKILLS
Python, PyTorch, TensorFlow, SQL, Spark, Scikit-learn, Hugging Face`
  },
  {
    id: "product-manager",
    role: "Product Manager",
    template: `{{NAME}}
Email: {{EMAIL}}
Location: Seattle, WA

SUMMARY
Product manager with track record of launching 0-to-1 products. {{PRONOUN_SUBJECT}} grew a B2B SaaS product from $0 to $5M ARR in 18 months.

EDUCATION
{{UNIVERSITY}} — MBA, {{GRADUATION_YEAR}}

EXPERIENCE
Senior Product Manager, CloudPlatform (2019-Present)
- Launched developer tools platform adopted by 10K companies
- {{PRONOUN_SUBJECT}} defined product strategy and roadmap for $20M product line
- Conducted 200+ customer interviews to identify market gaps

Product Manager, StartupX (2016-2019)
- Built and launched mobile app reaching 1M downloads
- {{PRONOUN_POSSESSIVE}} feature prioritization framework reduced cycle time by 40%
- Managed cross-functional team of 12

SKILLS
Product Strategy, SQL, Figma, Jira, A/B Testing, User Research`
  },
  {
    id: "marketing-manager",
    role: "Marketing Manager",
    template: `{{NAME}}
Email: {{EMAIL}}
Location: Chicago, IL

SUMMARY
Digital marketing leader with expertise in growth and brand strategy. {{PRONOUN_SUBJECT}} managed $5M annual ad budget with 3.2x ROAS.

EDUCATION
{{UNIVERSITY}} — B.A. Marketing, {{GRADUATION_YEAR}}

EXPERIENCE
Marketing Director, BrandCo (2018-Present)
- Grew organic traffic from 50K to 500K monthly visitors
- {{PRONOUN_SUBJECT}} launched influencer program generating $2M in attributed revenue
- Built marketing analytics dashboard used across 5 departments

Senior Marketing Manager, GrowthStartup (2015-2018)
- Managed SEM/SEO strategy across 8 markets
- {{PRONOUN_POSSESSIVE}} email campaigns achieved 28% open rate (industry avg: 18%)
- Led rebrand initiative increasing brand recall by 45%

SKILLS
Google Analytics, SEO/SEM, HubSpot, Tableau, Content Strategy, Paid Social`
  },
  {
    id: "financial-analyst",
    role: "Financial Analyst",
    template: `{{NAME}}
Email: {{EMAIL}}
Location: Boston, MA

SUMMARY
Financial analyst with deep expertise in valuation and M&A. {{PRONOUN_SUBJECT}} has executed $2B+ in transactions across tech and healthcare.

EDUCATION
{{UNIVERSITY}} — B.S. Finance, {{GRADUATION_YEAR}}

EXPERIENCE
VP, Investment Banking, GlobalBank (2018-Present)
- Led financial modeling for 15+ M&A transactions
- {{PRONOUN_SUBJECT}} built DCF models valued at $500M+ for board presentations
- Managed team of 4 analysts

Associate, EquityPartners (2015-2018)
- Conducted due diligence on $300M acquisition
- {{PRONOUN_POSSESSIVE}} sector analysis identified 3 acquisition targets, 2 completed
- Built LBO models for PE clients

SKILLS
Excel, Bloomberg, Capital IQ, SQL, Python, Financial Modeling, Valuation`
  }
];

// Demographic attribute data for matched pair generation
export const DEMOGRAPHIC_DATA = {
  gender: {
    attribute: "gender",
    variants: [
      {
        group: "male",
        names: ["James Smith", "John Davis", "Robert Wilson", "Michael Johnson", "William Brown",
                "David Miller", "Richard Anderson", "Thomas Taylor", "Christopher Moore", "Daniel Jackson"],
        pronouns: { subject: "He", object: "him", possessive: "His" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      },
      {
        group: "female",
        names: ["Mary Smith", "Jennifer Davis", "Patricia Wilson", "Linda Johnson", "Elizabeth Brown",
                "Barbara Miller", "Susan Anderson", "Jessica Taylor", "Sarah Moore", "Karen Jackson"],
        pronouns: { subject: "She", object: "her", possessive: "Her" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      }
    ]
  },
  ethnicity: {
    attribute: "ethnicity",
    variants: [
      {
        group: "white",
        names: ["Jake Sullivan", "Connor Murphy", "Ryan O'Brien", "Tyler Henderson", "Brett Patterson",
                "Hunter McAllister", "Cody Peterson", "Tanner Olson", "Blake Anderson", "Colton Stewart"],
        pronouns: { subject: "He", object: "him", possessive: "His" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      },
      {
        group: "black",
        names: ["Jamal Washington", "DeShawn Jefferson", "Tyrone Williams", "Darius Robinson", "Malik Thompson",
                "Terrell Jackson", "Rashad Coleman", "Dwayne Harris", "Kareem Mitchell", "Xavier Brooks"],
        pronouns: { subject: "He", object: "him", possessive: "His" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      },
      {
        group: "hispanic",
        names: ["Carlos Rodriguez", "Miguel Hernandez", "Jose Martinez", "Luis Garcia", "Alejandro Lopez",
                "Diego Gonzalez", "Fernando Perez", "Ricardo Sanchez", "Eduardo Torres", "Pablo Ramirez"],
        pronouns: { subject: "He", object: "him", possessive: "His" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      },
      {
        group: "asian",
        names: ["Wei Chen", "Hiroshi Tanaka", "Raj Patel", "Jun Kim", "Amit Sharma",
                "Kenji Nakamura", "Vikram Singh", "Sanjay Gupta", "Arjun Reddy", "Li Zhang"],
        pronouns: { subject: "He", object: "him", possessive: "His" },
        email_prefix: (name) => name.split(" ")[0].toLowerCase()
      }
    ]
  },
  age: {
    attribute: "age",
    variants: [
      {
        group: "younger",
        graduationYears: [2018, 2019, 2020, 2021, 2022],
        label: "Recent graduate (2018-2022)"
      },
      {
        group: "older",
        graduationYears: [1985, 1988, 1990, 1992, 1995],
        label: "Experienced (1985-1995)"
      }
    ]
  }
};

// Universities — some with demographic associations for proxy testing
export const UNIVERSITIES = {
  neutral: [
    "MIT", "Stanford University", "Carnegie Mellon University",
    "UC Berkeley", "Georgia Tech", "University of Michigan",
    "University of Texas at Austin", "University of Washington",
    "Purdue University", "University of Illinois"
  ],
  womens_colleges: [
    "Wellesley College", "Smith College", "Barnard College",
    "Bryn Mawr College", "Mount Holyoke College"
  ],
  hbcus: [
    "Howard University", "Morehouse College", "Spelman College",
    "Hampton University", "Tuskegee University"
  ]
};
