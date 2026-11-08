//! Validador de Segurança de Links e Caminhos Locais.
//!
//! Corrige a vulnerabilidade de alta severidade identificada na auditoria do MarkText:
//! Em `src/renderer/components/editorWithTabs/editor.vue` (linhas 695-720), o MarkText invoca
//! `shell.openPath(href)` diretamente em caminhos locais clicados no documento Markdown,
//! permitindo execução de `.exe`, `.bat`, `.cmd`, `.ps1`, `.vbs` ou `.lnk` arbitrários.
//!
//! O NexoMD valida estritamente esquemas de URL e bloqueia extensões executáveis ou de script.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Extensões locais estritamente proibidas de serem abertas via clique em link no editor.
const BLOCKED_EXTENSIONS: &[&str] = &[
    "exe", "bat", "cmd", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp", "com",
    "scr", "hta", "cpl", "msc", "jar", "reg", "lnk", "pif", "dll", "sys", "sh", "bash", "AppImage",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkValidationResult {
    pub allowed: bool,
    pub category: String,
    pub normalized_target: String,
    pub reason: Option<String>,
}

/// Valida um link clicado no documento antes de qualquer chamada ao sistema operacional.
pub fn validate_link_target(raw_href: &str) -> LinkValidationResult {
    let trimmed = raw_href.trim();
    if trimmed.is_empty() {
        return LinkValidationResult {
            allowed: false,
            category: "empty".to_string(),
            normalized_target: String::new(),
            reason: Some("Link vazio.".to_string()),
        };
    }

    // Links âncora internos (#secao)
    if trimmed.starts_with('#') {
        return LinkValidationResult {
            allowed: true,
            category: "anchor".to_string(),
            normalized_target: trimmed.to_string(),
            reason: None,
        };
    }

    let lower = trimmed.to_ascii_lowercase();

    // Bloqueia esquemas perigosos (javascript:, vbscript:, data:, file:// com executável)
    if lower.starts_with("javascript:")
        || lower.starts_with("vbscript:")
        || lower.starts_with("data:")
    {
        return LinkValidationResult {
            allowed: false,
            category: "blocked_scheme".to_string(),
            normalized_target: trimmed.to_string(),
            reason: Some("Esquema de URI potencialmente inseguro bloqueado pela política de segurança do NexoMD.".to_string()),
        };
    }

    // Links web seguros (https://, http://, mailto:)
    if lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:") {
        return LinkValidationResult {
            allowed: true,
            category: "external_url".to_string(),
            normalized_target: trimmed.to_string(),
            reason: None,
        };
    }

    // Caminho de arquivo local ou relativo: verifica se possui extensão executável bloqueada
    let clean_path = trimmed
        .strip_prefix("file:///")
        .or_else(|| trimmed.strip_prefix("file://"))
        .unwrap_or(trimmed);

    let path = Path::new(clean_path);
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_ascii_lowercase();
        if BLOCKED_EXTENSIONS.iter().any(|&b| b.eq_ignore_ascii_case(&ext_lower)) {
            return LinkValidationResult {
                allowed: false,
                category: "blocked_executable".to_string(),
                normalized_target: clean_path.to_string(),
                reason: Some(format!(
                    "Execução bloqueada: arquivos com extensão '.{}' não podem ser executados a partir de links Markdown.",
                    ext
                )),
            };
        }
    }

    LinkValidationResult {
        allowed: true,
        category: "local_document".to_string(),
        normalized_target: clean_path.to_string(),
        reason: None,
    }
}
