//! Núcleo Backend Tauri v2 do NexoMD.
//! Expõe comandos IPC tipados e assíncronos para o Frontend Vue 3 + TypeScript.

pub mod dialog;
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
fn pick_and_open_document(state: State<'_, AppState>) -> Result<Option<DocumentView>, String> {
    let filters = [
        (
            "Documentos Markdown (*.md, *.markdown, *.txt)",
            "*.md;*.markdown;*.mdown;*.mkdn;*.txt",
        ),
        ("Páginas Web (*.html, *.htm)", "*.html;*.htm"),
        ("Todos os Arquivos (*.*)", "*.*"),
    ];

    if let Some(path) = dialog::pick_open_file("Abrir Arquivo — NexoMD", &filters) {
        let path_str = path.to_string_lossy().to_string();
        let view = state.doc_manager.open_from_disk(&path_str)?;
        Ok(Some(view))
    } else {
        Ok(None)
    }
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
    content: Option<String>,
) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    if let Some(c) = content {
        doc.update_text(&c);
    }

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

    let doc_content = doc.rope.to_string();
    let new_sha = write_file_atomic(path, &doc_content, &doc.line_ending, doc.has_bom)?;
    doc.saved_sha256 = new_sha;
    doc.saved_line_ending = doc.line_ending.clone();

    // Remove o snapshot de Crash Recovery após gravação atômica confirmada
    let _ = state.recovery_journal.remove_snapshot(&doc.id);

    Ok(doc.to_view())
}

#[tauri::command]
fn save_document_as_dialog(
    state: State<'_, AppState>,
    doc_id: String,
    default_filename: Option<String>,
    content: Option<String>,
) -> Result<Option<DocumentView>, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    if let Some(c) = content {
        doc.update_text(&c);
    }

    let def_name = default_filename.unwrap_or_else(|| doc.filename.clone());
    let def_name = if !def_name.to_lowercase().ends_with(".md") && !def_name.contains('.') {
        format!("{}.md", def_name)
    } else {
        def_name
    };

    let filters = [
        ("Documento Markdown (*.md)", "*.md"),
        ("Arquivo de Texto (*.txt)", "*.txt"),
        ("Todos os Arquivos (*.*)", "*.*"),
    ];

    if let Some(picked_path) =
        dialog::pick_save_file("Salvar Como — NexoMD", &def_name, "md", &filters)
    {
        let final_path = if picked_path.extension().is_none() {
            picked_path.with_extension("md")
        } else {
            picked_path
        };

        if let Some(parent) = final_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if let Some(name) = final_path.file_name().and_then(|n| n.to_str()) {
            doc.filename = name.to_string();
        }
        doc.path = Some(final_path.clone());

        let doc_content = doc.rope.to_string();
        let new_sha = write_file_atomic(
            &final_path,
            &doc_content,
            &doc.line_ending,
            doc.has_bom,
        )?;
        doc.saved_sha256 = new_sha;
        doc.saved_line_ending = doc.line_ending.clone();

        let _ = state.recovery_journal.remove_snapshot(&doc.id);
        Ok(Some(doc.to_view()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn export_file_native(
    default_filename: String,
    filter_name: String,
    filter_ext: String,
    content_bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let filter_pattern = format!("*.{}", filter_ext);
    let filters = [
        (filter_name.as_str(), filter_pattern.as_str()),
        ("Todos os Arquivos (*.*)", "*.*"),
    ];

    if let Some(picked_path) = dialog::pick_save_file(
        "Exportar Arquivo — NexoMD",
        &default_filename,
        &filter_ext,
        &filters,
    ) {
        let final_path = if picked_path.extension().is_none() && !filter_ext.is_empty() {
            picked_path.with_extension(&filter_ext)
        } else {
            picked_path
        };

        if let Some(parent) = final_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        std::fs::write(&final_path, &content_bytes).map_err(|e| {
            format!(
                "Falha ao gravar arquivo exportado em {:?}: {}",
                final_path, e
            )
        })?;

        Ok(Some(final_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
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
fn set_document_line_ending(
    state: State<'_, AppState>,
    doc_id: String,
    line_ending: String,
) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    doc.set_line_ending(&line_ending);
    Ok(doc.to_view())
}

#[tauri::command]
fn rename_document(
    state: State<'_, AppState>,
    doc_id: String,
    filename: String,
) -> Result<DocumentView, String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    let doc = docs
        .get_mut(&doc_id)
        .ok_or_else(|| format!("Documento '{}' não encontrado.", doc_id))?;

    doc.set_filename(&filename);
    Ok(doc.to_view())
}

#[tauri::command]
fn close_document(state: State<'_, AppState>, doc_id: String) -> Result<(), String> {
    let mut docs = state
        .doc_manager
        .docs
        .lock()
        .map_err(|_| "Falha ao adquirir lock de documentos".to_string())?;

    docs.remove(&doc_id);
    let _ = state.recovery_journal.remove_snapshot(&doc_id);
    Ok(())
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
            pick_and_open_document,
            update_document_text,
            undo_document,
            redo_document,
            save_document_atomic,
            save_document_as_dialog,
            export_file_native,
            set_document_line_ending,
            rename_document,
            close_document,
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
    fn test_line_endings_and_rename() {
        let mut doc = DocumentBuffer::new_from_str(
            "doc-2".to_string(),
            None,
            "Sem-Titulo-1.md".to_string(),
            "Linha 1\nLinha 2",
            "UTF-8".to_string(),
            "LF".to_string(),
            false,
        );
        assert!(!doc.to_view().is_dirty);
        doc.set_line_ending("CRLF");
        assert_eq!(doc.to_view().line_ending, "CRLF");
        assert!(doc.to_view().is_dirty);
        doc.set_line_ending("CR");
        assert_eq!(doc.to_view().line_ending, "CR");
        assert!(doc.to_view().is_dirty);
        doc.set_line_ending("LF");
        assert!(!doc.to_view().is_dirty);
        doc.set_filename("Novo-Arquivo.md");
        assert_eq!(doc.to_view().filename, "Novo-Arquivo.md");

        let (_, _, le_cr, _) = decode_bytes(b"abc\rdef");
        assert_eq!(le_cr, "CR");
        let (_, _, le_crlf, _) = decode_bytes(b"abc\r\ndef");
        assert_eq!(le_crlf, "CRLF");

        // Verifica escrita atômica com CRLF e CR
        let tmp_dir = std::env::temp_dir();
        let test_path = tmp_dir.join("nexomd_test_le.md");
        write_file_atomic(&test_path, "A\nB", "CRLF", false).unwrap();
        let bytes_crlf = std::fs::read(&test_path).unwrap();
        assert_eq!(bytes_crlf, b"A\r\nB");
        write_file_atomic(&test_path, "A\nB", "CR", false).unwrap();
        let bytes_cr = std::fs::read(&test_path).unwrap();
        assert_eq!(bytes_cr, b"A\rB");
        let _ = std::fs::remove_file(&test_path);
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

    #[test]
    fn test_document_manager_and_atomic_save() {
        let mgr = DocumentManager::default();
        let created = mgr
            .create_memory_doc("Documento-Teste.md", "# Conteudo Inicial\nTexto.")
            .expect("Falha ao criar documento em memoria");
        assert_eq!(created.filename, "Documento-Teste.md");
        assert!(created.path.is_none());

        let tmp_file = std::env::temp_dir().join(format!("nexomd_test_save_{}.md", uuid::Uuid::new_v4()));
        let sha = write_file_atomic(&tmp_file, &created.content, "LF", false)
            .expect("Falha ao gravar arquivo atomicamente");
        assert!(!sha.is_empty());

        // Reabre do disco e valida
        let opened = mgr
            .open_from_disk(&tmp_file.to_string_lossy())
            .expect("Falha ao abrir do disco");
        assert_eq!(opened.content, created.content);
        assert_eq!(opened.sha256, sha);

        // Atualizacao e sobrescrita atomica com arquivo existente
        let updated_content = "# Conteudo Atualizado\nMais texto.";
        let sha2 = write_file_atomic(&tmp_file, updated_content, "LF", false)
            .expect("Falha ao sobrescrever arquivo existente atomicamente");
        assert_ne!(sha, sha2);

        let re_opened = mgr
            .open_from_disk(&tmp_file.to_string_lossy())
            .expect("Falha ao reabrir do disco");
        assert_eq!(re_opened.content, updated_content);

        let _ = std::fs::remove_file(&tmp_file);
    }
}
