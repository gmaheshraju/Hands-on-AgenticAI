/**
 * Dataset Builder — generates matched pairs of resumes differing only on a
 * single demographic attribute (gender, ethnicity, age).
 *
 * Each pair is identical except for the attribute under test, so any output
 * difference from the AI system is attributable to that attribute alone.
 */

import { RESUME_TEMPLATES, DEMOGRAPHIC_DATA, UNIVERSITIES } from "../data/templates/resumeTemplates.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Build matched pairs for a single attribute (gender, ethnicity, or age).
 *
 * @param {"gender"|"ethnicity"|"age"} attribute
 * @param {number} pairsPerCombination — pairs to generate per variant combination
 * @returns {Array<{id, attribute, groupA, groupB, resumeA, resumeB, template, metadata}>}
 */
export function buildMatchedPairs(attribute, pairsPerCombination = 50) {
  const spec = DEMOGRAPHIC_DATA[attribute];
  if (!spec) throw new Error(`Unknown attribute: ${attribute}`);

  const pairs = [];
  const variants = spec.variants;

  // For each pair of variant groups, generate matched pairs
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const groupA = variants[i];
      const groupB = variants[j];

      for (let p = 0; p < pairsPerCombination; p++) {
        const tmpl = RESUME_TEMPLATES[p % RESUME_TEMPLATES.length];
        const university = pickRandom(UNIVERSITIES.neutral);
        const gradYear = attribute === "age"
          ? null // handled below
          : pickRandom([2015, 2016, 2017, 2018, 2019]);

        let varsA, varsB;

        if (attribute === "age") {
          // Age pairs: same name, different graduation year
          const name = pickRandom(groupA.names || DEMOGRAPHIC_DATA.gender.variants[0].names);
          const yearA = pickRandom(groupA.graduationYears);
          const yearB = pickRandom(groupB.graduationYears);
          const pronouns = groupA.pronouns || DEMOGRAPHIC_DATA.gender.variants[0].pronouns;

          const baseVars = {
            NAME: name,
            EMAIL: `${name.split(" ")[0].toLowerCase()}@email.com`,
            PRONOUN_SUBJECT: pronouns.subject,
            PRONOUN_OBJECT: pronouns.object,
            PRONOUN_POSSESSIVE: pronouns.possessive,
            UNIVERSITY: university,
          };
          varsA = { ...baseVars, GRADUATION_YEAR: yearA };
          varsB = { ...baseVars, GRADUATION_YEAR: yearB };
        } else {
          // Name/pronoun swaps
          const nameA = groupA.names[p % groupA.names.length];
          const nameB = groupB.names[p % groupB.names.length];
          const pronounsA = groupA.pronouns;
          const pronounsB = groupB.pronouns;

          const base = { UNIVERSITY: university, GRADUATION_YEAR: gradYear };
          varsA = {
            ...base,
            NAME: nameA,
            EMAIL: `${groupA.email_prefix(nameA)}@email.com`,
            PRONOUN_SUBJECT: pronounsA.subject,
            PRONOUN_OBJECT: pronounsA.object,
            PRONOUN_POSSESSIVE: pronounsA.possessive,
          };
          varsB = {
            ...base,
            NAME: nameB,
            EMAIL: `${groupB.email_prefix(nameB)}@email.com`,
            PRONOUN_SUBJECT: pronounsB.subject,
            PRONOUN_OBJECT: pronounsB.object,
            PRONOUN_POSSESSIVE: pronounsB.possessive,
          };
        }

        const resumeA = fillTemplate(tmpl.template, varsA);
        const resumeB = fillTemplate(tmpl.template, varsB);

        pairs.push({
          id: `${attribute}-${groupA.group}-${groupB.group}-${p}`,
          attribute,
          groupA: groupA.group,
          groupB: groupB.group,
          resumeA,
          resumeB,
          template: tmpl.id,
          metadata: { varsA, varsB, role: tmpl.role },
        });
      }
    }
  }
  return pairs;
}

/**
 * Build intersectional pairs — combine two attributes.
 * Example: gender + ethnicity produces pairs that vary on both.
 */
export function buildIntersectionalPairs(attrA, attrB, pairsPerCombination = 25) {
  const specA = DEMOGRAPHIC_DATA[attrA];
  const specB = DEMOGRAPHIC_DATA[attrB];
  if (!specA || !specB) throw new Error("Unknown attribute");

  const pairs = [];

  for (const varA of specA.variants) {
    for (const varB of specB.variants) {
      for (let p = 0; p < pairsPerCombination; p++) {
        const tmpl = RESUME_TEMPLATES[p % RESUME_TEMPLATES.length];
        const university = pickRandom(UNIVERSITIES.neutral);

        // Merge variant properties
        const name = varA.names
          ? varA.names[p % varA.names.length]
          : (varB.names ? varB.names[p % varB.names.length] : "Alex Smith");

        const pronouns = varA.pronouns || varB.pronouns || { subject: "They", object: "them", possessive: "Their" };
        const gradYear = varA.graduationYears
          ? pickRandom(varA.graduationYears)
          : (varB.graduationYears ? pickRandom(varB.graduationYears) : 2018);

        const vars = {
          NAME: name,
          EMAIL: `${name.split(" ")[0].toLowerCase()}@email.com`,
          PRONOUN_SUBJECT: pronouns.subject,
          PRONOUN_OBJECT: pronouns.object,
          PRONOUN_POSSESSIVE: pronouns.possessive,
          UNIVERSITY: university,
          GRADUATION_YEAR: gradYear,
        };

        const resume = fillTemplate(tmpl.template, vars);

        pairs.push({
          id: `intersect-${varA.group}-${varB.group}-${p}`,
          attributes: [attrA, attrB],
          groups: { [attrA]: varA.group, [attrB]: varB.group },
          resume,
          template: tmpl.id,
          metadata: { vars, role: tmpl.role },
        });
      }
    }
  }
  return pairs;
}

/**
 * Build proxy discrimination test cases — uses university associations
 * (women's colleges, HBCUs) to test indirect bias.
 */
export function buildProxyTestPairs(pairsPerUniversity = 10) {
  const pairs = [];
  const neutralUnis = UNIVERSITIES.neutral;
  const proxyUnis = [
    ...UNIVERSITIES.womens_colleges.map(u => ({ name: u, type: "womens_college" })),
    ...UNIVERSITIES.hbcus.map(u => ({ name: u, type: "hbcu" })),
  ];

  for (const proxyUni of proxyUnis) {
    for (let p = 0; p < pairsPerUniversity; p++) {
      const tmpl = RESUME_TEMPLATES[p % RESUME_TEMPLATES.length];
      const neutralUni = neutralUnis[p % neutralUnis.length];
      // Use a gender-neutral name to isolate the university effect
      const name = "Alex Morgan";
      const gradYear = pickRandom([2016, 2017, 2018, 2019]);

      const baseVars = {
        NAME: name,
        EMAIL: "alex.morgan@email.com",
        PRONOUN_SUBJECT: "They",
        PRONOUN_OBJECT: "them",
        PRONOUN_POSSESSIVE: "Their",
        GRADUATION_YEAR: gradYear,
      };

      const resumeA = fillTemplate(tmpl.template, { ...baseVars, UNIVERSITY: neutralUni });
      const resumeB = fillTemplate(tmpl.template, { ...baseVars, UNIVERSITY: proxyUni.name });

      pairs.push({
        id: `proxy-${proxyUni.type}-${p}`,
        attribute: "university_proxy",
        proxyType: proxyUni.type,
        groupA: neutralUni,
        groupB: proxyUni.name,
        resumeA,
        resumeB,
        template: tmpl.id,
        metadata: { role: tmpl.role },
      });
    }
  }
  return pairs;
}

/**
 * Build the full test dataset for all attributes.
 */
export function buildFullDataset(pairsPerAttribute = 50) {
  return {
    gender: buildMatchedPairs("gender", pairsPerAttribute),
    ethnicity: buildMatchedPairs("ethnicity", pairsPerAttribute),
    age: buildMatchedPairs("age", pairsPerAttribute),
    proxy: buildProxyTestPairs(10),
    timestamp: new Date().toISOString(),
    config: { pairsPerAttribute },
  };
}
