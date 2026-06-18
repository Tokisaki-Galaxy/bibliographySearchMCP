import type { Paper } from '../types'

export async function searchCrossref(query: string, limit: number = 50): Promise<Paper[]> {
  const papers: Paper[] = []
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(limit, 100)}&filter=type:journal-article&sort=relevance`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BibliographySearchMCP/1.0 (mailto:research@example.com)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return []

    const data: any = await res.json()
    const items = data?.message?.items || []

    for (const item of items) {
      const authorList = Array.isArray(item.author) ? item.author : []
      const year = item.published?.['date-parts']?.[0]?.[0]
      const authors = authorList
        .map((a: any) => [a.given, a.family].filter(Boolean).join(' '))
        .filter((name: string) => name.trim().length > 0)

      papers.push({
        title: item.title?.[0] || '',
        authors,
        year,
        citations: item['is-referenced-by-count'] ?? 0,
        venue: item['container-title']?.[0] || item['short-container-title']?.[0] || 'Unknown',
        abstract: item.abstract || '',
        url: item.URL,
        source: 'Crossref',
        doi: item.DOI || null,
      })
    }
  } catch {
    return []
  }

  return papers.slice(0, limit)
}
