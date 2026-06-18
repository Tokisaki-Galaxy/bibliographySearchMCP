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

export async function searchPapers(opts: SearchOptions): Promise<SearchResult> {
  const limit = opts.limit || 200
  const tq = await analyzeQuery(opts.query, opts.useDict ? undefined : opts.groqApiKey)
  const timestamp = new Date().toISOString()

  let zhPapers: Paper[] = []
  let enPapers: Paper[] = []

  if (tq.isChinese) {
    zhPapers = await searchChinese(tq.original, limit, opts.baiduApiKey)

    const enQuery = tq.enTranslation
    enPapers = await searchEnglish(enQuery, limit, tq.isMedical)
  } else {
    enPapers = await searchEnglish(tq.original, limit, tq.isMedical)
  }

  zhPapers = deduplicate(zhPapers)
  enPapers = deduplicate(enPapers)

  const zhScored = sortByScore(scorePapers(zhPapers, tq.original, true))
  const enScored = sortByScore(scorePapers(enPapers, tq.enTranslation, false))

  return {
    query: opts.query,
    timestamp,
    zh_papers: zhScored,
    en_papers: enScored,
    zh_count: zhScored.length,
    en_count: enScored.length,
    total: zhScored.length + enScored.length,
  }
}

async function searchChinese(query: string, limit: number, apiKey?: string): Promise<Paper[]> {
  const papers: Paper[] = []

  const zhTarget = Math.ceil(limit * 0.5)

  const baiduPapers = await searchBaidu(query, apiKey || '', zhTarget)
  papers.push(...baiduPapers)

  if (papers.length < zhTarget) {
    const need = zhTarget - papers.length
    const crPapers = await searchCrossref(query, need)
    const zhFromCr = crPapers.filter(p => {
      const zhCount = [...p.title].filter(c => c.charCodeAt(0) >= 0x4e00 && c.charCodeAt(0) <= 0x9fff).length
      return zhCount > p.title.length * 0.1
    })
    papers.push(...zhFromCr)
  }

  return papers.slice(0, zhTarget)
}

async function searchEnglish(query: string, limit: number, isMedical: boolean): Promise<Paper[]> {
  let papers: Paper[] = []
  const enTarget = Math.ceil(limit * 0.5)

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
    const ssPapers = await searchSemanticScholar(query, need)
    papers.push(...ssPapers)
  }

  if (papers.length < enTarget) {
    const need = enTarget - papers.length
    const oaPapers = await searchOpenAlex(query, need)
    papers.push(...oaPapers)
  }

  return papers.slice(0, enTarget)
}

export async function continueSearch(
  existing: SearchResult,
  targetTotal: number = 200,
  baiduApiKey?: string,
  groqApiKey?: string,
  useDict?: boolean,
): Promise<SearchResult> {
  const tq = await analyzeQuery(existing.query, useDict ? undefined : groqApiKey)

  let zhPapers = [...existing.zh_papers]
  let enPapers = [...existing.en_papers]

  if (zhPapers.length < targetTotal && tq.isChinese) {
    const need = targetTotal - zhPapers.length
    const moreZh = await searchBaidu(existing.query, baiduApiKey || '', need, 10)
    const deduped = deduplicate([...zhPapers, ...moreZh])
    zhPapers = deduped.slice(0, targetTotal)
  }

  if (enPapers.length < targetTotal) {
    const need = targetTotal - enPapers.length
    const moreEn = await searchOpenAlex(tq.enTranslation, need + 50)
    const deduped = deduplicate([...enPapers, ...moreEn])
    enPapers = deduped.slice(0, targetTotal)
  }

  const zhScored = sortByScore(scorePapers(zhPapers, tq.original, true))
  const enScored = sortByScore(scorePapers(enPapers, tq.enTranslation, false))

  return {
    query: existing.query,
    timestamp: new Date().toISOString(),
    zh_papers: zhScored,
    en_papers: enScored,
    zh_count: zhScored.length,
    en_count: enScored.length,
    total: zhScored.length + enScored.length,
  }
}
