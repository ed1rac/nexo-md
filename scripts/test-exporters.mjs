import assert from 'node:assert'
import {
  generatePdfPrintHtml,
  generateDocHtml,
  generateRtfString,
  generateDocxUint8Array,
  normalizeLineEndings
} from '../src/engine/exporters.ts'

console.log('Testing Exporters...')

// 1. PDF HTML Generation
const pdfHtml = generatePdfPrintHtml('meu-doc.md', '<h1>Teste PDF</h1><p>Parágrafo de teste.</p>')
assert(pdfHtml.includes('<title></title>'), 'PDF title must be empty to avoid browser header')
assert(pdfHtml.includes('@page {\n      size: A4 portrait;\n      margin: 15mm;'), 'PDF must specify strict 15mm page margins')
assert(pdfHtml.includes('@top-left { content: none !important; }'), 'PDF must include strict content: none margin-box rules')
assert(pdfHtml.includes('Teste PDF'), 'PDF must contain rendered HTML')
console.log('✓ PDF Print HTML test passed.')

// 2. Word .doc HTML Generation
const docHtml = generateDocHtml('doc-word.md', '<h1>Título Word</h1>')
assert(docHtml.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'), 'DOC must contain Word XML namespace')
assert(docHtml.includes('Título Word'), 'DOC must contain content')
console.log('✓ DOC Word HTML test passed.')

// 3. RTF Generation
const rtf = generateRtfString('doc-rtf.md', '# Titulo RTF\n\nTexto com **negrito** e *italico* e acentuacao: Acao.')
assert(rtf.startsWith('{\\rtf1'), 'RTF must start with RTF header')
assert(rtf.includes('\\b\\fs44 Titulo RTF'), 'RTF must format headings with size and bold')
assert(rtf.includes('{\\b negrito}'), 'RTF must format bold')
assert(rtf.includes('{\\i italico}'), 'RTF must format italic')
assert(rtf.includes('\\u'), 'RTF must encode non-ascii characters with \\uN?')
console.log('✓ RTF test passed.')

// 4. DOCX OpenXML ZIP Generation
const docxBytes = generateDocxUint8Array('arquivo.docx', '# Documento Word Moderno\n\nParágrafo com texto.\n\n| Col 1 | Col 2 |\n| :--- | :--- |\n| A | B |\n')
assert(docxBytes instanceof Uint8Array, 'DOCX must produce Uint8Array')
assert(docxBytes.length > 500, 'DOCX must produce non-trivial size')
// Check PK ZIP magic header (0x50, 0x4B, 0x03, 0x04)
assert.strictEqual(docxBytes[0], 0x50, 'Byte 0 must be P')
assert.strictEqual(docxBytes[1], 0x4b, 'Byte 1 must be K')
assert.strictEqual(docxBytes[2], 0x03, 'Byte 2 must be 3')
assert.strictEqual(docxBytes[3], 0x04, 'Byte 3 must be 4')

// Test empty markdown DOCX generation
const emptyDocx = generateDocxUint8Array('empty.docx', '')
assert(emptyDocx instanceof Uint8Array, 'Empty DOCX must produce Uint8Array')
assert.strictEqual(emptyDocx[0], 0x50, 'Empty DOCX must start with PK')
console.log('✓ DOCX OpenXML test passed.')

// 5. Line endings
const crlf = normalizeLineEndings('A\nB\nC', 'CRLF')
assert.strictEqual(crlf, 'A\r\nB\r\nC', 'CRLF normalization')
const cr = normalizeLineEndings('A\r\nB\nC', 'CR')
assert.strictEqual(cr, 'A\rB\rC', 'CR normalization')
const lf = normalizeLineEndings('A\r\nB\rC', 'LF')
assert.strictEqual(lf, 'A\nB\nC', 'LF normalization')
console.log('✓ Line endings normalization test passed.')

console.log('All Exporters unit tests passed successfully!')
