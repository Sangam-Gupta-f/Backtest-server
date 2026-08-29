import { NODE_TYPES } from './nodeTypes.js';

const DEFAULT_HANDLE = 'in';

const buildReachability = (adjacency, startId) => {
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop();
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
};

// Validates a drag-and-drop strategy graph ({ nodes, edges }, React-Flow-shaped)
// against the node-type contract in nodeTypes.js. Checks, in order:
//  1. structural integrity (ids, known types, per-node data)
//  2. edge port-type compatibility + single-writer-per-input-handle
//  3. the graph is a DAG (no cycles)
//  4. every entry node can reach at least one exit node
export const validateStrategy = (graph) => {
  const errors = [];
  const warnings = [];

  if (!graph || typeof graph !== 'object') {
    return { valid: false, errors: ['Strategy must be an object with "nodes" and "edges"'], warnings };
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  if (!nodes.length) errors.push('Strategy must contain at least one node');

  // --- nodes: ids, known types, per-type data -----------------------------
  const nodesById = new Map();
  for (const node of nodes) {
    if (!node?.id) {
      errors.push('Every node must have an "id"');
      continue;
    }
    if (nodesById.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
      continue;
    }
    if (!NODE_TYPES[node.type]) {
      errors.push(`Node ${node.id} has unknown type "${node.type}"`);
      continue;
    }
    nodesById.set(node.id, node);
  }

  for (const node of nodesById.values()) {
    const spec = NODE_TYPES[node.type];
    spec.validateData(node.data).forEach((message) => errors.push(`Node ${node.id} (${node.type}): ${message}`));
  }

  // --- edges: references, port-type compatibility, single writer ---------
  const adjacency = new Map([...nodesById.keys()].map((id) => [id, []]));
  const incomingByHandle = new Map([...nodesById.keys()].map((id) => [id, new Map()]));

  for (const edge of edges) {
    if (!edge?.id) {
      errors.push('Every edge must have an "id"');
      continue;
    }
    if (!nodesById.has(edge.source)) {
      errors.push(`Edge ${edge.id} references unknown source node "${edge.source}"`);
      continue;
    }
    if (!nodesById.has(edge.target)) {
      errors.push(`Edge ${edge.id} references unknown target node "${edge.target}"`);
      continue;
    }

    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourceSpec = NODE_TYPES[sourceNode.type];
    const targetSpec = NODE_TYPES[targetNode.type];
    const targetHandle = edge.targetHandle || DEFAULT_HANDLE;

    const expectedType = targetSpec.inputs[targetHandle];
    if (!expectedType) {
      errors.push(`Edge ${edge.id}: ${targetNode.type} (${targetNode.id}) has no input handle "${targetHandle}"`);
      continue;
    }
    if (sourceSpec.outputType !== expectedType) {
      errors.push(
        `Edge ${edge.id}: type mismatch — ${sourceNode.type} (${sourceNode.id}) outputs "${sourceSpec.outputType}" ` +
          `but ${targetNode.type} (${targetNode.id}).${targetHandle} expects "${expectedType}"`
      );
      continue;
    }

    const handleMap = incomingByHandle.get(edge.target);
    if (handleMap.has(targetHandle)) {
      errors.push(`Node ${edge.target}: input "${targetHandle}" already has an incoming edge (from ${handleMap.get(targetHandle)})`);
    } else {
      handleMap.set(targetHandle, edge.source);
    }

    adjacency.get(edge.source).push(edge.target);
  }

  // --- required inputs must be connected ----------------------------------
  for (const node of nodesById.values()) {
    const spec = NODE_TYPES[node.type];
    const handleMap = incomingByHandle.get(node.id);

    if (node.type === 'exit') {
      if (!handleMap.has('in') && !handleMap.has('trigger')) {
        errors.push(`Node ${node.id} (exit): must receive either "in" (position) or "trigger" (signal)`);
      }
      continue;
    }

    for (const handle of Object.keys(spec.inputs)) {
      // "not" is unary — it only ever reads handle "a", so "b" is intentionally optional.
      if (node.type === 'logic' && node.data?.operator === 'not' && handle === 'b') continue;
      if (!handleMap.has(handle)) {
        errors.push(`Node ${node.id} (${node.type}): input "${handle}" is not connected`);
      }
    }
  }

  // --- cycle detection (DFS, white/gray/black) ----------------------------
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodesById.keys()].map((id) => [id, WHITE]));
  const cycleNodes = new Set();

  const dfsCycle = (id, stack) => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adjacency.get(id) || []) {
      if (color.get(next) === GRAY) {
        const cycleStart = stack.indexOf(next);
        stack.slice(cycleStart).forEach((n) => cycleNodes.add(n));
      } else if (color.get(next) === WHITE) {
        dfsCycle(next, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of nodesById.keys()) {
    if (color.get(id) === WHITE) dfsCycle(id, []);
  }

  if (cycleNodes.size) {
    errors.push(`Strategy graph contains a cycle involving: ${[...cycleNodes].join(', ')}`);
  }

  // --- required node kinds + entry -> exit reachability -------------------
  const dataSourceNodes = [...nodesById.values()].filter((n) => n.type === 'dataSource');
  const entryNodes = [...nodesById.values()].filter((n) => n.type === 'entry');
  const exitNodes = [...nodesById.values()].filter((n) => n.type === 'exit');

  if (!dataSourceNodes.length) errors.push('Strategy must contain at least one dataSource node');
  if (!entryNodes.length) errors.push('Strategy must contain at least one entry node');
  if (!exitNodes.length) errors.push('Strategy must contain at least one exit node');

  // Skip reachability when there's a cycle — cycleNodes already explains the
  // structural problem and traversal order is meaningless until it's fixed.
  if (!cycleNodes.size) {
    for (const entry of entryNodes) {
      const seen = buildReachability(adjacency, entry.id);
      const hasExit = [...seen].some((id) => nodesById.get(id)?.type === 'exit');
      if (!hasExit) errors.push(`Entry node ${entry.id} has no path to any exit node`);
    }

    for (const exit of exitNodes) {
      const isReached = entryNodes.some((entry) => buildReachability(adjacency, entry.id).has(exit.id));
      if (!isReached) warnings.push(`Exit node ${exit.id} is not reachable from any entry node`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
};
