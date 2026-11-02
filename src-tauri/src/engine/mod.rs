//! On-device inference engines. Both are prebuilt C++ executables (whisper.cpp /
//! llama.cpp) bundled under `<resources>/engines/` and launched as child processes.
//!
//! Cross-platform rules enforced here (keep them when adding code):
//! 1. Launch every engine through [`command`] — it hides the console window on
//!    Windows and pins the working directory.
//! 2. Pass *relative, ASCII-only* file arguments resolved against the app data dir.
//!    Windows user names are often Korean (C:\Users\홍길동\…); some C++ file APIs in
//!    the engines open paths with the ANSI code page and fail on those. The working
//!    directory itself is set through the wide-char Win32 API, so it is safe.
//! 3. Never assume `/` — build paths with `PathBuf::join`.

pub mod llama;
pub mod whisper;

use std::path::Path;
use std::process::Command;

/// A `Command` for an engine binary with platform quirks handled.
pub fn command(bin: &Path, cwd: &Path) -> Command {
    let mut c = Command::new(bin);
    c.current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// Path relative to `base`, with forward slashes (accepted by both OSes' C runtimes).
pub fn rel_arg(path: &Path, base: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(base)
        .map_err(|_| format!("{} is not inside {}", path.display(), base.display()))?;
    let s = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    if !s.is_ascii() {
        return Err(format!("engine argument must be ASCII: {s}"));
    }
    Ok(s)
}

/// Number of CPU threads to give an engine (leave one core for the UI).
pub fn threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().saturating_sub(1).max(1))
        .unwrap_or(4)
}
