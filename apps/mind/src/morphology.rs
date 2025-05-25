use std::collections::HashSet;
use tokio::sync::broadcast::{Receiver, Sender};
use prost::Message;

use crate::bus::Envelope;

/// Topic where the current URDF description is published.
const URDF_TOPIC: &str = "/description/urdf";

/// Launch a background task that tracks connected devices and publishes an updated URDF
/// whenever the set changes.
///
/// Devices announce themselves by sending a `/device/announce` envelope containing the
/// `DeviceDescriptor` proto.  We generate a very simple URDF that contains a fixed head
/// link (always present) and attaches every announced device to the head via a fixed joint.
///
/// The generated URDF is *not* spatially accurate – it just gives higher-level software a
/// live self-image of what modules are present.
pub fn spawn_morphology(tx: Sender<Envelope>, mut rx: Receiver<Envelope>) {
    tokio::spawn(async move {
        let mut devices: HashSet<String> = HashSet::new();
        devices.insert("head".into()); // the mandatory core module

        // Emit initial URDF so that consumers have something immediately.
        publish_urdf(&tx, &devices);

        loop {
            match rx.recv().await {
                Ok(env) if env.topic == "/device/announce" => {
                    if let Ok(desc) = crate::bus::DeviceDescriptor::decode(&*env.data) {
                        if devices.insert(desc.id.clone()) {
                            publish_urdf(&tx, &devices);
                        }
                    }
                }
                Ok(_) => {}
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // skip
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

fn publish_urdf(tx: &Sender<Envelope>, devices: &HashSet<String>) {
    let urdf = build_urdf(devices);
    let _ = tx.send(Envelope {
        topic: URDF_TOPIC.into(),
        data: urdf.into_bytes(),
    });
}

fn build_urdf(devices: &HashSet<String>) -> String {
    let mut xml = String::new();
    xml.push_str("<robot name=\"frog\">\n");
    // Head link with visual mesh
    xml.push_str("  <link name=\"head\">\n");
    xml.push_str("    <visual>\n      <geometry>\n        <mesh filename=\"pkg://frog_description/meshes/head.obj\"/>\n      </geometry>\n    </visual>\n  </link>\n");
    xml.push_str("  <joint name=\"head_fixed\" type=\"fixed\">\n");
    xml.push_str("    <parent link=\"world\"/>\n");
    xml.push_str("    <child link=\"head\"/>\n");
    xml.push_str("  </joint>\n");

    for id in devices {
        if id == "head" { continue; }
        xml.push_str(&format!("  <link name=\"{}\"/>\n", id));
        xml.push_str(&format!("  <joint name=\"joint_{}\" type=\"fixed\">\n", id));
        xml.push_str("    <parent link=\"head\"/>\n");
        xml.push_str(&format!("    <child link=\"{}\"/>\n", id));
        xml.push_str("  </joint>\n");
    }
    xml.push_str("</robot>\n");
    xml
}