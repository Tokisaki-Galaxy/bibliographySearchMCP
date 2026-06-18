import type { Paper } from '../types'

export async function searchOpenAlex(query: string, limit: number = 100): Promise<Paper[]> {
  const papers: Paper[] = []
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${Math.min(limit, 200)}&sort=relevance`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BibliographySearchMCP/1.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return []

    const data: any = await res.json()
    for (const item of data.results || []) {
      const isOA = !!item.open_access?.is_oa

      papers.push({
        title: item.title || '',
        authors: (item.authorships || []).map((a: any) => a.author?.display_name || ''),
        year: item.publication_year,
        citations: item.cited_by_count ?? 0,
        venue: item.primary_location?.source?.display_name || 'Unknown',
        abstract: item.abstract_inverted_index ? reconstructAbstract(item.abstract_inverted_index) : '',
        url: item.doi,
        source: 'OpenAlex',
        is_oa: isOA,
        doi: item.doi?.replace('https://doi.org/', '') || null,
      })
    }
  } catch {
    return []
  }

  return papers.slice(0, limit)
}

function reconstructAbstract(inverted: Record<string, number[]>): string {
  const words: { word: string; pos: number }[] = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words.push({ word, pos })
    }
  }
  return words.sort((a, b) => a.pos - b.pos).map(w => w.word).join(' ')
}
