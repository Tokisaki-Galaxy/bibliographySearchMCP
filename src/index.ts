import { searchPapers, continueSearch } from './orchestrator'
import { exportToCSV, exportToBibTeX } from './exporter'
import type { SearchSource } from './types'
import { analyzeQuery } from './tokenizer'

interface MCPRequest {
  jsonrpc: '2.0'
  method: string
  params?: any
  id?: number | string
}

interface MCPResponse {
  jsonrpc: '2.0'
  result?: any
  error?: { code: number; message: string; data?: any }
  id: number | string | null
}

function success(id: number | string | null, result: any): MCPResponse {
  return { jsonrpc: '2.0', result, id }
}

function error(id: number | string | null, code: number, message: string, data?: any): MCPResponse {
  return { jsonrpc: '2.0', error: { code, message, data }, id }
}

function getBaiduKey(request: Request, env: any): string {
  const header = request.headers.get('x-baidu-api-key')
  if (header) return header
  return env.BAIDU_API_KEY || ''
}

function getGroqKey(request: Request, env: any): string {
  const header = request.headers.get('x-groq-api-key')
  if (header) return header
  return env.GROQ_API_KEY || ''
}

function handleInitialize(id: number | string | null): MCPResponse {
  return success(id, {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'bibliography-search-mcp',
      version: '1.0.0',
    },
  })
}

function handleListTools(id: number | string | null): MCPResponse {
  return success(id, {
    tools: [
      {
        name: 'search_papers',
        description: 'Search academic papers across multiple sources (arXiv, DBLP, Semantic Scholar, Crossref, OpenAlex, PubMed, Baidu Xueshu). Auto-detects language and selects optimal sources. Uses LLM (Groq) for query analysis by default; pass use_dict=true to use dictionary-based tokenizer instead.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (Chinese or English)' },
            limit: { type: 'number', description: 'Target number of papers (default: 200)', default: 200 },
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['arxiv', 'semantic', 'crossref', 'openalex', 'pubmed', 'baidu', 'dblp'] },
              description: 'Specific sources to use (auto-selected if omitted)',
            },
            use_dict: { type: 'boolean', description: 'Use dictionary-based tokenizer instead of LLM (default: false)', default: false },
          },
          required: ['query'],
        },
      },
      {
        name: 'continue_search',
        description: 'Supplement existing search results to reach a higher target count. Searches for more papers from the same query. Uses LLM (Groq) for query analysis by default; pass use_dict=true to use dictionary-based tokenizer instead.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Original search query' },
            target_total: { type: 'number', description: 'Target total paper count (default: 200)', default: 200 },
            use_dict: { type: 'boolean', description: 'Use dictionary-based tokenizer instead of LLM (default: false)', default: false },
          },
          required: ['query'],
        },
      },
      {
        name: 'export_papers',
        description: 'Export papers to CSV or BibTeX format. Requires running search_papers first.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Original search query to export results for' },
            format: { type: 'string', enum: ['csv', 'bibtex'], description: 'Export format' },
            use_dict: { type: 'boolean', description: 'Use dictionary-based tokenizer instead of LLM (default: false)', default: false },
          },
          required: ['query', 'format'],
        },
      },
      {
        name: 'analyze_query',
        description: 'Analyze a search query without executing a search. Returns tokenization, language detection, translation, and medical keyword detection. Uses LLM (Groq) by default; pass use_dict=true to use dictionary-based tokenizer.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Query to analyze' },
            use_dict: { type: 'boolean', description: 'Use dictionary-based tokenizer instead of LLM (default: false)', default: false },
          },
          required: ['query'],
        },
      },
    ],
  })
}

async function handleToolCall(id: number | string | null, params: any, env: any, request: Request): Promise<MCPResponse> {
  const name = params?.name
  const args = params?.arguments || {}

  if (!name) {
    return error(id, -32602, 'Missing tool name')
  }

  try {
    switch (name) {
      case 'search_papers': {
        const { query, limit, sources, use_dict } = args
        if (!query) return error(id, -32602, 'Missing required parameter: query')

        const baiduKey = getBaiduKey(request, env)
        const groqKey = getGroqKey(request, env)
        const result = await searchPapers({
          query,
          limit: limit || 200,
          sources: sources as SearchSource[] | undefined,
          baiduApiKey: baiduKey,
          groqApiKey: groqKey,
          useDict: use_dict === true,
        })

        return success(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      }

      case 'continue_search': {
        const { query, target_total, use_dict } = args
        if (!query) return error(id, -32602, 'Missing required parameter: query')

        const baiduKey = getBaiduKey(request, env)
        const groqKey = getGroqKey(request, env)

        const result = await searchPapers({
          query,
          limit: target_total || 200,
          baiduApiKey: baiduKey,
          groqApiKey: groqKey,
          useDict: use_dict === true,
        })

        return success(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      }

      case 'export_papers': {
        const { query, format, use_dict } = args
        if (!query || !format) {
          return error(id, -32602, 'Missing required parameters: query, format')
        }

        const baiduKey = getBaiduKey(request, env)
        const groqKey = getGroqKey(request, env)

        const result = await searchPapers({
          query,
          limit: 200,
          baiduApiKey: baiduKey,
          groqApiKey: groqKey,
          useDict: use_dict === true,
        })

        const allPapers = [...result.zh_papers, ...result.en_papers]

        let output: string
        if (format === 'csv') {
          output = exportToCSV(allPapers)
        } else {
          output = exportToBibTeX(allPapers)
        }

        return success(id, {
          content: [{ type: 'text', text: output }],
        })
      }

      case 'analyze_query': {
        const { query, use_dict } = args
        if (!query) return error(id, -32602, 'Missing required parameter: query')

        const groqKey = getGroqKey(request, env)
        const tq = await analyzeQuery(query, use_dict ? undefined : groqKey)
        return success(id, {
          content: [{
            type: 'text',
            text: JSON.stringify(tq, null, 2),
          }],
        })
      }

      default:
        return error(id, -32601, `Unknown tool: ${name}`)
    }
  } catch (e: any) {
    return error(id, -32603, `Internal error: ${e.message || e}`)
  }
}

const ALLOWED_ORIGINS = '*'

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS === '*' ? '*' : (origin || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-baidu-api-key, x-groq-api-key',
    'Access-Control-Max-Age': '86400',
  }
}

async function handleRequest(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify(error(null, -32700, 'Method not allowed. Use POST.')), {
      status: 405,
      headers,
    })
  }

  let body: MCPRequest
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify(error(null, -32700, 'Parse error: invalid JSON')), {
      status: 400,
      headers,
    })
  }

  if (body.jsonrpc !== '2.0') {
    return new Response(JSON.stringify(error(null, -32600, 'Invalid JSON-RPC: must be jsonrpc 2.0')), {
      status: 400,
      headers,
    })
  }

  const reqId = body.id ?? null

  if (body.method === 'initialize') {
    return new Response(JSON.stringify(handleInitialize(reqId)), { status: 200, headers })
  }

  if (body.method === 'notifications/initialized') {
    return new Response(JSON.stringify(success(reqId, null)), { status: 200, headers })
  }

  if (body.method === 'tools/list') {
    return new Response(JSON.stringify(handleListTools(reqId)), { status: 200, headers })
  }

  if (body.method === 'tools/call') {
    const resp = await handleToolCall(reqId, body.params, env, request)
    return new Response(JSON.stringify(resp), { status: 200, headers })
  }

  if (body.method === 'ping') {
    return new Response(JSON.stringify(success(reqId, {})), { status: 200, headers })
  }

  return new Response(JSON.stringify(error(reqId, -32601, `Method not found: ${body.method}`)), {
    status: 404,
    headers,
  })
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (e: any) {
      return new Response(JSON.stringify(error(null, -32603, `Unhandled error: ${e.message || e}`)), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
}
