#![cfg(feature = "viz")]

use rerun::{archetypes::Mesh3D, datatypes::Vec3D, RecordingStream};

use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::Context;
use crate::bus_types::Envelope as BusEnvelope;
use tokio::sync::broadcast::Sender;

pub struct MeshStore {
    logged: HashSet<String>,
    tx: Sender<BusEnvelope>,
}

impl MeshStore {
    pub fn new(tx: Sender<BusEnvelope>) -> Self { Self { logged: HashSet::new(), tx } }

    pub fn ensure_logged(&mut self, uri: &str, rec: &RecordingStream) {
        if self.logged.contains(uri) { return; }
        let uri_owned = uri.to_owned();
        self.logged.insert(uri_owned.clone());
        let rec_clone = rec.clone();
        let path = resolve(&uri_owned);
        let tx_clone = self.tx.clone();
        std::thread::spawn(move || {
            if let Ok(mesh) = load_mesh(&path) {
                let _ = rec_clone.log(format!("asset/{}", uri_owned), &mesh);
                let _ = tx_clone.send(BusEnvelope{topic:"/log/sim".into(),data:format!("mesh_loaded {}", uri_owned).into_bytes()});
            } else {
                eprintln!("[sim] failed to load mesh {uri_owned}");
                let _ = tx_clone.send(BusEnvelope{topic:"/log/sim".into(),data:format!("mesh_load_fail {}", uri_owned).into_bytes()});
            }
        });
    }
}

pub fn resolve(uri: &str) -> PathBuf {
    // Very naive: strip pkg:// and map to ./assets/
    if let Some(rest) = uri.strip_prefix("pkg://") {
        PathBuf::from("assets/").join(rest)
    } else {
        PathBuf::from(uri)
    }
}

pub fn load_mesh(path: &PathBuf) -> anyhow::Result<Mesh3D> {
    // Load OBJ and duplicate vertices so each triangle has unique positions.
    let (models, _) = tobj::load_obj(path, &tobj::LoadOptions::default())
        .with_context(|| format!("load obj {path:?}"))?;

    let mut positions = Vec::new();
    let mut normals = Vec::new();
    for m in models {
        let mesh = &m.mesh;
        for idx in &mesh.indices {
            let i = *idx as usize;
            positions.push(Vec3D::from([
                mesh.positions[3 * i],
                mesh.positions[3 * i + 1],
                mesh.positions[3 * i + 2],
            ]));
            if !mesh.normals.is_empty() {
                normals.push(Vec3D::from([
                    mesh.normals[3 * i],
                    mesh.normals[3 * i + 1],
                    mesh.normals[3 * i + 2],
                ]));
            }
        }
    }

    let mut mesh3d = Mesh3D::new(positions);
    if normals.len() == mesh3d.num_vertices() {
        use rerun::components::Vector3D;
        mesh3d = mesh3d.with_vertex_normals(normals.into_iter().map(Vector3D::from));
    }
    Ok(mesh3d)
}