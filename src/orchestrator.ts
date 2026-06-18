import { analyzeQuery } from './tokenizer'
import { searchArxiv } from './searchers/arxiv'
import { searchSemanticScholar } from './searchers/semantic'
import { searchCrossref } from './searchers/crossref'
import { searchOpenAlex } from './searchers/openalex'
import { searchPubMed } from './searchers/pubmed'
import { searchBaidu } from './searchers/baidu'
import { searchDblp } from './searchers/dblp'
import { scorePapers, sortByScore } from './scorer'
import type { Paper, SearchResult, SearchSource } from './types'

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function deduplicate(papers: Paper[]): Paper[] {
  const seen = new Set<string>()
  return papers.filter(p => {
    const key = (p.title || '').toLowerCase().trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

interface SearchOptions {
  query: string
  limit?: number
  sources?: SearchSource[]
  baiduApiKey?: string
  groqApiKey?: string
  useDict?: boolean
}

function normalizeSources(sources?: SearchSource[]): Set<SearchSource> | null {
  if (!sources || sources.length === 0) return null
  return new Set(sources)
}

function sourceLimit(limit: number, count: number): number {
  return Math.max(1, limit - count)
}

async function searchSource(
  source: SearchSource,
  searchQuery: string,
  keywordQuery: string,
  limit: number,
  opts: SearchOptions,
): Promise<Paper[]> {
  switch (source) {
    case 'baidu':
      return searchBaidu(searchQuery, opts.baiduApiKey || '', limit)
    case 'crossref':
      return searchCrossref(keywordQuery || searchQuery, limit)
    case 'arxiv':
      return searchArxiv(searchQuery, limit)
    case 'dblp':
      return searchDblp(searchQuery, limit)
    case 'semantic':
      return searchSemanticScholar(keywordQuery || searchQuery, limit)
    case 'openalex':
      return searchOpenAlex(keywordQuery || searchQuery, limit)
    case 'pubmed':
      return searchPubMed(searchQuery, limit)
  }
}

export async function searchPapers(opts: SearchOptions): Promise<SearchResult> {
  const limit = opts.limit || 200
  const tq = await analyzeQuery(opts.query, opts.useDict ? undefined : opts.groqApiKey)
  const timestamp = new Date().toISOString()
  const searchQuery = tq.searchQuery || opts.query
  const keywordQuery = tq.keywordQuery || opts.query
  const selectedSources = normalizeSources(opts.sources)

  let zhPapers: Paper[] = []
  let enPapers: Paper[] = []

  if (selectedSources) {
    const sources = [...selectedSources]
    const collected: Paper[] = []
    for (const source of sources) {
      const papers = await searchSource(source, searchQuery, keywordQuery, sourceLimit(limit, collected.length), opts)
      collected.push(...papers)
      if (collected.length >= limit) break
    }

    if (tq.isChinese) {
      zhPapers = collected.slice(0, limit)
    } else {
      enPapers = collected.slice(0, limit)
    }
  } else if (tq.isChinese) {
    zhPapers = await searchChinese(searchQuery, keywordQuery, limit, opts.baiduApiKey)

    enPapers = await searchEnglish(searchQuery, keywordQuery, limit, tq.isMedical)
  } else {
    enPapers = await searchEnglish(searchQuery, keywordQuery, limit, tq.isMedical)
  }

  zhPapers = deduplicate(zhPapers)
  enPapers = deduplicate(enPapers)

  const zhScored = sortByScore(scorePapers(zhPapers, searchQuery, true))
  const enScored = sortByScore(scorePapers(enPapers, searchQuery, false))

  return {
    query: opts.query,
    search_query: tq.searchQuery,
    keyword_query: tq.keywordQuery,
    sources: opts.sources,
    analysis_mode: tq.analysisMode,
    timestamp,
    zh_papers: zhScored,
    en_papers: enScored,
    zh_count: zhScored.length,
    en_count: enScored.length,
    total: zhScored.length + enScored.length,
  }
}

async function searchChinese(query: string, keywordQuery: string, limit: number, apiKey?: string): Promise<Paper[]> {
  const papers: Paper[] = []

  const zhTarget = Math.ceil(limit * 0.5)

  const baiduPapers = await searchBaidu(query, apiKey || '', zhTarget)
  papers.push(...baiduPapers)

  if (papers.length < zhTarget) {
    const need = zhTarget - papers.length
    const crPapers = await searchCrossref(keywordQuery || query, need)
    const zhFromCr = crPapers.filter(p => {
      const zhCount = [...p.title].filter(c => c.charCodeAt(0) >= 0x4e00 && c.charCodeAt(0) <= 0x9fff).length
      return zhCount > p.title.length * 0.1
    })
    papers.push(...zhFromCr)
  }

  return papers.slice(0, zhTarget)
}

async function searchEnglish(query: string, keywordQuery: string, limit: number, isMedical: boolean): Promise<Paper[]> {
  let papers: Paper[] = []
  const enTarget = limit

  if (isMedical) {
    papers.push(...await searchPubMed(query, enTarget))
  }

  if (papers.length < enTarget) {
    const arxivPapers = await searchArxiv(query, enTarget)
    papers.push(...arxivPapers)
    if (papers.length < enTarget) {
      await sleep(1000)
    }
  }

  if (papers.length < enTarget) {
    const need = enTarget - papers.length
    const dblpPapers = await searchDblp(query, need)
    papers.push(...dblpPapers)
  }

  if (papers.length < enTarget) {
    const need = enTarget - papers.length
    const ssPapers = await searchSemanticScholar(keywordQuery || query, need)
    papers.push(...ssPapers)
  }

  if (papers.length < enTarget) {
    const need = enTarget - papers.length
    const oaPapers = await searchOpenAlex(keywordQuery || query, need)
    papers.push(...oaPapers)
  }

  return papers.slice(0, enTarget)
}
