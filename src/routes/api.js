/**
 * NeuroScribe Studio - API Router
 * Dispatches HTTP API requests to note and graph controllers.
 */

import { NoteController } from '../controllers/noteController.js';
import { GraphController } from '../controllers/graphController.js';

export class ApiRouter {
  constructor(vaultDb) {
    this.vaultDb = vaultDb;
    this.noteController = new NoteController(vaultDb);
    this.graphController = new GraphController(vaultDb);
  }

  /**
   * Dispatches incoming HTTP requests
   * @param {Object} req - HTTP IncomingMessage
   * @param {Object} res - HTTP ServerResponse
   * @param {string} pathname - Parsed URL path
   * @param {URLSearchParams} searchParams - Query string params
   * @returns {boolean} True if route was handled
   */
  async handle(req, res, pathname, searchParams) {
    const method = req.method.toUpperCase();

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      });
      res.end();
      return true;
    }

    const query = Object.fromEntries(searchParams.entries());

    // 1. Vault Stats: GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      const stats = this.vaultDb.getVaultStats();
      this.sendJson(res, 200, { success: true, stats });
      return true;
    }

    // 2. Tags: GET /api/tags
    if (method === 'GET' && pathname === '/api/tags') {
      const tags = this.vaultDb.getAllTags();
      this.sendJson(res, 200, { success: true, count: tags.length, tags });
      return true;
    }

    // 3. Search: GET /api/search?q=...
    if (method === 'GET' && pathname === '/api/search') {
      const q = query.q || '';
      const results = this.vaultDb.semanticIndex.search(q, 20);
      this.sendJson(res, 200, { success: true, query: q, count: results.length, results });
      return true;
    }

    // 4. Export: GET /api/export
    if (method === 'GET' && pathname === '/api/export') {
      await this.noteController.exportVault(req, res);
      return true;
    }

    // 5. Full Graph: GET /api/graph
    if (method === 'GET' && pathname === '/api/graph') {
      await this.graphController.getFullGraph(req, res);
      return true;
    }

    // 6. Local Graph: GET /api/graph/local/:slug
    const localGraphMatch = pathname.match(/^\/api\/graph\/local\/([^\/]+)$/);
    if (method === 'GET' && localGraphMatch) {
      const slug = decodeURIComponent(localGraphMatch[1]);
      await this.graphController.getLocalGraph(req, res, slug, query);
      return true;
    }

    // 7. Notes collection: GET /api/notes, POST /api/notes
    if (pathname === '/api/notes') {
      if (method === 'GET') {
        await this.noteController.listNotes(req, res, query);
        return true;
      }
      if (method === 'POST') {
        await this.noteController.createNote(req, res);
        return true;
      }
    }

    // 8. Note Backlinks: GET /api/notes/:slug/backlinks
    const backlinksMatch = pathname.match(/^\/api\/notes\/([^\/]+)\/backlinks$/);
    if (method === 'GET' && backlinksMatch) {
      const slug = decodeURIComponent(backlinksMatch[1]);
      await this.noteController.getBacklinks(req, res, slug);
      return true;
    }

    // 9. Note Recommendations: GET /api/notes/:slug/recommendations
    const recsMatch = pathname.match(/^\/api\/notes\/([^\/]+)\/recommendations$/);
    if (method === 'GET' && recsMatch) {
      const slug = decodeURIComponent(recsMatch[1]);
      await this.noteController.getRecommendations(req, res, slug);
      return true;
    }

    // 10. Single Note CRUD: GET, PUT, DELETE /api/notes/:slug
    const singleNoteMatch = pathname.match(/^\/api\/notes\/([^\/]+)$/);
    if (singleNoteMatch) {
      const slug = decodeURIComponent(singleNoteMatch[1]);
      if (method === 'GET') {
        await this.noteController.getNote(req, res, slug);
        return true;
      }
      if (method === 'PUT') {
        await this.noteController.updateNote(req, res, slug);
        return true;
      }
      if (method === 'DELETE') {
        await this.noteController.deleteNote(req, res, slug);
        return true;
      }
    }

    return false;
  }

  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  }
}
