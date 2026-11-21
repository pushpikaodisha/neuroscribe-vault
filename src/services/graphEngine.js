/**
 * NeuroScribe Studio - Graph Engine Service
 * Constructs knowledge graph networks, computes node degrees, PageRank centrality,
 * modularity clusters, and extracts ego-subgraphs for interactive visualization.
 */

const PALETTE = [
  { id: 'ai', color: '#6366f1', name: 'Artificial Intelligence & Cognition' },
  { id: 'neuro', color: '#10b981', name: 'Neuroscience & Biology' },
  { id: 'quantum', color: '#06b6d4', name: 'Quantum Physics & Information' },
  { id: 'complexity', color: '#f59e0b', name: 'Complexity & Systems' },
  { id: 'philosophy', color: '#ec4899', name: 'Philosophy & Consciousness' },
  { id: 'cybernetics', color: '#8b5cf6', name: 'Cybernetics & Information' },
  { id: 'general', color: '#64748b', name: 'General & Cross-Domain' }
];

/**
 * Builds the graph payload with metrics, centrality, and community clusters
 * @param {Array<Object>} notes - List of indexed notes
 * @param {Array<Object>} links - List of directional links
 * @returns {Object} Graph data structure { nodes, links, clusters, stats }
 */
export function buildGraphNetwork(notes = [], links = []) {
  const noteMap = new Map();
  notes.forEach(note => {
    noteMap.set(note.title.toLowerCase(), note);
    noteMap.set(note.slug, note);
  });

  const nodeStats = new Map();
  notes.forEach(note => {
    nodeStats.set(note.id, {
      id: note.id,
      title: note.title,
      slug: note.slug,
      tags: note.tags || [],
      wordCount: note.word_count || 0,
      excerpt: note.excerpt || '',
      inDegree: 0,
      outDegree: 0,
      degree: 0,
      inNeighbors: new Set(),
      outNeighbors: new Set(),
      allNeighbors: new Set()
    });
  });

  // Filter valid edges connecting known notes
  const validEdges = [];
  const edgeKeys = new Set();

  links.forEach(link => {
    const sourceNode = noteMap.get(link.source_id) || noteMap.get(link.source_title?.toLowerCase());
    const targetNode = noteMap.get(link.target_id) || noteMap.get(link.target_title?.toLowerCase());

    if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
      const edgeKey = `${sourceNode.id}->${targetNode.id}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        validEdges.push({
          source: sourceNode.id,
          target: targetNode.id,
          sourceTitle: sourceNode.title,
          targetTitle: targetNode.title,
          weight: 1
        });

        const srcStat = nodeStats.get(sourceNode.id);
        const tgtStat = nodeStats.get(targetNode.id);

        if (srcStat) {
          srcStat.outDegree += 1;
          srcStat.outNeighbors.add(targetNode.id);
          srcStat.allNeighbors.add(targetNode.id);
        }
        if (tgtStat) {
          tgtStat.inDegree += 1;
          tgtStat.inNeighbors.add(sourceNode.id);
          tgtStat.allNeighbors.add(sourceNode.id);
        }
      }
    }
  });

  // Calculate total degree for each node
  nodeStats.forEach(stat => {
    stat.degree = stat.inDegree + stat.outDegree;
  });

  // Compute PageRank centrality
  const pageRankScores = calculatePageRank(nodeStats, validEdges);

  // Community detection (Label Propagation / Tag-driven clustering)
  const clusterAssignments = detectClusters(nodeStats, validEdges);

  // Construct final node objects
  const finalNodes = notes.map(note => {
    const stat = nodeStats.get(note.id) || {
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      allNeighbors: new Set()
    };

    const clusterId = clusterAssignments.get(note.id) || 0;
    const clusterMeta = PALETTE[clusterId % PALETTE.length];
    const centrality = pageRankScores.get(note.id) || 0;

    return {
      id: note.id,
      title: note.title,
      slug: note.slug,
      tags: note.tags || [],
      wordCount: note.word_count || 0,
      excerpt: note.excerpt || '',
      degree: stat.degree,
      inDegree: stat.inDegree,
      outDegree: stat.outDegree,
      centrality: Number(centrality.toFixed(4)),
      cluster: clusterId,
      clusterName: clusterMeta.name,
      color: clusterMeta.color,
      neighborsCount: stat.allNeighbors ? stat.allNeighbors.size : 0
    };
  });

  // Compute graph-level statistics
  const totalNodes = finalNodes.length;
  const totalLinks = validEdges.length;
  const maxPossibleEdges = totalNodes > 1 ? totalNodes * (totalNodes - 1) : 1;
  const density = totalNodes > 1 ? Number((totalLinks / maxPossibleEdges).toFixed(4)) : 0;
  const isolatedNodes = finalNodes.filter(n => n.degree === 0).length;
  const avgDegree = totalNodes > 0 ? Number(((totalLinks * 2) / totalNodes).toFixed(2)) : 0;

  // Find top hub note
  const topHub = [...finalNodes].sort((a, b) => b.degree - a.degree)[0] || null;

  return {
    nodes: finalNodes,
    links: validEdges,
    clusters: PALETTE.map((p, idx) => ({
      id: idx,
      name: p.name,
      color: p.color,
      count: finalNodes.filter(n => n.cluster === idx).length
    })).filter(c => c.count > 0),
    stats: {
      totalNodes,
      totalLinks,
      density,
      isolatedNodes,
      avgDegree,
      topHub: topHub ? { title: topHub.title, degree: topHub.degree } : null
    }
  };
}

/**
 * Calculates PageRank centrality using power iteration
 * @param {Map} nodeStats
 * @param {Array} edges
 * @param {number} [dampingFactor=0.85]
 * @param {number} [maxIterations=30]
 * @returns {Map<string, number>}
 */
function calculatePageRank(nodeStats, edges, dampingFactor = 0.85, maxIterations = 30) {
  const nodeIds = Array.from(nodeStats.keys());
  const N = nodeIds.length;
  const rank = new Map();

  if (N === 0) return rank;

  const initialRank = 1 / N;
  nodeIds.forEach(id => rank.set(id, initialRank));

  // Build incoming links map: target -> array of sources
  const incomingMap = new Map();
  nodeIds.forEach(id => incomingMap.set(id, []));

  edges.forEach(e => {
    if (incomingMap.has(e.target)) {
      incomingMap.get(e.target).push(e.source);
    }
  });

  for (let iter = 0; iter < maxIterations; iter++) {
    let diff = 0;
    const newRank = new Map();

    // Calculate rank from dangling nodes (outDegree === 0)
    let danglingSum = 0;
    nodeIds.forEach(id => {
      const stat = nodeStats.get(id);
      if (!stat || stat.outDegree === 0) {
        danglingSum += rank.get(id);
      }
    });

    const baseRank = (1 - dampingFactor) / N + (dampingFactor * danglingSum) / N;

    for (const id of nodeIds) {
      let incomingRankSum = 0;
      const sources = incomingMap.get(id) || [];

      for (const srcId of sources) {
        const srcStat = nodeStats.get(srcId);
        const outDeg = srcStat && srcStat.outDegree > 0 ? srcStat.outDegree : 1;
        incomingRankSum += rank.get(srcId) / outDeg;
      }

      const calculated = baseRank + dampingFactor * incomingRankSum;
      newRank.set(id, calculated);
      diff += Math.abs(calculated - rank.get(id));
    }

    // Update ranks
    nodeIds.forEach(id => rank.set(id, newRank.get(id)));

    // Convergence check
    if (diff < 1e-5) break;
  }

  // Normalize scores to [0, 1] relative scale for visual sizing
  let maxScore = 0;
  rank.forEach(val => {
    if (val > maxScore) maxScore = val;
  });

  const normalized = new Map();
  rank.forEach((val, id) => {
    normalized.set(id, maxScore > 0 ? val / maxScore : 0.5);
  });

  return normalized;
}

/**
 * Community detection using Tag affinities and Label Propagation
 * @param {Map} nodeStats
 * @param {Array} edges
 * @returns {Map<string, number>}
 */
function detectClusters(nodeStats, edges) {
  const clusterAssignments = new Map();
  const nodeIds = Array.from(nodeStats.keys());

  // Priority mapping based on core themes
  const themeKeywords = [
    { idx: 0, match: ['ai', 'intelligence', 'neural', 'learning', 'machine-learning'] },
    { idx: 1, match: ['neuro', 'synapse', 'brain', 'biology', 'plasticity'] },
    { idx: 2, match: ['quantum', 'qubit', 'superposition', 'physics', 'decoherence'] },
    { idx: 3, match: ['complexity', 'chaos', 'emergence', 'systems', 'nonlinear'] },
    { idx: 4, match: ['philosophy', 'mind', 'consciousness', 'qualia', 'epistemology'] },
    { idx: 5, match: ['cybernetics', 'information', 'entropy', 'feedback'] }
  ];

  nodeIds.forEach(id => {
    const stat = nodeStats.get(id);
    const tags = stat?.tags || [];
    const titleLower = stat?.title.toLowerCase() || '';

    let assigned = -1;
    for (const theme of themeKeywords) {
      const hasTag = tags.some(t => theme.match.some(m => t.includes(m)));
      const hasTitle = theme.match.some(m => titleLower.includes(m));
      if (hasTag || hasTitle) {
        assigned = theme.idx;
        break;
      }
    }

    if (assigned === -1) {
      // General or fallback by modulo hash
      assigned = 6;
    }
    clusterAssignments.set(id, assigned);
  });

  // Refine via 2 passes of neighborhood consensus
  for (let pass = 0; pass < 2; pass++) {
    edges.forEach(e => {
      const srcCluster = clusterAssignments.get(e.source);
      const tgtCluster = clusterAssignments.get(e.target);
      if (srcCluster === 6 && tgtCluster !== 6) {
        clusterAssignments.set(e.source, tgtCluster);
      } else if (tgtCluster === 6 && srcCluster !== 6) {
        clusterAssignments.set(e.target, srcCluster);
      }
    });
  }

  return clusterAssignments;
}

/**
 * Extracts a local ego-graph around a target note (k-hop neighborhood)
 * @param {string} targetIdOrSlug - Identifier of target note
 * @param {Object} fullGraph - Complete graph network from buildGraphNetwork
 * @param {number} [hops=1] - Neighborhood radius
 * @returns {Object} Subgraph with target node highlighted
 */
export function extractEgoGraph(targetIdOrSlug, fullGraph, hops = 1) {
  const targetNode = fullGraph.nodes.find(
    n => n.id === targetIdOrSlug || n.slug === targetIdOrSlug || n.title.toLowerCase() === targetIdOrSlug.toLowerCase()
  );

  if (!targetNode) {
    return { nodes: [], links: [], targetId: null };
  }

  const selectedNodeIds = new Set([targetNode.id]);
  let currentLayer = new Set([targetNode.id]);

  for (let h = 0; h < hops; h++) {
    const nextLayer = new Set();
    fullGraph.links.forEach(l => {
      if (currentLayer.has(l.source) && !selectedNodeIds.has(l.target)) {
        selectedNodeIds.add(l.target);
        nextLayer.add(l.target);
      }
      if (currentLayer.has(l.target) && !selectedNodeIds.has(l.source)) {
        selectedNodeIds.add(l.source);
        nextLayer.add(l.source);
      }
    });
    currentLayer = nextLayer;
  }

  const subNodes = fullGraph.nodes
    .filter(n => selectedNodeIds.has(n.id))
    .map(n => ({
      ...n,
      isTarget: n.id === targetNode.id
    }));

  const subLinks = fullGraph.links.filter(
    l => selectedNodeIds.has(l.source) && selectedNodeIds.has(l.target)
  );

  return {
    targetId: targetNode.id,
    targetTitle: targetNode.title,
    nodes: subNodes,
    links: subLinks,
    hops
  };
}
