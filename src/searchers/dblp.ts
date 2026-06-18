import type { Paper } from '../types'
import { XMLParser } from 'fast-xml-parser'

const DBLP_BASE = 'https://dblp.org'

export async function searchDblp(query: string, limit: number = 50): Promise<Paper[]> {
  const papers: Paper[] = []
  const url = `${DBLP_BASE}/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${Math.min(limit, 200)}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BibliographySearchMCP/1.0 (research; mailto:research@example.com)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return []

    const data: any = await res.json()
    const hits = data?.result?.hits
    const total = parseInt(hits?.['@total'] || '0', 10)
    if (total === 0) return []

    const hitList = hits?.hit
    if (!hitList) return []

    const list = Array.isArray(hitList) ? hitList : [hitList]

    for (const hit of list) {
      const info = hit.info || {}
      const authorsData = info.authors?.author
      const authors: string[] = authorsData
        ? (Array.isArray(authorsData) ? authorsData : [authorsData]).map((a: any) =>
            typeof a === 'string' ? a : a.text || '',
          )
        : []

      const dblpUrl: string = info.url || ''
      let dblpKey = ''
      if (dblpUrl) {
        const parts = dblpUrl.split('/rec/')
        if (parts.length > 1) dblpKey = parts[1]
      }

      papers.push({
        title: info.title || '',
        authors,
        year: info.year ? parseInt(info.year, 10) : undefined,
        venue: info.venue || '',
        url: dblpUrl,
        doi: info.doi || undefined,
        source: 'DBLP',
        is_oa: false,
      })
    }
  } catch {
    return []
  }

  return papers.slice(0, limit)
}
