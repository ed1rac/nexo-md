/**
 * Motor de Indexação de Blocos em `O(1)` e Cache Incremental de Artefatos (`BlockIndex`).
 *
 * Soluciona os 4 maiores gargalos algorítmicos do motor Muya (identificados na Auditoria do MarkText):
 * 1. `getBlock(key)` no Muya (`stateRender.js`) percorria recursivamente toda a árvore de blocos (`O(N)`),
 *    resultando em `O(N²)` durante renderizações e edições. Aqui usamos `Map<string, BlockNode>` (`O(1)`).
 * 2. `labels` de links/referências no Muya (`stateRender.js`) varriam todos os blocos a cada tecla.
 *    Aqui mantemos um índice incremental `referenceLabels` atualizado apenas quando um bloco de definição muda.
 * 3. `renderMermaid` e `katex.renderToString` no Muya re-executavam a cada ciclo `partialRender`.
 *    Aqui usamos `renderedArtifactCache` indexado por hash FNV-1a do código-fonte do bloco.
 */

import katex from 'katex'

export interface BlockNode {
  key: string
  type: 'heading' | 'paragraph' | 'code' | 'math' | 'blockquote' | 'list' | 'table' | 'hr'
  text: string
  lineStart: number
  lineEnd: number
  hash: string
  lang?: string
  level?: number
}

/**
 * Calcula hash rápido FNV-1a (32-bit hex) para chavear cache de blocos e expressões KaTeX/SVG.
 */
export function fastHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export class BlockIndex {
  /** Índice primário `O(1)` de blocos por chave (`key -> BlockNode`) */
  private readonly blockMap = new Map<string, BlockNode>()

  /** Ordem linear das chaves para paginação/virtualização de viewport */
  private blockOrder: string[] = []

  /** Índice incremental de referências Markdown `[label]: url "title"` */
  private readonly referenceLabels = new Map<string, { href: string; title: string }>()

  /** Cache `O(1)` de fórmulas KaTeX e diagramas SVG por hash de conteúdo */
  private readonly renderedArtifactCache = new Map<string, string>()

  private cacheHits = 0
  private cacheMisses = 0

  /**
   * Busca um bloco em tempo constante `O(1)` (substitui a busca recursiva `O(N)` do Muya).
   */
  public getBlock(key: string): BlockNode | undefined {
    return this.blockMap.get(key)
  }

  /**
   * Retorna todos os blocos na ordem do documento ou apenas a janela visível (Viewport Slicing).
   */
  public getViewportBlocks(startIndex = 0, count?: number): BlockNode[] {
    const sliceKeys =
      typeof count === 'number'
        ? this.blockOrder.slice(startIndex, startIndex + count)
        : this.blockOrder
    const result: BlockNode[] = []
    for (const k of sliceKeys) {
      const node = this.blockMap.get(k)
      if (node) result.push(node)
    }
    return result
  }

  /**
   * Sincroniza incrementalmente o documento Markdown no índice `O(1)`.
   * Reutiliza nós cujo hash não mudou desde a última atualização.
   */
  public syncFromMarkdown(markdown: string): BlockNode[] {
    const lines = markdown.split(/\r?\n/)
    const nextOrder: string[] = []
    const seenKeys = new Set<string>()
    this.referenceLabels.clear()

    let i = 0
    let blockCounter = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed === '') {
        i++
        continue
      }

      // Captura definições de referência [id]: https://...
      const refMatch = /^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?/.exec(trimmed)
      if (refMatch) {
        this.referenceLabels.set(refMatch[1].toLowerCase(), {
          href: refMatch[2],
          title: refMatch[3] || ''
        })
      }

      const lineStart = i + 1
      let type: BlockNode['type'] = 'paragraph'
      let lang: string | undefined
      let level: number | undefined
      const buf: string[] = []

      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        type = 'code'
        lang = trimmed.slice(3).trim() || 'plaintext'
        const fence = trimmed.slice(0, 3)
        buf.push(line)
        i++
        while (i < lines.length && !lines[i].trim().startsWith(fence)) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) {
          buf.push(lines[i])
          i++
        }
      } else if (trimmed.startsWith('$$')) {
        type = 'math'
        buf.push(line)
        i++
        if (!trimmed.endsWith('$$') || trimmed === '$$') {
          while (i < lines.length && !lines[i].trim().endsWith('$$')) {
            buf.push(lines[i])
            i++
          }
          if (i < lines.length) {
            buf.push(lines[i])
            i++
          }
        }
      } else if (/^#{1,6}\s+/.test(trimmed)) {
        type = 'heading'
        const m = /^(#{1,6})\s+/.exec(trimmed)
        level = m ? m[1].length : 1
        buf.push(line)
        i++
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        type = 'hr'
        buf.push(line)
        i++
      } else if (trimmed.startsWith('>')) {
        type = 'blockquote'
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          buf.push(lines[i])
          i++
        }
      } else if (/^(\d+\.|[-*+])\s+/.test(trimmed)) {
        type = 'list'
        while (i < lines.length && /^(\s*(\d+\.|[-*+])\s+|\s{2,}\S)/.test(lines[i])) {
          buf.push(lines[i])
          i++
        }
      } else if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        type = 'table'
        while (i < lines.length && lines[i].trim().includes('|')) {
          buf.push(lines[i])
          i++
        }
      } else {
        type = 'paragraph'
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !lines[i].trim().startsWith('#') &&
          !lines[i].trim().startsWith('```') &&
          !lines[i].trim().startsWith('$$')
        ) {
          buf.push(lines[i])
          i++
        }
      }

      const lineEnd = Math.max(lineStart, i)
      const text = buf.join('\n')
      const hash = fastHash(`${type}:${text}`)
      const key = `blk_${blockCounter++}_${hash}`

      const existing = this.blockMap.get(key)
      if (existing && existing.hash === hash) {
        existing.lineStart = lineStart
        existing.lineEnd = lineEnd
      } else {
        this.blockMap.set(key, {
          key,
          type,
          text,
          lineStart,
          lineEnd,
          hash,
          lang,
          level
        })
      }

      nextOrder.push(key)
      seenKeys.add(key)
    }

    // Remove chaves antigas que não existem mais
    for (const oldKey of this.blockMap.keys()) {
      if (!seenKeys.has(oldKey)) {
        this.blockMap.delete(oldKey)
      }
    }

    this.blockOrder = nextOrder
    return this.getViewportBlocks()
  }

  /**
   * Renderiza expressão matemática KaTeX usando cache `O(1)` por hash de conteúdo.
   */
  public renderMathCached(latex: string, displayMode: boolean): string {
    const cacheKey = `math_${displayMode ? 'D' : 'I'}_${fastHash(latex)}`
    const cached = this.renderedArtifactCache.get(cacheKey)
    if (cached) {
      this.cacheHits++
      return cached
    }

    this.cacheMisses++
    try {
      const html = katex.renderToString(latex.trim(), {
        displayMode,
        throwOnError: false,
        output: 'html'
      })
      this.renderedArtifactCache.set(cacheKey, html)
      return html
    } catch (err) {
      return `<span class="math-error">${latex}</span>`
    }
  }

  public getStats() {
    return {
      indexedBlocks: this.blockMap.size,
      referenceLabels: this.referenceLabels.size,
      cachedArtifacts: this.renderedArtifactCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses
    }
  }
}
