import type { Paper } from './types'

function escapeCSV(val: string): string {
  const str = String(val ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCSV(papers: Paper[]): string {
  const header = 'title,authors,year,venue,citations,source,doi,url,abstract'
  const rows = papers.map(p => [
    escapeCSV(p.title),
    escapeCSV(p.authors.join('; ')),
    p.year ?? '',
    escapeCSV(p.venue || ''),
    p.citations ?? 0,
    escapeCSV(p.source || ''),
    escapeCSV(p.doi || ''),
    escapeCSV(p.url || p.pdf || ''),
    escapeCSV((p.abstract || '').slice(0, 500)),
  ].join(','))

  return [header, ...rows].join('\n')
}

function escapeLatex(text: string): string {
  const map: Record<string, string> = {
    '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
    '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}',
    '^': '\\^{}',
  }
  return text.replace(/[&%$#_{}~^]/g, c => map[c] || c)
}

export function exportToBibTeX(papers: Paper[]): string {
  return papers.map((p, i) => {
    const id = p.doi
      ? p.doi.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)
      : `${(p.authors[0] || 'unknown').replace(/[^a-zA-Z]/g, '')}${p.year || 'nodate'}`
    const key = `paper${i + 1}`

    return `@article{${key},
  title = {${escapeLatex(p.title)}},
  author = {${p.authors.join(' and ')}},
  year = {${p.year || 'n.d.'}},
  journal = {${escapeLatex(p.venue || 'Unknown')}},
  doi = {${p.doi || ''}},
  url = {${p.url || p.pdf || ''}},
  abstract = {${escapeLatex((p.abstract || '').slice(0, 500))}}
}`
  }).join('\n\n')
}
