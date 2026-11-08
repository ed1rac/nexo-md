//! Diário de Recuperação de Falhas (Crash Recovery / Hot Exit Journal).
//!
//! Soluciona a vulnerabilidade F-05 identificada na auditoria do MarkText:
//! O MarkText não possui qualquer mecanismo de Hot Exit ou Crash Recovery; se o processo
//! ou sistema operacional desligar abruptamente, todo texto não salvo é perdido.
//!
//! No NexoMD, cada buffer modificado (`isDirty`) é gravado periodicamente em um arquivo JSON
//! atômico dentro da pasta de recuperação da sessão, permitindo restauração imediata na abertura.

use crate::document::write_file_atomic;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Snapshot de recuperação de um documento não salvo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub doc_id: String,
    pub original_path: Option<String>,
    pub filename: String,
    pub content: String,
    pub saved_at_ms: u64,
}

/// Gerenciador do diretório de snapshots de recuperação.
pub struct RecoveryJournal {
    pub recovery_dir: PathBuf,
}

impl RecoveryJournal {
    pub fn new(base_dir: &Path) -> Self {
        let dir = base_dir.join("recovery_journal");
        let _ = fs::create_dir_all(&dir);
        Self { recovery_dir: dir }
    }

    fn snapshot_path(&self, doc_id: &str) -> PathBuf {
        let safe_id: String = doc_id
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        self.recovery_dir.join(format!("snapshot_{}.json", safe_id))
    }

    /// Salva atomicamente um snapshot de recuperação para um documento com edições pendentes.
    pub fn write_snapshot(
        &self,
        doc_id: &str,
        original_path: Option<String>,
        filename: String,
        content: String,
    ) -> Result<(), String> {
        let _ = fs::create_dir_all(&self.recovery_dir);
        let saved_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let snap = RecoverySnapshot {
            doc_id: doc_id.to_string(),
            original_path,
            filename,
            content,
            saved_at_ms,
        };

        let serialized = serde_json::to_string_pretty(&snap)
            .map_err(|e| format!("Erro ao serializar snapshot de recuperação: {}", e))?;

        let target = self.snapshot_path(doc_id);
        write_file_atomic(&target, &serialized, "LF", false).map(|_| ())
    }

    /// Remove o snapshot após salvamento confirmado pelo usuário.
    pub fn remove_snapshot(&self, doc_id: &str) -> Result<(), String> {
        let target = self.snapshot_path(doc_id);
        if target.exists() {
            fs::remove_file(&target)
                .map_err(|e| format!("Falha ao limpar snapshot {:?}: {}", target, e))?;
        }
        Ok(())
    }

    /// Lista todos os snapshots pendentes encontrados no disco ao iniciar a aplicação.
    pub fn list_snapshots(&self) -> Result<Vec<RecoverySnapshot>, String> {
        if !self.recovery_dir.exists() {
            return Ok(Vec::new());
        }
        let mut list = Vec::new();
        let entries = fs::read_dir(&self.recovery_dir)
            .map_err(|e| format!("Falha ao ler pasta de recuperação: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(snap) = serde_json::from_str::<RecoverySnapshot>(&raw) {
                        list.push(snap);
                    }
                }
            }
        }
        list.sort_by(|a, b| b.saved_at_ms.cmp(&a.saved_at_ms));
        Ok(list)
    }
}
