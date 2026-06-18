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
  isSCI: boolean
  isEI: boolean
  isCore: boolean
}

export interface SearchResult {
  query: string
  timestamp: string
  zh_papers: Paper[]
  en_papers: Paper[]
  zh_count: number
  en_count: number
  total: number
}

export interface TokenizedQuery {
  original: string
  tokens: string[]
  isChinese: boolean
  enTranslation: string
  isMedical: boolean
}

export interface MCPServerConfig {
  baiduApiKey: string
  openalexEmail: string
}

export type SearchSource = 'arxiv' | 'semantic' | 'crossref' | 'openalex' | 'pubmed' | 'baidu'
