// The front page's 3D scene: a model core with the subsystems every production
// agent needs around it. Each subsystem is a real link to the post that covers it.
//
// Plain math, no three.js: the prerender uses project() to place every label where
// the first WebGL frame will draw its node, so the static HTML and the live scene
// agree and nothing jumps when the scene takes over.

export const CORE = { label: 'Model', to: '/blog/ai-agent-system-design' };

// Local positions (scene units) around the core. Searched, not hand-placed: at 720
// sampled yaw angles no label overlaps another label or another node, and at rest
// nothing covers the core or its Model pill (560px canvas, 11.5px mono labels).
export const NODES = [
  { label: 'Planner loop', to: '/blog/agent-harness-loop-engineering', p: [-1.5, 1.32, 0.96] },
  { label: 'Tools', to: '/blog/tool-use-function-calling', p: [1.51, 1.35, 0.23] },
  { label: 'Memory', to: '/blog/agent-memory-architecture', p: [-1.59, -0.82, -1.47] },
  { label: 'Retrieval', to: '/blog/rag-pipeline-deep-dive', p: [0.9, -1.8, 0.52] },
  { label: 'Context', to: '/blog/context-engineering', p: [-0.59, 1.37, -1.77] },
  { label: 'Evals', to: '/blog/evaluation-engineering', p: [1.92, -0.48, -0.48] },
  { label: 'Guardrails', to: '/blog/ai-guardrails', p: [0.25, -0.31, 1.96] },
];

// Subsystem-to-subsystem links, by index into NODES: the data paths that matter.
export const LINKS = [
  [0, 1], // planner calls tools
  [3, 4], // retrieval feeds context
  [2, 4], // memory feeds context
  [5, 6], // evals and guardrails share the judge
  [0, 2], // planner writes memory
];

// z leaves room around the outermost node for a centred label at any rotation.
export const CAMERA = { fov: 34, z: 9.6 };
export const TILT = 0.32; // resting tilt toward the reader (radians, about X)
export const SPIN0 = 0.35; // resting yaw at t = 0 (radians, about Y)

// Rotate a local point by the group's Euler XYZ rotation (three applies Rx * Ry * v)
// and project it into the square canvas. Returns percentages plus view depth.
export function project([x, y, z], rx = TILT, ry = SPIN0) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y2 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const depth = CAMERA.z - z2; // distance in front of the camera
  const f = 1 / Math.tan((CAMERA.fov * Math.PI) / 360);
  return {
    left: 50 + (x1 * f * 50) / depth, // aspect is 1:1, so x and y share f
    top: 50 - (y2 * f * 50) / depth,
    depth,
  };
}

// 1 = as near as a node gets, 0 = as far. Drives label fade and stacking.
const R = 2.6;
export const nearness = (depth) => Math.min(1, Math.max(0, (CAMERA.z + R - depth) / (2 * R)));
