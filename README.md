<div align="center">

# ⚡ NexoMD

**Editor Markdown Híbrido Nativo de Alta Performance (Rust + Tauri v2 + Vue 3 + TypeScript)**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Rust](https://img.shields.io/badge/Core-Rust%20%2B%20Ropey-orange.svg)](https://www.rust-lang.org/)
[![Tauri v2](https://img.shields.io/badge/Desktop-Tauri%20v2-24c8db.svg)](https://v2.tauri.app/)
[![Vue 3](https://img.shields.io/badge/UI-Vue%203.5%20%2B%20TS-42b883.svg)](https://vuejs.org/)
[![Vercel App](https://img.shields.io/badge/Demo%20Online-Vercel%20App-000000?logo=vercel)](https://nexomarkdown.vercel.app/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Web-222222?logo=github)](https://ed1rac.github.io/nexo-md/)
[![Releases](https://img.shields.io/badge/Releases-v0.2.0%20Windows%20%7C%20Linux%20%7C%20macOS-success?logo=github)](https://github.com/ed1rac/nexo-md/releases)
[![Autor](https://img.shields.io/badge/Autor-Edkallenn%20(%40ed1rac)-purple.svg)](https://github.com/ed1rac)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-edkallenn-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/edkallenn)

*Roda **nativamente** em Desktop (Windows, Linux e macOS) com binário ultraleve e **também direto no navegador Web**!*

### 🌐 Acesse Agora no Navegador (Sem Instalar Nada):
- 🚀 **App Online na Vercel**: **[https://nexomarkdown.vercel.app/](https://nexomarkdown.vercel.app/)**
- 🌍 **Espelho no GitHub Pages**: **[https://ed1rac.github.io/nexo-md/](https://ed1rac.github.io/nexo-md/)**
- 📦 **Downloads Nativos (Windows, Linux e macOS)**: **[Página Oficial de Releases (`v0.2.0`)](https://github.com/ed1rac/nexo-md/releases)**

</div>

---

## 🎯 Sobre o Projeto

O **NexoMD** é um editor de Markdown moderno, rápido e seguro, concebido do zero com uma arquitetura **Híbrida Dual-Runtime**:

1. **Modo Desktop Nativo (Tauri v2 + Rust)**: Utiliza estruturas de dados de nível de sistema (`ropey::Rope` B-Tree UTF-8, parser SIMD `pulldown-cmark`, varredura de diretórios `ignore` e busca multithread `grep-searcher` do `ripgrep`), consumindo uma fração mínima de memória RAM e gerando um executável nativo compacto (~5 a 8 MB) sem embutir o Chromium inteiro.
2. **Modo Web / Navegador (Vite + Vue 3 + Motor `O(1)`)**: Funciona 100% no navegador como uma Single-Page Application (SPA) estática com indexação de blocos em tempo constante `O(1)` (`Map<string, BlockNode>`) e cache inteligente de fórmulas matemáticas.

> **Nota Histórica e Inspiração Arquitetural:**
> O **NexoMD** não compartilha código-fonte com editores legados baseados em Electron (como o *MarkText*). Ele nasceu como uma resposta de engenharia de software após uma auditoria profunda dos gargalos clássicos de editores Markdown em Electron/DOM (como buscas recursivas `O(N²)` em árvores de blocos, clones profundos de JSON no histórico de Undo/Redo e leitura integral de arquivos ao abrir pastas). O NexoMD foi inteiramente projetado e escrito do zero em **Rust + Vue 3 + TypeScript**.

---

## ✨ Funcionalidades Principais (`v0.2.0`)

### 🚀 Motor e Desempenho
- **Buffer de Texto em `Rope` (`ropey::Rope` em Rust)**: Inserções e deleções em `O(log N)` mesmo em arquivos de dezenas de megabytes.
- **Histórico de Desfazer/Refazer (`Undo/Redo`) em `O(1)`**: Baseado em compartilhamento estrutural imutável (`Arc` snapshots em Rust), sem clonagem pesada de JSON e sem travamentos de interface.
- **Indexador de Blocos em `O(1)` (`BlockIndex`)**: Tabela de dispersão (`Map<string, BlockNode>`) que substitui varreduras recursivas `O(N)` no DOM.
- **Cache Incremental de Fórmulas Matemáticas (`KaTeX`)**: Expressões `$$...$$` e `$...$` são cacheadas por hash FNV-1a de 32 bits (`O(1)` em re-renderizações).
- **Abertura Instantânea de Pastas (`O(1)` Content I/O)**: Ao abrir um workspace no desktop, lê exclusivamente os metadados (`stat`) dos arquivos respeitando `.gitignore` via crate `ignore` (`< 3 ms`), carregando o conteúdo apenas sob demanda.
- **Busca Global Ultrarrápida (`ripgrep` Core)**: Pesquisa textual e regex multithread direto no núcleo em Rust via `grep-searcher`.

### 📝 Edição, Formatação, Importação e Exportação Completa
- **4 Modos de Visão Integrados**: **Visual (`WYSIWYG`)**, **Dividido (`Split View`)**, **Código-Fonte (`Source Code`)** e **Somente Leitura (`Read-Only`)**, além de **Modo Foco** e **Modo Máquina de Escrever**.
- **Múltiplos Documentos em Abas (`+` / `Ctrl+N`)**: Criação limpa de novos documentos (`Sem-Titulo-N.md`), renomeação com duplo clique e fechamento individual (`×` / `Ctrl+W`).
- **Localizar (`Ctrl+F`) e Localizar e Substituir (`Ctrl+H`)**: Busca incremental com *Case Sensitive* (`Aa`), *Expressões Regulares* (`.*`), contador de ocorrências e substituição individual ou em lote.
- **Exportação Multiformato Nativa**:
  - **PDF**: Folha de impressão A4 dedicada com tipografia e blocos estilizados.
  - **DOCX (OpenXML ZIP)**: Geração direta de pacote `.docx` compatível com Word / LibreOffice.
  - **DOC (Word HTML/XML)**: Documento `.doc` estilizado.
  - **RTF (Rich Text Format)**: Geração `.rtf` com escape Unicode completo.
  - **HTML (`.html`)** e **Markdown (`.md`)**.
- **Importação Inteligente (`Ctrl+O` ou Drag & Drop)**: Abre `.md`, `.markdown`, `.txt` e converte arquivos `.html` / `.htm` automaticamente para Markdown.
- **Controle de Final de Linha (`LF`, `CRLF`, `CR`)**: Seletor interativo na barra de status e no menu **Arquivo**, sincronizado com o motor Rust.
- **Área de Transferência Avançada**: **Copiar como Markdown (`Ctrl+Shift+C`)**, **Copiar como HTML** e **Colar como Texto Simples (`Ctrl+Shift+V`)**.
- **Hierarquia Completa de Parágrafos (`H1` a `H6` + `P`)**: Botões dedicados para `H1`..`H6`, **Promover Título (`Ctrl+=`)**, **Rebaixar Título (`Ctrl+-`)**, **Duplicar Seleção/Linha (`Ctrl+Shift+D`)**, **Criar Parágrafo Acima/Abaixo** e **Apagar Parágrafo (`Ctrl+Shift+K`)**.
- **Seletor Visual de Tamanho de Tabela (`10×10`)**: Grade interativa `Linhas × Colunas` + escolha de alinhamento (`Esquerda`, `Centro`, `Direita`) ao inserir tabelas.
- **Formatação Inline Estendida**: **Negrito**, *Itálico*, **Sublinhado (`<u>`)**, ~~Tachado~~, **Highlight / Realce (`==texto==`)**, **Sobrescrito (`^texto^`)**, **Subscrito (`~texto~`)**, Código Inline e **Limpar Formatação (`Ctrl+\`)**.
- **Inserção de Elementos Ricos**: **Régua Horizontal (`---`)**, **Modal de Link (`Ctrl+K`)**, **Modal de Imagem (`Ctrl+Shift+I` — URL ou Upload Base64)**, **Bloco de HTML (`<div>`)**, **Alertas GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)**, **Frontmatter YAML** e **Notas de Rodapé (`[^1]`)**.
- **Numeração de Linhas no Editor de Código-Fonte e em Blocos de Código** + **Sumário Automático (`TOC`) Clicável**.

### 🛡️ Confiabilidade, Segurança e Internacionalização
- **Salvamento Atômico (`Atomic Write`)**: Gravação em arquivo temporário no mesmo volume + `fsync` (`sync_all`) + renomeação atômica, impedindo arquivos truncados (0 bytes) em quedas de energia.
- **Diário de Recuperação de Sessão (`Hot Exit / Crash Recovery`)**: Rascunhos modificados e não salvos são preservados em snapshots automáticos.
- **Salvamento Automático (`Auto-Save`) Real**: Com temporizador *debounce* configurável.
- **Validador de Segurança de Links**: Bloqueia esquemas maliciosos (`javascript:`, `vbscript:`, `data:`) e impede que cliques em links locais executem binários ou scripts (`.exe`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.msi`, `.lnk`, `.scr`, `.hta`, `.reg`).
- **Sanitização Estrita contra XSS**: Integrada via `DOMPurify` + *Content Security Policy (CSP)* rigorosa.
- **Internacionalização Reativa (`i18n`) em Tempo Real**: Troca instantânea entre **Português (Brasil) (`pt-BR`)** e **Inglês (`en`)** direto na barra superior ou nas Preferências, sem reiniciar o programa.
- **6 Temas Visuais Integrados**:
  - `Nexo Dark` (Padrão)
  - `Nexo Light`
  - `One Dark`
  - `Material Dark`
  - `Ulysses Light`
  - `Cadmium Solarized`
- **Exportação de Preferências em JSON**: Exporte suas configurações com 1 clique.

---

## 🖥️ Como Executar (Web e Desktop Nativo)

O **NexoMD** oferece **5 formas diferentes de execução**, desde o uso imediato com dois cliques (sem instalar nada) até o ambiente completo de desenvolvimento e compilação nativa:

### 0. Execução Imediata (Online ou Nativos Prontos — Zero Configuração)

- 🚀 **A) Online direto na Web (Vercel / GitHub Pages)**:
  - Acesse **[https://nexomarkdown.vercel.app/](https://nexomarkdown.vercel.app/)** ou **[https://ed1rac.github.io/nexo-md/](https://ed1rac.github.io/nexo-md/)** em qualquer dispositivo.
- 🪟 **B) Executável Nativo Windows (Pronto para Uso)**:
  - Baixe na **[Página de Releases (`v0.2.0`)](https://github.com/ed1rac/nexo-md/releases)** ou abra a pasta [`releases/windows/`](./releases/windows/) e dê **dois cliques** em **`nexo-md.exe`** (`6,68 MB`).
  - Roda nativamente no Windows 10/11 consumindo apenas ~35 MB de RAM, sem precisar de Node.js ou Rust instalados.
- 🐧 **C) Executável Nativo Linux (`x86_64`)**:
  - Disponível em [`releases/linux-x64/nexo-md`](./releases/linux-x64/nexo-md) e na **[Página de Releases (`v0.2.0`)](https://github.com/ed1rac/nexo-md/releases)** (`chmod +x nexo-md && ./nexo-md`).
- 🍎 **D) Executável Nativo macOS (Apple Silicon `arm64` M1/M2/M3/M4 e Intel `x86_64`)**:
  - Disponível em [`releases/macos-arm64/nexo-md`](./releases/macos-arm64/nexo-md) e [`releases/macos-x64/nexo-md`](./releases/macos-x64/nexo-md) ou na **[Página de Releases (`v0.2.0`)](https://github.com/ed1rac/nexo-md/releases)**.
- 🌐 **E) Versão Web Autônoma Offline (*Single-File Web App*)**:
  - Basta abrir a pasta [`dist-web/`](./dist-web/) e dar **dois cliques** diretamente em **`index.html`** no seu gerenciador de arquivos (`file://`).
  - Todo o motor `O(1)`, estilos e scripts já estão embutidos em um único arquivo HTML autônomo que abre e funciona 100% offline em qualquer navegador moderno (Chrome, Edge, Firefox, Safari, Brave) em Windows, Linux ou macOS!

### 1. Modo Navegador Web (Desenvolvimento ou Build Estático)

O NexoMD mantém compatibilidade total com qualquer navegador moderno:

```bash
# Instalar dependências
npm install

# Rodar servidor de desenvolvimento no navegador com Hot-Reload (http://localhost:1420)
npm run dev

# Gerar versão estática pronta para hospedar em GitHub Pages / Vercel / Netlify (pasta dist-web/)
npm run build:web

# Testar a versão estática compilada do navegador via servidor HTTP local (http://localhost:4173)
npm run preview:web
```

### 2. Modo Desktop Nativo (Windows, Linux e macOS)

Requer [Rust (`rustup` / `cargo`)](https://rustup.rs/) instalado:

```bash
# Executar em modo de desenvolvimento Desktop Nativo (abre a janela nativa com Hot-Reload)
npx tauri dev

# Executar os testes unitários do motor nativo em Rust (Rope O(1) + Validador de Segurança)
cd src-tauri && cargo test --lib && cd ..

# Compilar o binário nativo de produção
npm run build:native

# Ou gerar o executável autônomo / pacotes via Tauri CLI
npx tauri build --no-bundle
```

O executável nativo otimizado (`release`) é gerado em:
- **Windows**: `src-tauri/target/release/nexo-md.exe` (e copiado em `releases/windows/nexo-md.exe`)
- **Linux**: `src-tauri/target/release/nexo-md` (`.deb` / `.AppImage` via GitHub Actions)
- **macOS**: `src-tauri/target/release/bundle/macos/NexoMD.app` (`.dmg` Universal via GitHub Actions)

---

## 📦 Compilação Multiplataforma (Windows, Linux e macOS)

Como o **Rust + Tauri v2** vincula bibliotecas nativas do sistema operacional alvo (WebView2 no Windows, WebKitGTK no Linux e WebKit/Cocoa no macOS), este repositório inclui o workflow automatizado [`.github/workflows/release-multiplatform.yml`](./.github/workflows/release-multiplatform.yml) que compila simultaneamente:
1. 🪟 **Windows (`x86_64-pc-windows-msvc`)**: Executável `.exe` e instaladores `.msi` / NSIS.
2. 🐧 **Linux (`x86_64-unknown-linux-gnu`)**: Pacotes `.deb` e `.AppImage`.
3. 🍎 **macOS (`aarch64-apple-darwin` & `x86_64-apple-darwin`)**: Aplicativo `.app` e imagem `.dmg`.
4. 🌐 **Web Bundle (`dist-web/`)**: Aplicação Web completa pronta para navegador.

---

## ☕ Apoie o Projeto (Me Pague um Café / Buy Me a Coffee)

O **NexoMD** é um software livre e de código aberto desenvolvido com dedicação à engenharia de software de alta performance. Se este projeto foi útil para os seus estudos, trabalho ou produtividade diária e você quiser apoiar o desenvolvimento contínuo:

- ☕ **Buy Me a Coffee (Internacional / Cartão / QR Code)**:
  - 👉 **[https://buymeacoffee.com/edkallenn](https://buymeacoffee.com/edkallenn)**
  - [![](https://img.shields.io/badge/☕_Buy_Me_a_Coffee-Apoiar_Projeto-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/edkallenn)
  - Escaneie o QR Code abaixo com a câmera do celular para abrir diretamente:

<div align="center">
  <a href="https://buymeacoffee.com/edkallenn" target="_blank">
    <img src="./bmc_qr.png" alt="Buy Me a Coffee QR Code — Edkallenn (@ed1rac)" width="220" />
  </a>
</div>

- 🇧🇷 **PIX (Brasil — Qualquer valor, taxa zero)**:
  - **Chave PIX (E-mail)**: `edkevan@gmail.com`
  - **Titular**: Edkallenn Silva de Lima

Muito obrigado pelo apoio! 🚀

---

## 👨‍💻 Autor

Desenvolvido por **Edkallenn** (**[@ed1rac](https://github.com/ed1rac)**)
- GitHub: [https://github.com/ed1rac](https://github.com/ed1rac)
- Buy Me a Coffee: [https://buymeacoffee.com/edkallenn](https://buymeacoffee.com/edkallenn)
- Contato / PIX: `edkevan@gmail.com`

---

## 📜 Licença

Este projeto é distribuído sob a licença **GNU General Public License v3.0 (GPL-3.0-or-later)** — veja o arquivo [LICENSE](./LICENSE) para detalhes.

A licença **GPL-3.0** garante que o **NexoMD** e quaisquer trabalhos derivados permaneçam sempre **Software Livre e de Código Aberto**, protegendo a autoria original e impedindo que o código seja fechado em produtos proprietários sem retribuir as melhorias à comunidade.
