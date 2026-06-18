import type { TokenizedQuery } from './types'

const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'qwen/qwen3.6-27b'
const MAX_RETRIES = 3

const SYSTEM_PROMPT = `You are a query analysis tool for academic literature search.
Analyze the given search query and return a JSON object with this exact schema:
{
  "tokens": ["term1", "term2", ...],
  "isChinese": true or false,
  "enTranslation": "English translation of the full query (if Chinese, translate to English; if English, keep as-is)",
  "isMedical": true or false
}

Guidelines:
- tokens: For Chinese queries, segment into meaningful academic terms. For English, split by whitespace and group multi-word terms.
- isChinese: true if the query contains significant Chinese characters (>30%).
- enTranslation: Translate Chinese queries to idiomatic English academic terms. Keep English queries unchanged.
- isMedical: true if query relates to medicine, disease, drugs, proteins, genes, clinical treatment, etc.
- IMPORTANT: Never drop a core concept from the original query.
- IMPORTANT: If the query contains multiple distinct concepts, keep them all in tokens.
- IMPORTANT: Do not collapse a compound query into a single broad topic.
- IMPORTANT: For Chinese queries like "决策树深度学习", tokens must preserve both "决策树" and "深度学习" as separate concepts or phrase-level tokens.
- IMPORTANT: Prefer phrase-level tokens over overly generic tokens when the phrase is a domain term.
- IMPORTANT: The English translation must also preserve all core concepts from the original query, not just the broadest topic.`

interface LLMResponse {
  tokens: string[]
  isChinese: boolean
  enTranslation: string
  isMedical: boolean
}

async function callGroq(query: string, apiKey: string, attempt: number): Promise<string> {
  const messages = attempt > 0
    ? [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Query: "${query}"\n\nPrevious response was not valid JSON or it lost important query concepts. Return ONLY a valid JSON object this time, and keep every core concept from the original query.` },
      ]
    : [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Query: "${query}"\n\nKeep all core concepts from the original query.` },
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
      const parsed: LLMResponse = JSON.parse(raw)

      return {
        original: query,
        tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [query],
        isChinese: typeof parsed.isChinese === 'boolean' ? parsed.isChinese : false,
        enTranslation: typeof parsed.enTranslation === 'string' ? parsed.enTranslation : query,
        isMedical: typeof parsed.isMedical === 'boolean' ? parsed.isMedical : false,
      }
    } catch (e: any) {
      lastError = e
      if (attempt < MAX_RETRIES - 1) continue
    }
  }

  throw lastError || new Error('LLM query analysis failed after 3 retries')
}
