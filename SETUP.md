# CriticalPath Team Setup

## 1. Project

CriticalPath is an open-source EDA/circuit simulation application inspired by tools such as LTspice.

Current architecture:

    Electron
        |
        +-- React + TypeScript UI
        |
        +-- React Flow schematic editor
        |
        +-- Circuit JSON
        |
        +-- Connectivity Engine
        |
        +-- SPICE Netlist Generator
        |
        +-- ngspice
        |
        +-- Simulation Result Parser
        |
        +-- Waveform Viewer
        |
        +-- Critical Path / Timing Engine
        |
        +-- AI Assistant

The long-term goal is a complete circuit design and simulation environment with:

- schematic editing
- SPICE simulation
- waveform visualization
- circuit analysis
- critical path analysis
- AI-assisted circuit analysis
- large component library
- project/file management

---

# 2. Technology Stack

Frontend:

- Electron
- React
- TypeScript
- React Flow

Simulation:

- ngspice

Analysis:

- Python
- NetworkX
- NumPy
- Pandas

Visualization:

- Plotly

AI:

- AI API/tool calling

Operating system for development:

- Ubuntu/Linux

---

# 3. Repository

GitHub repository:

https://github.com/sanINFj/criticalpath

Main development branch:

develop

---

# 4. Clone the Project

Install Git if necessary:

    sudo apt update
    sudo apt install -y git

Clone:

    git clone https://github.com/sanINFj/criticalpath.git

Enter project:

    cd criticalpath

---

# 5. Node.js Setup

Check Node:

    node --version

Check npm:

    npm --version

The project currently uses Node.js 22.

If using NVM:

    nvm use 22

Install dependencies:

    npm install

---

# 6. Run the Application

Start development mode:

    npm run dev

The Electron application should open.

If it does not open, do not randomly modify the project.

First check:

    npm run typecheck

Then:

    npm run build

Report the exact error before changing shared architecture.

---

# 7. Python Setup

Create a virtual environment:

    python3 -m venv .venv

Activate:

    source .venv/bin/activate

Upgrade pip:

    pip install --upgrade pip

Install project dependencies:

    pip install -r requirements.txt

Current Python dependencies include:

- networkx
- numpy
- pandas

Do NOT commit .venv.

---

# 8. ngspice Setup

Install ngspice:

    sudo apt update
    sudo apt install -y ngspice

Verify:

    ngspice --version

ngspice is an external simulation engine.

CriticalPath does NOT initially implement its own SPICE solver.

The first integration should use the ngspice executable.

---

# 9. Git Branches

Branches:

    develop

    feature/schematic
    feature/ngspice
    feature/critpath
    feature/ai

Do NOT directly modify another team's feature branch.

---

# 10. Git Workflow

Before starting work:

    git fetch origin

    git switch develop

    git pull --ff-only origin develop

Then switch to your assigned branch.

Example:

    git switch feature/ngspice

Update your branch from develop when necessary.

Before pushing:

    git status

    git add .

    git commit -m "Short description"

    git push origin feature/ngspice

---

# 11. Team Responsibilities

## Team 1 — Schematic + Connectivity

Branch:

    feature/schematic

Responsible for:

- React Flow schematic editor
- component placement
- component symbols
- component pins
- wire creation
- wire deletion
- wire routing
- junctions
- connectivity detection
- circuit/net representation

The most important output is a reliable connectivity model.

Example:

    V1.pin+
        |
        +------ R1.pin1
        |
        +------ C1.pin1

must become one electrical net.

Do NOT make the SPICE engine depend directly on React Flow nodes.

React Flow is the UI.

Circuit JSON is the application-level representation.

---

# 12. Team 2 — SPICE/ngspice

Branch:

    feature/ngspice

Responsible for:

- Circuit JSON → SPICE netlist
- netlist validation
- ngspice process execution
- simulation configuration
- simulation output parsing
- errors
- simulation result data model

Example Circuit JSON:

    {
      "components": [
        {
          "id": "V1",
          "type": "voltage-source",
          "value": "5"
        },
        {
          "id": "R1",
          "type": "resistor",
          "value": "1k"
        }
      ]
    }

should eventually become something similar to:

    V1 NET1 0 DC 5
    R1 NET1 NET2 1k

Then ngspice runs the simulation.

Do NOT build a new SPICE solver.

Use ngspice.

---

# 13. Team 3 — Critical Path

Branch:

    feature/critpath

Responsible for:

- circuit graph generation
- digital logic recognition
- gate delay representation
- timing propagation
- longest path calculation
- critical path extraction
- timing reports

Initial target:

    INPUT
       |
      AND
       |
      XOR
       |
      MUX
       |
    OUTPUT

Example:

    AND delay = 2 ns
    XOR delay = 3 ns
    MUX delay = 2 ns

Path delay:

    2 + 3 + 2 = 7 ns

The engine should return structured data such as:

    {
      "path": ["INPUT", "AND1", "XOR1", "MUX1", "OUTPUT"],
      "delay": 7
    }

The first version should be simple and deterministic.

---

# 14. Team 4 — AI Assistant

Branch:

    feature/ai

Responsible for:

- AI assistant architecture
- tool definitions
- circuit inspection
- simulation commands
- analysis commands
- critical path commands

Initial tools:

    get_circuit()

    get_netlist()

    run_simulation()

    get_simulation_results()

    get_node_voltage()

    find_critical_path()

The AI should NOT directly manipulate React Flow internals.

It should communicate with application-level tools.

Example:

    User:
    "What is the voltage at OUT?"

    AI:
    get_node_voltage("OUT")

The tool executes the operation.

The AI explains the result.

---

# 15. Shared Circuit Model

This is extremely important.

All teams must respect the shared circuit model.

File:

    src/shared/circuit.ts

Current model:

    Component
    Pin
    Connection
    SimulationConfig
    Circuit

The schematic UI produces the circuit.

The SPICE system consumes the circuit.

The critical path engine consumes the circuit.

The AI tools consume the circuit.

Therefore:

    React Flow
        |
        v
    Circuit JSON
        |
        +----> SPICE
        |
        +----> Critical Path
        |
        +----> AI
        |
        +----> Analysis

Do not create independent incompatible circuit representations.

---

# 16. Architecture Rule

React Flow is NOT the source of truth.

Circuit JSON is the source of truth.

React Flow should represent the circuit visually.

Example:

    React Flow Node
          |
          v
    Circuit Component

    React Flow Edge
          |
          v
    Circuit Connection

Eventually the application should be able to save:

    circuit.json

and reopen the project without relying on React Flow's internal state.

---

# 17. Current Development Priority

The immediate milestone is:

    SCHEMATIC
       |
       v
    CONNECTIVITY
       |
       v
    CIRCUIT JSON
       |
       v
    SPICE NETLIST
       |
       v
    NGSPICE
       |
       v
    SIMULATION RESULTS
       |
       v
    WAVEFORM

Only after this basic pipeline works should we significantly expand the UI.

---

# 18. First Simulation Target

The first end-to-end circuit should be:

    5V source
       |
      R1
       |
      C1
       |
      GND

Example:

    V1 = 5V
    R1 = 1k
    C1 = 1uF

Transient simulation:

    .tran 1u 10m

Expected behavior:

    V(C1)
       ^
    5V |                 ______
       |              ./
       |            ./
       |          ./
       |       ./
       |    ./
       | ./
     0 +------------------------> time

This is the first complete system test.

---

# 19. Definition of Done for the First Major Milestone

The project should eventually be able to:

1. Place V1.
2. Place R1.
3. Place C1.
4. Place GND.
5. Wire them together.
6. Generate Circuit JSON.
7. Convert Circuit JSON to SPICE netlist.
8. Run ngspice.
9. Parse simulation results.
10. Display V(out) in a waveform viewer.

If these ten steps work, CriticalPath has its first real end-to-end simulation pipeline.

---

# 20. Important Development Rules

DO:

- keep modules separated
- use TypeScript types
- write small functions
- add tests for core logic
- document interfaces
- commit frequently
- pull from develop regularly
- communicate breaking changes

DO NOT:

- rewrite another team's subsystem
- directly modify another team's branch
- hard-code React Flow state into simulation code
- create a second Circuit model
- build a SPICE solver from scratch
- add huge dependencies without discussion
- commit .venv
- commit node_modules
- use git reset --hard unless you know exactly what it will remove

---

# 21. Communication Between Teams

When changing a shared interface, communicate:

1. What changed
2. Why it changed
3. Which files changed
4. Whether other teams need to modify code

Example:

    [SPICE TEAM]

    Added SimulationResult interface.

    File:
    src/shared/simulation.ts

    Other teams can now consume:

    SimulationResult {
      time: number[]
      signals: Record<string, number[]>
    }

---

# 22. Testing Philosophy

Core engines should be testable without Electron.

For example:

    Circuit JSON
        |
        v
    Netlist Generator
        |
        v
    Expected SPICE

This should be testable from Node/Python without opening the UI.

Similarly:

    Circuit
        |
        v
    Critical Path Engine
        |
        v
    Expected Path

should be testable independently.

---

# 23. Long-Term Architecture

The intended architecture is:

    +-----------------------------+
    |       Electron App          |
    |                             |
    |  +-----------------------+  |
    |  | React UI              |  |
    |  |                       |  |
    |  | Schematic Editor      |  |
    |  | Waveform Viewer       |  |
    |  | Properties            |  |
    |  +-----------+-----------+  |
    |              |              |
    |              v              |
    |       Circuit JSON          |
    |              |              |
    +--------------+--------------+
                   |
        +----------+----------+
        |          |          |
        v          v          v
      SPICE     Analysis     AI
        |          |          |
        v          v          v
     ngspice   Critical     Tools
               Path
        |
        v
    Simulation Results
        |
        v
    Waveform Viewer

---

# 24. Current Philosophy

Functionality first.

The UI does not need to look perfect yet.

The priority is:

    1. Correct circuit representation
    2. Correct connectivity
    3. Correct simulation
    4. Correct analysis
    5. AI integration
    6. UI refinement

We can improve the visual design after the underlying engineering is reliable.
