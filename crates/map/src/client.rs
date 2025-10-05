use crate::{BBox3, Layer, MapId, Tag, TileBlob, TileId, TileMeta};
use anyhow::Result;

#[derive(Clone)]
pub struct MapClient {
    base_url: String,
    http: reqwest::Client,
}

impl MapClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self { base_url: base_url.into(), http: reqwest::Client::new() }
    }

    pub async fn get_tile(&self, map: MapId, id: &TileId) -> Result<TileBlob> {
        let layer = match id.layer { Layer::Splats => "splats", Layer::Mesh => "mesh", Layer::Occ => "occ" };
        let url = format!(
            "{}/maps/{}/tiles/{}/{}/{}/{}?layer={}",
            self.base_url, map, id.lod, id.x, id.y, id.z, layer
        );
        let bytes = self.http.get(url).send().await?.bytes().await?;
        Ok(TileBlob { data: bytes.to_vec() })
    }

    pub async fn get_index(&self, map: MapId, bbox: &BBox3, lod: u8) -> Result<Vec<TileMeta>> {
        let url = format!("{}/maps/{}/index?lod={}", self.base_url, map, lod);
        let resp = self.http.post(url).json(bbox).send().await?;
        Ok(resp.json().await?)
    }

    pub async fn query_tags(&self, map: MapId, bbox: &BBox3) -> Result<Vec<Tag>> {
        let url = format!("{}/maps/{}/tags/query", self.base_url, map);
        let resp = self.http.post(url).json(bbox).send().await?;
        Ok(resp.json().await?)
    }

    pub async fn put_tag(&self, map: MapId, tag: &Tag) -> Result<()> {
        let url = format!("{}/maps/{}/tags", self.base_url, map);
        self.http.post(url).json(tag).send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn delete_tag(&self, map: MapId, id: uuid::Uuid) -> Result<()> {
        let url = format!("{}/maps/{}/tags/{}", self.base_url, map, id);
        self.http.delete(url).send().await?.error_for_status()?;
        Ok(())
    }
}


