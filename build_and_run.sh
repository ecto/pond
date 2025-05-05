#!/bin/bash
set -e

# Create the target site directory structure
mkdir -p target/site/pkg

# Build the WASM client bundle
echo "Building WASM client bundle..."
cargo build --package web --lib --release --target wasm32-unknown-unknown --features=hydrate --no-default-features

# Process the WASM bundle with wasm-bindgen
echo "Processing WASM with wasm-bindgen..."
wasm-bindgen --target web --out-dir target/site/pkg --no-typescript target/wasm32-unknown-unknown/release/web.wasm

# Copy static assets to the target directory
echo "Copying static assets..."
cp -r public/* target/site/ 2>/dev/null || true

# Run the server
echo "Starting server..."
cargo run --package server --bin start_server --release