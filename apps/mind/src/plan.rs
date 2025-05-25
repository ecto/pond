use std::collections::HashMap;
use std::time::{Duration, Instant};

use tokio::sync::broadcast::{Receiver, Sender};
use tokio::time::{sleep_until as tokio_sleep_until, Sleep, Instant as TokioInstant};

use crate::bus::Envelope;
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use koi::{ChatMessage, ChatModel, HttpChat};
use anyhow::Context;

// -----------------------------------------------------------------------------
// Data structures for tool commands emitted by the planner
// -----------------------------------------------------------------------------
#[derive(Deserialize)]
#[serde(tag = "cmd")]
enum Command {
    #[serde(rename = "publish")]
    Publish {
        topic: String,
        #[serde(default)]
        data_f32: Option<f32>,
        #[serde(default)]
        data_i64: Option<i64>,
        #[serde(default)]
        data_str: Option<String>,
    },
    #[serde(rename = "noop")]
    Noop,
}

// System prompt given to the LLM once at the beginning of the conversation.
const SYSTEM_PROMPT: &str = r#"
You are Pond-Mind, the high-level planner of a small robot.
You have ONE tool: publish(topic, data).
Constraints:
1. Always answer with a single JSON object, no extra text.
2. If you need the robot to act, set \"cmd\":\"publish\" and provide:
     • topic   – a string, e.g. "/actuator/fan"
     • ONE data field: data_f32 | data_i64 | data_str
3. If no action is needed, respond with {\"cmd\":\"noop\"}.
4. Never exceed the physical limits of actuators (fan speed ∈ [0,1]).
"#;

/// Spawns the Plan (slow, System-2) task backed by an LLM.
pub fn spawn_plan(tx: Sender<Envelope>, mut rx: Receiver<Envelope>) {
    tokio::spawn(async move {
        // Runtime parameters ----------------------------------------------------
        let tick = Duration::from_secs(5); // deliberative loop period
        let mut next_tick = Instant::now() + tick;

        // Chat backend ----------------------------------------------------------
        let chat_backend = match HttpChat::from_env() {
            Ok(b) => std::sync::Arc::new(b) as std::sync::Arc<dyn ChatModel>,
            Err(e) => {
                eprintln!("[plan] Failed to init HttpChat backend: {e}");
                return;
            }
        };

        // Conversation state ----------------------------------------------------
        let mut messages: Vec<ChatMessage> = vec![ChatMessage {
            role: "system".into(),
            content: JsonValue::String(SYSTEM_PROMPT.into()),
        }];

        // World state cache -----------------------------------------------------
        let mut sensors: HashMap<String, Vec<u8>> = HashMap::new();
        let mut current_goal: Option<String> = None;

        // Main loop -------------------------------------------------------------
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    if let Ok(env) = msg {
                        match env.topic.as_str() {
                            t if t.starts_with("/sensor/") => {
                                sensors.insert(env.topic.clone(), env.data.clone());
                            }
                            "/goal" => {
                                if let Ok(text) = String::from_utf8(env.data.clone()) {
                                    current_goal = Some(text);
                                }
                            }
                            _ => {}
                        }
                    }
                }

                _ = sleep_until(next_tick) => {
                    if let Err(e) = run_plan_step(chat_backend.as_ref(), &mut messages, &current_goal, &sensors, &tx).await {
                        eprintln!("[plan] {e}");
                    }
                    next_tick += tick;
                }
            }
        }
    });
}

fn sleep_until(deadline: Instant) -> Sleep {
    let tokio_deadline: TokioInstant = deadline.into();
    tokio_sleep_until(tokio_deadline)
}

async fn run_plan_step(
    chat: &dyn ChatModel,
    messages: &mut Vec<ChatMessage>,
    goal: &Option<String>,
    sensors: &HashMap<String, Vec<u8>>,
    tx: &Sender<Envelope>,
) -> anyhow::Result<()> {
    // Bail early if no goal yet
    let Some(goal_text) = goal else { return Ok(()); };

    // Example sensor extraction -------------------------------------------------
    let temp = sensors.get("/sensor/temp_sensor")
        .and_then(|b| b.as_slice().try_into().ok())
        .map(f32::from_le_bytes);

    let obs = json!({ "goal": goal_text, "temp": temp });
    messages.push(ChatMessage { role: "user".into(), content: JsonValue::String(obs.to_string()) });

    let asst_content = chat.chat(messages).await?;
    messages.push(ChatMessage { role: "assistant".into(), content: JsonValue::String(asst_content.clone()) });

    // Trim history
    if messages.len() > 40 { messages.drain(1..messages.len() - 40); }

    // Parse tool command -------------------------------------------------------
    let cmd: Command = serde_json::from_str(&asst_content).context("assistant replied with non-JSON content")?;

    if let Command::Publish { topic, data_f32, data_i64, data_str } = cmd {
        let data = if let Some(v) = data_f32 { v.to_le_bytes().to_vec() }
                   else if let Some(v) = data_i64 { v.to_le_bytes().to_vec() }
                   else if let Some(v) = data_str { v.into_bytes() }
                   else { vec![] };
        let _ = tx.send(Envelope { topic, data });
    }

    Ok(())
}