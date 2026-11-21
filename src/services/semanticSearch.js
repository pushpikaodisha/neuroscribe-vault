/**
 * NeuroScribe Studio - Semantic Search & TF-IDF Engine
 * Vector space model with TF-IDF, Cosine Similarity, and BM25-inspired ranking.
 */

// Common English Stopwords
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won', 'would', 'you',
  'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Tokenizes and normalizes text into cleaned term tokens
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text = '') {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ') // Strip code blocks
    .replace(/\[\[(.*?)\]\]/g, ' $1 ') // Keep wikilink text
    .replace(/#[a-z0-9_\-\/]+/gi, ' ') // Clean tags
    .replace(/[^a-z0-9\s]/g, ' ') // Non-alphanumeric to space
    .split(/\s+/)
    .map(token => stem(token.trim()))
    .filter(token => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Light rule-based English suffix stemmer
 * @param {string} word
 * @returns {string}
 */
function stem(word = '') {
  if (word.length <= 3) return word;
  return word
    .replace(/(?:ing|edly|ingly|ed)$/, '')
    .replace(/(?:ational|ation|tion)$/, 'te')
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:sses|ss)$/, 'ss')
    .replace(/(?:s)$/, '');
}

/**
 * Class representing the Semantic Corpus Index
 */
export class SemanticIndex {
  constructor() {
    this.documents = new Map(); // id -> { note, tokens, tfMap, length, vector }
    this.vocabulary = new Set();
    this.invertedIndex = new Map(); // term -> Set(docIds)
    this.idfMap = new Map(); // term -> idfScore
  }

  /**
   * Rebuilds the vector index from a list of notes
   * @param {Array<Object>} notes
   */
  buildIndex(notes = []) {
    this.documents.clear();
    this.vocabulary.clear();
    this.invertedIndex.clear();
    this.idfMap.clear();

    const N = notes.length;
    if (N === 0) return;

    // Phase 1: Tokenize and compute raw term frequencies per document
    notes.forEach(note => {
      // Weight title terms 3x and tags 2x in semantic representation
      const titleTokens = tokenize(note.title);
      const tagTokens = tokenize((note.tags || []).join(' '));
      const contentTokens = tokenize(note.content || '');

      const allTokens = [
        ...titleTokens, ...titleTokens, ...titleTokens,
        ...tagTokens, ...tagTokens,
        ...contentTokens
      ];

      const tfMap = new Map();
      allTokens.forEach(t => {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
        this.vocabulary.add(t);

        if (!this.invertedIndex.has(t)) {
          this.invertedIndex.set(t, new Set());
        }
        this.invertedIndex.get(t).add(note.id);
      });

      this.documents.set(note.id, {
        id: note.id,
        note,
        tokens: allTokens,
        tfMap,
        length: allTokens.length
      });
    });

    // Phase 2: Compute IDF for each term in vocabulary
    this.vocabulary.forEach(term => {
      const docCount = this.invertedIndex.get(term)?.size || 0;
      // Smooth IDF formula
      const idf = Math.log(1 + (N - docCount + 0.5) / (docCount + 0.5)) + 1;
      this.idfMap.set(term, idf);
    });

    // Phase 3: Compute normalized TF-IDF vectors for documents
    this.documents.forEach(doc => {
      const vector = new Map();
      let sumOfSquares = 0;

      doc.tfMap.forEach((count, term) => {
        const tf = count / doc.length;
        const idf = this.idfMap.get(term) || 1;
        const tfidf = tf * idf;
        vector.set(term, tfidf);
        sumOfSquares += tfidf * tfidf;
      });

      // L2 normalization
      const norm = Math.sqrt(sumOfSquares) || 1;
      vector.forEach((val, term) => {
        vector.set(term, val / norm);
      });

      doc.vector = vector;
    });
  }

  /**
   * Computes Cosine Similarity between two document vectors
   * @param {Map<string, number>} vecA
   * @param {Map<string, number>} vecB
   * @returns {{ score: number, sharedTerms: Array<{ term: string, weight: number }> }}
   */
  calculateSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return { score: 0, sharedTerms: [] };

    let dotProduct = 0;
    const sharedTerms = [];

    // Iterate over the smaller vector
    const [smallVec, largeVec] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];

    smallVec.forEach((valA, term) => {
      if (largeVec.has(term)) {
        const valB = largeVec.get(term);
        const product = valA * valB;
        dotProduct += product;
        sharedTerms.push({ term, weight: Number(product.toFixed(4)) });
      }
    });

    sharedTerms.sort((a, b) => b.weight - a.weight);

    return {
      score: Number(Math.max(0, Math.min(1, dotProduct)).toFixed(4)),
      sharedTerms: sharedTerms.slice(0, 5)
    };
  }

  /**
   * Finds top-K semantically related notes for a given note
   * @param {string} noteId
   * @param {number} [limit=5]
   * @returns {Array<Object>}
   */
  getRecommendations(noteId, limit = 5) {
    const targetDoc = this.documents.get(noteId);
    if (!targetDoc || !targetDoc.vector) return [];

    const scores = [];

    this.documents.forEach((otherDoc, otherId) => {
      if (otherId === noteId) return;

      const { score, sharedTerms } = this.calculateSimilarity(targetDoc.vector, otherDoc.vector);
      if (score > 0.05) {
        scores.push({
          id: otherDoc.note.id,
          title: otherDoc.note.title,
          slug: otherDoc.note.slug,
          excerpt: otherDoc.note.excerpt,
          tags: otherDoc.note.tags,
          similarityScore: score,
          sharedKeywords: sharedTerms.map(s => s.term)
        });
      }
    });

    scores.sort((a, b) => b.similarityScore - a.similarityScore);
    return scores.slice(0, limit);
  }

  /**
   * Performs full-text keyword search with BM25 / TF-IDF scoring and snippet generation
   * @param {string} query
   * @param {number} [limit=15]
   * @returns {Array<Object>}
   */
  search(query = '', limit = 15) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const results = [];
    const lowerQuery = query.toLowerCase().trim();

    this.documents.forEach(doc => {
      const note = doc.note;
      let score = 0;
      const matchedTerms = [];

      // Exact phrase match bonus
      if (note.title.toLowerCase().includes(lowerQuery)) {
        score += 10.0;
      }
      if ((note.content || '').toLowerCase().includes(lowerQuery)) {
        score += 3.0;
      }

      // Token-level scoring
      queryTokens.forEach(qTerm => {
        const tf = (doc.tfMap.get(qTerm) || 0) / (doc.length || 1);
        const idf = this.idfMap.get(qTerm) || 1;

        if (tf > 0) {
          score += tf * idf * 2.0;
          matchedTerms.push(qTerm);
        }

        // Title match bonus
        if (note.title.toLowerCase().includes(qTerm)) {
          score += 4.0;
        }

        // Tag match bonus
        if ((note.tags || []).some(t => t.toLowerCase().includes(qTerm))) {
          score += 3.0;
        }
      });

      if (score > 0.1) {
        const snippet = generateContextSnippet(note.content || '', queryTokens);
        results.push({
          id: note.id,
          title: note.title,
          slug: note.slug,
          excerpt: note.excerpt,
          tags: note.tags,
          wordCount: note.word_count,
          score: Number(score.toFixed(3)),
          snippet,
          matchedTerms: Array.from(new Set(matchedTerms))
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

/**
 * Generates an excerpt snippet highlighting search query terms
 * @param {string} text
 * @param {string[]} queryTerms
 * @returns {string}
 */
function generateContextSnippet(text = '', queryTerms = []) {
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/#[a-z0-9_\-\/]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '';

  let bestIdx = -1;
  const lowerClean = clean.toLowerCase();

  for (const term of queryTerms) {
    const idx = lowerClean.indexOf(term);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }

  if (bestIdx === -1) {
    return clean.slice(0, 160) + '...';
  }

  const start = Math.max(0, bestIdx - 60);
  const end = Math.min(clean.length, bestIdx + 100);
  let snippet = clean.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < clean.length) snippet = snippet + '...';

  // Highlight matches
  queryTerms.forEach(t => {
    const regex = new RegExp(`(${t}\\w*)`, 'gi');
    snippet = snippet.replace(regex, '<mark>$1</mark>');
  });

  return snippet;
}
