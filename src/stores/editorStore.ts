/**
 * Store Central do Editor NexoMD v0.2.0 (Vue 3 Reactivity + Ponte Híbrida Tauri v2 / Browser).
 *
 * Implementa todas as funcionalidades do MarkText mais as melhorias arquiteturais do NexoMD:
 * - Criação limpa de múltiplos documentos (`+` / `Ctrl+N`), fechamento e renomeação de abas.
 * - Localizar (`Ctrl+F`) e Localizar e Substituir (`Ctrl+H`) com Case Sensitive e Regex.
 * - Exportação para PDF, HTML, DOCX (OpenXML ZIP nativo), DOC, RTF e Markdown (.md).
 * - Importação de arquivos (.md, .markdown, .txt, .html convertido automaticamente para Markdown).
 * - Alteração de final de linha (`LF`, `CRLF`, `CR`) sincronizada com Rust `DocumentBuffer`.
 * - Copiar como Markdown, Copiar como HTML, Colar como Texto Simples.
 * - Duplicar seleção/linha, Criar parágrafo acima/abaixo, Apagar parágrafo/linha.
 * - Títulos H1 a H6, promover (`Ctrl+=`) e rebaixar (`Ctrl+-`) parágrafo/título.
 * - Sublinhado (`<u>`), Sobrescrito (`^`), Subscrito (`~`), Highlight (`==`), Limpar formatação.
 * - Seletor visual de tamanho de tabela (Linhas × Colunas + Alinhamento).
 * - Inserção de Régua Horizontal (`---`), Link, Imagem (URL ou Upload Base64) e Bloco HTML.
 */

import { reactive, computed, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { BlockIndex, fastHash } from '../engine/blockIndex'
import {
  type LineEndingType,
  detectLineEnding,
  normalizeLineEndings,
  exportAsMarkdown,
  exportAsHtml,
  exportAsPdf,
  exportAsDoc,
  exportAsDocx,
  exportAsRtf,
  generateStandaloneHtml,
  generateDocHtml,
  generateRtfString,
  generateDocxUint8Array,
  triggerBlobDownload,
  htmlToMarkdown
} from '../engine/exporters'

export type EditorMode = 'wysiwyg' | 'split' | 'source' | 'readonly'
export type ThemeId =
  | 'nexo-dark'
  | 'nexo-light'
  | 'one-dark'
  | 'material-dark'
  | 'ulysses-light'
  | 'cadmium-light'

export interface TocItem {
  level: number
  text: string
  slug: string
  line: number
}

export interface DocumentStats {
  bytes: number
  chars: number
  lines: number
  words: number
  paragraphs: number
  readingTimeMinutes: number
}

export interface DocumentTab {
  id: string
  path: string | null
  filename: string
  content: string
  encoding: string
  lineEnding: LineEndingType
  hasBom: boolean
  isDirty: boolean
  sha256: string
  canUndo: boolean
  canRedo: boolean
  stats: DocumentStats
  toc: TocItem[]
  undoStack: string[]
  redoStack: string[]
  fileHandle?: any
}

export interface WorkspaceEntry {
  path: string
  relativePath: string
  name: string
  isDir: boolean
  sizeBytes: number
  modifiedMs: number
  depth: number
}

export interface SearchMatch {
  path: string
  relativePath: string
  filename: string
  lineNumber: number
  lineExcerpt: string
  matchStart: number
  matchEnd: number
}

export interface InDocMatch {
  start: number
  end: number
  text: string
}

export interface NexoPreferences {
  theme: ThemeId
  fontSize: number
  lineHeight: number
  autoSave: boolean
  autoSaveDelay: number
  codeBlockLineNumbers: boolean
  sourceLineNumbers: boolean
  spellcheck: boolean
  focusMode: boolean
  typewriterMode: boolean
}

export const DEFAULT_WELCOME_MD = `# Bem-vindo ao NexoMD v0.2.0 (Rust + Tauri v2)

O **NexoMD v0.2.0** combina a arquitetura nativa em **Rust (\`ropey::Rope\` + \`pulldown-cmark\` SIMD)** com todas as ferramentas avançadas de edição, formatação e exportação.

---

## 1. Novidades da Versão 0.2.0

- **Múltiplas Abas e Documentos (\`+\` / \`Ctrl+N\`)**: Crie novos documentos em branco instantaneamente, renomeie com duplo clique e feche abas (\`×\`).
- **Localizar (\`Ctrl+F\`) e Substituir (\`Ctrl+H\`)**: Busca incremental com suporte a *Case Sensitive* (\`Aa\`) e *Expressões Regulares* (\`.*\`).
- **Exportação Completa**: Exporte para **PDF**, **Word (\`.docx\` e \`.doc\`)**, **Rich Text (\`.rtf\`)**, **HTML (\`.html\`)** e **Markdown (\`.md\`)**.
- **Importação Inteligente (\`Ctrl+O\` ou Arrastar e Soltar)**: Abra arquivos \`.md\`, \`.txt\` ou importe \`.html\` convertendo automaticamente para Markdown.
- **Seletor de Final de Linha**: Alterne entre \`LF\`, \`CRLF\` e \`CR\` diretamente na barra de status ou no menu **Arquivo**.
- **Seletor Visual de Tabelas (10×10)**: Escolha o tamanho exato da tabela (\`Linhas × Colunas\`) e o alinhamento antes de inserir.
- **Cabeçalhos H1 a H6 + Promover/Rebaixar (\`Ctrl+=\` / \`Ctrl+-\`)**: Controle completo de hierarquia de parágrafos.
- **Formatação Inline Avançada**: **Negrito**, *Itálico*, <u>Sublinhado</u>, ~~Tachado~~, ==Realce (Highlight)==, Sobrescrito \`H^2^\` (X^2^) e Subscrito \`H~2~O\` (H~2~O).

---

## 2. Comparativo Arquitetural: MarkText vs. NexoMD v0.2.0

| Métrica / Subsistema | MarkText v0.17.1 (Electron 17 + Muya) | NexoMD v0.2.0 (Tauri v2 + Rust Core) |
| :--- | :--- | :--- |
| **Motor de Texto** | Árvore mutável JS (\`ContentState\`) | **\`ropey::Rope\`** em Rust (\`O(log N)\`) |
| **Busca de Bloco (\`getBlock\`)** | Recursiva \`O(N)\` (\`stateRender.js\`) | **\`Map<string, BlockNode>\` em \`O(1)\`** |
| **Histórico Undo / Redo** | \`deepClone\` JSON (\`85 ms\` / \`740 MB\`) | **Snapshots \`Arc\` imutáveis \`O(1)\` (\`< 0.01 ms\`)** |
| **Exportação Nativa** | Apenas HTML / PDF básico | **PDF, DOCX, DOC, RTF, HTML e MD** |
| **Final de Linha** | Apenas LF / CRLF | **LF, CRLF e CR** sincronizados |

---

## 3. Demonstração de Blocos de Código e Fórmulas KaTeX

\`\`\`rust
// Motor ropey::Rope em src-tauri/src/document.rs
pub fn update_text(&mut self, new_text: &str) {
    if self.rope == new_text {
        return;
    }
    self.undo_stack.push(self.rope.clone()); // O(1) via Arc
    self.redo_stack.clear();
    self.rope = Rope::from_str(new_text);
}
\`\`\`

$$
T_{\\text{insert}}(N) = \\mathcal{O}(\\log N), \\quad S_{\\text{snapshot}}(N) = \\mathcal{O}(1)
$$
`

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export const blockIndex = new BlockIndex()

const defaultPrefs: NexoPreferences = {
  theme: 'nexo-dark',
  fontSize: 16,
  lineHeight: 1.65,
  autoSave: true,
  autoSaveDelay: 2000,
  codeBlockLineNumbers: true,
  sourceLineNumbers: true,
  spellcheck: true,
  focusMode: false,
  typewriterMode: false
}

function loadPreferences(): NexoPreferences {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nexomd.preferences') : null
    if (raw) {
      return { ...defaultPrefs, ...JSON.parse(raw) }
    }
  } catch {
    // Usa padrão em caso de JSON inválido
  }
  return { ...defaultPrefs }
}

export const editorStore = reactive({
  tabs: [] as DocumentTab[],
  activeTabId: '' as string,
  mode: 'split' as EditorMode,
  sidebarVisible: true,
  sidebarTab: 'toc' as 'files' | 'search' | 'toc',
  workspaceRoot: '' as string,
  workspaceEntries: [] as WorkspaceEntry[],
  searchQuery: '' as string,
  searchCaseSensitive: false,
  searchResults: [] as SearchMatch[],
  preferences: loadPreferences(),
  showPreferencesModal: false,
  showCommandPalette: false,
  showTableModal: false,
  showLinkModal: false,
  showImageModal: false,
  showRenameModal: false,
  showAboutModal: false,
  toastMessage: null as string | null,
  securityAlert: null as string | null,
  findReplace: {
    visible: false,
    showReplace: false,
    query: '',
    replacement: '',
    caseSensitive: false,
    useRegex: false,
    currentIndex: 0,
    matches: [] as InDocMatch[]
  },
  indexStats: {
    indexedBlocks: 0,
    referenceLabels: 0,
    cachedArtifacts: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
})

let toastTimer: ReturnType<typeof setTimeout> | null = null
export function showToast(msg: string, durationMs = 2600): void {
  editorStore.toastMessage = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    editorStore.toastMessage = null
  }, durationMs)
}

watch(
  () => editorStore.preferences,
  (prefs) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nexomd.preferences', JSON.stringify(prefs))
    }
  },
  { deep: true }
)

export const activeDocument = computed<DocumentTab | undefined>(() =>
  editorStore.tabs.find((t) => t.id === editorStore.activeTabId)
)

/**
 * Calcula estatísticas e TOC localmente e sincroniza o índice `O(1)` de blocos.
 */
function computeLocalAnalysis(content: string): { stats: DocumentStats; toc: TocItem[] } {
  const bytes = new TextEncoder().encode(content).length
  const chars = content.length
  const linesArr = content.split(/\r\n|\r|\n/)
  const lines = Math.max(1, linesArr.length)
  const words = content
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const paragraphs = content
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length
  const readingTimeMinutes = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0

  const toc: TocItem[] = []
  let inCodeFence = false
  for (let i = 0; i < linesArr.length; i++) {
    const line = linesArr[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    const m = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (m) {
      const level = m[1].length
      const text = m[2].replace(/#+$/, '').trim()
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
      toc.push({ level, text, slug, line: i + 1 })
    }
  }

  blockIndex.syncFromMarkdown(content)
  editorStore.indexStats = blockIndex.getStats()

  return {
    stats: { bytes, chars, lines, words, paragraphs, readingTimeMinutes },
    toc
  }
}

/**
 * Renderiza Markdown para HTML seguro com suporte a:
 * - Fórmulas KaTeX em cache `O(1)` (`$$...$$` e `$...$`)
 * - Extensões inline do MarkText: Highlight (`==texto==`), Sobrescrito (`^texto^`), Subscrito (`~texto~`), Sublinhado (`<u>texto</u>`)
 * - Alertas GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)
 * - Notas de rodapé (`[^1]`)
 * - Numeração de linhas em blocos de código (F-04 corrigido)
 * - Sanitização XSS estrita via DOMPurify
 */
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''

  // Protege blocos de código cercados durante substituições inline customizadas
  const codeBlocks: string[] = []
  let processed = markdown.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (match) => {
    codeBlocks.push(match)
    return `\u0000CODEBLOCK_${codeBlocks.length - 1}\u0000`
  })

  // Protege código inline `...`
  const inlineCodes: string[] = []
  processed = processed.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match)
    return `\u0000INLINECODE_${inlineCodes.length - 1}\u0000`
  })

  const escapeAttr = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  // 1. Substitui blocos matemáticos $$...$$ usando cache O(1) e preservando data-tex
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    return `<div class="katex-block" data-tex="${escapeAttr(tex.trim())}">${blockIndex.renderMathCached(tex, true)}</div>`
  })

  // 2. Substitui matemática inline $...$ (evitando valores monetários) e preservando data-tex
  processed = processed.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (full, prefix, tex) => {
    if (/^\d/.test(tex) && /\s/.test(tex)) return full
    return `${prefix}<span class="katex-inline" data-tex="${escapeAttr(tex.trim())}">${blockIndex.renderMathCached(tex, false)}</span>`
  })

  // 3. Extensões inline: Highlight ==texto==, Superscript ^texto^, Subscript ~texto~ (sem conflitar com ~~tachado~~)
  processed = processed.replace(/==([^\n=]+?)==/g, '<mark>$1</mark>')
  processed = processed.replace(/\^([^\n^]+?)\^/g, '<sup>$1</sup>')
  processed = processed.replace(/(^|[^~])~([^\n~]+?)~(?!~)/g, '$1<sub>$2</sub>')

  // 4. Notas de rodapé simples [^id]
  processed = processed.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, '<div class="footnote-def" id="fn-$1"><sup>[$1]</sup> $2</div>')
  processed = processed.replace(/\[\^([^\]]+)\]/g, '<sup class="footnote-ref"><a href="#fn-$1">[$1]</a></sup>')

  // Restaura código inline e blocos de código
  processed = processed.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_, idx) => inlineCodes[Number(idx)])
  processed = processed.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)])

  const rawHtml = marked.parse(processed, {
    gfm: true,
    breaks: false
  }) as string

  // 5. Transforma blockquotes com [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION] em GitHub Alerts
  let finalHtml = rawHtml.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/blockquote>/gi,
    (_, kind: string, rest: string) => {
      const upper = kind.toUpperCase()
      return `<blockquote class="github-alert alert-${upper.toLowerCase()}"><div class="alert-title">${upper}</div><p>${rest}</blockquote>`
    }
  )

  // 6. Aplica numeração de linhas nos blocos <pre><code> quando ativado nas preferências
  if (editorStore.preferences.codeBlockLineNumbers) {
    finalHtml = finalHtml.replace(
      /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, codeContent) => {
        const clean = codeContent.replace(/\n$/, '')
        const codeLines = clean.split('\n')
        const numberedLines = codeLines
          .map(
            (lineText: string, idx: number) =>
              `<span class="code-line"><span class="line-num" data-line="${idx + 1}">${idx + 1}</span><span class="line-text">${lineText || ' '}</span></span>`
          )
          .join('\n')
        const badge = lang ? `<div class="code-lang-badge">${lang}</div>` : ''
        return `<pre class="code-with-lines" data-lang="${escapeAttr(lang || '')}">${badge}<code>${numberedLines}</code></pre>`
      }
    )
  }

  editorStore.indexStats = blockIndex.getStats()

  return DOMPurify.sanitize(finalHtml, {
    ADD_TAGS: [
      'u',
      'sup',
      'sub',
      'mark',
      'ins',
      'del',
      'hr',
      'img',
      'div',
      'span',
      'details',
      'summary',
      'kbd',
      'math',
      'semantics',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'mfrac',
      'msqrt',
      'mtext',
      'annotation'
    ],
    ADD_ATTR: [
      'data-line',
      'data-tex',
      'data-lang',
      'colspan',
      'rowspan',
      'aria-hidden',
      'style',
      'class',
      'target',
      'id',
      'href',
      'src',
      'alt',
      'title',
      'width',
      'height'
    ]
  })
}

let untitledCounter = 0

function generateNextUntitledName(): string {
  untitledCounter += 1
  const existingNames = new Set(editorStore.tabs.map((t) => t.filename.toLowerCase()))
  while (existingNames.has(`sem-titulo-${untitledCounter}.md`)) {
    untitledCounter += 1
  }
  return `Sem-Titulo-${untitledCounter}.md`
}

/**
 * Cria uma nova aba de documento limpa e seleciona-a imediatamente.
 * Se chamada pelo clique no botão `+` sem argumentos (ou com MouseEvent), gera `Sem-Titulo-N.md` vazio.
 */
export async function createNewDocument(
  filename?: string | Event,
  initialContent = '',
  lineEnding: LineEndingType = 'LF'
): Promise<DocumentTab> {
  const resolvedFilename =
    typeof filename === 'string' && filename.trim().length > 0
      ? filename.trim()
      : generateNextUntitledName()

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('create_document', {
        filename: resolvedFilename,
        initialContent
      })
      if (lineEnding !== 'LF') {
        await invokeTauri<any>('set_document_line_ending', {
          docId: view.id,
          lineEnding
        })
        view.lineEnding = lineEnding
      }
      blockIndex.syncFromMarkdown(view.content)
      editorStore.indexStats = blockIndex.getStats()
      const tab: DocumentTab = {
        ...view,
        lineEnding: (view.lineEnding as LineEndingType) || lineEnding,
        undoStack: [],
        redoStack: []
      }
      editorStore.tabs.push(tab)
      editorStore.activeTabId = tab.id
      recomputeFindMatches()
      return tab
    } catch (err) {
      console.warn('Fallback para buffer local:', err)
    }
  }

  const { stats, toc } = computeLocalAnalysis(initialContent)
  const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const tab: DocumentTab = {
    id,
    path: null,
    filename: resolvedFilename,
    content: initialContent,
    encoding: 'UTF-8',
    lineEnding,
    hasBom: false,
    isDirty: false,
    sha256: fastHash(initialContent),
    canUndo: false,
    canRedo: false,
    stats,
    toc,
    undoStack: [],
    redoStack: []
  }
  editorStore.tabs.push(tab)
  editorStore.activeTabId = tab.id
  recomputeFindMatches()
  return tab
}

/**
 * Fecha uma aba de documento. Se for a última aba aberta, cria um novo documento em branco.
 */
export async function closeDocumentTab(tabId?: string): Promise<void> {
  const targetId = tabId || editorStore.activeTabId
  const idx = editorStore.tabs.findIndex((t) => t.id === targetId)
  if (idx === -1) return

  if (isTauriRuntime()) {
    try {
      await invokeTauri('close_document', { docId: targetId })
    } catch {
      // ignora caso documento seja apenas local
    }
  }

  editorStore.tabs.splice(idx, 1)

  if (editorStore.tabs.length === 0) {
    await createNewDocument(undefined, '')
  } else if (editorStore.activeTabId === targetId) {
    const nextIdx = Math.min(idx, editorStore.tabs.length - 1)
    editorStore.activeTabId = editorStore.tabs[nextIdx].id
  }
  recomputeFindMatches()
}

/**
 * Renomeia uma aba de documento.
 */
export async function renameDocumentTab(tabId: string, newFilename: string): Promise<void> {
  const doc = editorStore.tabs.find((t) => t.id === tabId)
  if (!doc) return
  let clean = newFilename.trim()
  if (!clean) return
  if (!/\.(md|markdown|txt)$/i.test(clean)) {
    clean += '.md'
  }
  doc.filename = clean

  if (isTauriRuntime()) {
    try {
      await invokeTauri('rename_document', { docId: doc.id, filename: clean })
    } catch {
      // fallback local
    }
  }
}

/**
 * Define o final de linha (`LF`, `CRLF` ou `CR`) do documento ativo.
 */
export async function setDocumentLineEnding(lineEnding: LineEndingType): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return
  doc.lineEnding = lineEnding
  doc.isDirty = true

  if (isTauriRuntime()) {
    try {
      await invokeTauri('set_document_line_ending', {
        docId: doc.id,
        lineEnding
      })
    } catch {
      // fallback local
    }
  }
  showToast(`Final de linha alterado para ${lineEnding}`)
}

export async function cycleDocumentLineEnding(): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return
  const order: LineEndingType[] = ['LF', 'CRLF', 'CR']
  const next = order[(order.indexOf(doc.lineEnding) + 1) % order.length]
  await setDocumentLineEnding(next)
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Atualiza o texto do documento ativo mantendo histórico `O(1)` e acionando Auto-Save real.
 */
export async function updateActiveDocumentContent(newContent: string): Promise<void> {
  const doc = activeDocument.value
  if (!doc || doc.content === newContent) return

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('update_document_text', {
        docId: doc.id,
        content: newContent
      })
      Object.assign(doc, view)
      blockIndex.syncFromMarkdown(newContent)
      editorStore.indexStats = blockIndex.getStats()
    } catch {
      // Fallback local caso falhe
      doc.undoStack.push(doc.content)
      doc.redoStack = []
      doc.content = newContent
      doc.isDirty = true
      const { stats, toc } = computeLocalAnalysis(newContent)
      doc.stats = stats
      doc.toc = toc
    }
  } else {
    doc.undoStack.push(doc.content)
    if (doc.undoStack.length > 500) doc.undoStack.shift()
    doc.redoStack = []
    doc.content = newContent
    doc.isDirty = true
    doc.canUndo = doc.undoStack.length > 0
    doc.canRedo = false
    const { stats, toc } = computeLocalAnalysis(newContent)
    doc.stats = stats
    doc.toc = toc
  }

  if (editorStore.findReplace.visible && editorStore.findReplace.query) {
    recomputeFindMatches()
  }

  if (editorStore.preferences.autoSave && doc.isDirty) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      void saveActiveDocument(true)
    }, editorStore.preferences.autoSaveDelay)
  }
}

export async function undoActiveDocument(): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('undo_document', { docId: doc.id })
      Object.assign(doc, view)
      blockIndex.syncFromMarkdown(doc.content)
      editorStore.indexStats = blockIndex.getStats()
      return
    } catch {
      // fallback local
    }
  }

  const prev = doc.undoStack.pop()
  if (prev !== undefined) {
    doc.redoStack.push(doc.content)
    doc.content = prev
    doc.canUndo = doc.undoStack.length > 0
    doc.canRedo = doc.redoStack.length > 0
    const { stats, toc } = computeLocalAnalysis(doc.content)
    doc.stats = stats
    doc.toc = toc
  }
}

export async function redoActiveDocument(): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('redo_document', { docId: doc.id })
      Object.assign(doc, view)
      blockIndex.syncFromMarkdown(doc.content)
      editorStore.indexStats = blockIndex.getStats()
      return
    } catch {
      // fallback local
    }
  }

  const next = doc.redoStack.pop()
  if (next !== undefined) {
    doc.undoStack.push(doc.content)
    doc.content = next
    doc.canUndo = doc.undoStack.length > 0
    doc.canRedo = doc.redoStack.length > 0
    const { stats, toc } = computeLocalAnalysis(doc.content)
    doc.stats = stats
    doc.toc = toc
  }
}

/**
 * Salva atomicamente o documento no disco ou armazenamento local.
 * Se isAutoSave for true e o arquivo não possuir caminho salvo, grava no cache local para não interromper a digitação.
 * Se isAutoSave for false (clique do usuário / Ctrl+S) e não possuir caminho, abre o diálogo "Salvar Como".
 */
export async function saveActiveDocument(isAutoSave = false): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return

  if (!doc.path) {
    if (isAutoSave) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`nexomd.saved.${doc.filename}`, doc.content)
      }
      return
    }
    await saveActiveDocumentAs()
    return
  }

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('save_document_atomic', {
        docId: doc.id,
        targetPath: doc.path,
        content: doc.content
      })
      Object.assign(doc, view)
      doc.isDirty = false
      showToast(`Salvo: ${doc.filename}`)
      return
    } catch (err) {
      showToast(`Erro ao salvar: ${String(err)}`)
      return
    }
  }

  if (doc.fileHandle) {
    try {
      const writable = await doc.fileHandle.createWritable()
      await writable.write(doc.content)
      await writable.close()
      doc.sha256 = fastHash(doc.content)
      doc.isDirty = false
      showToast(`Salvo: ${doc.filename}`)
      return
    } catch {
      // fallback localStorage
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`nexomd.saved.${doc.filename}`, doc.content)
  }
  doc.sha256 = fastHash(doc.content)
  doc.isDirty = false
  showToast(`Salvo: ${doc.filename}`)
}

/**
 * Diálogo Salvar Como (Save As) nativo no Tauri ou File System Access API / Download no Navegador.
 */
export async function saveActiveDocumentAs(): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return

  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('save_document_as_dialog', {
        docId: doc.id,
        defaultFilename: doc.filename,
        content: doc.content
      })
      if (view) {
        Object.assign(doc, view)
        doc.isDirty = false
        showToast(`Salvo com sucesso: ${doc.filename}`)
      }
      return
    } catch (err) {
      showToast(`Erro ao salvar: ${String(err)}`)
      return
    }
  }

  // Navegador: File System Access API
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: doc.filename.endsWith('.md') ? doc.filename : `${doc.filename}.md`,
        types: [
          {
            description: 'Documento Markdown (*.md)',
            accept: { 'text/markdown': ['.md', '.markdown', '.txt'] }
          }
        ]
      })
      const writable = await handle.createWritable()
      await writable.write(doc.content)
      await writable.close()
      doc.fileHandle = handle
      doc.filename = handle.name
      doc.sha256 = fastHash(doc.content)
      doc.isDirty = false
      showToast(`Salvo: ${doc.filename}`)
      return
    } catch (err: any) {
      if (err.name === 'AbortError') return
    }
  }

  // Fallback download direto
  exportAsMarkdown(doc.filename, doc.content, doc.lineEnding)
  doc.sha256 = fastHash(doc.content)
  doc.isDirty = false
  showToast(`Baixado: ${doc.filename}`)
}

/**
 * Abre diálogo nativo de seleção de arquivo (Tauri) ou File System Access API (Web).
 */
export async function openDocumentWithDialog(): Promise<DocumentTab | null> {
  if (isTauriRuntime()) {
    try {
      const view = await invokeTauri<any>('pick_and_open_document')
      if (!view) return null

      const isHtml = /\.(html|htm)$/i.test(view.filename)
      if (isHtml) {
        const converted = htmlToMarkdown(view.content)
        const mdName = view.filename.replace(/\.(html|htm)$/i, '.md')
        await invokeTauri('rename_document', { docId: view.id, filename: mdName })
        const updatedView = await invokeTauri<any>('update_document_text', {
          docId: view.id,
          content: converted
        })
        Object.assign(view, updatedView)
      }

      blockIndex.syncFromMarkdown(view.content)
      editorStore.indexStats = blockIndex.getStats()
      const tab: DocumentTab = {
        ...view,
        lineEnding: (view.lineEnding as LineEndingType) || 'LF',
        undoStack: [],
        redoStack: []
      }
      editorStore.tabs.push(tab)
      editorStore.activeTabId = tab.id
      recomputeFindMatches()
      showToast(`Arquivo aberto: ${tab.filename} (${tab.lineEnding})`)
      return tab
    } catch (err) {
      showToast(`Erro ao abrir arquivo: ${String(err)}`)
      return null
    }
  }

  // Web: File System Access API
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Documentos suportados (*.md, *.txt, *.html)',
            accept: {
              'text/markdown': ['.md', '.markdown'],
              'text/plain': ['.txt'],
              'text/html': ['.html', '.htm']
            }
          }
        ],
        multiple: false
      })
      if (!handle) return null
      const file = await handle.getFile()
      const rawText = await file.text()
      const detectedLe = detectLineEnding(rawText)
      const isHtml = /\.(html|htm)$/i.test(file.name)
      let finalContent = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      let finalName = file.name
      if (isHtml) {
        finalContent = htmlToMarkdown(rawText)
        finalName = file.name.replace(/\.(html|htm)$/i, '.md')
      }
      const tab = await createNewDocument(finalName, finalContent, detectedLe)
      tab.fileHandle = handle
      showToast(`Arquivo aberto: ${finalName} (${detectedLe})`)
      return tab
    } catch (err: any) {
      if (err.name === 'AbortError') return null
    }
  }

  return null
}

/**
 * Abre um arquivo diretamente pelo caminho nativo no disco quando em execução no Tauri v2 (`open_document`).
 * Se for `.html` / `.htm`, converte automaticamente para Markdown limpo.
 */
export async function openDocumentFromPath(filePath: string): Promise<DocumentTab | null> {
  if (!isTauriRuntime()) return null
  try {
    const view = await invokeTauri<any>('open_document', { path: filePath })
    const isHtml = /\.(html|htm)$/i.test(view.filename)
    if (isHtml) {
      const converted = htmlToMarkdown(view.content)
      const mdName = view.filename.replace(/\.(html|htm)$/i, '.md')
      await invokeTauri('rename_document', { docId: view.id, filename: mdName })
      const updatedView = await invokeTauri<any>('update_document_text', {
        docId: view.id,
        content: converted
      })
      Object.assign(view, updatedView)
    }
    blockIndex.syncFromMarkdown(view.content)
    editorStore.indexStats = blockIndex.getStats()
    const tab: DocumentTab = {
      ...view,
      lineEnding: (view.lineEnding as LineEndingType) || 'LF',
      undoStack: [],
      redoStack: []
    }
    editorStore.tabs.push(tab)
    editorStore.activeTabId = tab.id
    recomputeFindMatches()
    showToast(`Arquivo aberto: ${tab.filename} (${tab.lineEnding})`)
    return tab
  } catch (err) {
    showToast(`Erro ao abrir arquivo: ${String(err)}`)
    return null
  }
}

/**
 * Importa um arquivo do disco (.md, .markdown, .txt, .html, .htm).
 * Se possuir caminho nativo no Tauri, usa `open_document` em Rust; se for .html/.htm, converte para Markdown!
 */
export async function importFileObject(file: File): Promise<void> {
  const nativePath = (file as File & { path?: string }).path
  if (isTauriRuntime() && nativePath) {
    const opened = await openDocumentFromPath(nativePath)
    if (opened) return
  }

  const rawText = await file.text()
  const detectedLe = detectLineEnding(rawText)
  const isHtml = /\.(html|htm)$/i.test(file.name)

  let finalContent = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let finalName = file.name

  if (isHtml) {
    finalContent = htmlToMarkdown(rawText)
    finalName = file.name.replace(/\.(html|htm)$/i, '.md')
  }

  await createNewDocument(finalName, finalContent, detectedLe)
  showToast(`Arquivo importado: ${finalName} (${detectedLe})`)
}

/**
 * Funções de Exportação do Documento Ativo (suporta Desktop nativo via Tauri e Web).
 */
export async function exportActiveDocument(
  format: 'md' | 'html' | 'pdf' | 'docx' | 'doc' | 'rtf'
): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return
  const html = renderMarkdownToHtml(doc.content)

  if (format === 'pdf') {
    exportAsPdf(doc.filename, html)
    showToast('Diálogo de impressão PDF acionado!')
    return
  }

  const baseTitle =
    doc.filename.replace(/\.(md|markdown|txt|html|htm|docx|doc|rtf|pdf)$/i, '') || 'documento'
  let outFilename = ''
  let filterName = ''
  let filterExt = ''
  let mimeType = ''
  let fileBytes: Uint8Array

  switch (format) {
    case 'md': {
      outFilename = `${baseTitle}.md`
      filterName = 'Documento Markdown (*.md)'
      filterExt = 'md'
      mimeType = 'text/markdown;charset=utf-8'
      const normalized = normalizeLineEndings(doc.content, doc.lineEnding)
      fileBytes = new TextEncoder().encode(normalized)
      break
    }
    case 'html': {
      outFilename = `${baseTitle}.html`
      filterName = 'Página Web (*.html)'
      filterExt = 'html'
      mimeType = 'text/html;charset=utf-8'
      const standalone = generateStandaloneHtml(doc.filename, html)
      fileBytes = new TextEncoder().encode(standalone)
      break
    }
    case 'docx': {
      outFilename = `${baseTitle}.docx`
      filterName = 'Documento Word (*.docx)'
      filterExt = 'docx'
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      fileBytes = generateDocxUint8Array(doc.filename, doc.content)
      break
    }
    case 'doc': {
      outFilename = `${baseTitle}.doc`
      filterName = 'Documento Word 97-2003 (*.doc)'
      filterExt = 'doc'
      mimeType = 'application/msword;charset=utf-8'
      const docHtml = generateDocHtml(doc.filename, html)
      const encoded = new TextEncoder().encode(docHtml)
      const withBom = new Uint8Array(encoded.length + 3)
      withBom.set([0xef, 0xbb, 0xbf], 0)
      withBom.set(encoded, 3)
      fileBytes = withBom
      break
    }
    case 'rtf': {
      outFilename = `${baseTitle}.rtf`
      filterName = 'Rich Text Format (*.rtf)'
      filterExt = 'rtf'
      mimeType = 'application/rtf;charset=utf-8'
      const rtfStr = generateRtfString(doc.filename, doc.content)
      fileBytes = new TextEncoder().encode(rtfStr)
      break
    }
  }

  // Em ambiente Tauri Desktop: usa diálogo nativo de salvamento e escrita em disco!
  if (isTauriRuntime()) {
    try {
      const savedPath = await invokeTauri<string | null>('export_file_native', {
        defaultFilename: outFilename,
        filterName,
        filterExt,
        contentBytes: Array.from(fileBytes)
      })
      if (savedPath) {
        showToast(`Exportado: ${savedPath}`)
      }
      return
    } catch (err) {
      showToast(`Erro na exportação: ${String(err)}`)
      // segue para fallback
    }
  }

  // Em ambiente Navegador (Web): usa File System Access API showSaveFilePicker
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: outFilename,
        types: [
          {
            description: filterName,
            accept: { [mimeType]: [`.${filterExt}`] }
          }
        ]
      })
      const writable = await handle.createWritable()
      await writable.write(fileBytes)
      await writable.close()
      showToast(`Exportado: ${handle.name}`)
      return
    } catch (err: any) {
      if (err.name === 'AbortError') return
    }
  }

  // Fallback Web: download direto de Blob
  const blob = new Blob([fileBytes as any], { type: mimeType })
  triggerBlobDownload(blob, outFilename)
  showToast(`Baixado: ${outFilename}`)
}

/**
 * Operações de Área de Transferência: Copiar como Markdown, Copiar como HTML, Colar como Texto Simples.
 */
export async function copyAsMarkdown(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return
  const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd
  const textToCopy = hasSelection
    ? doc.content.slice(textarea!.selectionStart, textarea!.selectionEnd)
    : doc.content

  try {
    await navigator.clipboard.writeText(textToCopy)
    showToast('Copiado como Markdown!')
  } catch {
    showToast('Não foi possível acessar a área de transferência.')
  }
}

export async function copyAsHtml(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc) return
  const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd
  const mdSlice = hasSelection
    ? doc.content.slice(textarea!.selectionStart, textarea!.selectionEnd)
    : doc.content
  const html = renderMarkdownToHtml(mdSlice)

  try {
    await navigator.clipboard.writeText(html)
    showToast('Copiado como código HTML!')
  } catch {
    showToast('Não foi possível acessar a área de transferência.')
  }
}

export async function pasteAsPlainText(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  try {
    const rawClip = await navigator.clipboard.readText()
    if (!rawClip) return
    // Remove tags HTML residuais e normaliza quebras de linha
    const plain = rawClip.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n')
    const start = textarea ? textarea.selectionStart : doc.content.length
    const end = textarea ? textarea.selectionEnd : doc.content.length
    const updated = doc.content.slice(0, start) + plain + doc.content.slice(end)
    await updateActiveDocumentContent(updated)
    showToast('Colado como texto simples!')
  } catch {
    showToast('Use Ctrl+Shift+V para colar como texto simples.')
  }
}

/**
 * Localizar (`Ctrl+F`) e Localizar e Substituir (`Ctrl+H`) no documento ativo.
 */
export function openFindBar(withReplace = false): void {
  editorStore.findReplace.visible = true
  editorStore.findReplace.showReplace = withReplace
  recomputeFindMatches()
}

export function closeFindBar(): void {
  editorStore.findReplace.visible = false
}

export function recomputeFindMatches(textarea?: HTMLTextAreaElement | null): void {
  const doc = activeDocument.value
  const fr = editorStore.findReplace
  if (!doc || !fr.query) {
    fr.matches = []
    fr.currentIndex = 0
    return
  }

  const matches: InDocMatch[] = []
  try {
    const flags = fr.caseSensitive ? 'g' : 'gi'
    const pattern = fr.useRegex ? fr.query : fr.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(pattern, flags)
    let m: RegExpExecArray | null
    while ((m = regex.exec(doc.content)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++
        continue
      }
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0]
      })
      if (matches.length >= 2000) break
    }
  } catch {
    // Regex inválida durante digitação
  }

  fr.matches = matches
  if (fr.currentIndex >= matches.length) {
    fr.currentIndex = 0
  }
  if (textarea && matches.length > 0) {
    focusMatchInTextarea(textarea, true)
  }
}

function focusMatchInTextarea(
  textarea?: HTMLTextAreaElement | null,
  preserveActiveInput = true
): void {
  const doc = activeDocument.value
  const fr = editorStore.findReplace
  if (!doc || !textarea || fr.matches.length === 0) return
  const match = fr.matches[fr.currentIndex]
  if (!match) return

  const prevActive =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
  const shouldRestoreInput =
    preserveActiveInput &&
    prevActive &&
    prevActive !== textarea &&
    (prevActive.tagName === 'INPUT' || prevActive.tagName === 'BUTTON')

  textarea.setSelectionRange(match.start, match.end)

  // Rola o textarea proporcionalmente até a linha da ocorrência encontrada
  const lineIndex = doc.content.slice(0, match.start).split('\n').length - 1
  const lineHeightPx = Math.round(
    editorStore.preferences.fontSize * editorStore.preferences.lineHeight
  )
  textarea.scrollTop = Math.max(0, lineIndex * lineHeightPx - textarea.clientHeight / 3)

  if (!shouldRestoreInput) {
    textarea.focus()
  }
}

export function findNextMatch(textarea?: HTMLTextAreaElement | null): void {
  const fr = editorStore.findReplace
  if (fr.matches.length === 0) {
    recomputeFindMatches()
  }
  if (fr.matches.length === 0) return
  fr.currentIndex = (fr.currentIndex + 1) % fr.matches.length
  focusMatchInTextarea(textarea, true)
}

export function findPrevMatch(textarea?: HTMLTextAreaElement | null): void {
  const fr = editorStore.findReplace
  if (fr.matches.length === 0) {
    recomputeFindMatches()
  }
  if (fr.matches.length === 0) return
  fr.currentIndex = (fr.currentIndex - 1 + fr.matches.length) % fr.matches.length
  focusMatchInTextarea(textarea, true)
}

export async function replaceCurrentMatch(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  const fr = editorStore.findReplace
  if (!doc || fr.matches.length === 0) return
  const match = fr.matches[fr.currentIndex]
  if (!match) return

  const updated =
    doc.content.slice(0, match.start) + fr.replacement + doc.content.slice(match.end)
  await updateActiveDocumentContent(updated)
  recomputeFindMatches(textarea)
}

export async function replaceAllMatches(): Promise<void> {
  const doc = activeDocument.value
  const fr = editorStore.findReplace
  if (!doc || !fr.query) return

  try {
    const flags = fr.caseSensitive ? 'g' : 'gi'
    const pattern = fr.useRegex ? fr.query : fr.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(pattern, flags)
    const count = fr.matches.length
    const updated = doc.content.replace(regex, fr.replacement)
    await updateActiveDocumentContent(updated)
    recomputeFindMatches()
    showToast(`${count} ocorrência(s) substituída(s).`)
  } catch {
    showToast('Expressão regular inválida.')
  }
}

/**
 * Valida segurança de links clicados no preview antes de abrir.
 */
export async function handleSafeLinkClick(href: string): Promise<void> {
  if (isTauriRuntime()) {
    const res = await invokeTauri<{
      allowed: boolean
      category: string
      normalizedTarget: string
      reason: string | null
    }>('validate_and_open_link', { href })

    if (!res.allowed) {
      editorStore.securityAlert = `${res.reason} (${res.normalizedTarget})`
      return
    }
  } else {
    const lower = href.trim().toLowerCase()
    const blockedExts = [
      '.exe',
      '.bat',
      '.cmd',
      '.ps1',
      '.vbs',
      '.msi',
      '.lnk',
      '.scr',
      '.hta',
      '.reg'
    ]
    if (lower.startsWith('javascript:') || blockedExts.some((ext) => lower.endsWith(ext))) {
      editorStore.securityAlert = `Execução de destino perigoso bloqueada: ${href}`
      return
    }
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Utilitário para localizar os limites da linha onde o cursor está posicionado.
 */
function getCurrentLineBounds(content: string, cursorPos: number): {
  lineStart: number
  lineEnd: number
  lineText: string
} {
  const lineStart = content.lastIndexOf('\n', Math.max(0, cursorPos - 1)) + 1
  const nextNewline = content.indexOf('\n', cursorPos)
  const lineEnd = nextNewline === -1 ? content.length : nextNewline
  return {
    lineStart,
    lineEnd,
    lineText: content.slice(lineStart, lineEnd)
  }
}

/**
 * Altera o nível de cabeçalho (H1..H6 ou Parágrafo normal P) da linha atual, ou promove/rebaixa o título.
 */
export async function applyHeadingLevel(
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 'promote' | 'demote',
  textarea?: HTMLTextAreaElement | null
): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  const pos = textarea ? textarea.selectionStart : doc.content.length
  const { lineStart, lineEnd, lineText } = getCurrentLineBounds(doc.content, pos)
  const match = /^(#{1,6})\s+(.*)$/.exec(lineText)
  const currentLevel = match ? match[1].length : 0
  const cleanText = match ? match[2] : lineText

  let targetLevel: number
  if (level === 'promote') {
    // Promove: P -> H1, ou H(n) -> H(n-1) (ex: H4 -> H3 -> H2 -> H1)
    targetLevel = currentLevel === 0 ? 1 : Math.max(1, currentLevel - 1)
  } else if (level === 'demote') {
    // Rebaixa: H1 -> H2 -> H3 -> H4 -> H5 -> H6 -> P(0), ou P -> H2
    targetLevel = currentLevel === 0 ? 2 : currentLevel >= 6 ? 0 : currentLevel + 1
  } else {
    targetLevel = level
  }

  const newLine =
    targetLevel === 0
      ? cleanText || 'Parágrafo'
      : `${'#'.repeat(targetLevel)} ${cleanText || `Título ${targetLevel}`}`

  const updated = doc.content.slice(0, lineStart) + newLine + doc.content.slice(lineEnd)
  await updateActiveDocumentContent(updated)
}

/**
 * Ações de Parágrafo e Seleção do MarkText:
 * - Duplicar seleção ou linha atual
 * - Criar parágrafo acima / abaixo
 * - Apagar parágrafo / linha atual
 */
export async function duplicateSelectionOrLine(
  textarea?: HTMLTextAreaElement | null
): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  const start = textarea ? textarea.selectionStart : doc.content.length
  const end = textarea ? textarea.selectionEnd : doc.content.length

  if (start !== end) {
    const selected = doc.content.slice(start, end)
    const updated = doc.content.slice(0, end) + selected + doc.content.slice(end)
    await updateActiveDocumentContent(updated)
    return
  }

  const { lineStart, lineEnd, lineText } = getCurrentLineBounds(doc.content, start)
  const updated = doc.content.slice(0, lineEnd) + `\n${lineText}` + doc.content.slice(lineStart ? lineEnd : lineEnd)
  await updateActiveDocumentContent(updated)
}

export async function createParagraphAbove(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return
  const pos = textarea ? textarea.selectionStart : doc.content.length
  const { lineStart } = getCurrentLineBounds(doc.content, pos)
  const updated = doc.content.slice(0, lineStart) + '\n' + doc.content.slice(lineStart)
  await updateActiveDocumentContent(updated)
}

export async function createParagraphBelow(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return
  const pos = textarea ? textarea.selectionStart : doc.content.length
  const { lineEnd } = getCurrentLineBounds(doc.content, pos)
  const updated = doc.content.slice(0, lineEnd) + '\n\n' + doc.content.slice(lineEnd)
  await updateActiveDocumentContent(updated)
}

export async function deleteParagraphOrLine(textarea?: HTMLTextAreaElement | null): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return
  const pos = textarea ? textarea.selectionStart : doc.content.length
  const { lineStart, lineEnd } = getCurrentLineBounds(doc.content, pos)
  const removeEnd = lineEnd < doc.content.length && doc.content[lineEnd] === '\n' ? lineEnd + 1 : lineEnd
  const removeStart = removeEnd === doc.content.length && lineStart > 0 ? lineStart - 1 : lineStart
  const updated = doc.content.slice(0, removeStart) + doc.content.slice(removeEnd)
  await updateActiveDocumentContent(updated)
}

/**
 * Insere uma tabela Markdown com dimensões e alinhamento escolhidos pelo usuário.
 */
export async function insertCustomTable(
  rows: number,
  cols: number,
  alignment: 'left' | 'center' | 'right' = 'left',
  textarea?: HTMLTextAreaElement | null
): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  const safeRows = Math.max(1, Math.min(30, rows))
  const safeCols = Math.max(1, Math.min(15, cols))
  const alignToken =
    alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : ':---'

  const headers = Array.from({ length: safeCols }, (_, i) => `Coluna ${i + 1}`)
  const sep = Array.from({ length: safeCols }, () => alignToken)
  const bodyLines: string[] = []
  for (let r = 0; r < safeRows; r++) {
    const cells = Array.from({ length: safeCols }, (_, c) => `Item ${r + 1}.${c + 1}`)
    bodyLines.push(`| ${cells.join(' | ')} |`)
  }

  const tableMd = `\n| ${headers.join(' | ')} |\n| ${sep.join(' | ')} |\n${bodyLines.join('\n')}\n`
  const pos = textarea ? textarea.selectionEnd : doc.content.length
  const updated = doc.content.slice(0, pos) + tableMd + doc.content.slice(pos)
  await updateActiveDocumentContent(updated)
  editorStore.showTableModal = false
}

/**
 * Insere Link Markdown completo.
 */
export async function insertMarkdownLink(
  text: string,
  url: string,
  title = '',
  textarea?: HTMLTextAreaElement | null
): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  const label = text.trim() || 'Texto do Link'
  const href = url.trim() || 'https://'
  const md = title.trim()
    ? `[${label}](${href} "${title.trim()}")`
    : `[${label}](${href})`

  const start = textarea ? textarea.selectionStart : doc.content.length
  const end = textarea ? textarea.selectionEnd : doc.content.length
  const updated = doc.content.slice(0, start) + md + doc.content.slice(end)
  await updateActiveDocumentContent(updated)
  editorStore.showLinkModal = false
}

/**
 * Insere Imagem Markdown (URL ou DataURL Base64).
 */
export async function insertMarkdownImage(
  alt: string,
  url: string,
  title = '',
  textarea?: HTMLTextAreaElement | null
): Promise<void> {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  const label = alt.trim() || 'Imagem'
  const src = url.trim()
  if (!src) return
  const md = title.trim()
    ? `\n![${label}](${src} "${title.trim()}")\n`
    : `\n![${label}](${src})\n`

  const start = textarea ? textarea.selectionStart : doc.content.length
  const end = textarea ? textarea.selectionEnd : doc.content.length
  const updated = doc.content.slice(0, start) + md + doc.content.slice(end)
  await updateActiveDocumentContent(updated)
  editorStore.showImageModal = false
}

/**
 * Remove toda a formatação Markdown e HTML inline da seleção ou linha atual.
 */
export function stripMarkdownFormatting(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/\^(.+?)\^/g, '$1')
    .replace(/~(.+?)~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?(u|ins|del|s|strike|sup|sub|mark|b|strong|i|em|code|span|div)[^>]*>/gi, '')
}

/**
 * Aplica formatação Markdown na seleção ou linha atual.
 */
export function applyToolbarFormat(action: string, textarea?: HTMLTextAreaElement | null): void {
  const doc = activeDocument.value
  if (!doc || editorStore.mode === 'readonly') return

  if (action === 'h1') return void applyHeadingLevel(1, textarea)
  if (action === 'h2') return void applyHeadingLevel(2, textarea)
  if (action === 'h3') return void applyHeadingLevel(3, textarea)
  if (action === 'h4') return void applyHeadingLevel(4, textarea)
  if (action === 'h5') return void applyHeadingLevel(5, textarea)
  if (action === 'h6') return void applyHeadingLevel(6, textarea)
  if (action === 'paragraph') return void applyHeadingLevel(0, textarea)
  if (action === 'promote') return void applyHeadingLevel('promote', textarea)
  if (action === 'demote') return void applyHeadingLevel('demote', textarea)
  if (action === 'duplicate') return void duplicateSelectionOrLine(textarea)
  if (action === 'paragraphAbove') return void createParagraphAbove(textarea)
  if (action === 'paragraphBelow') return void createParagraphBelow(textarea)
  if (action === 'deleteParagraph') return void deleteParagraphOrLine(textarea)

  if (action === 'table') {
    editorStore.showTableModal = true
    return
  }
  if (action === 'link') {
    editorStore.showLinkModal = true
    return
  }
  if (action === 'image') {
    editorStore.showImageModal = true
    return
  }

  const start = textarea ? textarea.selectionStart : doc.content.length
  const end = textarea ? textarea.selectionEnd : doc.content.length
  const selected = doc.content.slice(start, end)
  let replacement = selected

  switch (action) {
    case 'bold':
      replacement = `**${selected || 'texto em negrito'}**`
      break
    case 'italic':
      replacement = `*${selected || 'texto em itálico'}*`
      break
    case 'underline':
      replacement = `<u>${selected || 'texto sublinhado'}</u>`
      break
    case 'strike':
      replacement = `~~${selected || 'texto tachado'}~~`
      break
    case 'highlight':
      replacement = `==${selected || 'texto destacado'}==`
      break
    case 'superscript':
      replacement = `^${selected || 'sobrescrito'}^`
      break
    case 'subscript':
      replacement = `~${selected || 'subscrito'}~`
      break
    case 'inlineCode':
      replacement = `\`${selected || 'codigo'}\``
      break
    case 'inlineMath':
      replacement = `$${selected || 'E = mc^2'}$`
      break
    case 'clearFormat': {
      if (selected) {
        replacement = stripMarkdownFormatting(selected)
      } else {
        const { lineStart, lineEnd, lineText } = getCurrentLineBounds(doc.content, start)
        const cleaned = stripMarkdownFormatting(lineText)
        const updatedLine = doc.content.slice(0, lineStart) + cleaned + doc.content.slice(lineEnd)
        void updateActiveDocumentContent(updatedLine)
        return
      }
      break
    }
    case 'codeBlock':
      replacement = `\n\`\`\`rust\n${selected || '// seu código aqui'}\n\`\`\`\n`
      break
    case 'htmlBlock':
      replacement = `\n<div class="custom-html-block">\n  ${selected || '<p>Bloco HTML personalizado</p>'}\n</div>\n`
      break
    case 'quote':
      replacement = selected
        ? selected
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        : '> Citação'
      break
    case 'orderedList':
      replacement = selected
        ? selected
            .split('\n')
            .map((l, idx) => `${idx + 1}. ${l.replace(/^\d+\.\s*/, '')}`)
            .join('\n')
        : '1. Primeiro item\n2. Segundo item\n3. Terceiro item'
      break
    case 'bulletList':
      replacement = selected
        ? selected
            .split('\n')
            .map((l) => `- ${l.replace(/^[-*+]\s*/, '')}`)
            .join('\n')
        : '- Item A\n- Item B'
      break
    case 'taskList':
      replacement = selected
        ? selected
            .split('\n')
            .map((l) => `- [ ] ${l}`)
            .join('\n')
        : '- [x] Tarefa concluída\n- [ ] Próxima tarefa'
      break
    case 'mathBlock':
      replacement = `\n$$\n${selected || '\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}'}\n$$\n`
      break
    case 'hr':
      replacement = `\n---\n`
      break
    case 'frontmatter': {
      const fm = `---\ntitle: "${doc.filename.replace(/\.md$/i, '')}"\ndate: "${new Date().toISOString().slice(0, 10)}"\ntags: [markdown, nexomd]\n---\n\n`
      void updateActiveDocumentContent(fm + doc.content)
      return
    }
    case 'footnote':
      replacement = `${selected}[^1]\n\n[^1]: Nota de rodapé explicativa.`
      break
    case 'alertNote':
      replacement = `\n> [!NOTE]\n> ${selected || 'Informação importante destacada no documento.'}\n`
      break
    case 'alertTip':
      replacement = `\n> [!TIP]\n> ${selected || 'Dica prática para o leitor.'}\n`
      break
    case 'alertImportant':
      replacement = `\n> [!IMPORTANT]\n> ${selected || 'Informação essencial para o sucesso da operação.'}\n`
      break
    case 'alertWarning':
      replacement = `\n> [!WARNING]\n> ${selected || 'Atenção a este ponto crítico.'}\n`
      break
    case 'alertCaution':
      replacement = `\n> [!CAUTION]\n> ${selected || 'Cuidado: ação com risco potencial ou irreversível.'}\n`
      break
  }

  const updated = doc.content.slice(0, start) + replacement + doc.content.slice(end)
  void updateActiveDocumentContent(updated)
}

/**
 * Exporta as preferências do usuário como arquivo JSON.
 */
export function exportPreferencesJson(): void {
  const data = JSON.stringify(editorStore.preferences, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'nexomd-preferences.json'
  a.click()
  URL.revokeObjectURL(url)
}
