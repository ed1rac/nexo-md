<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from './i18n'
import {
  editorStore,
  activeDocument,
  DEFAULT_WELCOME_MD,
  createNewDocument,
  closeDocumentTab,
  renameDocumentTab,
  setDocumentLineEnding,
  cycleDocumentLineEnding,
  updateActiveDocumentContent,
  undoActiveDocument,
  redoActiveDocument,
  saveActiveDocument,
  importFileObject,
  exportActiveDocument,
  copyAsMarkdown,
  copyAsHtml,
  pasteAsPlainText,
  openFindBar,
  closeFindBar,
  recomputeFindMatches,
  findNextMatch,
  findPrevMatch,
  replaceCurrentMatch,
  replaceAllMatches,
  renderMarkdownToHtml,
  applyToolbarFormat,
  insertCustomTable,
  insertMarkdownLink,
  insertMarkdownImage,
  handleSafeLinkClick,
  exportPreferencesJson,
  showToast,
  type EditorMode,
  type ThemeId
} from './stores/editorStore'
import { htmlToMarkdown, type LineEndingType } from './engine/exporters'

const { t, locale, availableLocales } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const findInputRef = ref<HTMLInputElement | null>(null)
const activeMenu = ref<string | null>(null)
const commandFilter = ref('')
const activeCursorLine = ref(1)

// Estado do Seletor de Tamanho de Tabela (10x10 visual grid + inputs numéricos)
const tableForm = reactive({
  rows: 3,
  cols: 3,
  hoverRow: 0,
  hoverCol: 0,
  alignment: 'left' as 'left' | 'center' | 'right'
})

// Estado do Modal de Link
const linkForm = reactive({
  text: '',
  url: 'https://',
  title: ''
})

// Estado do Modal de Imagem
const imageForm = reactive({
  alt: '',
  url: '',
  title: ''
})

// Estado do Modal de Renomear Aba
const renameForm = reactive({
  tabId: '',
  filename: ''
})

const renderedHtml = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  return renderMarkdownToHtml(doc.content)
})

const editorCssVars = computed(() => ({
  '--editor-font-size': `${editorStore.preferences.fontSize}px`,
  '--editor-line-height': String(editorStore.preferences.lineHeight)
}))

function closeMenus() {
  activeMenu.value = null
}

function toggleMenu(menuName: string) {
  activeMenu.value = activeMenu.value === menuName ? null : menuName
}

async function handleNewDocument() {
  closeMenus()
  await createNewDocument()
  if (editorStore.mode === 'readonly') {
    editorStore.mode = 'split'
  }
  await nextTick()
  textareaRef.value?.focus()
}

function triggerFileImport() {
  closeMenus()
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  for (const file of Array.from(input.files)) {
    await importFileObject(file)
  }
  await nextTick()
  textareaRef.value?.focus()
}

async function onWindowDrop(e: DragEvent) {
  e.preventDefault()
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
  for (const file of Array.from(e.dataTransfer.files)) {
    if (/\.(md|markdown|txt|html|htm)$/i.test(file.name)) {
      await importFileObject(file)
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          void insertMarkdownImage(file.name, reader.result, '', textareaRef.value)
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

function updateCursorLine() {
  const ta = textareaRef.value
  const doc = activeDocument.value
  if (!ta || !doc) {
    activeCursorLine.value = 1
    return
  }
  const pos = ta.selectionStart || 0
  activeCursorLine.value = doc.content.slice(0, pos).split('\n').length
}

function onTextareaScroll() {
  if (gutterRef.value && textareaRef.value) {
    gutterRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

function onTextareaInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  void updateActiveDocumentContent(target.value)
  updateCursorLine()
}

function onPreviewBlur(e: FocusEvent) {
  if (editorStore.mode !== 'wysiwyg') return
  const el = e.target as HTMLElement
  const converted = htmlToMarkdown(el.innerHTML)
  if (activeDocument.value && converted !== activeDocument.value.content) {
    void updateActiveDocumentContent(converted)
  }
}

function onPreviewClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a')
  if (target && target.getAttribute('href')) {
    e.preventDefault()
    void handleSafeLinkClick(target.getAttribute('href')!)
  }
}

function setMode(m: EditorMode) {
  closeMenus()
  editorStore.mode = m
}

function setTheme(theme: ThemeId) {
  closeMenus()
  editorStore.preferences.theme = theme
}

function openTablePicker() {
  closeMenus()
  tableForm.rows = 3
  tableForm.cols = 3
  tableForm.hoverRow = 0
  tableForm.hoverCol = 0
  tableForm.alignment = 'left'
  editorStore.showTableModal = true
}

function onGridCellClick(r: number, c: number) {
  tableForm.rows = r
  tableForm.cols = c
  void insertCustomTable(r, c, tableForm.alignment, textareaRef.value)
}

function openLinkDialog() {
  closeMenus()
  const doc = activeDocument.value
  const ta = textareaRef.value
  const selected =
    doc && ta && ta.selectionStart !== ta.selectionEnd
      ? doc.content.slice(ta.selectionStart, ta.selectionEnd)
      : ''
  linkForm.text = selected
  linkForm.url = 'https://'
  linkForm.title = ''
  editorStore.showLinkModal = true
}

function openImageDialog() {
  closeMenus()
  const doc = activeDocument.value
  const ta = textareaRef.value
  const selected =
    doc && ta && ta.selectionStart !== ta.selectionEnd
      ? doc.content.slice(ta.selectionStart, ta.selectionEnd)
      : ''
  imageForm.alt = selected || 'Descrição da imagem'
  imageForm.url = ''
  imageForm.title = ''
  editorStore.showImageModal = true
}

function onLocalImageUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      imageForm.url = reader.result
      if (!imageForm.alt || imageForm.alt === 'Descrição da imagem') {
        imageForm.alt = file.name.replace(/\.[^.]+$/, '')
      }
    }
  }
  reader.readAsDataURL(file)
}

function openRenameDialog(tabId?: string) {
  closeMenus()
  const target = editorStore.tabs.find((t) => t.id === (tabId || editorStore.activeTabId))
  if (!target) return
  renameForm.tabId = target.id
  renameForm.filename = target.filename
  editorStore.showRenameModal = true
}

async function confirmRenameTab() {
  await renameDocumentTab(renameForm.tabId, renameForm.filename)
  editorStore.showRenameModal = false
}

async function openFindReplacePanel(withReplace: boolean) {
  closeMenus()
  openFindBar(withReplace)
  await nextTick()
  findInputRef.value?.focus()
}

function scrollToLine(lineNumber: number) {
  const doc = activeDocument.value
  const ta = textareaRef.value
  if (!doc || !ta) return
  const lines = doc.content.split('\n')
  let charOffset = 0
  for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
    charOffset += lines[i].length + 1
  }
  ta.focus()
  ta.setSelectionRange(charOffset, charOffset)
  updateCursorLine()
}

function runFormat(action: string) {
  closeMenus()
  if (action === 'table') {
    openTablePicker()
    return
  }
  if (action === 'link') {
    openLinkDialog()
    return
  }
  if (action === 'image') {
    openImageDialog()
    return
  }
  applyToolbarFormat(action, textareaRef.value)
}

// Lista de Comandos para a Command Palette (Ctrl+Shift+P)
const paletteCommands = computed(() => [
  { id: 'new', label: t('menu.newTab'), run: () => handleNewDocument() },
  { id: 'open', label: t('menu.openFile'), run: () => triggerFileImport() },
  { id: 'save', label: t('menu.save'), run: () => saveActiveDocument() },
  { id: 'find', label: t('menu.find'), run: () => openFindReplacePanel(false) },
  { id: 'replace', label: t('menu.replace'), run: () => openFindReplacePanel(true) },
  { id: 'pdf', label: t('menu.exportPdf'), run: () => exportActiveDocument('pdf') },
  { id: 'docx', label: t('menu.exportDocx'), run: () => exportActiveDocument('docx') },
  { id: 'doc', label: t('menu.exportDoc'), run: () => exportActiveDocument('doc') },
  { id: 'rtf', label: t('menu.exportRtf'), run: () => exportActiveDocument('rtf') },
  { id: 'html', label: t('menu.exportHtml'), run: () => exportActiveDocument('html') },
  { id: 'md', label: t('menu.saveAsMd'), run: () => exportActiveDocument('md') },
  { id: 'le-lf', label: 'Final de Linha: LF (\\n)', run: () => setDocumentLineEnding('LF') },
  { id: 'le-crlf', label: 'Final de Linha: CRLF (\\r\\n)', run: () => setDocumentLineEnding('CRLF') },
  { id: 'le-cr', label: 'Final de Linha: CR (\\r)', run: () => setDocumentLineEnding('CR') },
  { id: 'copy-md', label: t('menu.copyMarkdown'), run: () => copyAsMarkdown(textareaRef.value) },
  { id: 'copy-html', label: t('menu.copyHtml'), run: () => copyAsHtml(textareaRef.value) },
  { id: 'paste-txt', label: t('menu.pastePlainText'), run: () => pasteAsPlainText(textareaRef.value) },
  { id: 'dup', label: t('menu.duplicateSelection'), run: () => runFormat('duplicate') },
  { id: 'para-above', label: t('menu.createParagraphAbove'), run: () => runFormat('paragraphAbove') },
  { id: 'para-below', label: t('menu.createParagraphBelow'), run: () => runFormat('paragraphBelow') },
  { id: 'para-del', label: t('menu.deleteParagraph'), run: () => runFormat('deleteParagraph') },
  { id: 'h1', label: t('paragraphMenu.h1'), run: () => runFormat('h1') },
  { id: 'h2', label: t('paragraphMenu.h2'), run: () => runFormat('h2') },
  { id: 'h3', label: t('paragraphMenu.h3'), run: () => runFormat('h3') },
  { id: 'h4', label: t('paragraphMenu.h4'), run: () => runFormat('h4') },
  { id: 'h5', label: t('paragraphMenu.h5'), run: () => runFormat('h5') },
  { id: 'h6', label: t('paragraphMenu.h6'), run: () => runFormat('h6') },
  { id: 'promote', label: t('paragraphMenu.promote'), run: () => runFormat('promote') },
  { id: 'demote', label: t('paragraphMenu.demote'), run: () => runFormat('demote') },
  { id: 'table', label: t('paragraphMenu.table'), run: () => openTablePicker() },
  { id: 'hr', label: t('paragraphMenu.horizontalRule'), run: () => runFormat('hr') },
  { id: 'html-block', label: t('paragraphMenu.htmlBlock'), run: () => runFormat('htmlBlock') },
  { id: 'frontmatter', label: t('paragraphMenu.frontmatter'), run: () => runFormat('frontmatter') },
  { id: 'footnote', label: t('paragraphMenu.footnote'), run: () => runFormat('footnote') },
  { id: 'alert-note', label: t('paragraphMenu.alertNote'), run: () => runFormat('alertNote') },
  { id: 'alert-tip', label: t('paragraphMenu.alertTip'), run: () => runFormat('alertTip') },
  { id: 'alert-important', label: t('paragraphMenu.alertImportant'), run: () => runFormat('alertImportant') },
  { id: 'alert-warning', label: t('paragraphMenu.alertWarning'), run: () => runFormat('alertWarning') },
  { id: 'alert-caution', label: t('paragraphMenu.alertCaution'), run: () => runFormat('alertCaution') },
  { id: 'underline', label: t('formatMenu.underline'), run: () => runFormat('underline') },
  { id: 'highlight', label: t('formatMenu.highlight'), run: () => runFormat('highlight') },
  { id: 'sup', label: t('formatMenu.superscript'), run: () => runFormat('superscript') },
  { id: 'sub', label: t('formatMenu.subscript'), run: () => runFormat('subscript') },
  { id: 'link', label: t('formatMenu.link'), run: () => openLinkDialog() },
  { id: 'image', label: t('formatMenu.image'), run: () => openImageDialog() },
  { id: 'clear', label: t('formatMenu.clearFormat'), run: () => runFormat('clearFormat') },
  { id: 'focus', label: t('preferences.focusMode'), run: () => { editorStore.preferences.focusMode = !editorStore.preferences.focusMode } },
  { id: 'typewriter', label: t('preferences.typewriterMode'), run: () => { editorStore.preferences.typewriterMode = !editorStore.preferences.typewriterMode } },
  { id: 'src-lines', label: t('preferences.sourceLineNumbers'), run: () => { editorStore.preferences.sourceLineNumbers = !editorStore.preferences.sourceLineNumbers } },
  { id: 'about', label: t('helpMenu.about'), run: () => { editorStore.showAboutModal = true } }
])

const filteredCommands = computed(() => {
  const q = commandFilter.value.trim().toLowerCase()
  if (!q) return paletteCommands.value
  return paletteCommands.value.filter((c) => c.label.toLowerCase().includes(q))
})

function executePaletteCommand(cmd: { run: () => unknown }) {
  editorStore.showCommandPalette = false
  commandFilter.value = ''
  cmd.run()
}

function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()

  if (e.key === 'Escape') {
    closeMenus()
    if (editorStore.findReplace.visible) closeFindBar()
    editorStore.showCommandPalette = false
    editorStore.showTableModal = false
    editorStore.showLinkModal = false
    editorStore.showImageModal = false
    editorStore.showRenameModal = false
    editorStore.showAboutModal = false
    return
  }

  if (!ctrl) return

  if (key === 'n' && !e.shiftKey) {
    e.preventDefault()
    void handleNewDocument()
  } else if (key === 'o' && !e.shiftKey) {
    e.preventDefault()
    triggerFileImport()
  } else if (key === 's' && !e.shiftKey) {
    e.preventDefault()
    void saveActiveDocument()
  } else if (key === 's' && e.shiftKey) {
    e.preventDefault()
    exportActiveDocument('md')
  } else if (key === 'w' && !e.shiftKey) {
    e.preventDefault()
    void closeDocumentTab()
  } else if (key === 'f' && !e.shiftKey) {
    e.preventDefault()
    void openFindReplacePanel(false)
  } else if (key === 'h' && !e.shiftKey) {
    e.preventDefault()
    void openFindReplacePanel(true)
  } else if (key === 'p' && e.shiftKey) {
    e.preventDefault()
    editorStore.showCommandPalette = !editorStore.showCommandPalette
  } else if (key === ',') {
    e.preventDefault()
    editorStore.showPreferencesModal = !editorStore.showPreferencesModal
  } else if (key === 'b' && !e.shiftKey) {
    e.preventDefault()
    runFormat('bold')
  } else if (key === 'i' && !e.shiftKey) {
    e.preventDefault()
    runFormat('italic')
  } else if (key === 'i' && e.shiftKey) {
    e.preventDefault()
    openImageDialog()
  } else if (key === 'u' && !e.shiftKey) {
    e.preventDefault()
    runFormat('underline')
  } else if (key === 'k' && !e.shiftKey) {
    e.preventDefault()
    openLinkDialog()
  } else if (key === 'k' && e.shiftKey) {
    e.preventDefault()
    runFormat('deleteParagraph')
  } else if (key === 'd' && e.shiftKey) {
    e.preventDefault()
    runFormat('duplicate')
  } else if (key === 'c' && e.shiftKey) {
    e.preventDefault()
    void copyAsMarkdown(textareaRef.value)
  } else if (key === 'v' && e.shiftKey) {
    e.preventDefault()
    void pasteAsPlainText(textareaRef.value)
  } else if (key === '\\') {
    e.preventDefault()
    runFormat('clearFormat')
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    runFormat('promote')
  } else if (e.key === '-') {
    e.preventDefault()
    runFormat('demote')
  } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
    e.preventDefault()
    runFormat(`h${e.key}`)
  } else if (e.key === '0') {
    e.preventDefault()
    runFormat('paragraph')
  }
}

onMounted(() => {
  if (editorStore.tabs.length === 0) {
    void createNewDocument('Boas-Vindas.md', DEFAULT_WELCOME_MD)
  }
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="nexo-app"
    :data-theme="editorStore.preferences.theme"
    :style="editorCssVars"
    @click="closeMenus"
    @dragover.prevent
    @drop="onWindowDrop"
  >
    <!-- Input oculto para Abrir / Importar Arquivos (.md, .markdown, .txt, .html) -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".md,.markdown,.txt,.html,.htm"
      multiple
      style="display: none"
      @change="onFileInputChange"
    />

    <!-- Barra de Menus Desktop (Arquivo, Editar, Parágrafo, Formatar, Exibir, Temas) -->
    <nav class="menubar" @click.stop>
      <div class="menubar-left">
        <button
          class="tool-btn brand-toggle"
          title="Alternar Barra Lateral"
          @click="editorStore.sidebarVisible = !editorStore.sidebarVisible"
        >
          ☰
        </button>
        <span class="brand-title">{{ t('app.name') }} <small>v0.2.0</small></span>

        <!-- Menu Arquivo -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('file')">{{ t('menu.file') }} ▾</button>
          <div v-if="activeMenu === 'file'" class="menu-dropdown">
            <button class="menu-item" @click="handleNewDocument()">➕ {{ t('menu.newTab') }}</button>
            <button class="menu-item" @click="triggerFileImport()">📂 {{ t('menu.openFile') }}</button>
            <button class="menu-item" @click="triggerFileImport()">🌐 {{ t('menu.importHtml') }}</button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="saveActiveDocument(); closeMenus()">
              💾 {{ t('menu.save') }}
            </button>
            <button class="menu-item" @click="exportActiveDocument('md'); closeMenus()">
              ⬇ {{ t('menu.saveAsMd') }}
            </button>
            <button class="menu-item" @click="openRenameDialog()">
              ✏️ {{ t('menu.renameDoc') }}
            </button>
            <div class="menu-divider"></div>
            <div class="menu-section-label">Exportar Documento</div>
            <button class="menu-item" @click="exportActiveDocument('pdf'); closeMenus()">
              🖨️ {{ t('menu.exportPdf') }}
            </button>
            <button class="menu-item" @click="exportActiveDocument('docx'); closeMenus()">
              📘 {{ t('menu.exportDocx') }}
            </button>
            <button class="menu-item" @click="exportActiveDocument('doc'); closeMenus()">
              📄 {{ t('menu.exportDoc') }}
            </button>
            <button class="menu-item" @click="exportActiveDocument('rtf'); closeMenus()">
              📝 {{ t('menu.exportRtf') }}
            </button>
            <button class="menu-item" @click="exportActiveDocument('html'); closeMenus()">
              🌍 {{ t('menu.exportHtml') }}
            </button>
            <div class="menu-divider"></div>
            <div class="menu-section-label">{{ t('menu.lineEnding') }}</div>
            <button
              class="menu-item"
              :class="{ selected: activeDocument?.lineEnding === 'LF' }"
              @click="setDocumentLineEnding('LF'); closeMenus()"
            >
              LF (\n) — Unix / macOS / Linux
            </button>
            <button
              class="menu-item"
              :class="{ selected: activeDocument?.lineEnding === 'CRLF' }"
              @click="setDocumentLineEnding('CRLF'); closeMenus()"
            >
              CRLF (\r\n) — Windows
            </button>
            <button
              class="menu-item"
              :class="{ selected: activeDocument?.lineEnding === 'CR' }"
              @click="setDocumentLineEnding('CR'); closeMenus()"
            >
              CR (\r) — Classic Mac
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="closeDocumentTab(); closeMenus()">
              ✕ {{ t('menu.closeTab') }}
            </button>
          </div>
        </div>

        <!-- Menu Editar -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('edit')">{{ t('menu.edit') }} ▾</button>
          <div v-if="activeMenu === 'edit'" class="menu-dropdown">
            <button class="menu-item" @click="undoActiveDocument(); closeMenus()">
              ↶ {{ t('menu.undo') }}
            </button>
            <button class="menu-item" @click="redoActiveDocument(); closeMenus()">
              ↷ {{ t('menu.redo') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="openFindReplacePanel(false)">
              🔍 {{ t('menu.find') }}
            </button>
            <button class="menu-item" @click="openFindReplacePanel(true)">
              🔄 {{ t('menu.replace') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="copyAsMarkdown(textareaRef); closeMenus()">
              📋 {{ t('menu.copyMarkdown') }}
            </button>
            <button class="menu-item" @click="copyAsHtml(textareaRef); closeMenus()">
              🏷️ {{ t('menu.copyHtml') }}
            </button>
            <button class="menu-item" @click="pasteAsPlainText(textareaRef); closeMenus()">
              📄 {{ t('menu.pastePlainText') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('duplicate')">
              ⧉ {{ t('menu.duplicateSelection') }}
            </button>
            <button class="menu-item" @click="runFormat('paragraphAbove')">
              ⬆️ {{ t('menu.createParagraphAbove') }}
            </button>
            <button class="menu-item" @click="runFormat('paragraphBelow')">
              ⬇️ {{ t('menu.createParagraphBelow') }}
            </button>
            <button class="menu-item" @click="runFormat('deleteParagraph')">
              🗑️ {{ t('menu.deleteParagraph') }}
            </button>
          </div>
        </div>

        <!-- Menu Parágrafo -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('paragraph')">
            {{ t('menu.paragraph') }} ▾
          </button>
          <div v-if="activeMenu === 'paragraph'" class="menu-dropdown">
            <button class="menu-item" @click="runFormat('h1')">H1 — {{ t('paragraphMenu.h1') }}</button>
            <button class="menu-item" @click="runFormat('h2')">H2 — {{ t('paragraphMenu.h2') }}</button>
            <button class="menu-item" @click="runFormat('h3')">H3 — {{ t('paragraphMenu.h3') }}</button>
            <button class="menu-item" @click="runFormat('h4')">H4 — {{ t('paragraphMenu.h4') }}</button>
            <button class="menu-item" @click="runFormat('h5')">H5 — {{ t('paragraphMenu.h5') }}</button>
            <button class="menu-item" @click="runFormat('h6')">H6 — {{ t('paragraphMenu.h6') }}</button>
            <button class="menu-item" @click="runFormat('paragraph')">
              ¶ — {{ t('paragraphMenu.paragraph') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('promote')">
              ⬆️ {{ t('paragraphMenu.promote') }}
            </button>
            <button class="menu-item" @click="runFormat('demote')">
              ⬇️ {{ t('paragraphMenu.demote') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="openTablePicker()">
              ⊞ {{ t('paragraphMenu.table') }}
            </button>
            <button class="menu-item" @click="runFormat('codeBlock')">
              { } {{ t('paragraphMenu.codeBlock') }}
            </button>
            <button class="menu-item" @click="runFormat('mathBlock')">
              ∑ {{ t('paragraphMenu.mathBlock') }}
            </button>
            <button class="menu-item" @click="runFormat('htmlBlock')">
              &lt;/&gt; {{ t('paragraphMenu.htmlBlock') }}
            </button>
            <button class="menu-item" @click="runFormat('quote')">
              ❝ {{ t('paragraphMenu.quote') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('orderedList')">
              1. {{ t('paragraphMenu.orderedList') }}
            </button>
            <button class="menu-item" @click="runFormat('bulletList')">
              • {{ t('paragraphMenu.bulletList') }}
            </button>
            <button class="menu-item" @click="runFormat('taskList')">
              ☑ {{ t('paragraphMenu.taskList') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('hr')">
              ― {{ t('paragraphMenu.horizontalRule') }}
            </button>
            <button class="menu-item" @click="runFormat('frontmatter')">
              ⚙️ {{ t('paragraphMenu.frontmatter') }}
            </button>
            <button class="menu-item" @click="runFormat('footnote')">
              [^1] {{ t('paragraphMenu.footnote') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('alertNote')">
              ℹ️ {{ t('paragraphMenu.alertNote') }}
            </button>
            <button class="menu-item" @click="runFormat('alertTip')">
              💡 {{ t('paragraphMenu.alertTip') }}
            </button>
            <button class="menu-item" @click="runFormat('alertImportant')">
              ❗ {{ t('paragraphMenu.alertImportant') }}
            </button>
            <button class="menu-item" @click="runFormat('alertWarning')">
              ⚠️ {{ t('paragraphMenu.alertWarning') }}
            </button>
            <button class="menu-item" @click="runFormat('alertCaution')">
              🛑 {{ t('paragraphMenu.alertCaution') }}
            </button>
          </div>
        </div>

        <!-- Menu Formatar -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('format')">
            {{ t('menu.format') }} ▾
          </button>
          <div v-if="activeMenu === 'format'" class="menu-dropdown">
            <button class="menu-item" @click="runFormat('bold')"><b>B</b> — {{ t('formatMenu.bold') }}</button>
            <button class="menu-item" @click="runFormat('italic')"><i>I</i> — {{ t('formatMenu.italic') }}</button>
            <button class="menu-item" @click="runFormat('underline')">
              <u>U</u> — {{ t('formatMenu.underline') }}
            </button>
            <button class="menu-item" @click="runFormat('strike')">
              <s>S</s> — {{ t('formatMenu.strikethrough') }}
            </button>
            <button class="menu-item" @click="runFormat('highlight')">
              ==H== — {{ t('formatMenu.highlight') }}
            </button>
            <button class="menu-item" @click="runFormat('superscript')">
              X² — {{ t('formatMenu.superscript') }}
            </button>
            <button class="menu-item" @click="runFormat('subscript')">
              X₂ — {{ t('formatMenu.subscript') }}
            </button>
            <button class="menu-item" @click="runFormat('inlineCode')">
              `c` — {{ t('formatMenu.inlineCode') }}
            </button>
            <button class="menu-item" @click="runFormat('inlineMath')">
              $x$ — {{ t('formatMenu.inlineMath') }}
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="openLinkDialog()">🔗 {{ t('formatMenu.link') }}</button>
            <button class="menu-item" @click="openImageDialog()">🖼️ {{ t('formatMenu.image') }}</button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="runFormat('clearFormat')">
              🧹 {{ t('formatMenu.clearFormat') }}
            </button>
          </div>
        </div>

        <!-- Menu Exibir -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('view')">{{ t('menu.view') }} ▾</button>
          <div v-if="activeMenu === 'view'" class="menu-dropdown">
            <button class="menu-item" @click="setMode('wysiwyg')">{{ t('modes.wysiwyg') }}</button>
            <button class="menu-item" @click="setMode('split')">{{ t('modes.split') }}</button>
            <button class="menu-item" @click="setMode('source')">{{ t('modes.source') }}</button>
            <button class="menu-item" @click="setMode('readonly')">{{ t('modes.readonly') }}</button>
            <div class="menu-divider"></div>
            <button
              class="menu-item"
              @click="editorStore.preferences.focusMode = !editorStore.preferences.focusMode; closeMenus()"
            >
              🎯 {{ t('preferences.focusMode') }}: {{ editorStore.preferences.focusMode ? 'ON' : 'OFF' }}
            </button>
            <button
              class="menu-item"
              @click="editorStore.preferences.typewriterMode = !editorStore.preferences.typewriterMode; closeMenus()"
            >
              ⌨️ {{ t('preferences.typewriterMode') }}: {{ editorStore.preferences.typewriterMode ? 'ON' : 'OFF' }}
            </button>
            <button
              class="menu-item"
              @click="editorStore.preferences.sourceLineNumbers = !editorStore.preferences.sourceLineNumbers; closeMenus()"
            >
              🔢 {{ t('preferences.sourceLineNumbers') }}: {{ editorStore.preferences.sourceLineNumbers ? 'ON' : 'OFF' }}
            </button>
            <div class="menu-divider"></div>
            <button
              class="menu-item"
              @click="editorStore.showCommandPalette = true; closeMenus()"
            >
              ⌘ {{ t('helpMenu.commandPalette') }}
            </button>
          </div>
        </div>

        <!-- Menu Temas -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('themes')">{{ t('menu.themes') }} ▾</button>
          <div v-if="activeMenu === 'themes'" class="menu-dropdown">
            <button class="menu-item" @click="setTheme('nexo-dark')">Nexo Dark</button>
            <button class="menu-item" @click="setTheme('nexo-light')">Nexo Light</button>
            <button class="menu-item" @click="setTheme('one-dark')">One Dark</button>
            <button class="menu-item" @click="setTheme('material-dark')">Material Dark</button>
            <button class="menu-item" @click="setTheme('ulysses-light')">Ulysses Light</button>
            <button class="menu-item" @click="setTheme('cadmium-light')">Cadmium Solarized</button>
          </div>
        </div>

        <!-- Menu Ajuda -->
        <div class="menu-wrapper">
          <button class="menu-trigger" @click="toggleMenu('help')">{{ t('menu.help') }} ▾</button>
          <div v-if="activeMenu === 'help'" class="menu-dropdown">
            <button
              class="menu-item"
              @click="editorStore.showCommandPalette = true; closeMenus()"
            >
              ⌘ {{ t('helpMenu.commandPalette') }}
            </button>
            <button
              class="menu-item"
              @click="createNewDocument('Boas-Vindas.md', DEFAULT_WELCOME_MD); closeMenus()"
            >
              📖 {{ t('helpMenu.welcomeGuide') }}
            </button>
            <button
              class="menu-item"
              @click="editorStore.showPreferencesModal = true; closeMenus()"
            >
              ⚙️ {{ t('menu.preferences') }} (Ctrl+,)
            </button>
            <div class="menu-divider"></div>
            <button
              class="menu-item"
              @click="editorStore.showAboutModal = true; closeMenus()"
            >
              ℹ️ {{ t('helpMenu.about') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Direita da Barra de Topo: Modos de Visão, Idioma e Preferências -->
      <div class="menubar-right">
        <div class="mode-switcher">
          <button
            class="mode-btn"
            :class="{ active: editorStore.mode === 'wysiwyg' }"
            @click="setMode('wysiwyg')"
          >
            {{ t('modes.wysiwyg') }}
          </button>
          <button
            class="mode-btn"
            :class="{ active: editorStore.mode === 'split' }"
            @click="setMode('split')"
          >
            {{ t('modes.split') }}
          </button>
          <button
            class="mode-btn"
            :class="{ active: editorStore.mode === 'source' }"
            @click="setMode('source')"
          >
            {{ t('modes.source') }}
          </button>
          <button
            class="mode-btn"
            :class="{ active: editorStore.mode === 'readonly' }"
            @click="setMode('readonly')"
          >
            {{ t('modes.readonly') }}
          </button>
        </div>

        <select
          v-model="locale"
          class="pref-select"
          style="padding: 3px 6px; font-size: 12px"
          :title="t('preferences.language')"
        >
          <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
            {{ lang.label }}
          </option>
        </select>

        <button
          class="tool-btn"
          :title="t('menu.preferences')"
          @click="editorStore.showPreferencesModal = true"
        >
          ⚙
        </button>
      </div>
    </nav>

    <!-- Faixa de Abas de Documentos -->
    <div class="tabs-bar">
      <div class="tabs-strip">
        <div
          v-for="tab in editorStore.tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === editorStore.activeTabId }"
          :title="'Duplo clique para renomear: ' + tab.filename"
          @click="editorStore.activeTabId = tab.id"
          @dblclick="openRenameDialog(tab.id)"
        >
          <span class="tab-filename">{{ tab.filename }}</span>
          <span v-if="tab.isDirty" class="dirty-dot" :title="t('status.modified')"></span>
          <button
            class="tab-close-btn"
            :title="t('menu.closeTab')"
            @click.stop="closeDocumentTab(tab.id)"
          >
            ×
          </button>
        </div>
        <button
          class="tool-btn new-tab-btn"
          :title="t('menu.newTab')"
          @click="handleNewDocument()"
        >
          +
        </button>
      </div>

      <!-- Ações Rápidas de Importar / Exportar na Barra de Abas -->
      <div class="quick-io-strip">
        <button class="tool-btn" :title="t('toolbar.openFile')" @click="triggerFileImport()">
          📂 Importar
        </button>
        <button class="tool-btn" :title="t('menu.exportPdf')" @click="exportActiveDocument('pdf')">
          PDF
        </button>
        <button class="tool-btn" :title="t('menu.exportDocx')" @click="exportActiveDocument('docx')">
          DOCX
        </button>
        <button class="tool-btn" :title="t('menu.exportRtf')" @click="exportActiveDocument('rtf')">
          RTF
        </button>
        <button class="tool-btn" :title="t('menu.exportHtml')" @click="exportActiveDocument('html')">
          HTML
        </button>
      </div>
    </div>

    <!-- Barra de Ferramentas Completa (Oculta apenas em Modo Somente Leitura) -->
    <div v-if="editorStore.mode !== 'readonly'" class="formatting-bar">
      <button class="tool-btn" :title="t('toolbar.newDoc')" @click="handleNewDocument()">➕</button>
      <button class="tool-btn" :title="t('menu.undo')" @click="undoActiveDocument()">↶</button>
      <button class="tool-btn" :title="t('menu.redo')" @click="redoActiveDocument()">↷</button>
      <button class="tool-btn" :title="t('menu.save')" @click="saveActiveDocument()">💾</button>
      <button
        class="tool-btn"
        :title="t('toolbar.findReplace')"
        @click="openFindReplacePanel(true)"
      >
        🔍
      </button>

      <div class="tool-sep"></div>

      <!-- Títulos H1 a H6 + Parágrafo + Promover / Rebaixar -->
      <button class="tool-btn" :title="t('toolbar.heading1')" @click="runFormat('h1')">H1</button>
      <button class="tool-btn" :title="t('toolbar.heading2')" @click="runFormat('h2')">H2</button>
      <button class="tool-btn" :title="t('toolbar.heading3')" @click="runFormat('h3')">H3</button>
      <button class="tool-btn" :title="t('toolbar.heading4')" @click="runFormat('h4')">H4</button>
      <button class="tool-btn" :title="t('toolbar.heading5')" @click="runFormat('h5')">H5</button>
      <button class="tool-btn" :title="t('toolbar.heading6')" @click="runFormat('h6')">H6</button>
      <button class="tool-btn" :title="t('paragraphMenu.paragraph')" @click="runFormat('paragraph')">
        ¶
      </button>
      <button class="tool-btn" :title="t('toolbar.promote')" @click="runFormat('promote')">
        H↑
      </button>
      <button class="tool-btn" :title="t('toolbar.demote')" @click="runFormat('demote')">
        H↓
      </button>

      <div class="tool-sep"></div>

      <!-- Formatação Inline: Negrito, Itálico, Sublinhado, Tachado, Highlight, Sobrescrito, Subscrito, Código, Limpar -->
      <button class="tool-btn" :title="t('toolbar.bold')" @click="runFormat('bold')">
        <b>B</b>
      </button>
      <button class="tool-btn" :title="t('toolbar.italic')" @click="runFormat('italic')">
        <i>I</i>
      </button>
      <button class="tool-btn" :title="t('toolbar.underline')" @click="runFormat('underline')">
        <u>U</u>
      </button>
      <button class="tool-btn" :title="t('toolbar.strikethrough')" @click="runFormat('strike')">
        <s>S</s>
      </button>
      <button class="tool-btn" :title="t('toolbar.highlight')" @click="runFormat('highlight')">
        <span style="background: rgba(250, 204, 21, 0.35); padding: 0 3px; border-radius: 2px">==H==</span>
      </button>
      <button class="tool-btn" :title="t('toolbar.superscript')" @click="runFormat('superscript')">
        X²
      </button>
      <button class="tool-btn" :title="t('toolbar.subscript')" @click="runFormat('subscript')">
        X₂
      </button>
      <button class="tool-btn" :title="t('toolbar.inlineCode')" @click="runFormat('inlineCode')">
        `c`
      </button>
      <button class="tool-btn" :title="t('toolbar.clearFormat')" @click="runFormat('clearFormat')">
        🧹
      </button>

      <div class="tool-sep"></div>

      <!-- Listas -->
      <button class="tool-btn" :title="t('toolbar.orderedList')" @click="runFormat('orderedList')">
        1. Lista
      </button>
      <button class="tool-btn" :title="t('toolbar.bulletList')" @click="runFormat('bulletList')">
        • Lista
      </button>
      <button class="tool-btn" :title="t('toolbar.taskList')" @click="runFormat('taskList')">
        ☑ Tarefas
      </button>

      <div class="tool-sep"></div>

      <!-- Inserções: Link, Imagem, Tabela (com seletor), Régua Horizontal, Código, HTML, Matemática, Citação -->
      <button class="tool-btn" :title="t('toolbar.link')" @click="openLinkDialog()">
        🔗 Link
      </button>
      <button class="tool-btn" :title="t('toolbar.image')" @click="openImageDialog()">
        🖼️ Img
      </button>
      <button class="tool-btn" :title="t('toolbar.table')" @click="openTablePicker()">
        ⊞ Tabela
      </button>
      <button class="tool-btn" :title="t('toolbar.horizontalRule')" @click="runFormat('hr')">
        ― Régua
      </button>
      <button class="tool-btn" :title="t('toolbar.codeBlock')" @click="runFormat('codeBlock')">
        { } Código
      </button>
      <button class="tool-btn" :title="t('toolbar.htmlBlock')" @click="runFormat('htmlBlock')">
        &lt;/&gt; HTML
      </button>
      <button class="tool-btn" :title="t('toolbar.mathBlock')" @click="runFormat('mathBlock')">
        ∑ Math
      </button>
      <button class="tool-btn" :title="t('toolbar.quote')" @click="runFormat('quote')">
        ❝
      </button>

      <div class="tool-sep"></div>

      <!-- Ações Rápidas de Seleção e Parágrafo -->
      <button
        class="tool-btn"
        :title="t('menu.duplicateSelection')"
        @click="runFormat('duplicate')"
      >
        ⧉ Duplicar
      </button>
      <button
        class="tool-btn"
        :title="t('menu.deleteParagraph')"
        @click="runFormat('deleteParagraph')"
      >
        🗑️ Parágrafo
      </button>
    </div>

    <!-- Barra de Localizar e Substituir (Ctrl+F / Ctrl+H) -->
    <div v-if="editorStore.findReplace.visible" class="find-replace-bar" @click.stop>
      <div class="find-row">
        <button
          class="tool-btn"
          title="Expandir / Ocultar Substituir"
          @click="editorStore.findReplace.showReplace = !editorStore.findReplace.showReplace"
        >
          {{ editorStore.findReplace.showReplace ? '▾' : '▸' }}
        </button>
        <input
          ref="findInputRef"
          v-model="editorStore.findReplace.query"
          class="pref-input find-input"
          :placeholder="t('findReplace.findPlaceholder')"
          @input="recomputeFindMatches(textareaRef)"
          @keydown.enter.exact.prevent="findNextMatch(textareaRef)"
          @keydown.shift.enter.prevent="findPrevMatch(textareaRef)"
        />
        <button
          class="tool-btn"
          :class="{ 'active-toggle': editorStore.findReplace.caseSensitive }"
          :title="t('findReplace.caseSensitive')"
          @click="
            editorStore.findReplace.caseSensitive = !editorStore.findReplace.caseSensitive;
            recomputeFindMatches(textareaRef)
          "
        >
          Aa
        </button>
        <button
          class="tool-btn"
          :class="{ 'active-toggle': editorStore.findReplace.useRegex }"
          :title="t('findReplace.regex')"
          @click="
            editorStore.findReplace.useRegex = !editorStore.findReplace.useRegex;
            recomputeFindMatches(textareaRef)
          "
        >
          .*
        </button>
        <span class="find-counter">
          <template v-if="editorStore.findReplace.matches.length > 0">
            {{ editorStore.findReplace.currentIndex + 1 }} {{ t('findReplace.matchesCount') }}
            {{ editorStore.findReplace.matches.length }}
          </template>
          <template v-else>{{ t('findReplace.noMatches') }}</template>
        </span>
        <button class="tool-btn" :title="t('findReplace.prev')" @click="findPrevMatch(textareaRef)">
          ↑
        </button>
        <button class="tool-btn" :title="t('findReplace.next')" @click="findNextMatch(textareaRef)">
          ↓
        </button>
        <button class="tool-btn" title="Fechar (Esc)" @click="closeFindBar()">✕</button>
      </div>

      <div v-if="editorStore.findReplace.showReplace" class="find-row replace-row">
        <span style="width: 26px"></span>
        <input
          v-model="editorStore.findReplace.replacement"
          class="pref-input find-input"
          :placeholder="t('findReplace.replacePlaceholder')"
          @keydown.enter.prevent="replaceCurrentMatch(textareaRef)"
        />
        <button class="tool-btn" @click="replaceCurrentMatch(textareaRef)">
          {{ t('findReplace.replace') }}
        </button>
        <button class="tool-btn" @click="replaceAllMatches()">
          {{ t('findReplace.replaceAll') }}
        </button>
      </div>
    </div>

    <!-- Alerta de Segurança de Links -->
    <div v-if="editorStore.securityAlert" class="security-banner">
      <span>🛡️ <b>{{ t('security.blockedTitle') }}:</b> {{ editorStore.securityAlert }}</span>
      <button class="tool-btn" @click="editorStore.securityAlert = null">✕</button>
    </div>

    <!-- Notificação Toast -->
    <div v-if="editorStore.toastMessage" class="nexo-toast">
      {{ editorStore.toastMessage }}
    </div>

    <!-- Corpo Principal: Barra Lateral + Palco do Editor -->
    <div class="workspace-body">
      <aside v-if="editorStore.sidebarVisible" class="sidebar">
        <div class="sidebar-tabs">
          <div
            class="sidebar-tab"
            :class="{ active: editorStore.sidebarTab === 'toc' }"
            @click="editorStore.sidebarTab = 'toc'"
          >
            {{ t('sidebar.toc') }}
          </div>
          <div
            class="sidebar-tab"
            :class="{ active: editorStore.sidebarTab === 'files' }"
            @click="editorStore.sidebarTab = 'files'"
          >
            {{ t('sidebar.files') }}
          </div>
          <div
            class="sidebar-tab"
            :class="{ active: editorStore.sidebarTab === 'search' }"
            @click="editorStore.sidebarTab = 'search'"
          >
            {{ t('sidebar.search') }}
          </div>
        </div>

        <!-- Aba Sumário (TOC H1..H6 clicável) -->
        <div v-if="editorStore.sidebarTab === 'toc'" class="sidebar-content">
          <div
            v-if="!activeDocument || activeDocument.toc.length === 0"
            style="color: var(--text-muted); font-size: 12px"
          >
            {{ t('sidebar.emptyToc') }}
          </div>
          <div
            v-for="(item, idx) in activeDocument?.toc"
            :key="idx"
            class="toc-item"
            :style="{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }"
            @click="scrollToLine(item.line)"
          >
            <span style="color: var(--accent); margin-right: 4px; font-weight: 600">
              H{{ item.level }}
            </span>
            <span>{{ item.text }}</span>
            <span style="float: right; color: var(--text-muted); font-size: 11px">
              L{{ item.line }}
            </span>
          </div>
        </div>

        <!-- Aba Arquivos -->
        <div v-else-if="editorStore.sidebarTab === 'files'" class="sidebar-content">
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px">
            <button class="tool-btn" style="width: 100%" @click="handleNewDocument()">
              ➕ {{ t('menu.newTab') }}
            </button>
            <button class="tool-btn" style="width: 100%" @click="triggerFileImport()">
              📂 {{ t('menu.openFile') }}
            </button>
          </div>
          <div class="sidebar-section-title">Documentos Abertos ({{ editorStore.tabs.length }})</div>
          <div
            v-for="tab in editorStore.tabs"
            :key="tab.id"
            class="toc-item"
            :style="{
              fontWeight: tab.id === editorStore.activeTabId ? '600' : '400',
              color: tab.id === editorStore.activeTabId ? 'var(--accent)' : 'var(--text-secondary)'
            }"
            @click="editorStore.activeTabId = tab.id"
          >
            📄 {{ tab.filename }}
            <span style="float: right; font-size: 10px; color: var(--text-muted)">
              {{ tab.lineEnding }}
            </span>
          </div>
          <p style="font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin-top: 12px">
            {{ t('sidebar.noWorkspace') }}
          </p>
        </div>

        <!-- Aba Busca -->
        <div v-else class="sidebar-content">
          <input
            v-model="editorStore.findReplace.query"
            class="pref-input"
            style="width: 100%; margin-bottom: 8px"
            :placeholder="t('sidebar.searchPlaceholder')"
            @input="recomputeFindMatches(textareaRef)"
          />
          <div
            v-if="editorStore.findReplace.matches.length === 0"
            style="font-size: 12px; color: var(--text-muted)"
          >
            {{ t('sidebar.noResults') }}
          </div>
          <div
            v-for="(m, idx) in editorStore.findReplace.matches"
            :key="idx"
            class="toc-item"
            @click="
              editorStore.findReplace.currentIndex = idx;
              recomputeFindMatches(textareaRef)
            "
          >
            <b>#{{ idx + 1 }}</b>: "{{ m.text }}" (pos {{ m.start }})
          </div>
        </div>
      </aside>

      <!-- Palco Principal do Editor -->
      <main
        v-if="activeDocument"
        class="editor-stage"
        :class="{
          'focus-mode': editorStore.preferences.focusMode,
          'typewriter-mode': editorStore.preferences.typewriterMode
        }"
      >
        <!-- Painel de Código-Fonte Markdown (com Numeração de Linhas sincronizada) -->
        <section
          v-if="editorStore.mode === 'source' || editorStore.mode === 'split'"
          class="source-pane"
        >
          <div
            v-if="editorStore.preferences.sourceLineNumbers"
            ref="gutterRef"
            class="source-line-gutter"
            aria-hidden="true"
          >
            <div
              v-for="ln in activeDocument.stats.lines"
              :key="ln"
              class="source-gutter-line"
              :class="{ 'active-line': ln === activeCursorLine }"
            >
              {{ ln }}
            </div>
          </div>
          <textarea
            ref="textareaRef"
            class="markdown-textarea"
            :value="activeDocument.content"
            :spellcheck="editorStore.preferences.spellcheck"
            placeholder="Digite seu Markdown aqui..."
            @input="onTextareaInput"
            @scroll="onTextareaScroll"
            @click="updateCursorLine"
            @keyup="updateCursorLine"
          ></textarea>
        </section>

        <!-- Painel Visual / Preview / Modo Leitura -->
        <section
          v-if="
            editorStore.mode === 'wysiwyg' ||
            editorStore.mode === 'split' ||
            editorStore.mode === 'readonly'
          "
          class="preview-pane"
          :contenteditable="editorStore.mode === 'wysiwyg'"
          @click="onPreviewClick"
          @blur="onPreviewBlur"
          v-html="renderedHtml || '<p style=&quot;color:var(--text-muted)&quot;>Documento em branco — comece a digitar...</p>'"
        ></section>
      </main>
    </div>

    <!-- Barra de Status com Seletor de Final de Linha (LF / CRLF / CR) e Telemetria -->
    <footer v-if="activeDocument" class="statusbar">
      <div class="status-group">
        <span class="status-pill">
          {{ activeDocument.isDirty ? t('status.modified') : t('status.saved') }}
        </span>
        <span>{{ activeDocument.encoding }}</span>
        <button
          class="status-le-btn"
          :title="t('status.lineEndingTooltip')"
          @click="cycleDocumentLineEnding()"
        >
          ↵ {{ activeDocument.lineEnding }}
        </button>
        <span>
          {{ t('status.blockIndex') }}: <b>{{ editorStore.indexStats.indexedBlocks }}</b>
        </span>
        <span>
          {{ t('status.svgCache') }}: <b>{{ editorStore.indexStats.cachedArtifacts }}</b>
        </span>
      </div>

      <div class="status-group">
        <span>{{ t('status.lines') }}: <b>{{ activeDocument.stats.lines }}</b></span>
        <span>{{ t('status.words') }}: <b>{{ activeDocument.stats.words }}</b></span>
        <span>{{ t('status.chars') }}: <b>{{ activeDocument.stats.chars }}</b></span>
        <span>
          {{ t('status.readingTime') }}: ~<b>{{ activeDocument.stats.readingTimeMinutes }}</b>
          {{ t('status.minutes') }}
        </span>
      </div>
    </footer>

    <!-- Modal: Seletor de Tamanho de Tabela (Grid Visual 10x10 + Inputs Numéricos + Alinhamento) -->
    <div
      v-if="editorStore.showTableModal"
      class="modal-backdrop"
      @click.self="editorStore.showTableModal = false"
    >
      <div class="modal-card" style="width: 440px">
        <h3 style="margin-bottom: 12px">⊞ {{ t('modals.tableTitle') }}</h3>

        <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary)">
          Tamanho selecionado:
          <b style="color: var(--accent)">
            {{ tableForm.hoverRow || tableForm.rows }} {{ t('modals.rows') }} ×
            {{ tableForm.hoverCol || tableForm.cols }} {{ t('modals.cols') }}
          </b>
        </div>

        <!-- Grade Visual Interativa 10x10 -->
        <div
          class="table-picker-grid"
          @mouseleave="
            tableForm.hoverRow = 0;
            tableForm.hoverCol = 0
          "
        >
          <div v-for="r in 10" :key="'r' + r" class="table-picker-row">
            <div
              v-for="c in 10"
              :key="'c' + c"
              class="table-picker-cell"
              :class="{
                active:
                  r <= (tableForm.hoverRow || tableForm.rows) &&
                  c <= (tableForm.hoverCol || tableForm.cols)
              }"
              @mouseenter="
                tableForm.hoverRow = r;
                tableForm.hoverCol = c
              "
              @click="onGridCellClick(r, c)"
            ></div>
          </div>
        </div>

        <div class="pref-row">
          <span>{{ t('modals.rows') }}</span>
          <input
            v-model.number="tableForm.rows"
            type="number"
            min="1"
            max="30"
            class="pref-input"
            style="width: 80px"
          />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.cols') }}</span>
          <input
            v-model.number="tableForm.cols"
            type="number"
            min="1"
            max="15"
            class="pref-input"
            style="width: 80px"
          />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.alignment') }}</span>
          <select v-model="tableForm.alignment" class="pref-select">
            <option value="left">{{ t('modals.alignLeft') }} (:---)</option>
            <option value="center">{{ t('modals.alignCenter') }} (:---:)</option>
            <option value="right">{{ t('modals.alignRight') }} (---:)</option>
          </select>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px">
          <button class="tool-btn" @click="editorStore.showTableModal = false">
            {{ t('modals.cancel') }}
          </button>
          <button
            class="tool-btn primary-btn"
            @click="
              insertCustomTable(
                tableForm.rows,
                tableForm.cols,
                tableForm.alignment,
                textareaRef
              )
            "
          >
            {{ t('modals.insert') }} ({{ tableForm.rows }}×{{ tableForm.cols }})
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Inserir Link -->
    <div
      v-if="editorStore.showLinkModal"
      class="modal-backdrop"
      @click.self="editorStore.showLinkModal = false"
    >
      <div class="modal-card" style="width: 460px">
        <h3 style="margin-bottom: 12px">🔗 {{ t('modals.linkTitle') }}</h3>
        <div class="pref-row">
          <span>{{ t('modals.linkText') }}</span>
          <input v-model="linkForm.text" class="pref-input" style="width: 260px" />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.linkUrl') }}</span>
          <input v-model="linkForm.url" class="pref-input" style="width: 260px" />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.linkTooltip') }}</span>
          <input v-model="linkForm.title" class="pref-input" style="width: 260px" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px">
          <button class="tool-btn" @click="editorStore.showLinkModal = false">
            {{ t('modals.cancel') }}
          </button>
          <button
            class="tool-btn primary-btn"
            @click="insertMarkdownLink(linkForm.text, linkForm.url, linkForm.title, textareaRef)"
          >
            {{ t('modals.insert') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Inserir Imagem (URL ou Upload Local Base64) -->
    <div
      v-if="editorStore.showImageModal"
      class="modal-backdrop"
      @click.self="editorStore.showImageModal = false"
    >
      <div class="modal-card" style="width: 480px">
        <h3 style="margin-bottom: 12px">🖼️ {{ t('modals.imageTitle') }}</h3>
        <div class="pref-row">
          <span>{{ t('modals.imageAlt') }}</span>
          <input v-model="imageForm.alt" class="pref-input" style="width: 260px" />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.imageUrl') }}</span>
          <input
            v-model="imageForm.url"
            class="pref-input"
            style="width: 260px"
            placeholder="https://... ou data:image/..."
          />
        </div>
        <div class="pref-row">
          <span>{{ t('modals.imageUpload') }}</span>
          <input type="file" accept="image/*" style="font-size: 12px" @change="onLocalImageUpload" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px">
          <button class="tool-btn" @click="editorStore.showImageModal = false">
            {{ t('modals.cancel') }}
          </button>
          <button
            class="tool-btn primary-btn"
            @click="insertMarkdownImage(imageForm.alt, imageForm.url, imageForm.title, textareaRef)"
          >
            {{ t('modals.insert') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Renomear Documento -->
    <div
      v-if="editorStore.showRenameModal"
      class="modal-backdrop"
      @click.self="editorStore.showRenameModal = false"
    >
      <div class="modal-card" style="width: 400px">
        <h3 style="margin-bottom: 12px">✏️ {{ t('modals.renameTitle') }}</h3>
        <div class="pref-row">
          <span>{{ t('modals.newFilename') }}</span>
          <input
            v-model="renameForm.filename"
            class="pref-input"
            style="width: 220px"
            @keydown.enter="confirmRenameTab()"
          />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px">
          <button class="tool-btn" @click="editorStore.showRenameModal = false">
            {{ t('modals.cancel') }}
          </button>
          <button class="tool-btn primary-btn" @click="confirmRenameTab()">
            Salvar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Paleta de Comandos (Ctrl+Shift+P) -->
    <div
      v-if="editorStore.showCommandPalette"
      class="modal-backdrop"
      @click.self="editorStore.showCommandPalette = false"
    >
      <div class="modal-card" style="width: 560px">
        <input
          v-model="commandFilter"
          class="pref-input"
          style="width: 100%; margin-bottom: 10px"
          :placeholder="t('commandPalette.placeholder')"
          autofocus
        />
        <div style="max-height: 300px; overflow-y: auto">
          <button
            v-for="cmd in filteredCommands"
            :key="cmd.id"
            class="menu-item"
            style="width: 100%; text-align: left; padding: 8px 10px"
            @click="executePaletteCommand(cmd)"
          >
            {{ cmd.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Preferências -->
    <div
      v-if="editorStore.showPreferencesModal"
      class="modal-backdrop"
      @click.self="editorStore.showPreferencesModal = false"
    >
      <div class="modal-card">
        <h3 style="margin-bottom: 14px">{{ t('preferences.title') }}</h3>

        <div class="pref-row">
          <span>{{ t('preferences.language') }}</span>
          <select v-model="locale" class="pref-select">
            <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
              {{ lang.label }}
            </option>
          </select>
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.theme') }}</span>
          <select v-model="editorStore.preferences.theme" class="pref-select">
            <option value="nexo-dark">Nexo Dark (Padrão)</option>
            <option value="nexo-light">Nexo Light</option>
            <option value="one-dark">One Dark</option>
            <option value="material-dark">Material Dark</option>
            <option value="ulysses-light">Ulysses Light</option>
            <option value="cadmium-light">Cadmium Solarized</option>
          </select>
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.fontSize') }}</span>
          <input
            v-model.number="editorStore.preferences.fontSize"
            type="number"
            min="12"
            max="28"
            class="pref-input"
            style="width: 80px"
          />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.autoSave') }}</span>
          <input v-model="editorStore.preferences.autoSave" type="checkbox" />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.codeBlockLineNumbers') }}</span>
          <input v-model="editorStore.preferences.codeBlockLineNumbers" type="checkbox" />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.sourceLineNumbers') }}</span>
          <input v-model="editorStore.preferences.sourceLineNumbers" type="checkbox" />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.spellcheck') }}</span>
          <input v-model="editorStore.preferences.spellcheck" type="checkbox" />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.focusMode') }}</span>
          <input v-model="editorStore.preferences.focusMode" type="checkbox" />
        </div>

        <div class="pref-row">
          <span>{{ t('preferences.typewriterMode') }}</span>
          <input v-model="editorStore.preferences.typewriterMode" type="checkbox" />
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 18px">
          <button class="tool-btn" @click="exportPreferencesJson()">
            ⬇ {{ t('preferences.exportJson') }}
          </button>
          <button class="tool-btn" @click="editorStore.showPreferencesModal = false">
            {{ t('preferences.close') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Sobre o NexoMD v0.2.0 -->
    <div
      v-if="editorStore.showAboutModal"
      class="modal-backdrop"
      @click.self="editorStore.showAboutModal = false"
    >
      <div class="modal-card" style="width: 520px">
        <h3 style="margin-bottom: 8px">⚡ {{ t('app.name') }} {{ t('app.version') }}</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.55">
          {{ t('app.tagline') }} — Arquitetura Híbrida Dual-Runtime (<code>ropey::Rope</code> + <code>pulldown-cmark</code> SIMD + Indexador de Blocos <code>O(1)</code> + Exportação Nativa PDF, DOCX, DOC, RTF, HTML e MD).
        </p>
        <div class="pref-row">
          <span>Autor</span>
          <b>Edkallenn (@ed1rac)</b>
        </div>
        <div class="pref-row">
          <span>Licença</span>
          <span>GPL-3.0-or-later</span>
        </div>
        <div class="pref-row">
          <span>Atalhos Principais</span>
          <span style="font-size: 12px; color: var(--text-secondary)">
            Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+F, Ctrl+H, Ctrl+Shift+P
          </span>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 16px">
          <button class="tool-btn primary-btn" @click="editorStore.showAboutModal = false">
            {{ t('preferences.close') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
