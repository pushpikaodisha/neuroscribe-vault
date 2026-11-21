/**
 * NeuroScribe Studio - Note Controller
 * Handles REST requests for note CRUD, backlinks, semantic recommendations, and export.
 */

import { markdownToHtml } from '../services/markdownParser.js';

export class NoteController {
  constructor(vaultDb) {
    this.vaultDb = vaultDb;
  }

  /**
   * Helper to send JSON response
   */
  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
  }

  /**
   * Helper to parse JSON request body
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
        if (body.length > 10 * 1024 * 1024) { // 10MB limit
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * GET /api/notes
   * Query params: ?tag=...&sort=...
   */
  async listNotes(req, res, query = {}) {
    try {
      const notes = this.vaultDb.getAllNotes({
        tag: query.tag,
        sort: query.sort
      });

      const responseList = notes.map(n => ({
        id: n.id,
        title: n.title,
        slug: n.slug,
        excerpt: n.excerpt,
        tags: n.tags,
        wordCount: n.word_count,
        created_at: n.created_at,
        updated_at: n.updated_at
      }));

      this.sendJson(res, 200, { success: true, count: responseList.length, notes: responseList });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * GET /api/notes/:slug
   */
  async getNote(req, res, slugOrId) {
    try {
      const note = this.vaultDb.getNote(slugOrId);
      if (!note) {
        return this.sendJson(res, 404, { success: false, error: 'Note not found' });
      }

      const html = markdownToHtml(note.content);
      const backlinks = this.vaultDb.getBacklinks(note.title);
      const forwardLinks = this.vaultDb.getForwardLinks(note.id);
      const recommendations = this.vaultDb.semanticIndex.getRecommendations(note.id, 5);

      this.sendJson(res, 200, {
        success: true,
        note: {
          id: note.id,
          title: note.title,
          slug: note.slug,
          filename: note.filename,
          frontmatter: note.frontmatter,
          content: note.content,
          html,
          wordCount: note.word_count,
          excerpt: note.excerpt,
          tags: note.tags,
          created_at: note.created_at,
          updated_at: note.updated_at,
          backlinks,
          forwardLinks,
          recommendations
        }
      });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * POST /api/notes
   */
  async createNote(req, res) {
    try {
      const body = await this.parseBody(req);
      if (!body.title || !body.title.trim()) {
        return this.sendJson(res, 400, { success: false, error: 'Title is required' });
      }

      const existing = this.vaultDb.getNote(body.title.trim());
      if (existing) {
        return this.sendJson(res, 409, { success: false, error: 'A note with this title already exists' });
      }

      const saved = await this.vaultDb.saveNote({
        title: body.title.trim(),
        content: body.content || '',
        frontmatter: body.frontmatter || {},
        tags: body.tags || []
      });

      this.sendJson(res, 201, { success: true, note: saved });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * PUT /api/notes/:slug
   */
  async updateNote(req, res, slugOrId) {
    try {
      const existing = this.vaultDb.getNote(slugOrId);
      if (!existing) {
        return this.sendJson(res, 404, { success: false, error: 'Note not found' });
      }

      const body = await this.parseBody(req);
      const newTitle = (body.title || existing.title).trim();

      const saved = await this.vaultDb.saveNote({
        title: newTitle,
        previousTitle: existing.title,
        content: body.content !== undefined ? body.content : existing.content,
        frontmatter: body.frontmatter || existing.frontmatter,
        tags: body.tags || existing.tags
      });

      this.sendJson(res, 200, { success: true, note: saved });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * DELETE /api/notes/:slug
   */
  async deleteNote(req, res, slugOrId) {
    try {
      const success = await this.vaultDb.deleteNote(slugOrId);
      if (!success) {
        return this.sendJson(res, 404, { success: false, error: 'Note not found' });
      }
      this.sendJson(res, 200, { success: true, message: 'Note deleted successfully' });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * GET /api/notes/:slug/backlinks
   */
  async getBacklinks(req, res, slugOrId) {
    try {
      const note = this.vaultDb.getNote(slugOrId);
      if (!note) {
        return this.sendJson(res, 404, { success: false, error: 'Note not found' });
      }
      const backlinks = this.vaultDb.getBacklinks(note.title);
      this.sendJson(res, 200, { success: true, noteId: note.id, backlinks });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * GET /api/notes/:slug/recommendations
   */
  async getRecommendations(req, res, slugOrId) {
    try {
      const note = this.vaultDb.getNote(slugOrId);
      if (!note) {
        return this.sendJson(res, 404, { success: false, error: 'Note not found' });
      }
      const recommendations = this.vaultDb.semanticIndex.getRecommendations(note.id, 6);
      this.sendJson(res, 200, { success: true, noteId: note.id, recommendations });
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }

  /**
   * GET /api/export
   */
  async exportVault(req, res) {
    try {
      const notes = this.vaultDb.getAllNotes();
      const exportBundle = {
        vaultName: 'NeuroScribe Knowledge Vault',
        exportedAt: new Date().toISOString(),
        stats: this.vaultDb.getVaultStats(),
        notes: notes.map(n => ({
          title: n.title,
          slug: n.slug,
          filename: n.filename,
          frontmatter: n.frontmatter,
          content: n.content,
          tags: n.tags,
          created_at: n.created_at,
          updated_at: n.updated_at
        }))
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="neuroscribe-vault-export.json"'
      });
      res.end(JSON.stringify(exportBundle, null, 2));
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    }
  }
}
