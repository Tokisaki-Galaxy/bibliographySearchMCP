export interface Paper {
  title: string
  authors: string[]
  year?: number
  citations?: number
  venue?: string
  abstract?: string
  pdf?: string
  url?: string
  source?: string
  is_oa?: boolean
  doi?: string
}

export interface ScoredPaper extends Paper {
  score: number
  maxScore: number
}

export interface SearchResult {
  query: string
  search_query?: string
  keyword_query?: string
  sources?: SearchSource[]
  analysis_mode?: 'llm' | 'dict'
  requested_limit: number
  returned_count: number
  timestamp: string
  zh_papers: Paper[]
  en_papers: Paper[]
  zh_count: number
  en_count: number
  total: number
}

export interface TokenizedQuery {
  original: string
  searchQuery: string
  keywordQuery: string
  tokens: string[]
  isChinese: boolean
  isMedical: boolean
  analysisMode?: 'llm' | 'dict'
}

export interface MCPServerConfig {
  baiduApiKey: string
  openalexEmail: string
}

export type SearchSource = 'arxiv' | 'semantic' | 'crossref' | 'openalex' | 'pubmed' | 'baidu' | 'dblp'
