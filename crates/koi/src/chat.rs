use anyhow::Context;
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: JsonValue,
}

#[async_trait]
pub trait ChatModel: Send + Sync {
    async fn chat(&self, history: &[ChatMessage]) -> anyhow::Result<String>;
}

/// Simple OpenAI-compatible HTTP backend.
///
/// Environment variables:
///   OPENAI_BASE_URL – defaults to https://api.openai.com
///   OPENAI_MODEL    – defaults to gpt-4o-mini
///   OPENAI_API_KEY  – optional bearer token
pub struct HttpChat {
    client: Client,
    api_url: String,
    model: String,
    api_key: Option<String>,
}

impl HttpChat {
    pub fn from_env() -> anyhow::Result<Self> {
        let client = Client::builder()
            .user_agent("koi-http-chat/0.1")
            .build()
            .context("failed to build reqwest client")?;

        let base_url = std::env::var("OPENAI_BASE_URL").unwrap_or_else(|_| "https://api.openai.com".into());
        let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into());
        let api_key = std::env::var("OPENAI_API_KEY").ok();
        let api_url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));

        Ok(Self { client, api_url, model, api_key })
    }
}

#[async_trait]
impl ChatModel for HttpChat {
    async fn chat(&self, history: &[ChatMessage]) -> anyhow::Result<String> {
        let body = json!({
            "model": self.model,
            "messages": history,
            "stream": false
        });

        let mut req = self.client.post(&self.api_url).json(&body);
        if let Some(key) = &self.api_key {
            req = req.bearer_auth(key);
        }

        let resp = req.send().await.context("chat request failed")?;
        let json: JsonValue = resp.json().await.context("invalid JSON response")?;
        let content = json["choices"][0]["message"]["content"].as_str()
            .context("unexpected JSON response structure")?;
        Ok(content.to_string())
    }
}