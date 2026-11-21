/**
 * NeuroScribe Studio - Main Workspace Application
 * Controls Note Explorer, Split Editor with Live Preview, Auto-Save,
 * Backlinks Drawer, Semantic Recommendations, Mini-Graph, and Quick Switcher.
 */

import { ForceGraph } from './force-graph.js';

class NeuroApp {
  constructor() {
    this.notes = [];
    this.currentNote = null;
    this.activeTag = null;
    this.viewMode = 'split'; // 'split', 'edit', 'preview'
    this.autoSaveTimer = null;
    this.isDirty = false;
    this.miniGraph = null;

    // Quick Switcher State
    this.switcherSelectedIndex = 0;
    this.switcherResults = [];

    // DOM Elements
    this.dom = {
      notesList: document.getElementById('notes-list'),
      tagCloud: document.getElementById('tag-cloud'),
      sidebarSearch: document.getElementById('sidebar-search'),
      sortSelect: document.getElementById('sort-select'),
      noteTitleInput: document.getElementById('note-title-input'),
      rawTextarea: document.getElementById('raw-textarea'),
      markdownPreview: document.getElementById('markdown-preview'),
      saveIndicator: document.getElementById('save-indicator'),
      saveDot: document.getElementById('save-dot'),
      saveStatusText: document.getElementById('save-status-text'),
      editorSplitBody: document.getElementById('editor-split-body'),
      backlinksList: document.getElementById('backlinks-list'),
      outgoingList: document.getElementById('outgoing-list'),
      recommendationsList: document.getElementById('recommendations-list'),
      backlinksCount: document.getElementById('backlinks-count'),
      outgoingCount: document.getElementById('outgoing-count'),
      recsCount: document.getElementById('recs-count'),
      metaWordCount: document.getElementById('meta-word-count'),
      metaReadTime: document.getElementById('meta-read-time'),
      metaUpdated: document.getElementById('meta-updated'),
      metaTagsContainer: document.getElementById('meta-tags-container'),
      miniGraphCanvas: document.getElementById('mini-graph-canvas'),
      // Quick Switcher Modal
      modalOverlay: document.getElementById('quick-switcher-modal'),
      switcherInput: document.getElementById('switcher-search-input'),
      switcherResultsList: document.getElementById('switcher-results'),
      // Buttons
      newNoteBtn: document.getElementById('new-note-btn'),
      deleteNoteBtn: document.getElementById('delete-note-btn'),
      quickSearchTrigger: document.getElementById('quick-search-trigger'),
      toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
      toggleInspectorBtn: document.getElementById('toggle-inspector-btn'),
      toastContainer: document.getElementById('toast-container')
    };

    this.init();
  }

  async init() {
    this.initEvents();
    this.initKeyboardShortcuts();
    this.initMiniGraph();
    await this.loadVaultData();
    this.handleRoute();
  }

  /**
   * Initializes the Mini-Graph component in the right inspector panel
   */
  initMiniGraph() {
    if (this.dom.miniGraphCanvas) {
      this.miniGraph = new ForceGraph(this.dom.miniGraphCanvas, {
        repulsion: 800,
        linkDistance: 65,
        gravity: 0.04,
        friction: 0.22,
        onNodeClick: (node) => {
          this.navigateToNote(node.slug);
        }
      });
    }
  }

  /**
   * Initializes DOM and UI event listeners
   */
  initEvents() {
    // Hash Routing
    window.addEventListener('hashchange', () => this.handleRoute());

    // Auto-save on textarea typing
    this.dom.rawTextarea.addEventListener('input', () => {
      this.isDirty = true;
      this.triggerLivePreview();
      this.scheduleAutoSave();
    });

    // Auto-save on title change
    this.dom.noteTitleInput.addEventListener('input', () => {
      this.isDirty = true;
      this.scheduleAutoSave();
    });

    // Sidebar search filter
    this.dom.sidebarSearch.addEventListener('input', (e) => {
      this.renderNotesList(e.target.value.trim().toLowerCase());
    });

    // Sort selector
    this.dom.sortSelect.addEventListener('change', () => {
      this.sortNotes(this.dom.sortSelect.value);
    });

    // New Note Button
    this.dom.newNoteBtn.addEventListener('click', () => this.createNewNote());

    // Delete Note Button
    this.dom.deleteNoteBtn.addEventListener('click', () => this.deleteCurrentNote());

    // View Mode Buttons (Split / Edit / Preview)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.setViewMode(mode);
      });
    });

    // Formatting Toolbar
    document.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.applyFormatting(action);
      });
    });

    // Quick Switcher triggers
    this.dom.quickSearchTrigger.addEventListener('click', () => this.openQuickSwitcher());
    this.dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.modalOverlay) this.closeQuickSwitcher();
    });
    this.dom.switcherInput.addEventListener('input', (e) => {
      this.filterQuickSwitcher(e.target.value);
    });

    // Delegate Click on WikiLinks and Tags in preview and backlinks
    document.addEventListener('click', (e) => {
      const wikiLink = e.target.closest('.wikilink');
      if (wikiLink) {
        e.preventDefault();
        const targetTitle = wikiLink.dataset.target;
        this.handleWikiLinkClick(targetTitle);
        return;
      }

      const tagPill = e.target.closest('.tag-pill, .tag-badge');
      if (tagPill && !tagPill.classList.contains('count')) {
        const tag = tagPill.dataset.tag;
        if (tag) this.toggleTagFilter(tag);
      }
    });

    // Mobile Sidebar Toggles
    if (this.dom.toggleSidebarBtn) {
      this.dom.toggleSidebarBtn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
      });
    }
    if (this.dom.toggleInspectorBtn) {
      this.dom.toggleInspectorBtn.addEventListener('click', () => {
        document.querySelector('.inspector-pane').classList.toggle('open');
      });
    }
  }

  /**
   * Keyboard Shortcuts (Ctrl+K, Ctrl+S, Ctrl+N, Ctrl+G, Escape)
   */
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Quick Switcher: Ctrl+K or Cmd+K
      if (isCtrlOrCmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openQuickSwitcher();
        return;
      }

      // Quick Save: Ctrl+S
      if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentNote();
        return;
      }

      // New Note: Ctrl+N or Alt+N
      if ((isCtrlOrCmd || e.altKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.createNewNote();
        return;
      }

      // Open Graph View: Ctrl+G
      if (isCtrlOrCmd && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        window.location.href = '/graph';
        return;
      }

      // Quick Switcher Keyboard Navigation
      if (this.dom.modalOverlay.classList.contains('open')) {
        if (e.key === 'Escape') {
          this.closeQuickSwitcher();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveSwitcherSelection(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveSwitcherSelection(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.selectSwitcherCurrent();
        }
      }
    });
  }

  /**
   * Fetches all vault notes and tags from REST API
   */
  async loadVaultData() {
    try {
      const [notesRes, tagsRes] = await Promise.all([
        fetch('/api/notes'),
        fetch('/api/tags')
      ]);

      const notesData = await notesRes.json();
      const tagsData = await tagsRes.json();

      if (notesData.success) {
        this.notes = notesData.notes;
        this.renderNotesList();
      }

      if (tagsData.success) {
        this.renderTagCloud(tagsData.tags);
      }
    } catch (err) {
      this.showToast('Failed to load vault data: ' + err.message, 'error');
    }
  }

  /**
   * Handles hash changes like `#/note/quantum-computing`
   */
  async handleRoute() {
    const hash = window.location.hash;
    const match = hash.match(/^#\/note\/([^\/]+)$/);

    if (match) {
      const slug = decodeURIComponent(match[1]);
      await this.loadNote(slug);
    } else if (this.notes.length > 0) {
      // Default to first note
      this.navigateToNote(this.notes[0].slug);
    }
  }

  /**
   * Navigates to a note via URL hash
   */
  navigateToNote(slug) {
    window.location.hash = `#/note/${slug}`;
  }

  /**
   * Loads and renders a single note by slug or ID
   */
  async loadNote(slugOrId) {
    try {
      this.setSaveStatus('Loading note...');
      const res = await fetch(`/api/notes/${encodeURIComponent(slugOrId)}`);
      const data = await res.json();

      if (!data.success || !data.note) {
        this.showToast('Note not found', 'error');
        return;
      }

      this.currentNote = data.note;
      this.isDirty = false;

      // Populate Title & Textarea
      this.dom.noteTitleInput.value = this.currentNote.title;
      this.dom.rawTextarea.value = this.currentNote.content;
      this.dom.markdownPreview.innerHTML = this.currentNote.html;

      // Update Inspector Info
      this.renderInspectorData(this.currentNote);

      // Highlight active item in sidebar
      this.highlightActiveSidebarItem(this.currentNote.id);

      // Update Mini-Graph around this note
      this.updateMiniGraph(this.currentNote.slug);

      this.setSaveStatus('All changes saved');
    } catch (err) {
      this.showToast('Error loading note: ' + err.message, 'error');
    }
  }

  /**
   * Renders the sidebar notes list
   */
  renderNotesList(filterQuery = '') {
    const list = this.dom.notesList;
    list.innerHTML = '';

    let filtered = this.notes;

    if (this.activeTag) {
      filtered = filtered.filter(n => (n.tags || []).includes(this.activeTag));
    }

    if (filterQuery) {
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(filterQuery) ||
        (n.excerpt || '').toLowerCase().includes(filterQuery) ||
        (n.tags || []).some(t => t.toLowerCase().includes(filterQuery))
      );
    }

    if (filtered.length === 0) {
      list.innerHTML = `<li style="padding: 1rem; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No matching notes found</li>`;
      return;
    }

    filtered.forEach(note => {
      const li = document.createElement('li');
      li.className = 'note-item';
      li.dataset.id = note.id;
      li.dataset.slug = note.slug;

      if (this.currentNote && (this.currentNote.id === note.id || this.currentNote.slug === note.slug)) {
        li.classList.add('active');
      }

      const tagsHtml = (note.tags || [])
        .slice(0, 3)
        .map(t => `<span class="note-item-tag">#${t}</span>`)
        .join(' ');

      li.innerHTML = `
        <div class="note-item-title">
          <span><span class="note-icon">📄</span>${this.escape(note.title)}</span>
        </div>
        <div class="note-item-excerpt">${this.escape(note.excerpt || '')}</div>
        <div class="note-item-meta">
          <span>${note.wordCount || 0} words</span>
          <div class="note-item-tags">${tagsHtml}</div>
        </div>
      `;

      li.addEventListener('click', () => {
        this.navigateToNote(note.slug);
      });

      list.appendChild(li);
    });
  }

  /**
   * Renders Tag Cloud in the sidebar
   */
  renderTagCloud(tags = []) {
    const cloud = this.dom.tagCloud;
    cloud.innerHTML = '';

    const allPill = document.createElement('span');
    allPill.className = `tag-badge ${!this.activeTag ? 'active' : ''}`;
    allPill.textContent = 'All Notes';
    allPill.addEventListener('click', () => {
      this.activeTag = null;
      this.renderTagCloud(tags);
      this.renderNotesList();
    });
    cloud.appendChild(allPill);

    tags.forEach(t => {
      const badge = document.createElement('span');
      badge.className = `tag-badge ${this.activeTag === t.tag ? 'active' : ''}`;
      badge.dataset.tag = t.tag;
      badge.innerHTML = `#${t.tag} <span class="count">${t.count}</span>`;
      badge.addEventListener('click', () => {
        this.toggleTagFilter(t.tag);
      });
      cloud.appendChild(badge);
    });
  }

  toggleTagFilter(tag) {
    this.activeTag = this.activeTag === tag ? null : tag;
    this.loadVaultData();
  }

  sortNotes(criterion) {
    if (criterion === 'title') {
      this.notes.sort((a, b) => a.title.localeCompare(b.title));
    } else if (criterion === 'words') {
      this.notes.sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0));
    } else {
      this.notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
    this.renderNotesList();
  }

  /**
   * Updates Inspector Panel with Backlinks, Outgoing, Semantic Recommendations, and Meta
   */
  renderInspectorData(note) {
    // Backlinks
    const backlinks = note.backlinks || [];
    this.dom.backlinksCount.textContent = backlinks.length;
    this.dom.backlinksList.innerHTML = '';

    if (backlinks.length === 0) {
      this.dom.backlinksList.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 0.3rem 0;">No incoming links yet</div>`;
    } else {
      backlinks.forEach(bl => {
        const card = document.createElement('div');
        card.className = 'link-card';
        card.innerHTML = `
          <div class="link-card-header">
            <span>🔗 ${this.escape(bl.sourceTitle)}</span>
          </div>
          <div class="link-card-context">${this.escape(bl.context || bl.sourceExcerpt)}</div>
        `;
        card.addEventListener('click', () => this.navigateToNote(bl.sourceSlug));
        this.dom.backlinksList.appendChild(card);
      });
    }

    // Outgoing WikiLinks
    const outgoing = note.forwardLinks || [];
    this.dom.outgoingCount.textContent = outgoing.length;
    this.dom.outgoingList.innerHTML = '';

    if (outgoing.length === 0) {
      this.dom.outgoingList.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 0.3rem 0;">No outgoing wikilinks</div>`;
    } else {
      outgoing.forEach(link => {
        const card = document.createElement('div');
        card.className = 'link-card';
        card.innerHTML = `
          <div class="link-card-header">
            <span>[[${this.escape(link.targetTitle)}]]</span>
            ${link.isExisting ? '' : '<span style="color: var(--accent-amber); font-size: 0.7rem;">(uncreated)</span>'}
          </div>
        `;
        card.addEventListener('click', () => this.handleWikiLinkClick(link.targetTitle));
        this.dom.outgoingList.appendChild(card);
      });
    }

    // Semantic Recommendations
    const recs = note.recommendations || [];
    this.dom.recsCount.textContent = recs.length;
    this.dom.recommendationsList.innerHTML = '';

    if (recs.length === 0) {
      this.dom.recommendationsList.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 0.3rem 0;">No semantic correlations found</div>`;
    } else {
      recs.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'link-card';
        const percent = Math.round(rec.similarityScore * 100);
        const termsHtml = (rec.sharedKeywords || [])
          .map(t => `<span class="term-pill">${t}</span>`)
          .join('');

        card.innerHTML = `
          <div class="link-card-header">
            <span>💡 ${this.escape(rec.title)}</span>
            <span class="similarity-badge">${percent}% match</span>
          </div>
          <div class="link-card-context">${this.escape(rec.excerpt || '')}</div>
          <div class="shared-terms-pills">${termsHtml}</div>
        `;
        card.addEventListener('click', () => this.navigateToNote(rec.slug));
        this.dom.recommendationsList.appendChild(card);
      });
    }

    // Metadata
    const words = note.wordCount || 0;
    this.dom.metaWordCount.textContent = `${words} words`;
    this.dom.metaReadTime.textContent = `${Math.max(1, Math.ceil(words / 200))} min read`;
    this.dom.metaUpdated.textContent = new Date(note.updated_at || Date.now()).toLocaleDateString();

    this.dom.metaTagsContainer.innerHTML = (note.tags || [])
      .map(t => `<span class="tag-pill" data-tag="${t}">#${t}</span>`)
      .join(' ');
  }

  /**
   * Updates Mini-Graph around current note
   */
  async updateMiniGraph(slug) {
    if (!this.miniGraph) return;

    try {
      const res = await fetch(`/api/graph/local/${encodeURIComponent(slug)}?hops=1`);
      const data = await res.json();

      if (data.success && data.nodes) {
        this.miniGraph.setData(data.nodes, data.links);
        this.miniGraph.focusNode(data.targetId);
      }
    } catch (e) {
      console.warn('Mini-graph fetch error:', e);
    }
  }

  /**
   * Handles clicking a WikiLink `[[Target Note]]`
   */
  async handleWikiLinkClick(targetTitle) {
    const slug = this.slugify(targetTitle);
    const existing = this.notes.find(
      n => n.title.toLowerCase() === targetTitle.toLowerCase() || n.slug === slug
    );

    if (existing) {
      this.navigateToNote(existing.slug);
    } else {
      const confirmCreate = confirm(`Note "${targetTitle}" does not exist yet. Would you like to create it now?`);
      if (confirmCreate) {
        await this.createNewNote(targetTitle);
      }
    }
  }

  /**
   * Creates a new note and immediately opens it
   */
  async createNewNote(customTitle = null) {
    const title = customTitle || prompt('Enter note title:', 'Untitled Note');
    if (!title || !title.trim()) return;

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: `# ${title.trim()}\n\nWrite your thoughts here. Link other concepts using [[WikiLinks]] and tags with #tags.\n`,
          tags: []
        })
      });

      const data = await res.json();
      if (!data.success) {
        this.showToast(data.error || 'Failed to create note', 'error');
        return;
      }

      this.showToast(`Created note "${title}"`, 'success');
      await this.loadVaultData();
      this.navigateToNote(data.note.slug);
    } catch (err) {
      this.showToast('Error creating note: ' + err.message, 'error');
    }
  }

  /**
   * Deletes the currently opened note
   */
  async deleteCurrentNote() {
    if (!this.currentNote) return;

    const confirmDelete = confirm(`Are you sure you want to delete "${this.currentNote.title}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(this.currentNote.slug)}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!data.success) {
        this.showToast(data.error || 'Failed to delete note', 'error');
        return;
      }

      this.showToast(`Deleted note "${this.currentNote.title}"`, 'success');
      this.currentNote = null;
      await this.loadVaultData();

      if (this.notes.length > 0) {
        this.navigateToNote(this.notes[0].slug);
      } else {
        window.location.hash = '';
        this.dom.noteTitleInput.value = '';
        this.dom.rawTextarea.value = '';
        this.dom.markdownPreview.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No notes in vault. Create one to get started!</p>';
      }
    } catch (err) {
      this.showToast('Error deleting note: ' + err.message, 'error');
    }
  }

  /**
   * Debounced Auto-Save
   */
  scheduleAutoSave() {
    this.setSaveStatus('Saving...', true);
    clearTimeout(this.autoSaveTimer);

    this.autoSaveTimer = setTimeout(() => {
      this.saveCurrentNote();
    }, 700);
  }

  /**
   * Saves current note content to disk via API
   */
  async saveCurrentNote() {
    if (!this.currentNote) return;

    const newTitle = this.dom.noteTitleInput.value.trim() || 'Untitled Note';
    const newContent = this.dom.rawTextarea.value;

    try {
      this.setSaveStatus('Saving...', true);

      const res = await fetch(`/api/notes/${encodeURIComponent(this.currentNote.slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          content: newContent
        })
      });

      const data = await res.json();
      if (!data.success) {
        this.setSaveStatus('Save error', false);
        this.showToast(data.error || 'Auto-save failed', 'error');
        return;
      }

      const prevSlug = this.currentNote.slug;
      this.currentNote = data.note;
      this.isDirty = false;
      this.setSaveStatus('All changes saved', false);

      // If title changed, update hash route smoothly
      if (data.note.slug !== prevSlug) {
        window.location.hash = `#/note/${data.note.slug}`;
      }

      // Refresh metadata & backlinks
      this.renderInspectorData(this.currentNote);

      // Soft update sidebar title
      const sidebarItem = this.dom.notesList.querySelector(`[data-id="${this.currentNote.id}"]`);
      if (sidebarItem) {
        sidebarItem.querySelector('.note-item-title span').lastChild.textContent = this.currentNote.title;
      }
    } catch (err) {
      this.setSaveStatus('Save failed', false);
      this.showToast('Error saving note: ' + err.message, 'error');
    }
  }

  /**
   * Client-side live preview renderer
   */
  triggerLivePreview() {
    const raw = this.dom.rawTextarea.value;
    // Fast regex preview replacement
    this.dom.markdownPreview.innerHTML = this.renderMarkdownClient(raw);
  }

  renderMarkdownClient(text = '') {
    // Quick client-side converter
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (m, h, t) => `<h${h.length}>${t}</h${h.length}>`);

    // WikiLinks
    html = html.replace(/\[\[([^[\]|]+?)(?:\|([^[\]|]+?))?\]\]/g, (m, target, alias) => {
      const display = alias || target;
      return `<a class="wikilink" data-target="${target}"><span class="wikilink-bracket">[[</span>${display}<span class="wikilink-bracket">]]</span></a>`;
    });

    // Tags
    html = html.replace(/(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=\s|$|[.,!?;:])/g, ' <span class="tag-pill" data-tag="$1">#$1</span>');

    // Bold, Italic, Code
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Paragraphs
    return html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('');
  }

  /**
   * Formatting Toolbar Insertion Helpers
   */
  applyFormatting(action) {
    const textarea = this.dom.rawTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (action) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'heading':
        replacement = `\n## ${selected || 'Heading'}\n`;
        cursorOffset = replacement.length;
        break;
      case 'wikilink':
        replacement = `[[${selected || 'Target Note'}]]`;
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'tag':
        replacement = `#${selected || 'concept'}`;
        cursorOffset = replacement.length;
        break;
      case 'task':
        replacement = `\n- [ ] ${selected || 'Task item'}\n`;
        cursorOffset = replacement.length;
        break;
      case 'code':
        replacement = selected.includes('\n')
          ? `\n\`\`\`javascript\n${selected || '// code here'}\n\`\`\`\n`
          : `\`${selected || 'code'}\``;
        cursorOffset = replacement.length;
        break;
      case 'math':
        replacement = `\n$$\n${selected || 'E = mc^2'}\n$$\n`;
        cursorOffset = replacement.length;
        break;
      case 'callout':
        replacement = `\n> [!NOTE]\n> ${selected || 'Important context'}\n`;
        cursorOffset = replacement.length;
        break;
    }

    textarea.setRangeText(replacement, start, end, 'end');
    textarea.focus();
    this.scheduleAutoSave();
    this.triggerLivePreview();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.dom.editorSplitBody.className = `editor-split-body mode-${mode}`;
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  setSaveStatus(text, isSaving = false) {
    this.dom.saveStatusText.textContent = text;
    this.dom.saveDot.className = `save-dot ${isSaving ? 'saving' : ''}`;
  }

  highlightActiveSidebarItem(id) {
    this.dom.notesList.querySelectorAll('.note-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });
  }

  // =========================================================================
  // Quick Switcher (Ctrl+K)
  // =========================================================================
  openQuickSwitcher() {
    this.dom.modalOverlay.classList.add('open');
    this.dom.switcherInput.value = '';
    this.dom.switcherInput.focus();
    this.filterQuickSwitcher('');
  }

  closeQuickSwitcher() {
    this.dom.modalOverlay.classList.remove('open');
  }

  async filterQuickSwitcher(query = '') {
    const q = query.trim();
    if (!q) {
      this.switcherResults = this.notes.slice(0, 10);
      this.renderSwitcherResults();
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      this.switcherResults = data.results || [];
      this.renderSwitcherResults();
    } catch (e) {
      this.switcherResults = this.notes.filter(n =>
        n.title.toLowerCase().includes(q.toLowerCase())
      );
      this.renderSwitcherResults();
    }
  }

  renderSwitcherResults() {
    const list = this.dom.switcherResultsList;
    list.innerHTML = '';
    this.switcherSelectedIndex = 0;

    if (this.switcherResults.length === 0) {
      list.innerHTML = `<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No notes matching your query</li>`;
      return;
    }

    this.switcherResults.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = `switcher-item ${index === 0 ? 'selected' : ''}`;
      li.innerHTML = `
        <div class="switcher-item-info">
          <div class="switcher-item-title">📄 ${this.escape(item.title)}</div>
          <div class="switcher-item-snippet">${item.snippet || this.escape(item.excerpt || '')}</div>
        </div>
        <span class="kbd-shortcut">↵</span>
      `;

      li.addEventListener('click', () => {
        this.navigateToNote(item.slug);
        this.closeQuickSwitcher();
      });

      list.appendChild(li);
    });
  }

  moveSwitcherSelection(direction) {
    const items = this.dom.switcherResultsList.querySelectorAll('.switcher-item');
    if (items.length === 0) return;

    items[this.switcherSelectedIndex]?.classList.remove('selected');
    this.switcherSelectedIndex = (this.switcherSelectedIndex + direction + items.length) % items.length;
    items[this.switcherSelectedIndex]?.classList.add('selected');
    items[this.switcherSelectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  selectSwitcherCurrent() {
    if (this.switcherResults[this.switcherSelectedIndex]) {
      const selected = this.switcherResults[this.switcherSelectedIndex];
      this.navigateToNote(selected.slug);
      this.closeQuickSwitcher();
    }
  }

  // Toast Notification
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  slugify(text = '') {
    return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
  }

  escape(str = '') {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

// Instantiate on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new NeuroApp();
});
