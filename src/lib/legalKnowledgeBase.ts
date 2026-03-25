export interface LegalEntry {
  id: string;
  category: string;
  title: string;
  description: string;
  keywords: string[];
}

export const knowledgeBase: LegalEntry[] = [
  {
    id: '1',
    category: 'Employment Law',
    title: 'Fair Labor Standards Act (FLSA)',
    description: 'Establishes minimum wage, overtime pay, recordkeeping, and youth employment standards affecting employees in the private sector and in Federal, State, and local governments.',
    keywords: ['wage', 'overtime', 'pay', 'employment', 'labor', 'hours', 'salary', 'work', 'boss', 'employee']
  },
  {
    id: '2',
    category: 'Housing & Real Estate',
    title: 'Fair Housing Act (FHA)',
    description: 'Protects people from discrimination when they are renting or buying a home, getting a mortgage, seeking housing assistance, or engaging in other housing-related activities.',
    keywords: ['tenant', 'landlord', 'rent', 'eviction', 'housing', 'discrimination', 'lease', 'property', 'apartment']
  },
  {
    id: '3',
    category: 'Contract Law',
    title: 'Breach of Contract Fundamentals',
    description: 'A breach of contract occurs when one party fails to fulfill their obligations as described in the contract. Remedies may include damages, specific performance, or cancellation and restitution.',
    keywords: ['contract', 'breach', 'agreement', 'obligation', 'terms', 'conditions', 'signature', 'void', 'sue']
  },
  {
    id: '4',
    category: 'Intellectual Property',
    title: 'Copyright Act of 1976',
    description: 'Forms the basis of copyright law in the United States, protecting original works of authorship including literary, dramatic, musical, and artistic works.',
    keywords: ['copyright', 'intellectual property', 'infringement', 'original work', 'author', 'creator', 'plagiarism', 'steal']
  },
  {
    id: '5',
    category: 'Personal Injury',
    title: 'Negligence Standard',
    description: 'To win a negligence claim, the plaintiff must prove four elements: duty, breach, causation, and damages/harm.',
    keywords: ['injury', 'accident', 'negligence', 'harm', 'damages', 'duty of care', 'liability', 'fault', 'crash', 'slip']
  },
  {
    id: '6',
    category: 'Consumer Protection',
    title: 'Deceptive Trade Practices Act (DTPA)',
    description: 'Protects consumers against false, misleading, and deceptive business practices, unconscionable actions, and breaches of warranty.',
    keywords: ['consumer', 'fraud', 'deceptive', 'scam', 'warranty', 'fake', 'misleading', 'purchase', 'refund']
  }
];

/**
 * API Method to search the legal knowledge base efficiently.
 * Extracts keywords from the query and matches against the DB.
 */
export function searchKnowledgeBase(query: string): LegalEntry[] {
  if (!query) return [];
  
  const lowerQuery = query.toLowerCase();
  // Extract words longer than 3 characters as potential keywords
  const tokens = lowerQuery.split(/\W+/).filter(t => t.length > 3);
  
  if (tokens.length === 0) return [];

  // Score each entry based on keyword matches
  const scoredEntries = knowledgeBase.map(entry => {
    let score = 0;
    tokens.forEach(token => {
      if (entry.title.toLowerCase().includes(token)) score += 3;
      if (entry.keywords.some(k => k.toLowerCase() === token || k.toLowerCase().includes(token))) score += 2;
      if (entry.description.toLowerCase().includes(token)) score += 1;
    });
    return { entry, score };
  });

  // Return entries that have a score > 0, sorted by relevance
  return scoredEntries
    .filter(se => se.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(se => se.entry);
}
