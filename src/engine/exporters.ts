/**
 * Motor de Exportação (PDF, HTML, DOCX, DOC, RTF, MD) e Importação (HTML -> Markdown, MD, TXT) do NexoMD v0.2.0.
 */

export type LineEndingType = 'LF' | 'CRLF' | 'CR'

export function normalizeLineEndings(content: string, lineEnding: LineEndingType): string {
  const lf = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (lineEnding === 'CRLF') return lf.replace(/\n/g, '\r\n')
  if (lineEnding === 'CR') return lf.replace(/\n/g, '\r')
  return lf
}

export function detectLineEnding(raw: string): LineEndingType {
  if (raw.includes('\r\n')) return 'CRLF'
  if (raw.includes('\r')) return 'CR'
  return 'LF'
}

function stripExtension(filename: string): string {
  return filename.replace(/\.(md|markdown|txt|html|htm)$/i, '') || 'documento'
}

export function triggerBlobDownload(blob: Blob, downloadName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Exporta o arquivo Markdown (.md) respeitando a quebra de linha selecionada (LF, CRLF ou CR).
 */
export function exportAsMarkdown(
  filename: string,
  content: string,
  lineEnding: LineEndingType
): void {
  const normalized = normalizeLineEndings(content, lineEnding)
  const outName = filename.endsWith('.md') ? filename : `${stripExtension(filename)}.md`
  const blob = new Blob([normalized], { type: 'text/markdown;charset=utf-8' })
  triggerBlobDownload(blob, outName)
}

const STANDALONE_DOC_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    line-height: 1.65;
    color: #1f2328;
    max-width: 840px;
    margin: 40px auto;
    padding: 0 24px;
    background: #ffffff;
  }
  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.4em;
    margin-bottom: 0.5em;
    font-weight: 700;
    color: #111827;
  }
  h1, h2, h3 {
    border-bottom: 1px solid #d0d7de;
    padding-bottom: 0.25em;
  }
  p, ul, ol, blockquote, table, pre {
    margin-bottom: 1em;
  }
  code {
    font-family: "JetBrains Mono", Consolas, monospace;
    background: #f3f4f6;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  pre {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 14px 16px;
    overflow-x: auto;
  }
  pre code {
    background: transparent;
    padding: 0;
  }
  blockquote {
    border-left: 4px solid #2563eb;
    padding: 8px 16px;
    background: #f8fafc;
    color: #475569;
    margin-left: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: #f3f4f6;
    font-weight: 600;
  }
  mark {
    background: #fef08a;
    padding: 1px 4px;
    border-radius: 3px;
  }
  hr {
    border: none;
    border-top: 2px solid #e5e7eb;
    margin: 24px 0;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  .code-lang-badge {
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .code-with-lines .line-num {
    display: inline-block;
    width: 2.2em;
    color: #9ca3af;
    text-align: right;
    padding-right: 0.8em;
    margin-right: 0.8em;
    border-right: 1px solid #e5e7eb;
    user-select: none;
  }
`

/**
 * Exporta como documento HTML5 completo e autônomo (.html).
 */
export function exportAsHtml(filename: string, renderedHtml: string): void {
  const title = stripExtension(filename)
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)} — NexoMD</title>
  <style>${STANDALONE_DOC_STYLES}</style>
</head>
<body>
${renderedHtml}
</body>
</html>`
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
  triggerBlobDownload(blob, `${title}.html`)
}

/**
 * Exporta para PDF abrindo janela/iframe de impressão dedicada com folha de estilo @page limpa.
 */
export function exportAsPdf(filename: string, renderedHtml: string): void {
  const title = stripExtension(filename)
  const printHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <style>
    ${STANDALONE_DOC_STYLES}
    @page {
      size: A4;
      margin: 18mm 16mm;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
        max-width: none;
      }
      pre, blockquote, table, tr, img {
        page-break-inside: avoid;
      }
      h1, h2, h3, h4 {
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
${renderedHtml}
</body>
</html>`

  // Cria um iframe invisível para acionar a impressão/PDF nativa em qualquer ambiente (Tauri ou Browser)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (doc && iframe.contentWindow) {
    doc.open()
    doc.write(printHtml)
    doc.close()
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 2000)
    }, 250)
  } else {
    window.print()
  }
}

/**
 * Exporta para formato Word (.doc) compatível com Microsoft Word, LibreOffice e Google Docs.
 */
export function exportAsDoc(filename: string, renderedHtml: string): void {
  const title = stripExtension(filename)
  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>${STANDALONE_DOC_STYLES}</style>
</head>
<body>
${renderedHtml}
</body>
</html>`
  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword;charset=utf-8'
  })
  triggerBlobDownload(blob, `${title}.doc`)
}

/**
 * Exporta para Rich Text Format (.rtf) nativo com suporte a Unicode (\uN?), títulos, negrito, itálico, sublinhado, listas e código.
 */
export function exportAsRtf(filename: string, markdown: string): void {
  const title = stripExtension(filename)
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const encodeRtfText = (text: string): string => {
    let out = ''
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      const ch = text[i]
      if (ch === '\\' || ch === '{' || ch === '}') {
        out += `\\${ch}`
      } else if (code > 127) {
        const signed = code > 32767 ? code - 65536 : code
        out += `\\u${signed}?`
      } else {
        out += ch
      }
    }
    return out
  }

  const formatInlineRtf = (line: string): string => {
    // Escapa caracteres especiais RTF primeiro em blocos
    let s = encodeRtfText(line)
    // Negrito **texto**
    s = s.replace(/\*\*(.+?)\*\*/g, '{\\b $1}')
    // Itálico *texto*
    s = s.replace(/\*(.+?)\*/g, '{\\i $1}')
    // Tachado ~~texto~~
    s = s.replace(/~~(.+?)~~/g, '{\\strike $1}')
    // Realce ==texto== ou <mark>texto</mark>
    s = s.replace(/==(.+?)==/g, '{\\highlight2 $1}')
    s = s.replace(/<mark>(.+?)<\/mark>/gi, '{\\highlight2 $1}')
    // Sublinhado <u>texto</u>
    s = s.replace(/<u>(.+?)<\/u>/gi, '{\\ul $1}')
    // Sobrescrito ^texto^ ou <sup>texto</sup>
    s = s.replace(/\^(.+?)\^/g, '{\\super $1}')
    s = s.replace(/<sup>(.+?)<\/sup>/gi, '{\\super $1}')
    // Subscrito ~texto~ ou <sub>texto</sub>
    s = s.replace(/(^|[^~])~([^~]+?)~(?!~)/g, '$1{\\sub $2}')
    s = s.replace(/<sub>(.+?)<\/sub>/gi, '{\\sub $1}')
    // Código inline `codigo`
    s = s.replace(/`([^`]+)`/g, '{\\f1 $1}')
    // Links [texto](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ({\\ul\\cf1 $2})')
    return s
  }

  const bodyParts: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) {
      bodyParts.push(`\\pard\\sa60\\f1\\fs20 ${encodeRtfText(rawLine)}\\par`)
      continue
    }

    // Tabela Markdown GFM
    if (
      rawLine.trim().includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headers = parseRow(rawLine)
      const colCount = Math.max(1, headers.length)
      const colWidth = Math.floor(9000 / colCount)
      const cellDefs = Array.from(
        { length: colCount },
        (_, idx) => `\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx${(idx + 1) * colWidth}`
      ).join('')

      // Header row
      const headerCells = headers
        .map((h) => `\\pard\\intbl\\b ${formatInlineRtf(h)}\\b0\\cell`)
        .join('')
      bodyParts.push(`\\trowd\\trgaph108${cellDefs}${headerCells}\\row`)

      i += 2 // pula linha separadora
      while (i < lines.length && lines[i].trim().includes('|')) {
        const cells = parseRow(lines[i])
        const rowCells = Array.from({ length: colCount }, (_, cIdx) => {
          const val = cells[cIdx] || ''
          return `\\pard\\intbl ${formatInlineRtf(val)}\\cell`
        }).join('')
        bodyParts.push(`\\trowd\\trgaph108${cellDefs}${rowCells}\\row`)
        i++
      }
      i--
      bodyParts.push('\\pard\\sa100\\par')
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(rawLine.trim())
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes: Record<number, number> = { 1: 44, 2: 36, 3: 30, 4: 26, 5: 24, 6: 22 }
      const fs = sizes[level] || 24
      bodyParts.push(`\\pard\\sb240\\sa120\\b\\fs${fs} ${formatInlineRtf(headingMatch[2])}\\b0\\fs24\\par`)
      continue
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(rawLine.trim())) {
      bodyParts.push(`\\pard\\sa160\\brdrb\\brdrs\\brdrw15\\brsp20 \\par`)
      continue
    }

    if (rawLine.trim().startsWith('>')) {
      const quoteText = rawLine.replace(/^\s*>\s?/, '')
      bodyParts.push(`\\pard\\li360\\sa120\\i ${formatInlineRtf(quoteText)}\\i0\\par`)
      continue
    }

    const bulletMatch = /^\s*[-*+]\s+(.+)$/.exec(rawLine)
    if (bulletMatch) {
      bodyParts.push(`\\pard\\li360\\sa80 \\u8226? ${formatInlineRtf(bulletMatch[1])}\\par`)
      continue
    }

    const orderedMatch = /^\s*(\d+)\.\s+(.+)$/.exec(rawLine)
    if (orderedMatch) {
      bodyParts.push(`\\pard\\li360\\sa80 ${orderedMatch[1]}. ${formatInlineRtf(orderedMatch[2])}\\par`)
      continue
    }

    if (rawLine.trim().length === 0) {
      bodyParts.push(`\\pard\\sa100\\par`)
    } else {
      bodyParts.push(`\\pard\\sa140\\fs24 ${formatInlineRtf(rawLine)}\\par`)
    }
  }

  const rtf = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat',
    '{\\fonttbl{\\f0\\fnil\\fcharset0 Segoe UI;}{\\f1\\fmodern\\fcharset0 Consolas;}}',
    '{\\colortbl ;\\red37\\green99\\blue235;\\red254\\green240\\blue138;}',
    '\\viewkind4\\uc1\\pard\\f0\\fs24',
    ...bodyParts,
    '}'
  ].join('\r\n')

  const blob = new Blob([rtf], { type: 'application/rtf;charset=utf-8' })
  triggerBlobDownload(blob, `${title}.rtf`)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Converte formatação inline Markdown/HTML para elementos OpenXML `<w:r>` preservando estilos.
 */
function markdownInlineToWordRuns(line: string, extraRPr = '<w:sz w:val="22"/>'): string {
  // Normaliza links [texto](url) -> texto (url)
  const normalized = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  const tokenRegex =
    /(\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|==(.+?)==|<u>(.+?)<\/u>|<sup>(.+?)<\/sup>|\^([^^]+?)\^|<sub>(.+?)<\/sub>|~([^~]+?)~|`([^`]+)`|\*([^*]+?)\*)/gi

  let runs = ''
  let lastIdx = 0
  let m: RegExpExecArray | null

  while ((m = tokenRegex.exec(normalized)) !== null) {
    if (m.index > lastIdx) {
      const plain = normalized.slice(lastIdx, m.index)
      runs += `<w:r><w:rPr>${extraRPr}</w:rPr><w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`
    }

    if (m[2] !== undefined || m[3] !== undefined) {
      const txt = m[2] ?? m[3]
      runs += `<w:r><w:rPr>${extraRPr}<w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`
    } else if (m[4] !== undefined) {
      runs += `<w:r><w:rPr>${extraRPr}<w:strike/></w:rPr><w:t xml:space="preserve">${escapeXml(m[4])}</w:t></w:r>`
    } else if (m[5] !== undefined) {
      runs += `<w:r><w:rPr>${extraRPr}<w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">${escapeXml(m[5])}</w:t></w:r>`
    } else if (m[6] !== undefined) {
      runs += `<w:r><w:rPr>${extraRPr}<w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeXml(m[6])}</w:t></w:r>`
    } else if (m[7] !== undefined || m[8] !== undefined) {
      const txt = m[7] ?? m[8]
      runs += `<w:r><w:rPr>${extraRPr}<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`
    } else if (m[9] !== undefined || m[10] !== undefined) {
      const txt = m[9] ?? m[10]
      runs += `<w:r><w:rPr>${extraRPr}<w:vertAlign w:val="subscript"/></w:rPr><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`
    } else if (m[11] !== undefined) {
      runs += `<w:r><w:rPr>${extraRPr}<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${escapeXml(m[11])}</w:t></w:r>`
    } else if (m[12] !== undefined) {
      runs += `<w:r><w:rPr>${extraRPr}<w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(m[12])}</w:t></w:r>`
    }

    lastIdx = m.index + m[0].length
  }

  if (lastIdx < normalized.length || runs === '') {
    const tail = normalized.slice(lastIdx)
    runs += `<w:r><w:rPr>${extraRPr}</w:rPr><w:t xml:space="preserve">${escapeXml(tail)}</w:t></w:r>`
  }

  return runs
}

/**
 * Construtor leve de pacote ZIP (método STORE sem compressão + CRC32 IEEE) para geração nativa de arquivos .docx OpenXML.
 */
function createZipArchive(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder()
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crcTable[n] = c >>> 0
  }

  const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    }
    return (c ^ 0xffffffff) >>> 0
  }

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const dataBytes = encoder.encode(file.content)
    const crc = crc32(dataBytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // Local file header signature
    lv.setUint16(4, 20, true) // Version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 flag
    lv.setUint16(8, 0, true) // Compression 0 (STORE)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, dataBytes.length, true)
    lv.setUint32(22, dataBytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    localParts.push(localHeader, dataBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // Central directory file header signature
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, dataBytes.length, true)
    cv.setUint32(24, dataBytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    centralHeader.set(nameBytes, 46)

    centralParts.push(centralHeader)
    offset += localHeader.length + dataBytes.length
  }

  let centralSize = 0
  for (const c of centralParts) centralSize += c.length

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  return new Blob([...localParts, ...centralParts, eocd] as unknown as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

/**
 * Exporta para pacote OpenXML (.docx) nativo válido com suporte a tabelas `<w:tbl>`, títulos H1..H6, blocos de código e estilos inline.
 */
export function exportAsDocx(filename: string, markdown: string): void {
  const title = stripExtension(filename)
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const bodyElementsXml: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    if (/^\s*(```|~~~)/.test(trimmed)) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      bodyElementsXml.push(
        `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${escapeXml(rawLine)}</w:t></w:r></w:p>`
      )
      continue
    }

    // Tabela Markdown -> OpenXML <w:tbl>
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const parseCells = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headerCells = parseCells(rawLine)
      const colCount = Math.max(1, headerCells.length)
      const tableRowsXml: string[] = []

      const buildRowXml = (cells: string[], isHeader: boolean) => {
        const tcXml = Array.from({ length: colCount }, (_, idx) => {
          const cellText = cells[idx] || ''
          const shd = isHeader
            ? '<w:shd w:val="clear" w:color="auto" w:fill="EAECEF"/>'
            : ''
          const rPr = isHeader ? '<w:b/><w:sz w:val="20"/>' : '<w:sz w:val="20"/>'
          return `<w:tc><w:tcPr>${shd}</w:tcPr><w:p>${markdownInlineToWordRuns(cellText, rPr)}</w:p></w:tc>`
        }).join('')
        return `<w:tr>${tcXml}</w:tr>`
      }

      tableRowsXml.push(buildRowXml(headerCells, true))
      i += 2 // pula linha separadora
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableRowsXml.push(buildRowXml(parseCells(lines[i]), false))
        i++
      }
      i--

      bodyElementsXml.push(
        `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/></w:tblBorders></w:tblPr>${tableRowsXml.join('')}</w:tbl>`
      )
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const halfPts: Record<number, number> = { 1: 40, 2: 32, 3: 28, 4: 24, 5: 22, 6: 20 }
      const sz = halfPts[level] || 24
      bodyElementsXml.push(
        `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${markdownInlineToWordRuns(headingMatch[2], `<w:b/><w:sz w:val="${sz}"/>`)}</w:p>`
      )
      continue
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      bodyElementsXml.push(
        `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>`
      )
      continue
    }

    if (trimmed.startsWith('>')) {
      const quoteContent = rawLine.replace(/^\s*>\s?/, '')
      bodyElementsXml.push(
        `<w:p><w:pPr><w:ind w:left="480"/><w:spacing w:after="100"/></w:pPr>${markdownInlineToWordRuns(quoteContent, '<w:i/><w:sz w:val="22"/>')}</w:p>`
      )
      continue
    }

    bodyElementsXml.push(
      `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${markdownInlineToWordRuns(rawLine, '<w:sz w:val="22"/>')}</w:p>`
    )
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyElementsXml.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const blob = createZipArchive([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/document.xml', content: documentXml }
  ])
  triggerBlobDownload(blob, `${title}.docx`)
}

/**
 * Converte HTML (de arquivos importados .html ou edições no modo Visual WYSIWYG) para Markdown limpo.
 * Preserva blocos de código numerados (`.code-with-lines`), fórmulas KaTeX (`data-tex`) e GitHub Alerts.
 */
export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Remove tags de script/style
  doc.querySelectorAll('script, style, meta, link').forEach((el) => el.remove())

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    // Preserva blocos e spans matemáticos KaTeX com atributo data-tex
    if (el.classList.contains('katex-block') && el.getAttribute('data-tex')) {
      return `\n$$\n${el.getAttribute('data-tex')!.trim()}\n$$\n\n`
    }
    if (el.classList.contains('katex-inline') && el.getAttribute('data-tex')) {
      return `$${el.getAttribute('data-tex')!.trim()}$`
    }

    const childrenMd = Array.from(el.childNodes).map(walk).join('')

    switch (tag) {
      case 'h1':
        return `\n# ${childrenMd.trim()}\n\n`
      case 'h2':
        return `\n## ${childrenMd.trim()}\n\n`
      case 'h3':
        return `\n### ${childrenMd.trim()}\n\n`
      case 'h4':
        return `\n#### ${childrenMd.trim()}\n\n`
      case 'h5':
        return `\n##### ${childrenMd.trim()}\n\n`
      case 'h6':
        return `\n###### ${childrenMd.trim()}\n\n`
      case 'p':
        return `${childrenMd.trim()}\n\n`
      case 'br':
        return '\n'
      case 'hr':
        return '\n---\n\n'
      case 'strong':
      case 'b':
        return `**${childrenMd}**`
      case 'em':
      case 'i':
        return `*${childrenMd}*`
      case 'u':
      case 'ins':
        return `<u>${childrenMd}</u>`
      case 's':
      case 'strike':
      case 'del':
        return `~~${childrenMd}~~`
      case 'mark':
        return `==${childrenMd}==`
      case 'sup':
        return `^${childrenMd}^`
      case 'sub':
        return `~${childrenMd}~`
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return el.textContent || ''
        }
        return `\`${childrenMd}\``
      }
      case 'pre': {
        const badgeEl = el.querySelector('.code-lang-badge')
        const codeEl = el.querySelector('code')
        const langClass =
          el.getAttribute('data-lang') ||
          badgeEl?.textContent?.trim() ||
          codeEl?.className.match(/language-(\S+)/)?.[1] ||
          ''
        const lineTextNodes = el.querySelectorAll('.line-text')
        let rawCode = ''
        if (lineTextNodes.length > 0) {
          rawCode = Array.from(lineTextNodes)
            .map((n) => n.textContent || '')
            .join('\n')
        } else {
          rawCode = (codeEl ? codeEl.textContent : el.textContent) || ''
        }
        return `\n\`\`\`${langClass}\n${rawCode.replace(/\n$/, '')}\n\`\`\`\n\n`
      }
      case 'blockquote': {
        const alertTitleEl = el.querySelector(':scope > .alert-title')
        if (alertTitleEl) {
          const kind = alertTitleEl.textContent?.trim().toUpperCase() || 'NOTE'
          const clone = el.cloneNode(true) as HTMLElement
          clone.querySelector(':scope > .alert-title')?.remove()
          const bodyMd = Array.from(clone.childNodes).map(walk).join('').trim()
          const quotedLines = bodyMd
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
          return `\n> [!${kind}]\n${quotedLines}\n\n`
        }
        const quoted = childrenMd
          .trim()
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n')
        return `\n${quoted}\n\n`
      }
      case 'a': {
        const href = el.getAttribute('href') || ''
        const title = el.getAttribute('title')
        return title
          ? `[${childrenMd}](${href} "${title}")`
          : `[${childrenMd}](${href})`
      }
      case 'img': {
        const src = el.getAttribute('src') || ''
        const alt = el.getAttribute('alt') || ''
        const title = el.getAttribute('title')
        return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
      }
      case 'ul': {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === 'li')
          .map((li) => `- ${walk(li).trim()}`)
          .join('\n')
        return `\n${items}\n\n`
      }
      case 'ol': {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === 'li')
          .map((li, idx) => `${idx + 1}. ${walk(li).trim()}`)
          .join('\n')
        return `\n${items}\n\n`
      }
      case 'li':
        return childrenMd
      case 'table': {
        const rows = Array.from(el.querySelectorAll('tr'))
        if (rows.length === 0) return ''
        const matrix = rows.map((tr) => {
          const expandedCells: string[] = []
          for (const cell of Array.from(tr.querySelectorAll('th, td'))) {
            const text = walk(cell).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
            const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1)
            expandedCells.push(text)
            for (let c = 1; c < colspan; c++) expandedCells.push('')
          }
          return expandedCells
        })
        const colCount = Math.max(...matrix.map((r) => r.length), 1)
        const padRow = (r: string[]) =>
          Array.from({ length: colCount }, (_, i) => r[i] ?? '')
        const header = padRow(matrix[0] || [])
        const sep = Array(colCount).fill(':---')
        const bodyRows = matrix.slice(1).map(padRow)
        const lines = [
          `| ${header.join(' | ')} |`,
          `| ${sep.join(' | ')} |`,
          ...bodyRows.map((r) => `| ${r.join(' | ')} |`)
        ]
        return `\n${lines.join('\n')}\n\n`
      }
      default:
        return childrenMd
    }
  }

  return walk(doc.body)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
