use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::fs;
use clap::Parser; // Use clap for potential future args

// --- Configuration ---
const VENV_DIR: &str = ".venv";
const BUILD123D_DEP: &str = "build123d";
const PYTHON_DEPS: &[&str] = &[BUILD123D_DEP];
const MODEL_DIR_REL: &str = "crates/cad/models"; // Relative to workspace root
const TARGET_DIR_REL: &str = "target"; // Relative to workspace root
const CAD_OUT_SUBDIR: &str = "cad";
const STEP_OUT_SUBDIR: &str = "step";
const STL_OUT_SUBDIR: &str = "stl";

/// Simple CLI tool to generate CAD models using Python scripts
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
   // Add arguments here later if needed, e.g.:
   // /// Specific model file to generate
   // #[arg(short, long)]
   // model: Option<String>,
}

fn main() -> std::io::Result<()> {
    println!("--- CAD Generator CLI Started ---");

    // --- Get paths (relative to current dir, assumed workspace root) ---
    let workspace_root = env::current_dir()?;
    println!("Workspace root detected as: {}", workspace_root.display());

    let venv_path = workspace_root.join(VENV_DIR);
    let model_path = workspace_root.join(MODEL_DIR_REL);
    let cad_out_dir = workspace_root.join(TARGET_DIR_REL).join(CAD_OUT_SUBDIR);
    let step_out_dir = cad_out_dir.join(STEP_OUT_SUBDIR);
    let stl_out_dir = cad_out_dir.join(STL_OUT_SUBDIR);

    // --- Ensure venv exists and dependencies are installed ---
    if !venv_path.exists() {
        println!("Virtual environment not found at {}, creating...", venv_path.display());
        create_venv(&venv_path);
        install_deps(&venv_path); // Install deps after creation
    } else {
        println!("Found existing virtual environment at {}", venv_path.display());
        // Optionally, force reinstall or check if deps need update
        // install_deps(&venv_path);
    }

    // --- Create output directories ---
    fs::create_dir_all(&step_out_dir).expect("Failed to create STEP output directory");
    fs::create_dir_all(&stl_out_dir).expect("Failed to create STL output directory");

    // --- Find and execute Python model scripts ---
    let python_executable = venv_path.join("bin").join("python");
    println!("Using python executable: {}", python_executable.display());

    if !model_path.exists() || !model_path.is_dir() {
        eprintln!("Model source directory not found: {}", model_path.display());
        return Ok(()); // Exit cleanly if no models dir
    }

    println!("Looking for Python models in: {}", model_path.display());
    let mut models_processed = 0;
    for entry in fs::read_dir(&model_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "py") {
            models_processed += 1;
            let file_stem = path.file_stem().unwrap().to_str().unwrap();
            let script_path = path.canonicalize()?; // Use canonicalize for absolute path
            let step_file_path = step_out_dir.join(format!("{}.step", file_stem));
            let stl_file_path = stl_out_dir.join(format!("{}.stl", file_stem));

            println!("Executing Python script: {}", script_path.display());
            println!("  Output STEP: {}", step_file_path.display());
            println!("  Output STL: {}", stl_file_path.display());

            let status = Command::new(&python_executable)
                .arg(&script_path)
                .env("STEP_OUTPUT_PATH", &step_file_path)
                .env("STL_OUTPUT_PATH", &stl_file_path)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .status()
                .expect(&format!("Failed to execute Python script: {}", script_path.display()));

            if !status.success() {
                eprintln!(
                    "Error: Python script {} failed with exit code: {}",
                    script_path.display(),
                    status
                ); // Use eprintln for errors
                // Decide whether to continue or exit
                // std::process::exit(1);
            } else {
                // Verify output files exist after success
                if !step_file_path.exists() {
                    println!("Warning: STEP file not found after script execution: {}", step_file_path.display());
                }
                if !stl_file_path.exists() {
                    println!("Warning: STL file not found after script execution: {}", stl_file_path.display());
                }
            }
            println!("Finished processing: {}", path.file_name().unwrap().to_str().unwrap());
            println!("-----");
        }
    }

    if models_processed == 0 {
        println!("No Python model scripts found in {}", model_path.display());
    }

    println!("--- CAD Generator CLI Finished ---");
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
        // If venv was just created, python might not be immediately visible?
        // Add a small delay or check differently? For now, panic if not found.
        panic!("Python executable not found in venv: {}", python_executable.display());
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