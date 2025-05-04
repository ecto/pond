// Build script intentionally left empty.
// CAD generation is handled by the root Makefile.

use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::fs;

// Configuration
const VENV_DIR: &str = ".venv"; // Relative to workspace root
const BUILD123D_DEP: &str = "build123d"; // Target build123d

// Add other dependencies here if needed
const PYTHON_DEPS: &[&str] = &[
    BUILD123D_DEP,
];
const MODEL_DIR: &str = "crates/cad/models";
const STEP_OUT_SUBDIR: &str = "step";
const STL_OUT_SUBDIR: &str = "stl";

fn main() {
    println!("--- build.rs started ---");

    // --- Get paths ---
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace_root = manifest_dir.parent().and_then(|p| p.parent()).expect("Failed to get workspace root");
    let venv_path = workspace_root.join(VENV_DIR);
    let model_path = workspace_root.join(MODEL_DIR);
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let step_out_dir = out_dir.join(STEP_OUT_SUBDIR);
    let stl_out_dir = out_dir.join(STL_OUT_SUBDIR);

    println!("cargo:rerun-if-changed={}", model_path.display());

    // --- Ensure venv exists and dependencies are installed ---
    if !venv_path.exists() {
        println!("Virtual environment not found at {}, creating...", venv_path.display());
        create_venv(&venv_path);
    } else {
        println!("Found existing virtual environment at {}", venv_path.display());
    }
    // Always ensure dependencies are installed after venv exists
    install_deps(&venv_path);

    // --- Create output directories ---
    fs::create_dir_all(&step_out_dir).expect("Failed to create STEP output directory");
    fs::create_dir_all(&stl_out_dir).expect("Failed to create STL output directory");

    // --- Find and execute Python model scripts ---
    let python_executable = venv_path.join("bin").join("python");
    println!("Using python executable: {}", python_executable.display());

    for entry in fs::read_dir(&model_path).expect("Failed to read models directory") {
        let entry = entry.expect("Failed to read directory entry");
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "py") {
            let file_stem = path.file_stem().unwrap().to_str().unwrap();
            let script_path = path.canonicalize().unwrap();
            let step_file_path = step_out_dir.join(format!("{}.step", file_stem));
            let stl_file_path = stl_out_dir.join(format!("{}.stl", file_stem));

            println!("cargo:rerun-if-changed={}", script_path.display());
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
                .expect("Failed to execute Python script.");

            if !status.success() {
                panic!(
                    "Python script {} failed with exit code: {}",
                    script_path.display(),
                    status
                );
            }

            if !step_file_path.exists() {
                println!("Warning: STEP file not found after script execution: {}", step_file_path.display());
            }
            if !stl_file_path.exists() {
                println!("Warning: STL file not found after script execution: {}", stl_file_path.display());
            }
        }
    }
    println!("--- build.rs finished ---");
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