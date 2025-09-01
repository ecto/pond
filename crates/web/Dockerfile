# Build stage
FROM rust:1.75 as builder

# Install cargo-leptos
RUN cargo install cargo-leptos

# Install sass compiler for styles
RUN apt-get update && apt-get install -y dart-sass

# Set work directory
WORKDIR /app

# Copy cargo files
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src
COPY style ./style
COPY public ./public

# Build the Leptos app
RUN cargo leptos build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy the built application
COPY --from=builder /app/target/release/server ./
COPY --from=builder /app/target/site ./target/site

# Expose the port
EXPOSE 3000

# Run the server
CMD ["./server"]

