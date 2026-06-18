import type { Paper } from '../types'
import { XMLParser } from 'fast-xml-parser'

export async function searchArxiv(query: string, limit: number = 100): Promise<Paper[]> {
  const papers: Paper[] = []
  const encoded = encodeURIComponent(query)
  const url = `https://export.arxiv.org/api/query?search_query=all:${encoded}&start=0&max_results=${Math.min(limit, 100)}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BibliographySearchMCP/1.0)' },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) return []

    const xml = await res.text()
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    })
    const data = parser.parse(xml)

    const entries = data?.feed?.entry
    if (!entries) return []

    const list = Array.isArray(entries) ? entries : [entries]

    for (const entry of list) {
      const authorList = entry.author
      const authors = authorList
        ? (Array.isArray(authorList) ? authorList : [authorList]).map((a: any) => a.name)
        : []

      let pdfLink: string | undefined
      if (entry.link) {
        const links = Array.isArray(entry.link) ? entry.link : [entry.link]
        const pdfLinkEntry = links.find((l: any) => l['@_title'] === 'pdf' || l['@_type'] === 'application/pdf')
        if (pdfLinkEntry) pdfLink = pdfLinkEntry['@_href']
      }

      papers.push({
        title: (entry.title || '').replace(/\s+/g, ' ').trim(),
        authors,
        year: entry.published ? parseInt(entry.published.slice(0, 4)) : undefined,
        venue: 'arXiv',
        abstract: (entry.summary || '').replace(/\s+/g, ' ').trim(),
        pdf: pdfLink,
        source: 'arXiv',
        is_oa: true,
      })
    }
  } catch {
    return []
  }

  return papers.slice(0, limit)
}
