import { INDICATORS } from '../indicators/index.js';
import {
  buildDenseFromTimedSeries,
  buildDenseFromField,
  buildDenseConstant,
  evaluateCondition,
  evaluateLogic,
} from './denseSeries.js';

const topologicalOrder = (nodesById, edges) => {
  const inDegree = new Map([...nodesById.keys()].map((id) => [id, 0]));
  const adjacency = new Map([...nodesById.keys()].map((id) => [id, []]));

  for (const edge of edges) {
    adjacency.get(edge.source).push(edge);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue = [...nodesById.keys()].filter((id) => inDegree.get(id) === 0);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const edge of adjacency.get(id)) {
      inDegree.set(edge.target, inDegree.get(edge.target) - 1);
      if (inDegree.get(edge.target) === 0) queue.push(edge.target);
    }
  }

  return { order, adjacency };
};

const findIncoming = (edges, targetId, targetHandle) =>
  edges.find((edge) => edge.target === targetId && (edge.targetHandle || 'in') === targetHandle);

// Walks forward from an entry node through position-typed nodes only
// (positionSizing / riskRule), collecting every one it passes through until
// it reaches the exit that terminates this trade. validateStrategy's
// single-writer-per-input-handle rule means independent branches must still
// converge on one exit's "in" handle, so collecting every position-typed
// node reached this way is sufficient — no need to assume one linear chain.
const collectPositionChain = (entryId, nodesById, adjacency) => {
  const sizingNodes = [];
  const riskRuleNodes = [];
  const exitNodes = [];
  const seenEdges = new Set();
  const stack = [entryId];

  while (stack.length) {
    const currentId = stack.pop();
    for (const edge of adjacency.get(currentId) || []) {
      if (seenEdges.has(edge.id)) continue;
      seenEdges.add(edge.id);
      const targetNode = nodesById.get(edge.target);
      if (targetNode.type === 'positionSizing') sizingNodes.push(targetNode);
      else if (targetNode.type === 'riskRule') riskRuleNodes.push(targetNode);
      else if (targetNode.type === 'exit') exitNodes.push(targetNode);
      stack.push(edge.target);
    }
  }

  return { sizingNodes, riskRuleNodes, exitNodes };
};

// Compiles a validated strategy graph + a chronological candle array into
// trade plans the bar-replay engine (runBacktest.js) can execute directly,
// with every series/signal precomputed up front over the full history.
export const compileStrategy = (graph, candles) => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const { order, adjacency } = topologicalOrder(nodesById, graph.edges);

  const denseById = new Map();

  for (const nodeId of order) {
    const node = nodesById.get(nodeId);

    switch (node.type) {
      case 'dataSource':
        denseById.set(nodeId, candles);
        break;

      case 'priceSeries':
        denseById.set(nodeId, buildDenseFromField(candles, node.data.field));
        break;

      case 'constant':
        denseById.set(nodeId, buildDenseConstant(candles, node.data.value));
        break;

      case 'indicator': {
        const inEdge = findIncoming(graph.edges, nodeId, 'in');
        const inputCandles = denseById.get(inEdge.source);
        const indicatorFn = INDICATORS[node.data.indicator];
        const timedSeries = indicatorFn(inputCandles, node.data.params || {});
        const pick = node.data.output ? (point) => point[node.data.output] : (point) => point.value;
        denseById.set(nodeId, buildDenseFromTimedSeries(candles, timedSeries, pick));
        break;
      }

      case 'condition': {
        const leftEdge = findIncoming(graph.edges, nodeId, 'left');
        const rightEdge = findIncoming(graph.edges, nodeId, 'right');
        denseById.set(
          nodeId,
          evaluateCondition(node.data.operator, denseById.get(leftEdge.source), denseById.get(rightEdge.source))
        );
        break;
      }

      case 'logic': {
        const aEdge = findIncoming(graph.edges, nodeId, 'a');
        const bEdge = findIncoming(graph.edges, nodeId, 'b');
        const a = denseById.get(aEdge.source);
        const b = bEdge ? denseById.get(bEdge.source) : null;
        denseById.set(nodeId, evaluateLogic(node.data.operator, a, b));
        break;
      }

      // entry / positionSizing / riskRule / exit carry no per-bar series of
      // their own — they're configuration, resolved below per trade plan.
      default:
        break;
    }
  }

  const entryNodes = [...nodesById.values()].filter((node) => node.type === 'entry');

  const tradePlans = entryNodes.map((entryNode) => {
    const triggerEdge = findIncoming(graph.edges, entryNode.id, 'trigger');
    const entrySignal = denseById.get(triggerEdge.source);

    const { sizingNodes, riskRuleNodes, exitNodes } = collectPositionChain(entryNode.id, nodesById, adjacency);

    if (sizingNodes.length !== 1) {
      throw new Error(
        `Entry node ${entryNode.id} must reach exactly one positionSizing node (found ${sizingNodes.length})`
      );
    }
    if (exitNodes.length !== 1) {
      throw new Error(`Entry node ${entryNode.id} must reach exactly one exit node (found ${exitNodes.length})`);
    }

    const exitNode = exitNodes[0];
    const exitTriggerEdge = findIncoming(graph.edges, exitNode.id, 'trigger');
    const exitSignal = exitTriggerEdge ? denseById.get(exitTriggerEdge.source) : null;

    return {
      entryNodeId: entryNode.id,
      direction: entryNode.data.direction,
      orderType: entryNode.data.orderType || 'MARKET',
      producttype: entryNode.data.producttype || 'INTRADAY',
      entrySignal,
      sizing: sizingNodes[0].data,
      riskRules: riskRuleNodes.map((node) => node.data),
      exitSignal,
    };
  });

  return { tradePlans };
};
