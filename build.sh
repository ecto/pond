#!/bin/bash
set -e

# Build the WASM module
echo "Building WASM module..."
cargo build --target wasm32-unknown-unknown --release -p web

# Create the output directory
mkdir -p target/site/pkg

# Use wasm-bindgen to generate the JS bindings
echo "Generating JS bindings with wasm-bindgen..."
wasm-bindgen --target web --no-typescript --out-dir target/site/pkg target/wasm32-unknown-unknown/release/web.wasm

# Build the server
echo "Building server..."
cargo build --release -p server

echo "Done! Run the server with: cargo run --release -p server --bin start_server"