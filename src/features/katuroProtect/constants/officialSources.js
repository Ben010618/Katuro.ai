// Direct links to official/authoritative sources for the laws and DepEd
// issuances this feature references. Every URL below was checked via a live
// search before being hardcoded — none are guessed. RA 12080 and the 2017
// RACCS are deliberately left out: the reference material itself flags RA
// 12080's number as unverified against the Official Gazette, and no single
// stable government-hosted URL for the RACCS turned up in research — both
// fall through to the search link instead of risking a wrong citation.
export const OFFICIAL_SOURCES = [
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?7610\b/i, url: 'https://lawphil.net/statutes/repacts/ra1992/ra_7610_1992.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?10627\b/i, url: 'https://lawphil.net/statutes/repacts/ra2013/ra_10627_2013.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?11313\b/i, url: 'https://www.officialgazette.gov.ph/2019/04/17/republic-act-no-11313/', source: 'Official Gazette' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?10175\b/i, url: 'https://lawphil.net/statutes/repacts/ra2012/ra_10175_2012.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?11930\b/i, url: 'https://lawphil.net/statutes/repacts/ra2022/ra_11930_2022.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?9995\b/i, url: 'https://lawphil.net/statutes/repacts/ra2010/ra_9995_2010.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?7877\b/i, url: 'https://www.officialgazette.gov.ph/1995/02/14/republic-act-no-7877/', source: 'Official Gazette' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?(8049|11053)\b/i, url: 'https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/85055', source: 'Supreme Court E-Library' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?(9344|10630)\b/i, url: 'https://www.officialgazette.gov.ph/2006/04/28/republic-act-no-9344/', source: 'Official Gazette' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?10173\b/i, url: 'https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?11036\b/i, url: 'https://lawphil.net/statutes/repacts/ra2018/ra_11036_2018.html', source: 'LawPhil' },
  { match: /R\.?\s*A\.?\s*(?:No\.?\s*)?4670\b/i, url: 'https://lawphil.net/statutes/repacts/ra1966/ra_4670_1966.html', source: 'LawPhil' },
  { match: /P\.?\s*D\.?\s*(?:No\.?\s*)?603\b/i, url: 'https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/26/22773', source: 'Supreme Court E-Library' },
  { match: /DepEd\s+Order\s+No\.?\s*40,?\s*s\.?\s*2012/i, url: 'https://www.deped.gov.ph/2012/05/14/do-40-s-2012-deped-child-protection-policy/', source: 'DepEd' },
  { match: /DepEd\s+Order\s+No\.?\s*55,?\s*s\.?\s*2013/i, url: 'https://www.deped.gov.ph/2013/12/23/do-55-s-2013-implementing-rules-and-regulations-irr-of-republic-act-ra-no-10627-otherwise-known-as-the-anti-bullying-act-of-2013/', source: 'DepEd' },
  { match: /DepEd\s+Order\s+No\.?\s*0*3,?\s*s\.?\s*2026/i, url: 'https://www.deped.gov.ph/2026/02/20/february-20-2026-do-003-s-2026-foundational-guidelines-on-artificial-intelligence-ai-in-basic-education/', source: 'DepEd' },
  { match: /DepEd\s+Order\s+No\.?\s*0*6,?\s*s\.?\s*2026/i, url: 'https://www.deped.gov.ph/wp-content/uploads/DO_s2026_006r.pdf', source: 'DepEd' },
  { match: /DepEd\s+Order\s+No\.?\s*32,?\s*s\.?\s*2017/i, url: 'https://www.deped.gov.ph/2017/06/29/do-32-s-2017-gender-responsive-basic-education-policy/', source: 'DepEd' },
  { match: /(Revised\s+IRR\s+of\s+RA\s*10627|DM\s*090,?\s*s\.?\s*2025)/i, url: 'https://www.deped.gov.ph/wp-content/uploads/Anti-bullying-IRR-Clean-version-as-of-25-March-2025_1.pdf', source: 'DepEd' },
];

/** Verified direct link if we have one; otherwise an honestly-labeled search link (never a guessed URL). */
export function findOfficialSource(citationText) {
  for (const entry of OFFICIAL_SOURCES) {
    if (entry.match.test(citationText)) return { url: entry.url, source: entry.source, isSearch: false };
  }
  const q = encodeURIComponent(`${citationText} site:deped.gov.ph OR site:officialgazette.gov.ph OR site:lawphil.net`);
  return { url: `https://www.google.com/search?q=${q}`, source: 'Search', isSearch: true };
}
