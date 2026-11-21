/**
 * NeuroScribe Studio - Force-Directed Graph Engine
 * High-performance HTML5 Canvas 2D physics simulation with Coulomb repulsion,
 * Hooke spring attraction, centering gravity, neighborhood glow, pan/zoom, and node dragging.
 */

export class ForceGraph {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options={}]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = Object.assign({
      repulsion: 1200,
      linkDistance: 95,
      linkStrength: 0.12,
      gravity: 0.035,
      friction: 0.18,
      sizingMode: 'degree', // 'degree' or 'centrality'
      interactive: true,
      onNodeClick: null,
      onNodeHover: null
    }, options);

    this.nodes = [];
    this.links = [];
    this.nodeMap = new Map();

    // Simulation Physics State
    this.alpha = 1.0;
    this.alphaMin = 0.002;
    this.alphaDecay = 0.015;
    this.isRunning = false;
    this.animationFrameId = null;

    // Viewport Camera State (Pan & Zoom)
    this.transform = {
      x: 0,
      y: 0,
      scale: 1.0
    };

    // Interaction State
    this.draggedNode = null;
    this.hoveredNode = null;
    this.isPanning = false;
    this.lastMousePos = { x: 0, y: 0 };
    this.searchQuery = '';
    this.activeTags = new Set();
    this.hideOrphans = false;

    // High DPI scaling
    this.dpr = window.devicePixelRatio || 1;
    this.initCanvasSize();
    this.initEventListeners();
  }

  /**
   * Resizes canvas to match client dimensions with DPR
   */
  initCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    this.width = width;
    this.height = height;

    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    // Initial center transform
    if (this.transform.x === 0 && this.transform.y === 0) {
      this.transform.x = width / 2;
      this.transform.y = height / 2;
    }
  }

  /**
   * Loads graph data into simulation
   * @param {Array<Object>} nodes
   * @param {Array<Object>} links
   */
  setData(nodes = [], links = []) {
    this.nodeMap.clear();

    // Initialize node physics coordinates
    this.nodes = nodes.map((n, idx) => {
      // Distribute nodes in a golden spiral pattern initially
      const phi = idx * 2.39996; // Golden angle
      const radius = 25 * Math.sqrt(idx + 1);
      const existing = this.nodeMap.get(n.id);

      const nodeObj = {
        ...n,
        x: existing ? existing.x : Math.cos(phi) * radius,
        y: existing ? existing.y : Math.sin(phi) * radius,
        vx: 0,
        vy: 0,
        radius: this.computeNodeRadius(n),
        isPinned: false
      };

      this.nodeMap.set(n.id, nodeObj);
      return nodeObj;
    });

    // Map links to node references
    this.links = links
      .map(l => {
        const sourceNode = this.nodeMap.get(typeof l.source === 'object' ? l.source.id : l.source);
        const targetNode = this.nodeMap.get(typeof l.target === 'object' ? l.target.id : l.target);
        if (sourceNode && targetNode) {
          return {
            ...l,
            source: sourceNode,
            target: targetNode
          };
        }
        return null;
      })
      .filter(Boolean);

    this.reheat();
    this.start();
  }

  /**
   * Calculates node display radius
   */
  computeNodeRadius(node) {
    if (this.options.sizingMode === 'centrality') {
      return 6 + (node.centrality || 0) * 16;
    }
    // Default by degree
    return 6 + Math.sqrt(Math.max(1, node.degree || 1)) * 3.5;
  }

  /**
   * Physics Simulation Step
   */
  tick() {
    if (this.alpha < this.alphaMin) {
      this.render();
      return;
    }

    const visibleNodes = this.getVisibleNodes();
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const kRepulsion = this.options.repulsion * this.alpha;
    const kGravity = this.options.gravity * this.alpha;
    const linkStrength = this.options.linkStrength * this.alpha;
    const linkDistance = this.options.linkDistance;
    const friction = 1 - this.options.friction;

    // 1. Many-Body Coulomb Repulsion between visible nodes
    for (let i = 0; i < visibleNodes.length; i++) {
      const u = visibleNodes[i];
      for (let j = i + 1; j < visibleNodes.length; j++) {
        const v = visibleNodes[j];

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);

        // Clamp minimum distance to prevent explosion
        const effectiveDist = Math.max(dist, 20);
        const force = kRepulsion / (effectiveDist * effectiveDist);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!u.isPinned) {
          u.vx -= fx;
          u.vy -= fy;
        }
        if (!v.isPinned) {
          v.vx += fx;
          v.vy += fy;
        }
      }
    }

    // 2. Hooke's Law Spring Attraction along Edges
    this.links.forEach(link => {
      if (!visibleNodeIds.has(link.source.id) || !visibleNodeIds.has(link.target.id)) return;

      const u = link.source;
      const v = link.target;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - linkDistance;
      const force = displacement * linkStrength;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!u.isPinned) {
        u.vx += fx;
        u.vy += fy;
      }
      if (!v.isPinned) {
        v.vx -= fx;
        v.vy -= fy;
      }
    });

    // 3. Centering Gravity & Velocity Integration
    visibleNodes.forEach(node => {
      if (node.isPinned) return;

      // Gravity towards (0, 0)
      node.vx -= node.x * kGravity;
      node.vy -= node.y * kGravity;

      // Damping
      node.vx *= friction;
      node.vy *= friction;

      // Position update
      node.x += node.vx;
      node.y += node.vy;
    });

    // Cool alpha
    this.alpha += (0 - this.alpha) * this.alphaDecay;

    this.render();
  }

  /**
   * Filters nodes based on UI criteria
   */
  getVisibleNodes() {
    return this.nodes.filter(node => {
      if (this.hideOrphans && (node.degree === 0 || node.degree === undefined)) {
        return false;
      }
      if (this.activeTags.size > 0) {
        const hasTag = (node.tags || []).some(t => this.activeTags.has(t));
        if (!hasTag) return false;
      }
      return true;
    });
  }

  /**
   * Main Render Loop on 2D Canvas
   */
  render() {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    // Clear Canvas
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    // Apply camera transform: Pan & Zoom
    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.scale, this.transform.scale);

    const visibleNodes = this.getVisibleNodes();
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Determine highlighted set from hover
    let hoveredNeighborIds = null;
    if (this.hoveredNode) {
      hoveredNeighborIds = new Set([this.hoveredNode.id]);
      this.links.forEach(l => {
        if (l.source.id === this.hoveredNode.id) hoveredNeighborIds.add(l.target.id);
        if (l.target.id === this.hoveredNode.id) hoveredNeighborIds.add(l.source.id);
      });
    }

    // Phase 1: Draw Edges
    this.links.forEach(link => {
      if (!visibleNodeIds.has(link.source.id) || !visibleNodeIds.has(link.target.id)) return;

      const isConnectedToHover = hoveredNeighborIds &&
        hoveredNeighborIds.has(link.source.id) &&
        hoveredNeighborIds.has(link.target.id);

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);

      if (isConnectedToHover) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.2 / this.transform.scale;
        ctx.globalAlpha = 0.9;
      } else if (hoveredNeighborIds) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.75 / this.transform.scale;
        ctx.globalAlpha = 0.15;
      } else {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.0 / this.transform.scale;
        ctx.globalAlpha = 0.45;
      }

      ctx.stroke();
    });

    ctx.globalAlpha = 1.0;

    // Phase 2: Draw Nodes
    visibleNodes.forEach(node => {
      const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
      const isNeighbor = hoveredNeighborIds && hoveredNeighborIds.has(node.id);
      const isDimmed = hoveredNeighborIds && !isNeighbor;
      const matchesSearch = this.searchQuery &&
        node.title.toLowerCase().includes(this.searchQuery.toLowerCase());

      const r = (node.radius || 8) / (isHovered ? 0.85 : 1);

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.18;
      } else {
        ctx.globalAlpha = 1.0;
      }

      // Outer Halo for hubs, active search, or hover
      if (isHovered || matchesSearch) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? 'rgba(56, 189, 248, 0.35)' : 'rgba(244, 63, 94, 0.4)';
        ctx.fill();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color || '#6366f1';
      ctx.fill();

      // Border stroke
      ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = (isHovered ? 2.5 : 1.2) / this.transform.scale;
      ctx.stroke();

      // Node Label
      const showLabel = isHovered || isNeighbor || matchesSearch ||
        (this.transform.scale > 0.85 && (node.degree || 0) > 1) ||
        this.transform.scale > 1.35;

      if (showLabel) {
        const fontSize = Math.max(9, Math.min(14, 11 / Math.sqrt(this.transform.scale)));
        ctx.font = `${isHovered ? '600' : '500'} ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Text shadow for legibility
        ctx.fillStyle = '#0f172a';
        ctx.fillText(node.title, node.x + 1, node.y + r + 4);
        ctx.fillText(node.title, node.x - 1, node.y + r + 4);

        ctx.fillStyle = isHovered ? '#38bdf8' : (matchesSearch ? '#f43f5e' : '#e2e8f0');
        ctx.fillText(node.title, node.x, node.y + r + 3);
      }

      ctx.restore();
    });

    ctx.restore();
  }

  /**
   * Starts simulation animation loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = () => {
      this.tick();
      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Reheats simulation physics
   * @param {number} [alpha=0.4]
   */
  reheat(alpha = 0.45) {
    this.alpha = Math.max(this.alpha, alpha);
  }

  /**
   * Converts screen mouse coordinates into world coordinates
   */
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    return {
      x: (x - this.transform.x) / this.transform.scale,
      y: (y - this.transform.y) / this.transform.scale
    };
  }

  /**
   * Finds the top node located at world coordinates (x, y)
   */
  getNodeAt(worldX, worldY) {
    const visibleNodes = this.getVisibleNodes();
    for (let i = visibleNodes.length - 1; i >= 0; i--) {
      const node = visibleNodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = (node.radius || 8) + 6 / this.transform.scale;

      if (dist <= hitRadius) {
        return node;
      }
    }
    return null;
  }

  /**
   * Centers and zooms onto a specific node
   */
  focusNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    this.transform.scale = 1.3;
    this.transform.x = this.width / 2 - node.x * this.transform.scale;
    this.transform.y = this.height / 2 - node.y * this.transform.scale;
    this.hoveredNode = node;
    this.reheat(0.3);
  }

  /**
   * Resets camera to fit all nodes
   */
  resetView() {
    const visible = this.getVisibleNodes();
    if (visible.length === 0) {
      this.transform = { x: this.width / 2, y: this.height / 2, scale: 1.0 };
      this.reheat();
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visible.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const graphWidth = Math.max(100, maxX - minX + 120);
    const graphHeight = Math.max(100, maxY - minY + 120);

    const scaleX = this.width / graphWidth;
    const scaleY = this.height / graphHeight;
    const fitScale = Math.min(1.4, Math.max(0.3, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.transform.scale = fitScale;
    this.transform.x = this.width / 2 - centerX * fitScale;
    this.transform.y = this.height / 2 - centerY * fitScale;

    this.reheat(0.3);
  }

  /**
   * Mouse and Touch Event Handlers
   */
  initEventListeners() {
    const canvas = this.canvas;

    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.render();
    });

    // Mouse Move (Hover & Pan & Drag)
    canvas.addEventListener('mousemove', e => {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);

      if (this.draggedNode) {
        this.draggedNode.x = worldPos.x;
        this.draggedNode.y = worldPos.y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        this.reheat(0.2);
        return;
      }

      if (this.isPanning) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        this.transform.x += dx;
        this.transform.y += dy;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.render();
        return;
      }

      // Check hover
      const node = this.getNodeAt(worldPos.x, worldPos.y);
      if (node !== this.hoveredNode) {
        this.hoveredNode = node;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        if (this.options.onNodeHover) {
          this.options.onNodeHover(node);
        }
        this.render();
      }
    });

    // Mouse Down (Drag or Pan)
    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return; // Left click only
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      const node = this.getNodeAt(worldPos.x, worldPos.y);

      if (node) {
        this.draggedNode = node;
        node.isPinned = true;
        canvas.style.cursor = 'grabbing';
      } else {
        this.isPanning = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    });

    // Mouse Up
    window.addEventListener('mouseup', () => {
      if (this.draggedNode) {
        this.draggedNode.isPinned = false;
        this.draggedNode = null;
        this.reheat(0.15);
      }
      this.isPanning = false;
      canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    });

    // Click
    canvas.addEventListener('click', e => {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      const node = this.getNodeAt(worldPos.x, worldPos.y);
      if (node && this.options.onNodeClick) {
        this.options.onNodeClick(node);
      }
    });

    // Wheel (Zoom)
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.min(3.5, Math.max(0.2, this.transform.scale * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom toward cursor
      this.transform.x = mouseX - (mouseX - this.transform.x) * (newScale / this.transform.scale);
      this.transform.y = mouseY - (mouseY - this.transform.y) * (newScale / this.transform.scale);
      this.transform.scale = newScale;

      this.render();
    }, { passive: false });
  }

  /**
   * Dynamic property setters for UI controls
   */
  setPhysicsParams(params = {}) {
    Object.assign(this.options, params);
    this.reheat(0.5);
  }

  setSizingMode(mode) {
    this.options.sizingMode = mode;
    this.nodes.forEach(n => {
      n.radius = this.computeNodeRadius(n);
    });
    this.render();
  }

  setFilters({ search, tags, hideOrphans } = {}) {
    if (search !== undefined) this.searchQuery = search;
    if (tags !== undefined) this.activeTags = new Set(tags);
    if (hideOrphans !== undefined) this.hideOrphans = hideOrphans;
    this.reheat(0.35);
  }

  destroy() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
