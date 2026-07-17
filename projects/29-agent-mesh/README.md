# P29 — Self-Healing Agent Mesh

A production-grade self-healing agent mesh that demonstrates distributed systems
patterns: health monitoring, automatic failover, work redistribution, circuit
breaking, and degraded-mode operation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Mesh (Orchestrator)                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ MeshRouter   │  │HealthMonitor │  │ CircuitBreakerRegistry│  │
│  │              │  │              │  │                       │  │
│  │ round-robin  │  │ heartbeat    │  │  Per-node breakers:   │  │
│  │ least-loaded │  │ detection    │  │  CLOSED → OPEN →      │  │
│  │ capability   │  │              │  │  HALF_OPEN → CLOSED   │  │
│  │ affinity     │  │ node_failed  │  │                       │  │
│  │              │  │ node_degraded│  │  Auto-recovery probe  │  │
│  └──────┬───────┘  │ node_recover │  └───────────────────────┘  │
│         │          └──────┬───────┘                              │
│         │                 │          ┌───────────────────────┐   │
│         │                 └─────────►│ WorkRedistributor     │   │
│         │                            │                       │   │
│         │                            │ Capability-aware      │   │
│         │                            │ Load-balanced          │   │
│         │                            │ Cascade-safe          │   │
│         │                            └───────────────────────┘   │
│         ▼                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │AgentNode │  │AgentNode │  │AgentNode │  │AgentNode │        │
│  │ [nlp]    │  │ [vision] │  │ [compute]│  │ [nlp]    │        │
│  │ healthy  │  │ failed   │  │ healthy  │  │ degraded │        │
│  │ q:2 e:0% │  │ q:0 e:80%│  │ q:5 e:1% │  │ q:48 e:3%│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Modules

| Module | File | Purpose |
|---|---|---|
| **AgentNode** | `src/agentNode.js` | Node with health tracking, capability declaration, work queue, load metrics |
| **MeshRouter** | `src/meshRouter.js` | Routes work via round-robin, least-loaded, capability-based, or affinity-sticky |
| **HealthMonitor** | `src/healthMonitor.js` | Detects failures from missed heartbeats, emits node lifecycle events |
| **WorkRedistributor** | `src/workRedistributor.js` | Reassigns failed-node work respecting capabilities and cascade limits |
| **CircuitBreaker** | `src/circuitBreaker.js` | Per-node closed/open/half_open breaker with auto-recovery probing |
| **Mesh** | `src/mesh.js` | Top-level orchestrator: registration, submission, monitoring, dashboard |

## File Structure

```
29-agent-mesh/
├── package.json
├── README.md
└── src/
    ├── agentNode.js
    ├── meshRouter.js
    ├── healthMonitor.js
    ├── workRedistributor.js
    ├── circuitBreaker.js
    ├── mesh.js
    ├── demo.js
    └── tests/
        └── mesh.test.js        (33 tests, 6 suites)
```

## Usage

```bash
# Run tests (33 tests, 6 suites)
node --test src/tests/mesh.test.js

# Run demo (5 scenarios)
node src/demo.js
```

## Key Patterns Demonstrated

1. **Health Monitoring** — Heartbeat-based failure detection with configurable thresholds
2. **Circuit Breaker** — Three-state (closed/open/half-open) per-node protection
3. **Work Redistribution** — Capability-aware reassignment with cascade protection
4. **Degraded Mode** — Mesh throttles rather than fails when majority of nodes are down
5. **Automatic Recovery** — Nodes re-enter the mesh after proving health via probes

## Demo Scenarios

1. **Normal Routing** — Work routed by capability and load across healthy nodes
2. **Node Failure + Redistribution** — Failing node's work retried on healthy nodes
3. **Cascading Failure + Degraded Mode** — 50% nodes down, mesh throttles gracefully
4. **Node Recovery** — Failed nodes rejoin the mesh, degraded mode exits
5. **Mesh Dashboard** — Real-time overview of node health, circuit breakers, metrics
