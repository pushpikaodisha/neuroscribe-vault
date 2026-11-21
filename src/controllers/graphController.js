/**
 * NeuroScribe Studio - Graph Controller
 * Serves processed knowledge graph data, PageRank metrics, and ego-subgraphs.
 */

import { buildGraphNetwork, extractEgoGraph } from '../services/graphEngine.js';

export class GraphController {
  constructor(vaultDb) {
    this.vaultDb = vaultDb;
  }

  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
  }

  /**
   * GET /api/graph
   * Returns complete knowledge graph payload with nodes, links, clusters, and statistics
   */
  async getFullGraph(req, res) {
    try {
      const raw = this.vaultDb.getRawGraphData();
      const network = buildGraphNetwork(raw.notes, raw.links);

      this.sendJson(res, 200, {
        success: true,
        ...network
      });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * GET /api/graph/local/:slug?hops=1
   * Returns ego-subgraph centered around target note
   */
  async getLocalGraph(req, res, slugOrId, query = {}) {
    try {
      const raw = this.vaultDb.getRawGraphData();
      const network = buildGraphNetwork(raw.notes, raw.links);
      const hops = Math.min(3, Math.max(1, parseInt(query.hops || '1', 10)));

      const ego = extractEgoGraph(slugOrId, network, hops);
      if (!ego.targetId) {
        return this.sendJson(res, 404, { success: false, error: 'Target note not found' });
      }

      this.sendJson(res, 200, {
        success: true,
        ...ego
      });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }
}
