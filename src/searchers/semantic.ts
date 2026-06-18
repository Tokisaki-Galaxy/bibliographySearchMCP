import type { Paper } from '../types'

export async function searchSemanticScholar(query: string, limit: number = 100): Promise<Paper[]> {
  const papers: Paper[] = []
  const batch = Math.min(limit, 100)
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${batch}&fields=title,authors,year,citationCount,venue,abstract,openAccessPdf,externalIds`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BibliographySearchMCP/1.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return []

    const data: any = await res.json()
    for (const item of data.data || []) {
      papers.push({
        title: item.title || '',
        authors: (item.authors || []).map((a: any) => a.name || ''),
        year: item.publicationYear,
        citations: item.citationCount ?? 0,
        venue: item.venue || 'Unknown',
        abstract: item.abstract || '',
        pdf: item.openAccessPdf?.url || null,
        source: 'Semantic Scholar',
        is_oa: !!item.openAccessPdf,
        doi: item.externalIds?.DOI || null,
      })
    }
  } catch {
    return []
  }

  return papers.slice(0, limit)
}
