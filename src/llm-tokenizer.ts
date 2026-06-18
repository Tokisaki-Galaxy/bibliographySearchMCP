import type { TokenizedQuery } from './types'

const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'qwen/qwen3.6-27b'
const MAX_RETRIES = 3

const SYSTEM_PROMPT = `You are an academic search query planner.
Return ONLY a JSON object with this schema:
{
  "searchQuery": "boolean or keyword search string for academic databases",
  "keywordQuery": "a shorter keyword-only fallback query",
  "tokens": ["core concept 1", "core concept 2"],
  "isChinese": true or false,
  "isMedical": true or false
}

Rules:
- The output must be valid JSON only.
- The word JSON must appear in your response context.
- searchQuery should be a high-precision boolean query.
- Preserve every core concept from the input.
- Do not drop any major term.
- Do not collapse multi-concept queries into a single broad topic.
- Prefer phrase-level terms.
- Use AND between distinct required concepts.
- Use OR only for clear synonyms or aliases.
- Put quoted phrases around multi-word concepts.
- For medical/biomedical queries, include common aliases when obvious.
- keywordQuery should be a simpler fallback version containing the same core concepts.`

interface LLMResponse {
  searchQuery: string
  keywordQuery: string
  tokens: string[]
  isChinese: boolean
  isMedical: boolean
}

function sanitizeTokens(tokens: string[], isChinese: boolean): string[] {
  const cleaned = tokens
    .map(t => String(t || '').trim())
    .filter(Boolean)

  if (!isChinese) return cleaned

  return cleaned.filter(t => {
    const chineseCount = [...t].filter(ch => /[\u4e00-\u9fff]/u.test(ch)).length
    return chineseCount > 1 || t.length > 1
  })
}

async function callGroq(query: string, apiKey: string, attempt: number): Promise<string> {
  const messages = attempt > 0
    ? [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Query: "${query}"\n\nPrevious response was invalid JSON or omitted important concepts. Return only JSON and keep every core concept.` },
      ]
    : [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Query: "${query}"\n\nReturn JSON only.` },
      ]

  const res = await fetch(GROQ_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 200)}`)
  }

  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content || ''
  if (!content) throw new Error('Empty response from Groq')
  return content
}

export async function analyzeQueryWithLLM(query: string, apiKey: string): Promise<TokenizedQuery> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const raw = await callGroq(query, apiKey, attempt)
      let parsed: LLMResponse
      try {
        parsed = JSON.parse(raw)
      } catch (parseError: any) {
        console.error('[llm-tokenizer] JSON parse error', {
          attempt,
          query,
          raw: raw.slice(0, 1000),
          error: parseError?.message || String(parseError),
        })
        throw parseError
      }

      return {
        original: query,
        searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : query,
        keywordQuery: typeof parsed.keywordQuery === 'string' ? parsed.keywordQuery : query,
        tokens: sanitizeTokens(Array.isArray(parsed.tokens) ? parsed.tokens : [query], typeof parsed.isChinese === 'boolean' ? parsed.isChinese : false),
        isChinese: typeof parsed.isChinese === 'boolean' ? parsed.isChinese : false,
        isMedical: typeof parsed.isMedical === 'boolean' ? parsed.isMedical : false,
        analysisMode: 'llm',
      }
    } catch (e: any) {
      lastError = e
      if (!String(e?.message || e).includes('JSON')) {
        console.error('[llm-tokenizer] query analysis error', {
          attempt,
          query,
          error: e?.message || String(e),
        })
      }
      if (attempt < MAX_RETRIES - 1) continue
    }
  }

  throw lastError || new Error('LLM query analysis failed after 3 retries')
}
