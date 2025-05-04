# POND

```ascii
   @..@
  (----) INITIATING...
 ( >__< )
 ^^ ~~ ^^
```

**Pedersen Open Neural Devices**

_Open Source Humanoids for Your Home_

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-username/pond/actions) <!-- Replace with actual build status URL -->
[![Discord](https://img.shields.io/discord/YOUR_DISCORD_ID?label=discord)](https://discord.gg/YOUR_INVITE_CODE) <!-- Replace with actual Discord info -->

---

Pedersen Open Neural Devices (POND) aims to open source and democratize household humanoid robotics. The goal of this project is to decentralize manufacturing capability, enabling you to build capable robots in your own basement for tasks like folding laundry and doing dishes, without the prohibitive cost typically associated with humanoid robotics.

## Why?

Household chores represent a significant portion of unpaid labor, disproportionately affecting certain demographics. Automating these tasks can free up countless hours, allowing people to pursue more creative, fulfilling, or economically productive activities. POND seeks to unburden humanity from drudgery, one household task at a time.

## Why Now?

We stand at a unique confluence of technological advancements:

- **Mature AI/ML:** Models capable of understanding complex commands and environments are becoming more accessible.
- **Affordable Hardware:** The cost of sensors, actuators, and compute powerful enough for robotics has decreased dramatically.
- **Advanced Simulation:** Tools for simulating complex robot dynamics and interactions are more powerful and available than ever.
- **Open Source Robotics:** Foundational software (like ROS) and hardware designs provide a starting point, even with plans to improve upon them.

This convergence makes ambitious projects like affordable, capable household humanoids feasible for the first time.

## Getting Started

Follow these steps to get the POND project compiled and running on your local machine.

### Prerequisites

- **Rust:** POND is built with Rust. If you don't have it installed, using [rustup](https://rustup.rs/) is recommended to manage your Rust installation.
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
  Follow the on-screen instructions. You might need to restart your terminal or run `source $HOME/.cargo/env` afterwards.
- **Nix:** Development environment dependencies (Python, CAD tooling, build tools) are managed using [Nix](https://nixos.org/download.html) with Flakes enabled. Follow the installation instructions for your OS. You may need to enable the `flakes` and `nix-command` experimental features.

### Installation & Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/pond.git # Replace with actual repo URL when available
    cd pond
    ```

2.  **Enter Development Environment:**
    Navigate to the cloned `pond/` directory and activate the Nix development shell:

    ```bash
    nix develop
    ```

    This will download and make available all necessary tools (Rust toolchain, Python, uv, etc.). You need to run subsequent commands _within this shell_.

3.  **Build the project:**
    While inside the Nix shell (`nix develop`), run:

    ```bash
    cargo build
    ```

    This will download dependencies and compile all crates in the workspace. The initial build might take some time.

4.  **Generate CAD Models:**
    The 3D models for robot components are defined in Python using `build123d`. To generate the exportable STEP and STL files (used for manufacturing or simulation), run the dedicated generator tool from the workspace root (still inside the `nix develop` shell):
    ```bash
    cargo run --bin generate-cad
    ```
    This command will automatically set up a Python virtual environment (`.venv/`) and install necessary dependencies (`build123d`) using `uv` if it doesn't exist. It then executes the Python scripts in `crates/cad/models/` to produce outputs in `target/cad/`.

### Running an Example

To verify the setup, you can run the included `hello_pond` example crate:

```bash
cargo run -p hello_pond
```

You should see the output `Hello, world!`.

## Technology

This repository is a Rust monorepo containing everything necessary for a clean-room rewrite of ROS2, designed to be lightweight and efficient.

## Roadmap

1.  **FROG (Friendly Robotic Open Generalist):** The first draft humanoid. It will feature a dual-arm torso mounted on a wheeled base, utilizing consumer parts readily available from retailers like Amazon.
2.  **TOAD (Tactile Open Autonomous Device):** A fully integrated humanoid requiring custom-milled aluminum and purpose-built batteries. Despite its advanced capabilities, TOAD is designed to be significantly more affordable than existing humanoids like the Unitree G1.

## Licensing & Governance

POND operates under a strict non-harm ethos.

This project utilizes a **dual-licensing** model designed to foster open-source collaboration while enabling sustainable commercial use.

### Option 1: Open Source License — AGPLv3

Unless a separate commercial license is obtained, all content in this monorepo (hardware CAD, firmware, software, UI code, etc.) is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

- **Strong Copyleft:** If you distribute modifications or products based on this project, or provide network access to modified versions, you must release the complete corresponding source code under AGPLv3.
- **Goal:** Ensures that the core technology and improvements remain perpetually open and accessible to the community.
- **SPDX Header:** Please use `SPDX-License-Identifier: AGPL-3.0-or-later` in every applicable file.

### Option 2: Commercial License

For entities wishing to incorporate POND technology into proprietary, closed-source products or services without being subject to the source-sharing requirements of AGPLv3, a separate **Commercial License** must be obtained from the Maintainers.

- **Contact:** Please reach out to the project Maintainers to discuss commercial licensing terms.
- **Goal:** Provides a path for commercial integration while supporting the ongoing development of the open-source project.

### "Love" Non‑Harm Clause

**Regardless of the license option chosen (AGPLv3 or Commercial), the following Non-Harm Clause applies universally and takes precedence.**

Inspired by Asimov's First Law & the Hippocratic ethos.

- **Supremacy:** This clause overrides all other license or rider provisions. Violation terminates all rights, and Maintainers reserve the right to pursue all available legal remedies.
- **Absolute Non‑Harm:** The Project, its derivatives, and any robots embodying it **shall not** be used or configured to cause physical, psychological, or economic harm to any sentient being. Prohibited uses include (but are not limited to) autonomous weapons, oppressive surveillance, intimidation, and harmful manipulation.
- **Inherent Protective Behaviour:** Robots must actively prioritize safety — yielding to humans/animals, limiting force, refusing harmful commands.
- **Universal Safe‑Mode:** A hardware E‑stop and software "Safe‑Mode" must disable actuation and sever network connectivity within ≤ 200 ms upon invocation.
- **Licence Termination & Enforcement:** Breaching this clause voids the applicable license (AGPLv3 or Commercial). Maintainers will seek injunctive relief, damages, and penalties to the fullest extent of the law.
