import type { Paper } from '../types'
import { XMLParser } from 'fast-xml-parser'

export async function searchPubMed(query: string, limit: number = 50): Promise<Paper[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${Math.min(limit, 100)}&retmode=json`
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) })
    if (!searchRes.ok) return []

    const searchData: any = await searchRes.json()
    const ids = searchData?.esearchresult?.idlist || []
    if (ids.length === 0) return []

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`
    const fetchRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(20000) })
    if (!fetchRes.ok) return []

    const xml = await fetchRes.text()
    const parser = new XMLParser({ ignoreAttributes: false })
    const data = parser.parse(xml)

    const articles = data?.PubmedArticleSet?.PubmedArticle
    const list = Array.isArray(articles) ? articles : (articles ? [articles] : [])
    const papers: Paper[] = []

    for (const article of list) {
      const medline = article.MedlineCitation
      if (!medline) continue
      const citation = medline.Article
      if (!citation) continue

      const authorList = citation.AuthorList?.Author || []
      const authorArr = Array.isArray(authorList) ? authorList : [authorList]
      const year = citation.Journal?.JournalIssue?.PubDate?.Year ||
                   citation.Journal?.JournalIssue?.PubDate?.MedlineDate?.slice(0, 4)

      papers.push({
        title: citation.ArticleTitle || '',
        authors: authorArr.map((a: any) => [a.ForeName, a.LastName].filter(Boolean).join(' ')),
        year: year ? parseInt(year) : undefined,
        venue: citation.Journal?.Title || 'PubMed',
        abstract: citation.Abstract?.AbstractText
          ? (Array.isArray(citation.Abstract.AbstractText)
            ? citation.Abstract.AbstractText.map((t: any) => typeof t === 'string' ? t : t['#text'] || '').join(' ')
            : typeof citation.Abstract.AbstractText === 'string'
              ? citation.Abstract.AbstractText
              : citation.Abstract.AbstractText['#text'] || '')
          : '',
        source: 'PubMed',
        is_oa: false,
        doi: article.PubmedData?.ArticleIdList?.ArticleId
          ? (Array.isArray(article.PubmedData.ArticleIdList.ArticleId)
            ? article.PubmedData.ArticleIdList.ArticleId.find((id: any) => id['@_IdType'] === 'doi')?.['#text']
            : undefined)
          : undefined,
      })
    }

    return papers.slice(0, limit)
  } catch {
    return []
  }
}
