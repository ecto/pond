use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::fs;
use clap::Parser;
use walkdir::WalkDir;

// --- Configuration ---
const VENV_DIR: &str = ".venv";
const PYTHON_DEPS: &[&str] = &["pcbnew"]; // KiCad's Python API
const MODEL_DIR_REL: &str = "crates/pcb/models"; // Relative to workspace root
const TARGET_DIR_REL: &str = "target"; // Relative to workspace root
const PCB_OUT_SUBDIR: &str = "pcb";

/// Simple CLI tool to generate PCB designs using Python scripts with KiCad's pcbnew API
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
   // Add arguments here later if needed, e.g.:
   // /// Specific model file to generate
   // #[arg(short, long)]
   // model: Option<String>,
}

fn main() -> std::io::Result<()> {
    println!("--- PCB Generator CLI Started ---");

    // --- Get paths (relative to current dir, assumed workspace root) ---
    let workspace_root = env::current_dir()?;
    println!("Workspace root detected as: {}", workspace_root.display());

    let venv_path = workspace_root.join(VENV_DIR);
    let model_path = workspace_root.join(MODEL_DIR_REL);
    let pcb_out_dir = workspace_root.join(TARGET_DIR_REL).join(PCB_OUT_SUBDIR);

    // --- Ensure venv exists and dependencies are installed ---
    if !venv_path.exists() {
        println!("Virtual environment not found at {}, creating...", venv_path.display());
        create_venv(&venv_path);
        install_deps(&venv_path); // Install deps after creation
    } else {
        println!("Found existing virtual environment at {}", venv_path.display());
        // Note: pcbnew is part of KiCad installation, not pip-installable
        // We'll check for it during script execution
    }

    // --- Create output directories ---
    fs::create_dir_all(&pcb_out_dir).expect("Failed to create PCB output directory");

    // --- Find and execute Python model scripts ---
    let python_executable = venv_path.join("bin").join("python");
    println!("Using python executable: {}", python_executable.display());

    if !model_path.exists() || !model_path.is_dir() {
        eprintln!("Model source directory not found: {}", model_path.display());
        return Ok(()); // Exit cleanly if no models dir
    }

    println!("Looking for Python PCB models in: {}", model_path.display());
    let mut models_processed = 0;
    for entry in WalkDir::new(&model_path)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_str().unwrap_or("").starts_with('.'))  // Skip hidden files/dirs
        .filter_map(|e| e.ok())  // Handle errors gracefully
    {
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "py") {
            // Skip __init__.py files as they're not meant to be executed
            if path.file_name().unwrap_or_default() == "__init__.py" {
                continue;
            }

            // Skip base/utility files that aren't meant to be executed directly
            let filename = path.file_name().unwrap_or_default().to_str().unwrap_or("");
            if filename == "base.py" || filename.starts_with("common_") || filename.starts_with("pcb_") {
                continue;
            }

            models_processed += 1;

            // Create a hierarchical output name based on relative path
            let relative_path = path.strip_prefix(&model_path).unwrap();
            let output_name = relative_path.with_extension("").to_string_lossy().replace('/', "_");

            let script_path = path.canonicalize()?; // Use canonicalize for absolute path
            let kicad_pcb_path = pcb_out_dir.join(format!("{}.kicad_pcb", output_name));

            println!("Executing Python script: {}", script_path.display());
            println!("  Output KiCad PCB: {}", kicad_pcb_path.display());

            let models_dir_parent = model_path.parent().expect("Could not get parent of models dir"); // Get crates/pcb
            let status = Command::new(&python_executable)
                .arg(&script_path)
                .env("KICAD_PCB_OUTPUT_PATH", &kicad_pcb_path)
                .env("PYTHONPATH", models_dir_parent)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .status()
                .expect(&format!("Failed to execute Python script: {}", script_path.display()));

            if !status.success() {
                eprintln!(
                    "Error: Python script {} failed with exit code: {}",
                    script_path.display(),
                    status
                );
                // Decide whether to continue or exit
                // std::process::exit(1);
            } else {
                // Verify output files exist after success
                if !kicad_pcb_path.exists() {
                    println!("Warning: KiCad PCB file not found after script execution: {}", kicad_pcb_path.display());
                }
            }
            println!("Finished processing: {}", relative_path.display());
            println!("-----");
        }
    }

    if models_processed == 0 {
        println!("No Python PCB model scripts found in {}", model_path.display());
    }

    println!("--- PCB Generator CLI Finished ---");
    Ok(())
}


// Helper function to create venv using uv
fn create_venv(venv_path: &PathBuf) {
    println!("Running uv venv...");
    let status = Command::new("uv")
        .arg("venv")
        .arg(venv_path)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .expect("Failed to execute uv venv. Is uv in PATH (via Nix)?");
    if !status.success() {
        panic!("uv venv command failed with status: {}", status);
    }
}

// Helper function to install dependencies using uv
fn install_deps(venv_path: &PathBuf) {
    println!("Running uv pip install into {}", venv_path.display());
    let python_executable = venv_path.join("bin").join("python");
    if !python_executable.exists() {
        panic!("Python executable not found in venv: {}", python_executable.display());
    }

    // Note: pcbnew is part of KiCad and cannot be installed via pip
    // We'll document this requirement instead
    println!("Note: KiCad's pcbnew module must be available in your Python environment.");
    println!("Install KiCad 7+ to use this tool.");

    // Install any other dependencies here if needed
    if PYTHON_DEPS.is_empty() || PYTHON_DEPS[0] == "pcbnew" {
        println!("No pip dependencies to install (pcbnew comes with KiCad).");
        return;
    }

    let status = Command::new("uv")
        .arg("pip")
        .arg("install")
        .args(PYTHON_DEPS)
        .arg("--python")
        .arg(&python_executable)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .expect("Failed to execute uv pip install.");

    if !status.success() {
        panic!("uv pip install command failed with status: {}", status);
    }
    println!("uv pip install completed successfully.");
}

