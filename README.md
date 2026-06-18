# Bibliography Search MCP

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=fff" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Groq-10a37f?logo=groq&logoColor=fff" alt="Groq" />
  <img src="https://img.shields.io/badge/arXiv-B31B1B?logo=arxiv&logoColor=fff" alt="arXiv" />
</p>

A multi-source academic bibliography search MCP (Machine Context Protocol) server running on Cloudflare Workers. Supports both Chinese and English literature retrieval across 7 academic databases with automatic language detection, query planning, and scoring.

## Features
- **Multi-source search** — arXiv, DBLP, Semantic Scholar, Crossref, OpenAlex, PubMed, Baidu Xueshu
- **Automatic language detection** — chooses appropriate sources and search strategies for Chinese vs English queries
- **LLM-powered query planning** — uses Groq API to build optimal boolean search queries from natural language
- **Dictionary fallback** — built-in Chinese academic vocabulary dictionary when LLM is unavailable
- **Medical query detection** — auto-routes biomedical queries to PubMed
- **Deduplication & scoring** — relevance-based ranking across all sources
- **Export formats** — CSV and BibTeX support

## Usage (MCP)
Configure as an MCP server in your MCP client:
```json
{
  "mcpServers": {
    "bibliography-search": {
      "url": "https://bibliography-search-mcp.example.workers.dev/mcp"
    }
  }
}
```

### Passing your own API keys

Send your Groq key via request header — it takes precedence over the environment variable:

```
x-groq-api-key: gsk_your_key_here
```

Similarly for Baidu Xueshu:

```
x-baidu-api-key: your_baidu_key
```

This is useful when the server is shared but each client has their own quota.

### Tools
| Tool | Description |
|------|-------------|
| `search_papers` | Search academic papers across multiple sources |
| `analyze_query` | Analyze a query without executing search |

## Environment
| Variable | Description |
|----------|-------------|
| `BAIDU_API_KEY` | Baidu Xueshu API key (for Chinese literature) |
| `GROQ_API_KEY` | Groq API key (for LLM query planning) |

## Development
```bash
npm install
npm run dev        # local dev with wrangler
npm run typecheck  # type check
npm run deploy     # deploy to Cloudflare Workers
```

## Architecture
```
User query → [LLM / Dict tokenizer] → search query → [arXiv | DBLP | Semantic Scholar | Crossref | OpenAlex | PubMed | Baidu]
                                                                                                                          ↓
                                                                                              [Deduplicate → Score → Rank]
                                                                                                                          ↓
                                                                                                              Result (JSON / CSV / BibTeX)
```
