import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { KIND_FILL, TIME_DEPTH } from './constants.js';
import { formatSpan } from './dates.js';
import { layoutBoard, yearToZ } from './layout.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class AssociationScene {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    this.view = 'board';
    this.filters = new Set([
      'romantic',
      'ancestry',
      'religion',
      'political_ideology',
      'organization',
      'documented_communications',
    ]);
    this.selected = null;
    this.hovered = null;
    this.scrubYear = null;
    this.onSelect = null;
    this.onTimeTravel = null;
    this.bg = '#1c1814';

    this.camX = 0;
    this.camY = 0;
    this.camZ = 0;
    this.zoom = 48;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    labelLayer.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.setBackground(this.bg);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._ndc = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._plane = new THREE.Plane();

    this.pos = new Map();
    this.nodeMap = new Map();
    this.edgeVisuals = [];
    this.pickables = [];
    this.graph = null;

    this._mode = null;
    this._dragId = null;
    this._moved = false;
    this._last = { x: 0, y: 0 };

    const el = this.labelRenderer.domElement;
    el.addEventListener('pointerdown', (e) => this._onDown(e));
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerup', (e) => this._onUp(e));
    el.addEventListener('pointerleave', (e) => this._onUp(e));
    el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    this.resize();
    this._placeCamera();
  }

  setBackground(hex) {
    this.bg = hex;
    this.scene.background = new THREE.Color(hex);
    this.renderer.setClearColor(hex, 1);
  }

  mat(color, opacity = 1) {
    const key = `${color}:${opacity}`;
    if (!this.mats.has(key)) {
      this.mats.set(
        key,
        new THREE.MeshBasicMaterial({
          color,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity >= 1,
        }),
      );
    }
    return this.mats.get(key);
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setView(view) {
    this.view = view;
    if (view === 'time' && this.graph && this.scrubYear != null) {
      this.camZ = yearToZ(this.scrubYear, this.graph.axisMin, this.graph.axisMax, TIME_DEPTH);
    } else if (view === 'board') {
      this.camZ = 0;
    }
    this._layoutNodes();
    this._layoutEdges();
    this._placeCamera();
    this._syncVisibility();
  }

  setFilters(types) {
    this.filters = new Set(types);
    this._syncVisibility();
  }

  setScrubYear(year) {
    this.scrubYear = year;
    if (this.view === 'time' && this.graph) {
      this.camZ = yearToZ(year, this.graph.axisMin, this.graph.axisMax, TIME_DEPTH);
      this._placeCamera();
    }
    this._syncVisibility();
  }

  select(id) {
    this.selected = id;
    this._applyHighlight();
  }

  load(graph) {
    this.resize();
    this._clear();
    this.graph = graph;
    const { pos, centerId } = layoutBoard(graph.nodes, graph.edges);
    this.centerId = centerId;
    this.pos = new Map(Object.entries(pos).map(([id, p]) => [id, { x: p.x, y: p.y }]));
    this.camX = 0;
    this.camY = 0;
    this.zoom = 48;
    this.camZ = 0;

    this.nodeGroup = new THREE.Group();
    this.edgeGroup = new THREE.Group();
    this.axisGroup = new THREE.Group();
    this.root.add(this.nodeGroup, this.edgeGroup, this.axisGroup);

    const labelKeep = new Set(
      [...graph.nodes]
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 14)
        .map((n) => n.id),
    );

    this.nodeMap = new Map();
    this.pickables = [];
    for (const node of graph.nodes) {
      const vis = this._makeNode(node, labelKeep.has(node.id));
      this.nodeGroup.add(vis.group);
      this.nodeMap.set(node.id, vis);
      this.pickables.push(vis.mesh);
    }

    this.edgeVisuals = [];
    for (const edge of graph.edges) {
      if (!this.pos.has(edge.source) || !this.pos.has(edge.target)) continue;
      const vis = this._makeEdge(edge);
      this.edgeGroup.add(vis.mesh);
      this.edgeVisuals.push(vis);
      this.pickables.push(vis.mesh);
    }

    this._makeTimeAxis();
    this._layoutNodes();
    this._layoutEdges();
    this._placeCamera();
    this._syncVisibility();
    this._applyHighlight();
  }

  _clear() {
    // Detach every child (and descendant) explicitly. Object3D.clear() only
    // fires 'removed' on direct children, so CSS2DObjects nested inside node
    // groups / the axis group would keep their DOM elements in the label layer.
    const doomed = [];
    this.root.traverse((obj) => {
      if (obj !== this.root) doomed.push(obj);
    });
    for (const obj of doomed) {
      if (obj.isCSS2DObject && obj.element) obj.element.remove();
      obj.removeFromParent();
    }
    this.root.clear();
    // Belt and braces: anything still sitting in the CSS2D layer belongs to the
    // previous graph (the layer only ever holds pin labels and year ticks).
    const layer = this.labelRenderer.domElement;
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    // Geometries (cylGeo/boxGeo) and materials (this.mats cache) are shared and
    // reused across loads, so they are not disposed here.
    this.nodeGroup = null;
    this.edgeGroup = null;
    this.axisGroup = null;
    this.pickables = [];
    this.nodeMap = new Map();
    this.edgeVisuals = [];
    this.pos = new Map();
    this.selected = null;
    this.hovered = null;
    this._mode = null;
    this._dragId = null;
  }

  _makeNode(node, labeled) {
    const fill = KIND_FILL[node.kind] || '#ccc';
    const opacity = node.kind === 'affiliation' ? 0.7 : 1;
    const mesh = new THREE.Mesh(this.cylGeo, this.mat(fill, opacity));
    mesh.userData = { kind: 'node', id: node.id };
    const group = new THREE.Group();
    group.add(mesh);

    const el = document.createElement('div');
    el.className = `pin-label kind-${node.kind}`;
    el.innerHTML = `<span class="n">${escapeHtml(node.name)}</span><span class="y">${formatSpan(node.start, node.end, node.open)}</span>`;
    el.style.display = labeled ? '' : 'none';
    const label = new CSS2DObject(el);
    label.visible = labeled;
    group.add(label);

    const r = 0.22 + Math.sqrt(node.degree + 1) * 0.09;
    return { group, mesh, label, el, node, r, labeled };
  }

  _makeEdge(edge) {
    const mesh = new THREE.Mesh(this.boxGeo, this.mat(edge.color));
    mesh.userData = { kind: 'edge', id: edge.id };
    return { mesh, edge };
  }

  _nodeZs(node) {
    const z0 = yearToZ(Math.max(node.start, this.graph.axisMin), this.graph.axisMin, this.graph.axisMax, TIME_DEPTH);
    const z1 = yearToZ(Math.min(node.end, this.graph.axisMax), this.graph.axisMin, this.graph.axisMax, TIME_DEPTH);
    return { z0, z1, zMid: (z0 + z1) / 2, h: Math.max(0.2, Math.abs(z1 - z0)) };
  }

  _layoutNodes() {
    const time = this.view === 'time';
    for (const vis of this.nodeMap.values()) {
      const p = this.pos.get(vis.node.id);
      if (!p) continue;
      const { z0, z1, zMid, h } = this._nodeZs(vis.node);
      vis.group.position.set(p.x, p.y, time ? zMid : 0);
      vis.mesh.quaternion.setFromUnitVectors(Y_AXIS, Z_AXIS);
      vis.mesh.scale.set(vis.r, time ? h : 0.45, vis.r);
      vis.label.position.set(0, -vis.r * 1.5, time ? h / 2 + 0.2 : 0.4);
      vis.el.classList.toggle('time', time);
    }
  }

  _layoutEdges() {
    const time = this.view === 'time';
    for (const vis of this.edgeVisuals) {
      const a = this.pos.get(vis.edge.source);
      const b = this.pos.get(vis.edge.target);
      if (!a || !b) continue;
      const az = time ? yearToZ(vis.edge.zStart, this.graph.axisMin, this.graph.axisMax, TIME_DEPTH) : 0;
      const bz = time
        ? yearToZ(vis.edge.zEnd ?? vis.edge.zStart, this.graph.axisMin, this.graph.axisMax, TIME_DEPTH)
        : 0;

      if (time && vis.edge.trace && Math.abs(bz - az) > 0.3) {
        this._placeSlab(vis.mesh, a.x, a.y, b.x, b.y, az, bz, vis.edge.type === 'romantic' ? 0.12 : 0.08);
      } else {
        const z = time ? (az + bz) / 2 : 0;
        const thick = vis.edge.momentary ? 0.045 : 0.07;
        this._placePrism(vis.mesh, a.x, a.y, z, b.x, b.y, z, thick, thick);
      }
    }
  }

  /** Straight box from A to B. Local Z is the long axis after lookAt. */
  _placePrism(mesh, ax, ay, az, bx, by, bz, ty, tz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.02;
    mesh.quaternion.identity();
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(ty, tz, len);
    mesh.up.copy(Y_AXIS);
    mesh.lookAt(bx, by, bz);
  }

  /** XY rectangle between two pins, extruded in Z over [z0, z1]. */
  _placeSlab(mesh, ax, ay, bx, by, z0, z1, thick) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 0.02;
    mesh.quaternion.identity();
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2);
    mesh.scale.set(len, thick, Math.max(0.08, Math.abs(z1 - z0)));
    mesh.rotation.set(0, 0, Math.atan2(dy, dx));
  }

  _makeTimeAxis() {
    const g = this.graph;
    const y0 = Math.ceil(g.axisMin / 10) * 10;
    const y1 = Math.floor(g.axisMax / 10) * 10;
    const x = -18;
    const y = -18;
    for (let year = y0; year <= y1; year += 10) {
      const z = yearToZ(year, g.axisMin, g.axisMax, TIME_DEPTH);
      const el = document.createElement('div');
      el.className = 'year-tick';
      el.textContent = String(year);
      const lab = new CSS2DObject(el);
      lab.position.set(x, y, z);
      this.axisGroup.add(lab);
    }
  }

  _placeCamera() {
    // Both views look straight down -Z at the XY association map with up = +Y,
    // so pin cylinders (rotated onto world Z) are orthogonal to the display and
    // point at the viewer. In time mode the focus plane is z = camZ (the
    // current year); scrolling/scrubbing travels through Z, zoom is distance.
    const zFocus = this.view === 'time' ? this.camZ : 0;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(this.camX, this.camY, zFocus + this.zoom);
    this.camera.lookAt(this.camX, this.camY, zFocus);
    this.camera.updateMatrixWorld();
  }

  _syncVisibility() {
    if (this.axisGroup) this.axisGroup.visible = this.view === 'time';
    const year = this.scrubYear;
    for (const vis of this.edgeVisuals) {
      const on = this.filters.has(vis.edge.type);
      vis.mesh.visible = on;
      if (on && this.view === 'time' && year != null) {
        const a = vis.edge.zStart;
        const b = vis.edge.zEnd ?? vis.edge.zStart;
        const hit = vis.edge.momentary ? Math.abs(a - year) < 1.2 : year >= a - 0.2 && year <= b + 0.2;
        vis.mesh.material = this.mat(vis.edge.color, hit ? 1 : 0.18);
      } else if (on) {
        vis.mesh.material = this.mat(vis.edge.color, 1);
      }
    }
  }

  _applyHighlight() {
    let focus = this.selected;
    if (!focus && this.hovered && !String(this.hovered).startsWith('edge:')) focus = this.hovered;
    const connected = new Set();
    if (focus && this.graph) {
      connected.add(focus);
      for (const e of this.graph.edges) {
        if (e.source === focus || e.target === focus) {
          connected.add(e.source);
          connected.add(e.target);
        }
      }
    }
    for (const vis of this.nodeMap.values()) {
      const active = connected.size === 0 || connected.has(vis.node.id);
      vis.el.classList.toggle('dim', connected.size > 0 && !active);
      vis.el.classList.toggle('sel', vis.node.id === this.selected);
      const show = connected.size === 0 ? vis.labeled : connected.has(vis.node.id);
      vis.el.style.display = show ? '' : 'none';
      vis.label.visible = show;
      vis.mesh.material = this.mat(KIND_FILL[vis.node.kind] || '#ccc', active ? (vis.node.kind === 'affiliation' ? 0.7 : 1) : 0.2);
    }
  }

  _setPointer(e) {
    const rect = this.labelRenderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _intersect(e) {
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits[0]?.object || null;
  }

  _onDragPlane(e, zConst) {
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this._plane.set(Z_AXIS, -zConst);
    return this.raycaster.ray.intersectPlane(this._plane, this._hit) ? this._hit : null;
  }

  _onDown(e) {
    if (e.button === 1) {
      e.preventDefault();
      this._mode = 'pan';
      this._last.x = e.clientX;
      this._last.y = e.clientY;
      this.labelRenderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const obj = this._intersect(e);
    if (obj?.userData.kind === 'node') {
      this._mode = 'pin';
      this._dragId = obj.userData.id;
      this._moved = false;
      this._last.x = e.clientX;
      this._last.y = e.clientY;
      this.labelRenderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    this._mode = null;
    this._dragId = null;
  }

  _onMove(e) {
    if (!this._mode) {
      const obj = this._intersect(e);
      const next = obj?.userData.kind === 'node' ? obj.userData.id : obj?.userData.kind === 'edge' ? `edge:${obj.userData.id}` : null;
      if (next !== this.hovered) {
        this.hovered = next;
        this._applyHighlight();
      }
      this.labelRenderer.domElement.style.cursor = obj?.userData.kind === 'node' ? 'grab' : this._mode === 'pan' ? 'grabbing' : 'default';
      return;
    }

    if (this._mode === 'pan') {
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last.x = e.clientX;
      this._last.y = e.clientY;
      const scale = this.zoom * 0.0028;
      this.camX -= dx * scale;
      this.camY += dy * scale;
      this._placeCamera();
      return;
    }

    if (this._mode === 'pin' && this._dragId) {
      if (Math.hypot(e.clientX - this._last.x, e.clientY - this._last.y) > 4) this._moved = true;
      const vis = this.nodeMap.get(this._dragId);
      const z = this.view === 'time' ? this._nodeZs(vis.node).zMid : 0;
      const hit = this._onDragPlane(e, z);
      if (!hit) return;
      const p = this.pos.get(this._dragId);
      p.x = hit.x;
      p.y = hit.y;
      this._layoutNodes();
      this._layoutEdges();
      this.labelRenderer.domElement.style.cursor = 'grabbing';
    }
  }

  _onUp(e) {
    if (this._mode === 'pin' && this._dragId && !this._moved) {
      this.select(this._dragId);
      this.onSelect?.({ kind: 'node', id: this._dragId });
    } else if (this._mode == null && e.button === 0) {
      const obj = this._intersect(e);
      if (obj?.userData.kind === 'edge') {
        this.select(null);
        this.onSelect?.({ kind: 'edge', id: obj.userData.id });
      } else if (!obj) {
        this.select(null);
        this.onSelect?.(null);
      }
    }
    this._mode = null;
    this._dragId = null;
    try {
      this.labelRenderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  _onWheel(e) {
    e.preventDefault();
    if (this.view === 'board') {
      const factor = Math.exp(e.deltaY * 0.0015);
      this.zoom = Math.min(160, Math.max(8, this.zoom * factor));
    } else {
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(e.deltaY * 0.0015);
        this.zoom = Math.min(160, Math.max(8, this.zoom * factor));
      } else {
        this.camZ -= e.deltaY * 0.04;
        if (this.graph) {
          const year =
            this.graph.axisMin + (this.camZ / TIME_DEPTH + 0.5) * (this.graph.axisMax - this.graph.axisMin);
          this.scrubYear = year;
          this.onTimeTravel?.(year);
        }
      }
    }
    this._placeCamera();
  }

  tick() {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
