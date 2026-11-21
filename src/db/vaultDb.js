/**
 * NeuroScribe Studio - Vault Database & Synchronizer
 * Manages SQLite persistence with DatabaseSync / native fallback, file system sync,
 * backlinks resolution, and semantic search indexing.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFrontmatter, extractWikiLinks, extractTags, slugify, extractExcerpt } from '../services/markdownParser.js';
import { SemanticIndex } from '../services/semanticSearch.js';

export class VaultDb {
  constructor(vaultDir, dbPath) {
    this.vaultDir = vaultDir;
    this.dbPath = dbPath;
    this.semanticIndex = new SemanticIndex();
    this.sqliteDb = null;
    this.useSqlite = false;

    // Memory cache for sub-millisecond retrieval and fallback
    this.memoryStore = {
      notes: new Map(), // id -> note
      slugMap: new Map(), // slug -> id
      titleMap: new Map(), // lowercase title -> id
      links: [], // { id, source_id, source_title, target_title, target_id, raw_link }
      tags: new Map(), // tag -> Set(noteId)
      stats: { totalWords: 0 }
    };
  }

  /**
   * Initializes SQLite database and/or file storage
   */
  async init() {
    // Ensure vault directory exists
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }

    const storageDir = path.dirname(this.dbPath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Try initializing node:sqlite DatabaseSync
    try {
      const sqliteModule = await import('node:sqlite');
      if (sqliteModule && sqliteModule.DatabaseSync) {
        this.sqliteDb = new sqliteModule.DatabaseSync(this.dbPath);
        this.useSqlite = true;
        this.initSqliteSchema();
      }
    } catch (err) {
      this.useSqlite = false;
    }

    // Initial sync from disk
    await this.syncVault();
  }

  /**
   * Initializes SQLite schema if using DatabaseSync
   */
  initSqliteSchema() {
    if (!this.sqliteDb) return;

    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        frontmatter TEXT,
        content TEXT,
        word_count INTEGER DEFAULT 0,
        excerpt TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        note_id TEXT,
        tag TEXT,
        PRIMARY KEY (note_id, tag),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_title TEXT NOT NULL,
        target_title TEXT NOT NULL,
        target_id TEXT,
        raw_link TEXT,
        FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notes_slug ON notes(slug);
      CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_title);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    `);
  }

  /**
   * Scans disk directory storage/notes/ and synchronizes database & index
   */
  async syncVault() {
    const files = fs.readdirSync(this.vaultDir).filter(f => f.endsWith('.md'));

    // Clear in-memory caches
    this.memoryStore.notes.clear();
    this.memoryStore.slugMap.clear();
    this.memoryStore.titleMap.clear();
    this.memoryStore.links = [];
    this.memoryStore.tags.clear();

    const rawParsedNotes = [];

    // Phase 1: Parse all files
    for (const filename of files) {
      const filePath = path.join(this.vaultDir, filename);
      const rawText = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);

      const { frontmatter, content } = parseFrontmatter(rawText);
      const title = frontmatter.title || path.basename(filename, '.md');
      const slug = frontmatter.slug || slugify(title);
      const id = frontmatter.id || slug;
      const tags = extractTags(content, frontmatter.tags);
      const links = extractWikiLinks(content);
      const excerpt = extractExcerpt(content, 180);
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      const createdAt = frontmatter.date || stats.birthtime.toISOString();
      const updatedAt = stats.mtime.toISOString();

      const noteObj = {
        id,
        title,
        slug,
        filename,
        frontmatter,
        content,
        word_count: wordCount,
        excerpt,
        tags,
        rawLinks: links,
        created_at: createdAt,
        updated_at: updatedAt
      };

      rawParsedNotes.push(noteObj);
      this.memoryStore.notes.set(id, noteObj);
      this.memoryStore.slugMap.set(slug, id);
      this.memoryStore.titleMap.set(title.toLowerCase(), id);

      // Map tags
      tags.forEach(t => {
        if (!this.memoryStore.tags.has(t)) {
          this.memoryStore.tags.set(t, new Set());
        }
        this.memoryStore.tags.get(t).add(id);
      });
    }

    // Phase 2: Resolve bi-directional links
    const allLinks = [];
    for (const note of rawParsedNotes) {
      for (const link of note.rawLinks) {
        const targetTitleLower = link.target.toLowerCase();
        const targetId = this.memoryStore.titleMap.get(targetTitleLower) || null;

        const linkRecord = {
          id: `${note.id}->${slugify(link.target)}`,
          source_id: note.id,
          source_title: note.title,
          target_title: link.target,
          target_id: targetId,
          raw_link: link.raw
        };

        allLinks.push(linkRecord);
      }
    }
    this.memoryStore.links = allLinks;

    // Phase 3: Update SQLite if active
    if (this.useSqlite && this.sqliteDb) {
      try {
        this.sqliteDb.exec('BEGIN TRANSACTION;');
        this.sqliteDb.exec('DELETE FROM links;');
        this.sqliteDb.exec('DELETE FROM tags;');
        this.sqliteDb.exec('DELETE FROM notes;');

        const insertNote = this.sqliteDb.prepare(`
          INSERT INTO notes (id, title, slug, filename, frontmatter, content, word_count, excerpt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTag = this.sqliteDb.prepare(`
          INSERT INTO tags (note_id, tag) VALUES (?, ?)
        `);

        const insertLink = this.sqliteDb.prepare(`
          INSERT INTO links (id, source_id, source_title, target_title, target_id, raw_link)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const note of rawParsedNotes) {
          insertNote.run(
            note.id,
            note.title,
            note.slug,
            note.filename,
            JSON.stringify(note.frontmatter),
            note.content,
            note.word_count,
            note.excerpt,
            note.created_at,
            note.updated_at
          );

          for (const t of note.tags) {
            insertTag.run(note.id, t);
          }
        }

        for (const link of allLinks) {
          insertLink.run(
            link.id,
            link.source_id,
            link.source_title,
            link.target_title,
            link.target_id,
            link.raw_link
          );
        }

        this.sqliteDb.exec('COMMIT;');
      } catch (err) {
        try { this.sqliteDb.exec('ROLLBACK;'); } catch (e) {}
      }
    }

    // Phase 4: Build semantic vector index
    this.semanticIndex.buildIndex(rawParsedNotes);

    return {
      notesCount: rawParsedNotes.length,
      linksCount: allLinks.length,
      tagsCount: this.memoryStore.tags.size
    };
  }

  /**
   * Retrieves all notes with optional tag filtering and sorting
   * @param {Object} [options={}]
   * @returns {Array<Object>}
   */
  getAllNotes(options = {}) {
    let notes = Array.from(this.memoryStore.notes.values());

    if (options.tag) {
      const tagLower = options.tag.toLowerCase();
      notes = notes.filter(n => (n.tags || []).includes(tagLower));
    }

    if (options.sort === 'title') {
      notes.sort((a, b) => a.title.localeCompare(b.title));
    } else if (options.sort === 'words') {
      notes.sort((a, b) => b.word_count - a.word_count);
    } else {
      // Default: sort by last updated descending
      notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    return notes;
  }

  /**
   * Retrieves a note by ID, slug, or title
   * @param {string} identifier
   * @returns {Object|null}
   */
  getNote(identifier = '') {
    if (!identifier) return null;

    // Check direct ID
    if (this.memoryStore.notes.has(identifier)) {
      return this.memoryStore.notes.get(identifier);
    }

    // Check slug
    const idFromSlug = this.memoryStore.slugMap.get(identifier);
    if (idFromSlug && this.memoryStore.notes.has(idFromSlug)) {
      return this.memoryStore.notes.get(idFromSlug);
    }

    // Check title (case insensitive)
    const idFromTitle = this.memoryStore.titleMap.get(identifier.toLowerCase());
    if (idFromTitle && this.memoryStore.notes.has(idFromTitle)) {
      return this.memoryStore.notes.get(idFromTitle);
    }

    return null;
  }

  /**
   * Creates or updates a note on disk and synchronizes
   * @param {Object} noteData - { title, content, frontmatter, tags }
   * @returns {Object} Updated note object
   */
  async saveNote(noteData = {}) {
    const title = (noteData.title || 'Untitled Note').trim();
    const slug = slugify(title);
    const content = noteData.content || '';
    const frontmatter = noteData.frontmatter || {};

    if (!frontmatter.title) frontmatter.title = title;
    if (noteData.tags && Array.isArray(noteData.tags)) {
      frontmatter.tags = noteData.tags;
    }

    // Format frontmatter YAML
    let yamlStr = '---\n';
    Object.entries(frontmatter).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        yamlStr += `${k}: [${v.map(item => `"${item}"`).join(', ')}]\n`;
      } else if (typeof v === 'boolean' || typeof v === 'number') {
        yamlStr += `${k}: ${v}\n`;
      } else {
        yamlStr += `${k}: "${v}"\n`;
      }
    });
    yamlStr += '---\n\n';

    const fullContent = `${yamlStr}${content}`;
    const filename = `${title.replace(/[\/\\?%*:|"<>]/g, '_')}.md`;
    const filePath = path.join(this.vaultDir, filename);

    // If title changed, clean up previous file
    if (noteData.previousTitle && noteData.previousTitle !== title) {
      const prevFilename = `${noteData.previousTitle.replace(/[\/\\?%*:|"<>]/g, '_')}.md`;
      const prevPath = path.join(this.vaultDir, prevFilename);
      if (fs.existsSync(prevPath)) {
        try { fs.unlinkSync(prevPath); } catch (e) {}
      }
    }

    fs.writeFileSync(filePath, fullContent, 'utf-8');

    // Resync vault to update relational and vector index
    await this.syncVault();

    return this.getNote(slug);
  }

  /**
   * Deletes a note from disk and synchronizes
   * @param {string} identifier - ID, slug, or title
   * @returns {boolean}
   */
  async deleteNote(identifier) {
    const note = this.getNote(identifier);
    if (!note) return false;

    const filePath = path.join(this.vaultDir, note.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.syncVault();
    return true;
  }

  /**
   * Retrieves all backlinks pointing to a target note
   * @param {string} targetTitleOrSlug
   * @returns {Array<Object>}
   */
  getBacklinks(targetTitleOrSlug) {
    const note = this.getNote(targetTitleOrSlug);
    if (!note) return [];

    const targetTitleLower = note.title.toLowerCase();
    const targetSlug = note.slug;

    const matchedLinks = this.memoryStore.links.filter(link => {
      const tLower = link.target_title.toLowerCase();
      const tSlug = slugify(link.target_title);
      return tLower === targetTitleLower || tSlug === targetSlug || link.target_id === note.id;
    });

    const backlinks = [];
    const seen = new Set();

    matchedLinks.forEach(link => {
      const sourceNote = this.memoryStore.notes.get(link.source_id);
      if (sourceNote && !seen.has(sourceNote.id) && sourceNote.id !== note.id) {
        seen.add(sourceNote.id);

        // Find sentence where link occurs for contextual snippet
        let contextSentence = '';
        const lines = (sourceNote.content || '').split('\n');
        for (const line of lines) {
          if (line.includes(`[[${link.target_title}`) || line.toLowerCase().includes(targetTitleLower)) {
            contextSentence = line.trim();
            break;
          }
        }

        backlinks.push({
          sourceId: sourceNote.id,
          sourceTitle: sourceNote.title,
          sourceSlug: sourceNote.slug,
          sourceExcerpt: sourceNote.excerpt,
          rawLink: link.raw_link,
          context: contextSentence || sourceNote.excerpt
        });
      }
    });

    return backlinks;
  }

  /**
   * Retrieves forward links originating from a note
   * @param {string} noteIdOrSlug
   * @returns {Array<Object>}
   */
  getForwardLinks(noteIdOrSlug) {
    const note = this.getNote(noteIdOrSlug);
    if (!note) return [];

    const outgoing = this.memoryStore.links.filter(l => l.source_id === note.id);
    return outgoing.map(link => {
      const targetNote = this.memoryStore.notes.get(link.target_id) || null;
      return {
        targetTitle: link.target_title,
        targetSlug: slugify(link.target_title),
        targetId: link.target_id,
        isExisting: !!targetNote,
        rawLink: link.raw_link
      };
    });
  }

  /**
   * Returns list of all tags with occurrence count
   * @returns {Array<{ tag: string, count: number }>}
   */
  getAllTags() {
    const tags = [];
    this.memoryStore.tags.forEach((noteIds, tag) => {
      tags.push({ tag, count: noteIds.size });
    });
    tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return tags;
  }

  /**
   * Returns raw graph nodes and links for graph engine processing
   * @returns {{ notes: Array<Object>, links: Array<Object> }}
   */
  getRawGraphData() {
    return {
      notes: Array.from(this.memoryStore.notes.values()),
      links: this.memoryStore.links
    };
  }

  /**
   * Returns vault summary statistics
   * @returns {Object}
   */
  getVaultStats() {
    const notes = Array.from(this.memoryStore.notes.values());
    const totalWords = notes.reduce((sum, n) => sum + (n.word_count || 0), 0);
    return {
      totalNotes: notes.length,
      totalLinks: this.memoryStore.links.length,
      totalTags: this.memoryStore.tags.size,
      totalWords,
      storageMode: this.useSqlite ? 'SQLite (DatabaseSync) + Vault Mirror' : 'Native High-Speed Vault Store'
    };
  }
}
