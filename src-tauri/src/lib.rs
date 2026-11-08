//! Núcleo Backend Tauri v2 do NexoMD.
//! Expõe comandos IPC tipados e assíncronos para o Frontend Vue 3 + TypeScript.

pub mod document;
pub mod recovery;
pub mod security;
pub mod workspace;

use document::{write_file_atomic, DocumentManager, DocumentView};
use recovery::{RecoveryJournal, RecoverySnapshot};
use security::{validate_link_target, LinkValidationResult};
use std::path::PathBuf;
use tauri::State;
use workspace::{scan_directory_metadata, search_workspace_files, SearchMatch, WorkspaceEntry};

pub struct AppState {
    pub doc_manager: DocumentManager,
    pub recovery_journal: RecoveryJournal,
}

#[tauri::command]
fn create_document(
    state: State<'_, AppState>,
    filename: String,
    initial_content: String,
) -> Result<DocumentView, String> {
    state.doc_manager.create_memory_doc(&filename, &initial_content)
}

#[tauri::command]
fn open_document(state: State<'_, AppState>, path: String) -> Result<DocumentView, String> {
    state.doc_manager.open_from_disk(&path)
}

#[tauri::command]
fn update_document_text(
    state: State<'_, AppState>,
    doc_id: String,
    content: String,
) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    doc.update_text(&content);
    let view = doc.to_view();

    // Se o documento estiver modificado (dirty), grava snapshot no Crash Recovery Journal
    if view.is_dirty {
        let _ = state.recovery_journal.write_snapshot(
            &view.id,
            view.path.clone(),
            view.filename.clone(),
            view.content.clone(),
        );
    } else {
        let _ = state.recovery_journal.remove_snapshot(&view.id);
    }

    Ok(view)
}

#[tauri::command]
fn undo_document(state: State<'_, AppState>, doc_id: String) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    doc.undo();
    Ok(doc.to_view())
}

#[tauri::command]
fn redo_document(state: State<'_, AppState>, doc_id: String) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    doc.redo();
    Ok(doc.to_view())
}

#[tauri::command]
fn save_document_atomic(
    state: State<'_, AppState>,
    doc_id: String,
    target_path: Option<String>,
) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    if let Some(new_path_str) = target_path {
        let new_path = PathBuf::from(&new_path_str);
        if let Some(name) = new_path.file_name().and_then(|n| n.to_str()) {
            doc.filename = name.to_string();
        }
        doc.path = Some(new_path);
    }

    let path = doc
        .path
        .as_ref()
        .ok_or_else(|| "Caminho de destino não especificado para salvar o documento.".to_string())?;

    let content = doc.rope.to_string();
    let new_sha = write_file_atomic(path, &content, &doc.line_ending, doc.has_bom)?;
    doc.saved_sha256 = new_sha;

    // Remove o snapshot de Crash Recovery após gravação atômica confirmada
    let _ = state.recovery_journal.remove_snapshot(&doc.id);

    Ok(doc.to_view())
}

#[tauri::command]
fn scan_workspace_metadata(
    root_dir: String,
    max_entries: Option<usize>,
) -> Result<Vec<WorkspaceEntry>, String> {
    scan_directory_metadata(&root_dir, max_entries.unwrap_or(5000))
}

#[tauri::command]
fn search_in_workspace(
    root_dir: String,
    query: String,
    case_sensitive: bool,
    max_results: Option<usize>,
) -> Result<Vec<SearchMatch>, String> {
    search_workspace_files(&root_dir, &query, case_sensitive, max_results.unwrap_or(250))
}

#[tauri::command]
fn list_recovery_snapshots(state: State<'_, AppState>) -> Result<Vec<RecoverySnapshot>, String> {
    state.recovery_journal.list_snapshots()
}

#[tauri::command]
fn clear_recovery_snapshot(state: State<'_, AppState>, doc_id: String) -> Result<(), String> {
    state.recovery_journal.remove_snapshot(&doc_id)
}

#[tauri::command]
fn validate_and_open_link(href: String) -> LinkValidationResult {
    validate_link_target(&href)
}

pub fn run() {
    let app_data_dir = std::env::temp_dir().join("nexo-md-data");
    let state = AppState {
        doc_manager: DocumentManager::default(),
        recovery_journal: RecoveryJournal::new(&app_data_dir),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            create_document,
            open_document,
            update_document_text,
            undo_document,
            redo_document,
            save_document_atomic,
            scan_workspace_metadata,
            search_in_workspace,
            list_recovery_snapshots,
            clear_recovery_snapshot,
            validate_and_open_link
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar a aplicação Tauri NexoMD");
}

#[cfg(test)]
mod tests {
    use super::document::*;
    use super::security::*;

    #[test]
    fn test_rope_o1_undo_redo_and_toc() {
        let mut doc = DocumentBuffer::new_from_str(
            "doc-1".to_string(),
            None,
            "teste.md".to_string(),
            "# Título Principal\n\nTexto inicial.",
            "UTF-8".to_string(),
            "LF".to_string(),
            false,
        );

        let view1 = doc.to_view();
        assert!(!view1.is_dirty);
        assert_eq!(view1.toc.len(), 1);
        assert_eq!(view1.toc[0].text, "Título Principal");

        doc.update_text("# Título Principal\n\n## Subtítulo\n\nTexto modificado.");
        let view2 = doc.to_view();
        assert!(view2.is_dirty);
        assert!(view2.can_undo);
        assert_eq!(view2.toc.len(), 2);

        assert!(doc.undo());
        let view3 = doc.to_view();
        assert!(!view3.is_dirty);
        assert!(view3.can_redo);
        assert_eq!(view3.toc.len(), 1);
    }

    #[test]
    fn test_security_link_validator_blocks_executables() {
        let bad_exe = validate_link_target("C:\\Windows\\System32\\calc.exe");
        assert!(!bad_exe.allowed);
        assert_eq!(bad_exe.category, "blocked_executable");

        let bad_script = validate_link_target("./scripts/deploy.ps1");
        assert!(!bad_script.allowed);

        let bad_scheme = validate_link_target("javascript:alert(1)");
        assert!(!bad_scheme.allowed);

        let good_web = validate_link_target("https://rust-lang.org");
        assert!(good_web.allowed);

        let good_md = validate_link_target("./docs/arquitetura.md");
        assert!(good_md.allowed);
    }
}
