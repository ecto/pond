use anyhow::Result;

pub trait PolicyModel: Send + Sync {
    /// Run inference; length of input/output is model-specific.
    fn infer(&self, input: &[f32]) -> Result<Vec<f32>>;
}

/// Dummy implementation that returns zeros – placeholder until real engine.
pub struct NullPolicy;

impl PolicyModel for NullPolicy {
    fn infer(&self, input: &[f32]) -> Result<Vec<f32>> {
        Ok(vec![0.0; input.len()])
    }
}

#[cfg(target_os = "linux")]
mod linux_trt {
    use super::PolicyModel;
    use anyhow::{Context, Result};
    use std::sync::Arc;
    use tensorrt_rs::{Logger, LoggerSeverity, Runtime, ICudaEngine, ExecutionContext};

    pub struct TrtPolicy {
        engine: Arc<ICudaEngine>,
        context: ExecutionContext<'static>,
        input_binding: i32,
        output_binding: i32,
    }

    impl TrtPolicy {
        pub fn load(path: &str) -> Result<Self> {
            let logger = Logger::new(LoggerSeverity::Warning);
            let runtime = Runtime::new(&logger)?;
            let bytes = std::fs::read(path).context("read TRT engine")?;
            let engine = runtime.deserialize_cuda_engine(&bytes)?;
            let context = engine.create_execution_context()?;
            let input_binding = engine.get_binding_index("input").unwrap_or(0) as i32;
            let output_binding = engine.get_binding_index("output").unwrap_or(1) as i32;
            Ok(Self { engine: Arc::new(engine), context, input_binding, output_binding })
        }
    }

    impl PolicyModel for TrtPolicy {
        fn infer(&self, _input: &[f32]) -> Result<Vec<f32>> { Ok(vec![0.0]) }
    }

    pub use TrtPolicy as NativePolicy;
}

#[cfg(target_os = "macos")]
mod macos_metal {
    use super::PolicyModel;
    use anyhow::Result;

    pub struct MetalPolicy;

    impl MetalPolicy {
        pub fn load(_path: &str) -> Result<Self> { Ok(Self) }
    }

    impl PolicyModel for MetalPolicy {
        fn infer(&self, input: &[f32]) -> Result<Vec<f32>> { Ok(vec![0.0; input.len()]) }
    }

    pub use MetalPolicy as NativePolicy;
}

#[cfg(target_os = "linux")]
pub use self::linux_trt::NativePolicy as DefaultPolicy;

#[cfg(target_os = "macos")]
pub use self::macos_metal::NativePolicy as DefaultPolicy;

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub use self::NullPolicy as DefaultPolicy;