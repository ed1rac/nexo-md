//! Módulo de diálogos nativos do sistema de arquivos para Windows e fallback multiplataforma.

use std::path::PathBuf;

#[cfg(windows)]
mod win32 {
    use super::*;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct OPENFILENAMEW {
        lStructSize: u32,
        hwndOwner: *mut std::ffi::c_void,
        hInstance: *mut std::ffi::c_void,
        lpstrFilter: *const u16,
        lpstrCustomFilter: *mut u16,
        nMaxCustFilter: u32,
        nFilterIndex: u32,
        lpstrFile: *mut u16,
        nMaxFile: u32,
        lpstrFileTitle: *mut u16,
        nMaxFileTitle: u32,
        lpstrInitialDir: *const u16,
        lpstrTitle: *const u16,
        Flags: u32,
        nFileOffset: u16,
        nFileExtension: u16,
        lpstrDefExt: *const u16,
        lCustData: usize,
        lpfnHook: *mut std::ffi::c_void,
        lpTemplateName: *const u16,
        pvReserved: *mut std::ffi::c_void,
        dwReserved: u32,
        FlagsEx: u32,
    }

    #[link(name = "comdlg32")]
    extern "system" {
        fn GetOpenFileNameW(lpofn: *mut OPENFILENAMEW) -> i32;
        fn GetSaveFileNameW(lpofn: *mut OPENFILENAMEW) -> i32;
    }

    const OFN_EXPLORER: u32 = 0x00080000;
    const OFN_PATHMUSTEXIST: u32 = 0x00000800;
    const OFN_FILEMUSTEXIST: u32 = 0x00001000;
    const OFN_OVERWRITEPROMPT: u32 = 0x00000002;
    const OFN_NOCHANGEDIR: u32 = 0x00000008;

    fn build_filter_wide(filters: &[(&str, &str)]) -> Vec<u16> {
        let mut out = Vec::new();
        for (desc, pattern) in filters {
            out.extend(desc.encode_utf16());
            out.push(0);
            out.extend(pattern.encode_utf16());
            out.push(0);
        }
        out.push(0);
        out
    }

    fn to_wide_null(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn open_file(title: &str, filters: &[(&str, &str)]) -> Option<PathBuf> {
        let mut file_buf = vec![0u16; 1024];
        let filter_wide = build_filter_wide(filters);
        let title_wide = to_wide_null(title);

        let mut ofn: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        ofn.lpstrFilter = filter_wide.as_ptr();
        ofn.nFilterIndex = 1;
        ofn.lpstrFile = file_buf.as_mut_ptr();
        ofn.nMaxFile = file_buf.len() as u32;
        ofn.lpstrTitle = title_wide.as_ptr();
        ofn.Flags = OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;

        let ret = unsafe { GetOpenFileNameW(&mut ofn) };
        if ret != 0 {
            let len = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
            let path_str = String::from_utf16_lossy(&file_buf[..len]);
            Some(PathBuf::from(path_str))
        } else {
            None
        }
    }

    pub fn save_file(
        title: &str,
        default_name: &str,
        default_ext: &str,
        filters: &[(&str, &str)],
    ) -> Option<PathBuf> {
        let mut file_buf = vec![0u16; 1024];
        let def_wide: Vec<u16> = default_name.encode_utf16().collect();
        for (i, &c) in def_wide.iter().enumerate().take(1023) {
            file_buf[i] = c;
        }

        let filter_wide = build_filter_wide(filters);
        let title_wide = to_wide_null(title);
        let ext_wide = to_wide_null(default_ext);

        let mut ofn: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        ofn.lpstrFilter = filter_wide.as_ptr();
        ofn.nFilterIndex = 1;
        ofn.lpstrFile = file_buf.as_mut_ptr();
        ofn.nMaxFile = file_buf.len() as u32;
        ofn.lpstrTitle = title_wide.as_ptr();
        ofn.lpstrDefExt = ext_wide.as_ptr();
        ofn.Flags = OFN_EXPLORER | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;

        let ret = unsafe { GetSaveFileNameW(&mut ofn) };
        if ret != 0 {
            let len = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
            let path_str = String::from_utf16_lossy(&file_buf[..len]);
            Some(PathBuf::from(path_str))
        } else {
            None
        }
    }
}

pub fn pick_open_file(title: &str, filters: &[(&str, &str)]) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        win32::open_file(title, filters)
    }
    #[cfg(not(windows))]
    {
        let _ = (title, filters);
        None
    }
}

pub fn pick_save_file(
    title: &str,
    default_name: &str,
    default_ext: &str,
    filters: &[(&str, &str)],
) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        win32::save_file(title, default_name, default_ext, filters)
    }
    #[cfg(not(windows))]
    {
        let _ = (title, default_name, default_ext, filters);
        None
    }
}
