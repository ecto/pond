fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use a vendored `protoc` binary so users don't need it installed system-wide.
    let protoc_path = protoc_bin_vendored::protoc_bin_path()?;
    std::env::set_var("PROTOC", &protoc_path);
    std::env::set_var("PROTOC_INCLUDE", protoc_bin_vendored::include_path()?);
    tonic_build::configure()
        .compile(&["protos/bus.proto"], &["protos"])?;
    println!("cargo:rerun-if-changed=protos/bus.proto");
    Ok(())
}