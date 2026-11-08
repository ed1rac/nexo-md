<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n, type SupportedLocale } from './i18n'
import {
  editorStore,
  activeDocument,
  createNewDocument,
  updateActiveDocumentContent,
  undoActiveDocument,
  redoActiveDocument,
  saveActiveDocument,
  renderMarkdownToHtml,
  applyToolbarFormat,
  handleSafeLinkClick,
  exportPreferencesJson,
  type EditorMode
} from './stores/editorStore'

const { t, locale, availableLocales } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const renderedHtml = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  return renderMarkdownToHtml(doc.content)
})

const editorCssVars = computed(() => ({
  '--editor-font-size': `${editorStore.preferences.fontSize}px`,
  '--editor-line-height': String(editorStore.preferences.lineHeight)
}))

function onTextareaInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  void updateActiveDocumentContent(target.value)
}

function onPreviewClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a')
  if (target && target.getAttribute('href')) {
    e.preventDefault()
    void handleSafeLinkClick(target.getAttribute('href')!)
  }
}

function setMode(m: EditorMode) {
  editorStore.mode = m
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void saveActiveDocument()
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    editorStore.showCommandPalette = !editorStore.showCommandPalette
  } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault()
    editorStore.showPreferencesModal = !editorStore.showPreferencesModal
  }
}

onMounted(() => {
  if (editorStore.tabs.length === 0) {
    void createNewDocument('Boas-Vindas.md')
  }
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="nexo-app" :data-theme="editorStore.preferences.theme" :style="editorCssVars">
    <!-- Barra de Topo: Marca, Abas de Documentos, Modos de Visão e Preferências -->
    <header class="topbar">
      <div class="brand">
        <button
          class="tool-btn"
          title="Alternar Barra Lateral"
          @click="editorStore.sidebarVisible = !editorStore.sidebarVisible"
        >
          ☰
        </button>
        <span>{{ t('app.name') }}</span>
        <span class="brand-badge">Rust Rope + O(1) Index</span>
      </div>

      <!-- Abas de Documentos -->
      <div class="tabs-strip">
        <div
          v-for="tab in editorStore.tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === editorStore.activeTabId }"
          @click="editorStore.activeTabId = tab.id"
        >
          <span>{{ tab.filename }}</span>
          <span v-if="tab.isDirty" class="dirty-dot" :title="t('status.modified')"></span>
        </div>
        <button class="tool-btn" :title="t('menu.newTab')" @click="createNewDocument()">+</button>
      </div>

      <!-- Seletor dos 4 Modos de Visão (WYSIWYG, Split, Código-Fonte, Modo Leitura) -->
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

      <!-- Idioma Rápido e Botão de Preferências -->
      <div style="display: flex; align-items: center; gap: 6px">
        <select
          v-model="locale"
          class="pref-select"
          style="padding: 4px 8px; font-size: 12px"
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
          ⚙ {{ t('menu.preferences') }}
        </button>
      </div>
    </header>

    <!-- Barra de Ferramentas de Formatação (Oculta em Modo Somente Leitura) -->
    <div v-if="editorStore.mode !== 'readonly'" class="formatting-bar">
      <button class="tool-btn" :title="t('menu.undo')" @click="undoActiveDocument()">↶</button>
      <button class="tool-btn" :title="t('menu.redo')" @click="redoActiveDocument()">↷</button>
      <button class="tool-btn" :title="t('menu.save')" @click="saveActiveDocument()">
        💾 {{ t('menu.save') }}
      </button>
      <div class="tool-sep"></div>
      <button class="tool-btn" :title="t('toolbar.heading1')" @click="applyToolbarFormat('h1', textareaRef)">
        H1
      </button>
      <button class="tool-btn" :title="t('toolbar.heading2')" @click="applyToolbarFormat('h2', textareaRef)">
        H2
      </button>
      <button class="tool-btn" :title="t('toolbar.heading3')" @click="applyToolbarFormat('h3', textareaRef)">
        H3
      </button>
      <div class="tool-sep"></div>
      <button class="tool-btn" :title="t('toolbar.bold')" @click="applyToolbarFormat('bold', textareaRef)">
        <b>B</b>
      </button>
      <button class="tool-btn" :title="t('toolbar.italic')" @click="applyToolbarFormat('italic', textareaRef)">
        <i>I</i>
      </button>
      <button
        class="tool-btn"
        :title="t('toolbar.strikethrough')"
        @click="applyToolbarFormat('strike', textareaRef)"
      >
        <s>S</s>
      </button>
      <button
        class="tool-btn"
        :title="t('toolbar.inlineCode')"
        @click="applyToolbarFormat('inlineCode', textareaRef)"
      >
        `code`
      </button>
      <div class="tool-sep"></div>
      <!-- Lista Ordenada com Bug F-02 corrigido -->
      <button
        class="tool-btn"
        :title="t('toolbar.orderedList')"
        @click="applyToolbarFormat('orderedList', textareaRef)"
      >
        1. {{ t('toolbar.orderedList') }}
      </button>
      <button
        class="tool-btn"
        :title="t('toolbar.bulletList')"
        @click="applyToolbarFormat('bulletList', textareaRef)"
      >
        • {{ t('toolbar.bulletList') }}
      </button>
      <button
        class="tool-btn"
        :title="t('toolbar.taskList')"
        @click="applyToolbarFormat('taskList', textareaRef)"
      >
        ☑ {{ t('toolbar.taskList') }}
      </button>
      <div class="tool-sep"></div>
      <button
        class="tool-btn"
        :title="t('toolbar.codeBlock')"
        @click="applyToolbarFormat('codeBlock', textareaRef)"
      >
        { } {{ t('toolbar.codeBlock') }}
      </button>
      <button
        class="tool-btn"
        :title="t('toolbar.mathBlock')"
        @click="applyToolbarFormat('mathBlock', textareaRef)"
      >
        ∑ {{ t('toolbar.mathBlock') }}
      </button>
      <button class="tool-btn" :title="t('toolbar.table')" @click="applyToolbarFormat('table', textareaRef)">
        ⊞ {{ t('toolbar.table') }}
      </button>
      <button class="tool-btn" :title="t('toolbar.quote')" @click="applyToolbarFormat('quote', textareaRef)">
        ❝ {{ t('toolbar.quote') }}
      </button>
    </div>

    <!-- Alerta de Segurança de Links (Correção da Vulnerabilidade shell.openPath) -->
    <div
      v-if="editorStore.securityAlert"
      style="
        background: var(--danger);
        color: #fff;
        padding: 8px 16px;
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      "
    >
      <span>🛡️ <b>{{ t('security.blockedTitle') }}:</b> {{ editorStore.securityAlert }}</span>
      <button class="tool-btn" @click="editorStore.securityAlert = null">✕</button>
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

        <!-- Aba Sumário (TOC extraído em passo único via pulldown-cmark) -->
        <div v-if="editorStore.sidebarTab === 'toc'" class="sidebar-content">
          <div v-if="!activeDocument || activeDocument.toc.length === 0" style="color: var(--text-muted); font-size: 12px">
            {{ t('sidebar.emptyToc') }}
          </div>
          <div
            v-for="(item, idx) in activeDocument?.toc"
            :key="idx"
            class="toc-item"
            :style="{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }"
          >
            <span style="color: var(--accent); margin-right: 4px">H{{ item.level }}</span>
            <span>{{ item.text }}</span>
            <span style="float: right; color: var(--text-muted); font-size: 11px">L{{ item.line }}</span>
          </div>
        </div>

        <!-- Aba Arquivos (Carregamento O(1) apenas de metadados stat) -->
        <div v-else-if="editorStore.sidebarTab === 'files'" class="sidebar-content">
          <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5">
            {{ t('sidebar.noWorkspace') }}
          </p>
        </div>

        <!-- Aba Busca Ripgrep -->
        <div v-else class="sidebar-content">
          <input
            v-model="editorStore.searchQuery"
            class="pref-input"
            style="width: 100%; margin-bottom: 8px"
            :placeholder="t('sidebar.searchPlaceholder')"
          />
          <p style="font-size: 12px; color: var(--text-muted)">
            {{ t('sidebar.noResults') }}
          </p>
        </div>
      </aside>

      <!-- Palco Principal do Editor (Suporta Source, Split, WYSIWYG e Read-Only) -->
      <main v-if="activeDocument" class="editor-stage">
        <!-- Painel de Código-Fonte Markdown -->
        <section
          v-if="editorStore.mode === 'source' || editorStore.mode === 'split'"
          class="source-pane"
        >
          <textarea
            ref="textareaRef"
            class="markdown-textarea"
            :value="activeDocument.content"
            :spellcheck="editorStore.preferences.spellcheck"
            @input="onTextareaInput"
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
          v-html="renderedHtml"
        ></section>
      </main>
    </div>

    <!-- Barra de Status com Telemetria em Tempo Real -->
    <footer v-if="activeDocument" class="statusbar">
      <div class="status-group">
        <span class="status-pill">
          {{ activeDocument.isDirty ? t('status.modified') : t('status.saved') }}
        </span>
        <span>{{ activeDocument.encoding }}</span>
        <span>{{ activeDocument.lineEnding }}</span>
        <span>
          {{ t('status.blockIndex') }}: <b>{{ editorStore.indexStats.indexedBlocks }}</b>
        </span>
        <span>
          {{ t('status.svgCache') }}:
          <b>{{ editorStore.indexStats.cachedArtifacts }}</b> (hits:
          {{ editorStore.indexStats.cacheHits }})
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

    <!-- Modal de Preferências (Com Seletor de Idioma Ativo — Corrige F-01) -->
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
          <span>{{ t('preferences.spellcheck') }}</span>
          <input v-model="editorStore.preferences.spellcheck" type="checkbox" />
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
  </div>
</template>
