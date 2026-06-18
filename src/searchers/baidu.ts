import type { Paper } from '../types'

interface BaiduAuthResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface BaiduSearchResponse {
  result?: {
    items?: BaiduItem[]
  }
  log_id?: string
}

interface BaiduItem {
  title?: string
  abstract?: string
  authors?: string[]
  year?: number
  source?: string
  link?: string
  citation?: number
  doi?: string
}

export async function searchBaidu(query: string, apiKey: string, limit: number = 100, page: number = 0): Promise<Paper[]> {
  if (!apiKey) return []

  try {
    const authRes = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: '',
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!authRes.ok) return []

    const authData: BaiduAuthResponse = await authRes.json()
    const token = authData.access_token
    if (!token) return []

    const papers: Paper[] = []
    const pagesToFetch = Math.ceil(limit / 10)
    const startPage = page
    const endPage = page + pagesToFetch

    for (let p = startPage; p < endPage && papers.length < limit; p++) {
      const body = new URLSearchParams({
        query,
        page: String(p),
        pageSize: '10',
      })

      const res = await fetch(`https://aip.baidubce.com/rpc/2.0/ai_search/xueshu/v1/search?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) break

      const data: BaiduSearchResponse = await res.json()
      const items = data?.result?.items || []

      for (const item of items) {
        papers.push({
          title: item.title || '',
          authors: item.authors || [],
          year: item.year,
          citations: item.citation ?? 0,
          venue: item.source || '百度学术',
          abstract: item.abstract || '',
          url: item.link,
          source: '百度学术',
          doi: item.doi,
        })
      }

      if (items.length < 10) break
    }

    return papers.slice(0, limit)
  } catch {
    return []
  }
}
