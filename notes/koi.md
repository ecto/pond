**KOI Model Stack – Detailed Technical Specification**
_Kinematic Onboard Inference – release lineage `koi0`_
_Last updated: 2025-05-01_

---

### Executive Summary

`koi0` unifies a **Gemma-3 7 B INT4 planner (`koi0-think`)** and a **40 M-param INT8 reflex VLA (`koi0-act`)** to drive FROG v1 at 120 Hz entirely on a Jetson Orin NX 16 GB.
The planner inherits reasoning from a 27 B Gemma teacher via KL / τ distillation, while `koi0-act` is distilled from planner skill traces and quantised for < 1.5 ms latency.
All checkpoints and calibration artefacts are open-sourced to the Hugging Face Hub (Apache-2.0).

---

## 1 Model-family naming

| Checkpoint   | Purpose                   | File                     | HF repo slug      |
| ------------ | ------------------------- | ------------------------ | ----------------- |
| `koi0-teach` | 27 B Gemma teacher (fp16) | `koi0-teach.safetensors` | `pond/koi0-teach` |
| `koi0-think` | 7 B Gemma planner INT4    | `koi0-think.plan`        | `pond/koi0-think` |
| `koi0-act`   | 40 M VLA INT8 reflex      | `koi0-act.plan`          | `pond/koi0-act`   |

Version grammar: `<root><major>.<minor>-<phase>` → `koi1.2-think-int4`.

---

## 2 Target hardware

- **Jetson Orin NX 16 GB** — 1024 CUDA / 32 Tensor Cores, ≈ 100 INT8 TOPS.
- Ubuntu 22.04 + JetPack 6.
- Run `nvpmodel -m 2 && jetson_clocks` to unlock max perf.

---

## 3 Sensor suite & logging

### 3.1 Modalities

- **RGB-D camera** 224 × 224 @ 120 Hz
- **16-layer LiDAR** → 64 × 1024 **range-image** per frame
- **16 DoF proprio** (qpos, qvel) @ 120 Hz
- **Torque command** from tele-op

### 3.2 Unified JSONL record

```json
{
  "ts": 1683059123.456,
  "rgb": "rgb/042234.jpg",
  "lidar": "lidar/042234.npy",
  "qpos": [...],
  "qvel": [...],
  "goal": "place cup on table",
  "skill": "<reach>",
  "torque": [...]
}
```

⸻

4 Training pipeline

4.1 Environment

```bash
conda create -n koi_train python=3.11 cudatoolkit=12.3 -y
conda activate koi_train
pip install torch==2.3._ transformers==4.43._ trl==0.10.0 timm \
 datasets bitsandbytes==0.43 tensorboard accelerate
git clone https://github.com/google-gemma/gemma-training.git # QLoRA helpers
git clone https://github.com/NVIDIA/TensorRT-LLM.git # early-exit plugin
huggingface-cli login
```

_QLoRA lets a 24 GB card fine-tune Gemma (Google guide). _
_TensorRT-LLM v9 supplies INT4 export + early-exit. _

⸻

4.2 Stage A — Distil 27 B ➜ 7 B (KL / τ grid)

```bash
python gemma-training/kd_train.py \
 --teacher models/gemma27b --student models/gemma7b \
 --train_json data/teleop.jsonl \
 --epochs 1 \
 --tau_grid 1 2 4 \
 --kl_grid 0.05 0.1 \
 --output_dir ckpts/koi0-think-pre
```

_(KD grid per Kim et al. 2021). _

4.3 Stage B — Vision / skill alignment

```bash
python gemma-training/vision_finetune.py \
 --model ckpts/koi0-think-pre/best \
 --vision_encoder siglip \
 --epochs 3 \
 --output_dir ckpts/koi0-think-vl
```

Gemma-3 bundles SigLIP vision encoder.

4.4 Stage C — (Optional) SAC RL polish

500 k Isaac-Sim steps; reward = task success − energy.

4.5 Stage D — INT4 PTQ export

```bash
python TensorRT-LLM/tools/qlora_int4_export.py \
 --model ckpts/koi0-think-vl \
 --save koi0-think.plan
```

4.6 Stage E — Distil planner ➜ 40 M VLA

```bash
python gemma-training/vla_distill.py \
 --planner koi0-think.plan \
 --train_json data/teleop.jsonl \
 --epochs 2 \
 --student_config configs/vla_40m.yaml \
 --out_dir koi0-act-fp16
```

4.7 Stage F — INT8 QAT

```bash
python gemma-training/qat_int8_export.py \
 --model koi0-act-fp16 \
 --calib_json data/calib_1000.jsonl \
 --save koi0-act.plan
```

4.8 Stage G — Push to Hugging Face

````bash
for repo in koi0-teach koi0-think koi0-act; do
huggingface-cli repo create pond/$repo --type=model -y
done

huggingface-cli upload --repo_id pond/koi0-think koi0-think.plan \
 --path_in_repo koi0-think.plan \
 --commit-message "INT4 planner v0"

huggingface-cli upload --repo_id pond/koi0-act koi0-act.plan \
 --path_in_repo koi0-act.plan \
 --commit-message "INT8 reflex v0"

_Add a README.md model card (HF best practices). _

⸻

5 Embedded runtime (no ROS)

5.1 Filesystem

```bash
/opt/models/koi0-think.plan
/opt/models/koi0-act.plan
/usr/local/bin/robotd
````

5.2 Thread + CUDA-stream map

Thread Rate Engine CUDA stream Latency
sensor_thread 120 Hz — CPU —
reflex_thread 120 Hz koi0-act INT8 high-prio 1.3 ms
planner_thread ~0.5 Hz (event) koi0-think INT4 low-prio 90 ms

Early-exit in TensorRT-LLM ensures planner cannot block reflex.

5.3 Boot flow

```bash
systemd -> robotd.service
├─ load koi0-act on stream 0 (HIGH)
├─ load koi0-think on stream 1 (LOW)
├─ spawn sensor / reflex / planner threads
└─ start watchdog (fallback PID after 2 missed reflex ticks)
```

⸻

6 Performance

Engine GPU RAM Avg p99
koi0-act 0.2 GB 1.3 ms 1.5 ms
koi0-think 4.1 GB 90 ms 110 ms

Total < 6 GB, leaving > 10 GB head-room.

⸻

References

Gemma 3 release · Jetson NX datasheet · TensorRT-LLM early-exit · QLoRA Gemma guide · HF upload docs · LiDAR range-image format (KITTI) · KD temperature paper · SigLIP VL encoder · Reflexxes latency study · Jetson INT8 tuning guide · Model-card best practices

## 0.2 2025-05-25 — unified-engine update for `koi0` 🇰🇴

The `koi0` lineage now folds **planner** and **reflex** into _one_ distilled backbone to
simplify training & deployment while still meeting drastically different
latency budgets.

• **Single checkpoint** (Gemma-3B trunk + SigLiP vision encoder) → two export
targets using TensorRT-LLM early-exit:

| Engine     | Layers | Head        | Precision | File              |
| ---------- | ------ | ----------- | --------- | ----------------- |
| koi0-act   | 0-7    | policy head | INT8      | `koi0-act.plan`   |
| koi0-think | 0-31   | LM head     | INT4      | `koi0-think.plan` |

Early-exit keeps System-1 at ≤ 1.5 ms while System-2 enjoys full-depth
reasoning.

Run-time glue lives in `crates/koi`:

```rust
trait ChatModel   { async fn chat(&self, hist:&[ChatMessage]) -> Result<String>; }
trait PolicyModel { fn infer(&self, input:&[f32]) -> Result<Vec<f32>>; }
```

Back-ends (feature-gated):

- `http-chat` → OpenAI-compatible REST (default during dev)
- `trt-chat` → TensorRT runner over `koi*-think.plan`
- `trt-policy` → TensorRT runner over `koi*-act.plan`

System threads and CUDA streams (Jetson Orin NX):

| Thread         | Rate   | Engine          | Stream | Priority |
| -------------- | ------ | --------------- | ------ | -------- |
| sensor_thread  | 120 Hz | —               | CPU    | —        |
| reflex_thread  | 120 Hz | koi0-act INT8   | 0      | HIGH     |
| planner_thread | event  | koi0-think INT4 | 1      | LOW      |

No IPC: both engines are loaded in-process by `mind` via the `koi` crate.

---
