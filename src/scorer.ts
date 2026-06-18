import type { Paper, ScoredPaper } from './types'

const sciKeywords = ['Nature', 'Science', 'IEEE', 'ACM', 'Cell', 'Lancet', 'NEJM', 'JAMA', 'BMJ']
const topVenues = ['NeurIPS', 'ICML', 'ICLR', 'CVPR', 'ICCV', 'ECCV', 'ACL', 'EMNLP', 'NAACL',
  'AAAI', 'IJCAI', 'SIGIR', 'WWW', 'KDD', 'VLDB', 'SIGMOD', 'OSDI', 'SOSP', 'PLDI',
  'POPL', 'CAV', 'STOC', 'FOCS', 'SODA', 'MOBICOM', 'SIGCOMM', 'NSDI', 'USENIX',
  'IEEE', 'ACM', 'Nature', 'Science', 'Cell', 'PNAS']

const sourceWeights: Record<string, number> = {
  'arXiv': 3.0,
  'PubMed': 2.8,
  'DBLP': 2.7,
  'Semantic Scholar': 2.5,
  '百度学术': 2.0,
  'Crossref': 1.8,
  'OpenAlex': 1.5,
}

function detectJournalLevel(venue: string): { isSCI: boolean; isEI: boolean; isCore: boolean } {
  const upper = (venue || '').toUpperCase()
  const isSCI = topVenues.some(v => upper.includes(v.toUpperCase()))
  const isEI = upper.includes('CONFERENCE') || upper.includes('PROC') || upper.includes('TRANSACTIONS')
  const isCore = isSCI || isEI
  return { isSCI, isEI, isCore }
}

export function scorePapers(papers: Paper[], query: string, isChinese: boolean): ScoredPaper[] {
  const maxScore = isChinese ? 7 : 8
  const currentYear = new Date().getFullYear()

  return papers.map(paper => {
    let score = 0
    const titleLower = (paper.title || '').toLowerCase()
    const queryLower = query.toLowerCase()

    if (titleLower.includes(queryLower)) {
      score += 3
    } else {
      const qWords = queryLower.split(/\s+/)
      const matchCount = qWords.filter(w => titleLower.includes(w)).length
      if (matchCount >= Math.ceil(qWords.length / 2)) score += 2
      else if (matchCount > 0) score += 1
    }

    const sw = sourceWeights[paper.source || ''] || 1.5
    score += Math.min(sw, isChinese ? 2 : 3)

    if (paper.year && currentYear - paper.year <= 3) score += 1
    else if (paper.year && currentYear - paper.year <= 10) score += 0.5

    if ((paper.citations || 0) > 10) score += 1
    else if ((paper.citations || 0) > 0) score += 0.5

    const { isSCI, isEI, isCore } = detectJournalLevel(paper.venue || '')
    if (isSCI) score += 1
    else if (isEI) score += 0.5

    return {
      ...paper,
      score: Math.min(score, maxScore),
      maxScore,
      isSCI,
      isEI,
      isCore,
    }
  })
}

export function sortByScore(papers: ScoredPaper[]): ScoredPaper[] {
  return papers.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if ((b.citations || 0) !== (a.citations || 0)) return (b.citations || 0) - (a.citations || 0)
    if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0)
    const titleCmp = (a.title || '').localeCompare(b.title || '')
    if (titleCmp !== 0) return titleCmp
    return (a.source || '').localeCompare(b.source || '')
  })
}
