{
  description = "FROG Robot Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable"; # Or a specific revision
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, rust-overlay, flake-utils }: flake-utils.lib.eachDefaultSystem (system:
    let
      # Define Rust toolchain version
      rust_version = "stable"; # Or "nightly", "1.xx.x"

      # Overlays provide Rust toolchain and targets
      overlays = [ (import rust-overlay) ];
      pkgs = import nixpkgs { inherit system overlays; };

      # Rust targets
      rust_targets = [
        "thumbv6m-none-eabi" # RP2040
        "aarch64-unknown-linux-gnu" # Jetson
        "wasm32-unknown-unknown" # WebAssembly
      ];

      # Build toolchain with targets
      rust_toolchain = pkgs.rust-bin.fromRustupToolchain {
        channel = rust_version;
        targets = rust_targets;
      };

    in {
      devShells.default = pkgs.mkShell {
        packages = [
          # Core build tools
          pkgs.bashInteractive
          pkgs.gnumake
          pkgs.git
          pkgs.pkg-config
          pkgs.cmake # Needed for building some python deps like nlopt
          pkgs.clang # Needed for C bindings (e.g., ocp-sys)
          pkgs.llvm  # Needed for C bindings

          # Rust toolchain
          rust_toolchain
          pkgs.cargo
          pkgs.rustfmt
          pkgs.clippy
          pkgs.cargo-leptos
          pkgs.wasm-bindgen-cli

          # RP2040 flashing
          pkgs.probe-rs

          # Cross-compilation linker (for thumbv6m)
          pkgs.gcc-arm-embedded

          # Cross-compilation linker (for aarch64) - Rely on toolchain

          # Python Environment Management
          pkgs.python311 # Specific Python version
          pkgs.uv        # UV installer/venv manager

          # Jetson runtime dependencies (keep from previous attempts, might be needed later)
          pkgs.libusb1
          # pkgs.libudev # Not available/needed on macOS, keep commented
          # pkgs.joystick # Not available/needed on macOS, keep commented
        ];

        # Remove macOS specific shellHook for openscad
        shellHook = ''
          # Add any other necessary env vars here later if needed
          echo "Entered FROG CAD (uv + Python) Dev Shell"
        '';
      };
    });
}