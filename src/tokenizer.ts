import { zhAcademicDict, zhAcademicEnMap, medicalTerms } from './dict'
import type { TokenizedQuery } from './types'
import { analyzeQueryWithLLM } from './llm-tokenizer'

function isChineseChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x4e00 && code <= 0x9fff
}

export function detectChinese(ratio: number): boolean {
  return ratio > 0.3
}

export function tokenizeChinese(text: string): string[] {
  const sorted = [...zhAcademicDict].sort((a, b) => b.length - a.length)
  const tokens: string[] = []
  let i = 0

  while (i < text.length) {
    let matched = false
    for (const word of sorted) {
      if (text.startsWith(word, i)) {
        tokens.push(word)
        i += word.length
        matched = true
        break
      }
    }
    if (!matched) {
      if (!/[\s\p{P}]/u.test(text[i])) {
        tokens.push(text[i])
      }
      i++
    }
  }

  return [...new Set(tokens)]
}

function softTranslate(text: string): string {
  const sorted = Object.entries(zhAcademicEnMap).sort((a, b) => b[0].length - a[0].length)
  let result = text
  for (const [zh, en] of sorted) {
    while (result.includes(zh)) {
      result = result.replace(zh, en)
    }
  }
  return result
}

function quoteTerm(term: string): string {
  const cleaned = term.trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) return cleaned
  return cleaned.includes(' ') ? `"${cleaned}"` : cleaned
}

function buildBooleanQuery(tokens: string[]): string {
  const normalized = tokens.map(quoteTerm).filter(Boolean)
  return normalized.join(' AND ')
}

export function detectMedical(text: string): boolean {
  const lower = text.toLowerCase()
  return medicalTerms.some(t => lower.includes(t.toLowerCase()))
}

function analyzeQueryWithDict(query: string): TokenizedQuery {
  const zhCount = [...query].filter(isChineseChar).length
  const isChinese = zhCount > query.length * 0.3
  const tokens = isChinese ? tokenizeChinese(query) : query.split(/\s+/).filter(Boolean)
  const translated = isChinese ? softTranslate(query) : query
  const searchQuery = buildBooleanQuery(tokens.length ? tokens : [translated])
  const keywordQuery = tokens.join(' ').trim() || translated
  const isMedical = detectMedical(query)

  return { original: query, searchQuery, keywordQuery, tokens, isChinese, isMedical }
}

export async function analyzeQuery(query: string, groqApiKey?: string): Promise<TokenizedQuery> {
  if (groqApiKey) {
    try {
      return await analyzeQueryWithLLM(query, groqApiKey)
    } catch {
      return analyzeQueryWithDict(query)
    }
  }
  return analyzeQueryWithDict(query)
}
