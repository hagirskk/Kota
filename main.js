import * as THREE from 'three';

// ---------------------------------------------------------------------------
// ブロック定義 (Minecraft 風の色合い)
// ---------------------------------------------------------------------------
const BLOCKS = {
  AIR:    { id: 0, name: 'Air',    color: 0x000000, solid: false },
  GRASS:  { id: 1, name: '草',      color: 0x7fb238, top: 0x7fb238, side: 0x8f7853, solid: true, hardness: 0.6 },
  DIRT:   { id: 2, name: '土',      color: 0x8f7853, solid: true, hardness: 0.5 },
  STONE:  { id: 3, name: '石',      color: 0x7e7e7e, solid: true, hardness: 1.5 },
  WOOD:   { id: 4, name: '原木',    color: 0x6b4423, side: 0x634521, top: 0x7f5e2e, solid: true, hardness: 2.0 },
  LEAVES: { id: 5, name: '葉',      color: 0x58a020, solid: true, hardness: 0.2 },
  SAND:   { id: 6, name: '砂',      color: 0xdcc48e, solid: true, hardness: 0.5 },
  WATER:  { id: 7, name: '水',      color: 0x3a6dd9, solid: false, transparent: true },
  PLANK:  { id: 8, name: '板',      color: 0xc29866, solid: true, hardness: 2.0 },
  BRICK:  { id: 9, name: 'レンガ',  color: 0xaa4a33, solid: true, hardness: 1.8 },
  COBBLESTONE: { id: 10, name: '丸石', color: 0x696969, solid: true, hardness: 2.0 },
};

const BLOCK_BY_ID = Object.values(BLOCKS).reduce((acc, b) => {
  acc[b.id] = b;
  return acc;
}, {});

const PLACEABLE = [BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.STONE, BLOCKS.WOOD, BLOCKS.PLANK, BLOCKS.BRICK];

// ---------------------------------------------------------------------------
// ツール定義
// ---------------------------------------------------------------------------
const TOOLS = {
  HAND: { id: 0, name: '素手', speed: 1.0 },
  WOODEN_PICKAXE: { id: 1, name: '木のツルハシ', speed: 1.2 },
  STONE_PICKAXE: { id: 2, name: '石のツルハシ', speed: 1.8 },
  IRON_PICKAXE: { id: 3, name: '鉄のツルハシ', speed: 2.5 },
};

const TOOL_NAMES = Object.values(TOOLS).map(t => t.name);

// ---------------------------------------------------------------------------
// ワールド設定
// ---------------------------------------------------------------------------
const WORLD_SIZE = 64;      // X,Z の幅
const WORLD_HEIGHT = 32;    // Y
const SEA_LEVEL = 8;

// 3Dボクセル配列
function createWorld() {
  const data = new Uint8Array(WORLD_SIZE * WORLD_HEIGHT * WORLD_SIZE);
  return data;
}

function idx(x, y, z) {
  return x + WORLD_SIZE * (z + WORLD_SIZE * y);
}

function inBounds(x, y, z) {
  return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < WORLD_SIZE;
}

function getBlock(world, x, y, z) {
  if (!inBounds(x, y, z)) return BLOCKS.AIR.id;
  return world[idx(x, y, z)];
}

function setBlock(world, x, y, z, id) {
  if (!inBounds(x, y, z)) return;
  world[idx(x, y, z)] = id;
}

// ---------------------------------------------------------------------------
// 疑似ノイズ (Valueノイズ + バイリニア補間)
// ---------------------------------------------------------------------------
function hash2(x, z, seed = 1337) {
  let h = x * 374761393 + z * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, z, scale, seed) {
  const xs = x / scale;
  const zs = z / scale;
  const x0 = Math.floor(xs), z0 = Math.floor(zs);
  const tx = smooth(xs - x0), tz = smooth(zs - z0);
  const a = hash2(x0,     z0,     seed);
  const b = hash2(x0 + 1, z0,     seed);
  const c = hash2(x0,     z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

function fbm(x, z, seed) {
  let v = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * freq, z * freq, 16, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / norm;
}

// ---------------------------------------------------------------------------
// 地形生成
// ---------------------------------------------------------------------------
function generateTerrain(world, seed = 1) {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const n = fbm(x, z, seed);
      const h = Math.floor(4 + n * 16);
      for (let y = 0; y <= h; y++) {
        let b;
        if (y === h && y >= SEA_LEVEL) b = BLOCKS.GRASS.id;
        else if (y === h && y < SEA_LEVEL) b = BLOCKS.SAND.id;
        else if (y > h - 3) b = BLOCKS.DIRT.id;
        else b = BLOCKS.STONE.id;
        setBlock(world, x, y, z, b);
      }
      // 水で海を埋める
      for (let y = h + 1; y < SEA_LEVEL; y++) {
        setBlock(world, x, y, z, BLOCKS.WATER.id);
      }
    }
  }
  // 石も生成
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let y = 1; y < 10; y++) {
        if (Math.random() < 0.05 && getBlock(world, x, y, z) === BLOCKS.STONE.id) {
          setBlock(world, x, y, z, BLOCKS.COBBLESTONE.id);
        }
      }
    }
  }
  // 木を生やす
  for (let i = 0; i < 30; i++) {
    const tx = Math.floor(Math.random() * WORLD_SIZE);
    const tz = Math.floor(Math.random() * WORLD_SIZE);
    let ty = WORLD_HEIGHT - 1;
    while (ty > 0 && getBlock(world, tx, ty, tz) === BLOCKS.AIR.id) ty--;
    if (getBlock(world, tx, ty, tz) !== BLOCKS.GRASS.id) continue;
    const trunkH = 4 + Math.floor(Math.random() * 2);
    for (let k = 1; k <= trunkH; k++) setBlock(world, tx, ty + k, tz, BLOCKS.WOOD.id);
    // 葉
    const top = ty + trunkH;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dz) + dy > 4) continue;
          const px = tx + dx, py = top + dy, pz = tz + dz;
          if (!inBounds(px, py, pz)) continue;
          if (getBlock(world, px, py, pz) === BLOCKS.AIR.id) {
            setBlock(world, px, py, pz, BLOCKS.LEAVES.id);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// メッシュ生成 (不透明・半透明で別メッシュ)
// ---------------------------------------------------------------------------
const FACES = [
  { dir: [ 1, 0, 0], corners: [[1,0,0],[1,1,0],[1,0,1],[1,1,1]], normal: [1,0,0], shade: 0.85 },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,0,0],[0,1,0]], normal: [-1,0,0], shade: 0.85 },
  { dir: [ 0, 1, 0], corners: [[0,1,1],[1,1,1],[0,1,0],[1,1,0]], normal: [0,1,0], shade: 1.0 },
  { dir: [ 0,-1, 0], corners: [[0,0,0],[1,0,0],[0,0,1],[1,0,1]], normal: [0,-1,0], shade: 0.6 },
  { dir: [ 0, 0, 1], corners: [[1,0,1],[1,1,1],[0,0,1],[0,1,1]], normal: [0,0,1], shade: 0.75 },
  { dir: [ 0, 0,-1], corners: [[0,0,0],[0,1,0],[1,0,0],[1,1,0]], normal: [0,0,-1], shade: 0.75 },
];

function buildMesh(world) {
  const opaque = { positions: [], normals: [], colors: [], indices: [] };
  const water  = { positions: [], normals: [], colors: [], indices: [] };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const id = getBlock(world, x, y, z);
        if (id === BLOCKS.AIR.id) continue;
        const block = BLOCK_BY_ID[id];
        const target = block.transparent ? water : opaque;

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const neighborId = getBlock(world, nx, ny, nz);
          const neighbor = BLOCK_BY_ID[neighborId];

          // 不透明同士の面は描画しない
          if (block === neighbor) continue;
          if (neighbor && neighbor.solid && !neighbor.transparent) continue;
          if (block.transparent && neighbor && neighbor.transparent) continue;

          const idxBase = target.positions.length / 3;
          let color = block.color;
          if (block === BLOCKS.GRASS) {
            if (face.dir[1] === 1) color = block.top;
            else if (face.dir[1] === -1) color = BLOCKS.DIRT.color;
            else color = block.color;
          }
          const r = ((color >> 16) & 0xff) / 255 * face.shade;
          const g = ((color >> 8) & 0xff) / 255 * face.shade;
          const b = (color & 0xff) / 255 * face.shade;

          for (const c of face.corners) {
            target.positions.push(x + c[0], y + c[1], z + c[2]);
            target.normals.push(...face.normal);
            target.colors.push(r, g, b);
          }
          target.indices.push(idxBase, idxBase + 1, idxBase + 2, idxBase + 2, idxBase + 1, idxBase + 3);
        }
      }
    }
  }
  return { opaque, water };
}

function toGeometry(mesh) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
  geo.setIndex(mesh.indices);
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// プレイヤー・衝突
// ---------------------------------------------------------------------------
const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.6;

function isSolidAt(world, x, y, z) {
  const b = BLOCK_BY_ID[getBlock(world, Math.floor(x), Math.floor(y), Math.floor(z))];
  return b && b.solid;
}

function collides(world, pos) {
  const minX = Math.floor(pos.x - PLAYER_RADIUS);
  const maxX = Math.floor(pos.x + PLAYER_RADIUS);
  const minY = Math.floor(pos.y);
  const maxY = Math.floor(pos.y + PLAYER_HEIGHT - 0.01);
  const minZ = Math.floor(pos.z - PLAYER_RADIUS);
  const maxZ = Math.floor(pos.z + PLAYER_RADIUS);
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (isSolidAt(world, x + 0.5, y + 0.5, z + 0.5)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// レイキャスト (DDA)
// ---------------------------------------------------------------------------
function raycast(world, origin, direction, maxDist = 8) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(direction.x) || 1;
  const stepY = Math.sign(direction.y) || 1;
  const stepZ = Math.sign(direction.z) || 1;

  const tDeltaX = Math.abs(1 / direction.x);
  const tDeltaY = Math.abs(1 / direction.y);
  const tDeltaZ = Math.abs(1 / direction.z);

  const fracX = origin.x - x;
  const fracY = origin.y - y;
  const fracZ = origin.z - z;

  let tMaxX = tDeltaX * (stepX > 0 ? 1 - fracX : fracX);
  let tMaxY = tDeltaY * (stepY > 0 ? 1 - fracY : fracY);
  let tMaxZ = tDeltaZ * (stepZ > 0 ? 1 - fracZ : fracZ);

  let face = null;

  while (true) {
    if (inBounds(x, y, z)) {
      const id = getBlock(world, x, y, z);
      const b = BLOCK_BY_ID[id];
      if (b && b.solid) {
        return { x, y, z, face };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) return null;
      x += stepX;
      face = [-stepX, 0, 0];
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) return null;
      y += stepY;
      face = [0, -stepY, 0];
      tMaxY += tDeltaY;
    } else {
      if (tMaxZ > maxDist) return null;
      z += stepZ;
      face = [0, 0, -stepZ];
      tMaxZ += tDeltaZ;
    }
  }
}

// ---------------------------------------------------------------------------
// 昼夜サイクル
// ---------------------------------------------------------------------------
const DAY_NIGHT_CYCLE = 120; // 秒単位
function getSkyColor(time) {
  const t = (time % DAY_NIGHT_CYCLE) / DAY_NIGHT_CYCLE;
  let color;
  if (t < 0.25) { // 夜から朝
    const x = t * 4;
    color = new THREE.Color().lerpColors(new THREE.Color(0x1a1a2e), new THREE.Color(0x87ceeb), x);
  } else if (t < 0.5) { // 昼
    color = new THREE.Color(0x87ceeb);
  } else if (t < 0.75) { // 昼から夜
    const x = (t - 0.5) * 4;
    color = new THREE.Color().lerpColors(new THREE.Color(0x87ceeb), new THREE.Color(0xff6b35), x);
  } else { // 夜
    const x = (t - 0.75) * 4;
    color = new THREE.Color().lerpColors(new THREE.Color(0xff6b35), new THREE.Color(0x1a1a2e), x);
  }
  return color;
}

// ---------------------------------------------------------------------------
// ゲーム初期化
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const initialSkyColor = getSkyColor(0);
scene.background = initialSkyColor;
scene.fog = new THREE.Fog(initialSkyColor, 40, 120);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);

// ライト
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(40, 80, 30);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// ワールド
const world = createWorld();
generateTerrain(world, Math.floor(Math.random() * 10000));

const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const waterMat = new THREE.MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});

let opaqueMesh = null;
let waterMesh = null;

function rebuildMesh() {
  const { opaque, water } = buildMesh(world);
  if (opaqueMesh) {
    scene.remove(opaqueMesh);
    opaqueMesh.geometry.dispose();
  }
  if (waterMesh) {
    scene.remove(waterMesh);
    waterMesh.geometry.dispose();
  }
  opaqueMesh = new THREE.Mesh(toGeometry(opaque), material);
  waterMesh = new THREE.Mesh(toGeometry(water), waterMat);
  scene.add(opaqueMesh);
  scene.add(waterMesh);
}
rebuildMesh();

// ハイライト枠
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
highlight.visible = false;
scene.add(highlight);

// ---------------------------------------------------------------------------
// プレイヤー状態
// ---------------------------------------------------------------------------
const player = {
  pos: new THREE.Vector3(WORLD_SIZE / 2, WORLD_HEIGHT, WORLD_SIZE / 2),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: false,
  flying: false,
  selectedTool: 0,
  mining: false,
  miningStart: 0,
  miningTarget: null,
  health: 20,
  hunger: 20,
};

// スポーン地点を地面に合わせる
{
  const cx = Math.floor(WORLD_SIZE / 2);
  const cz = Math.floor(WORLD_SIZE / 2);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (BLOCK_BY_ID[getBlock(world, cx, y, cz)].solid) {
      player.pos.set(cx + 0.5, y + 2, cz + 0.5);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------
const keys = Object.create(null);
window.addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyF') player.flying = !player.flying;
  if (e.code === 'KeyC') cycleGameMode();
  if (e.code === 'KeyT') cycleTool();
  if (e.code === 'Escape' && dragLook && playing) stopGame();
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const i = parseInt(e.code.slice(5), 10) - 1;
    if (i < PLACEABLE.length) selectSlot(i);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ポインターロックが使えない環境 (埋め込み iframe など) ではドラッグで視点操作する
const isTouch = window.matchMedia('(pointer: coarse)').matches;
let pointerLocked = false;
let dragLook = false;
let playing = false;
let dragging = false;
let dragMoved = 0;
const canvas = renderer.domElement;
canvas.tabIndex = 0;
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');

function startGame() {
  playing = true;
  overlay.classList.add('hidden');
  if (isTouch) {
    dragLook = true;
    document.body.classList.add('touch');
    return;
  }
  canvas.focus();
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (_) {}
  setTimeout(() => {
    if (!pointerLocked && playing) {
      dragLook = true;
      hint.hidden = false;
    }
  }, 400);
}

function stopGame() {
  playing = false;
  dragging = false;
  player.mining = false;
  mineHeld = false;
  hint.hidden = true;
  document.body.classList.remove('touch');
  overlay.classList.remove('hidden');
}

document.getElementById('startBtn').addEventListener('click', startGame);

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) {
    dragLook = false;
    hint.hidden = true;
  } else if (playing && !dragLook) {
    stopGame();
  }
});

function rotateView(mx, my, sens) {
  player.yaw   -= mx * sens;
  player.pitch -= my * sens;
  const lim = Math.PI / 2 - 0.01;
  if (player.pitch >  lim) player.pitch =  lim;
  if (player.pitch < -lim) player.pitch = -lim;
}

document.addEventListener('mousemove', e => {
  if (pointerLocked) {
    rotateView(e.movementX, e.movementY, 0.0025);
  } else if (dragLook && dragging) {
    rotateView(e.movementX, e.movementY, 0.004);
    dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (dragMoved > 6) player.mining = false;
  }
});

function aimedBlock() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return raycast(world, camera.position, dir, 6);
}

function startMining(hit) {
  if (!hit) return;
  player.mining = true;
  player.miningStart = performance.now();
  player.miningTarget = hit;
}

function placeBlock(hit) {
  if (!hit || !hit.face) return;
  const px = hit.x + hit.face[0];
  const py = hit.y + hit.face[1];
  const pz = hit.z + hit.face[2];
  if (!inBounds(px, py, pz)) return;
  if (getBlock(world, px, py, pz) !== BLOCKS.AIR.id) return;

  const p = player.pos;
  const overlap =
    p.x + PLAYER_RADIUS > px && p.x - PLAYER_RADIUS < px + 1 &&
    p.y + PLAYER_HEIGHT > py && p.y < py + 1 &&
    p.z + PLAYER_RADIUS > pz && p.z - PLAYER_RADIUS < pz + 1;
  if (overlap) return;

  setBlock(world, px, py, pz, PLACEABLE[selected].id);
  rebuildMesh();
}

canvas.addEventListener('mousedown', e => {
  if (!playing || isTouch) return;
  if (dragLook && e.button === 0) {
    dragging = true;
    dragMoved = 0;
  }
  if (e.button === 0) startMining(aimedBlock());
  else if (e.button === 2) placeBlock(aimedBlock());
});

// ---------------------------------------------------------------------------
// タッチ操作 (タブレット / スマホ)
// ---------------------------------------------------------------------------
const joy = { x: 0, y: 0 };
let mineHeld = false;
const joyBase = document.getElementById('joy');
const joyKnob = document.getElementById('joyKnob');
const JOY_RADIUS = 40;

let joyTouchId = null;
let lookTouchId = null;
let lookLast = { x: 0, y: 0 };

joyBase.addEventListener('touchstart', e => {
  e.preventDefault();
  if (joyTouchId !== null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  updateJoy(t);
}, { passive: false });

joyBase.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) updateJoy(t);
}, { passive: false });

const endJoy = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null;
      joy.x = 0; joy.y = 0;
      joyKnob.style.transform = 'translate(0px, 0px)';
    }
  }
};
joyBase.addEventListener('touchend', endJoy);
joyBase.addEventListener('touchcancel', endJoy);

function updateJoy(t) {
  const r = joyBase.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2);
  let dy = t.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
  joy.x = dx / JOY_RADIUS;
  joy.y = dy / JOY_RADIUS;
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!playing || lookTouchId !== null) return;
  const t = e.changedTouches[0];
  lookTouchId = t.identifier;
  lookLast = { x: t.clientX, y: t.clientY };
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier !== lookTouchId) continue;
    rotateView(t.clientX - lookLast.x, t.clientY - lookLast.y, 0.005);
    lookLast = { x: t.clientX, y: t.clientY };
  }
}, { passive: false });

const endLook = e => {
  for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
};
canvas.addEventListener('touchend', endLook);
canvas.addEventListener('touchcancel', endLook);

function holdButton(id, onDown, onUp) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); el.classList.add('down'); onDown(); }, { passive: false });
  const up = e => { e.preventDefault(); el.classList.remove('down'); if (onUp) onUp(); };
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
}

holdButton('btnJump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
holdButton('btnDown', () => { keys['ShiftLeft'] = true; }, () => { keys['ShiftLeft'] = false; });
holdButton('btnMine', () => { mineHeld = true; startMining(aimedBlock()); }, () => { mineHeld = false; player.mining = false; });
holdButton('btnPlace', () => placeBlock(aimedBlock()));
holdButton('btnFly', () => { player.flying = !player.flying; });
holdButton('btnMenu', () => stopGame());

window.addEventListener('mouseup', e => {
  if (e.button === 0) {
    player.mining = false;
    dragging = false;
  }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('wheel', e => {
  if (!playing) return;
  selectSlot((selected + (e.deltaY > 0 ? 1 : -1) + PLACEABLE.length) % PLACEABLE.length);
}, { passive: true });

// ---------------------------------------------------------------------------
// ホットバー UI & ツール表示
// ---------------------------------------------------------------------------
let selected = 0;
const hotbar = document.getElementById('hotbar');
let gameMode = 'survival'; // survival or creative

PLACEABLE.forEach((b, i) => {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.innerHTML = `
    <span class="num">${i + 1}</span>
    <div class="swatch" style="background:#${b.color.toString(16).padStart(6,'0')}"></div>
    <span class="label">${b.name}</span>
  `;
  slot.addEventListener('click', () => selectSlot(i));
  hotbar.appendChild(slot);
});

function selectSlot(i) {
  selected = i;
  [...hotbar.children].forEach((el, k) => el.classList.toggle('active', k === i));
}
selectSlot(0);

// ツール表示
const toolDisplay = document.createElement('div');
toolDisplay.id = 'toolDisplay';
toolDisplay.style.cssText = `
  position: absolute;
  bottom: 120px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px 15px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
`;
document.body.appendChild(toolDisplay);

// ゲームモード表示
const modeDisplay = document.createElement('div');
modeDisplay.id = 'modeDisplay';
modeDisplay.style.cssText = `
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px 15px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
`;
document.body.appendChild(modeDisplay);

function cycleTool() {
  player.selectedTool = (player.selectedTool + 1) % Object.keys(TOOLS).length;
}

function cycleGameMode() {
  gameMode = gameMode === 'survival' ? 'creative' : 'survival';
}

toolDisplay.addEventListener('click', cycleTool);
modeDisplay.addEventListener('click', cycleGameMode);

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------
const GRAVITY = -28;
const JUMP_V = 9;
const SPEED = 5;
const SPRINT = 8;
const FLY_SPEED = 12;

let last = performance.now();
let gameTime = 0;
const coords = document.getElementById('coords');
const mineBar = document.getElementById('mineBar');
const mineFill = document.getElementById('mineFill');

function getMiningTime(blockId) {
  const block = BLOCK_BY_ID[blockId];
  const tool = Object.values(TOOLS)[player.selectedTool];
  const hardness = block ? (block.hardness || 0.5) : 0;
  const toolSpeed = tool.speed || 1;
  return Math.max(0.1, hardness / toolSpeed);
}

function update(dt) {
  gameTime += dt;

  // 昼夜サイクル更新
  const skyColor = getSkyColor(gameTime);
  scene.background = skyColor;
  scene.fog.color = skyColor;

  // カメラ向き
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // 入力ベクトル
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right   = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let dx = 0, dz = 0;
  if (keys['KeyW']) { dx += forward.x; dz += forward.z; }
  if (keys['KeyS']) { dx -= forward.x; dz -= forward.z; }
  if (keys['KeyD']) { dx += right.x;   dz += right.z; }
  if (keys['KeyA']) { dx -= right.x;   dz -= right.z; }
  dx += forward.x * -joy.y + right.x * joy.x;
  dz += forward.z * -joy.y + right.z * joy.x;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }

  const speed = player.flying ? FLY_SPEED : (keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT : SPEED);

  if (player.flying) {
    player.vel.x = dx * speed;
    player.vel.z = dz * speed;
    player.vel.y = 0;
    if (keys['Space']) player.vel.y =  speed;
    if (keys['ControlLeft'] || keys['ShiftLeft']) player.vel.y = -speed;
  } else {
    player.vel.x = dx * speed;
    player.vel.z = dz * speed;
    player.vel.y += GRAVITY * dt;
    if (keys['Space'] && player.onGround) player.vel.y = JUMP_V;
  }

  // 軸ごとに移動 + 衝突
  player.onGround = false;

  const tryMove = (axis, delta) => {
    const next = player.pos.clone();
    next[axis] += delta;
    if (!collides(world, next)) {
      player.pos[axis] = next[axis];
    } else {
      if (axis === 'y') {
        if (delta < 0) player.onGround = true;
        player.vel.y = 0;
      }
    }
  };

  tryMove('x', player.vel.x * dt);
  tryMove('z', player.vel.z * dt);
  tryMove('y', player.vel.y * dt);

  // 落ちすぎ防止
  if (player.pos.y < -20) {
    player.pos.set(WORLD_SIZE / 2, WORLD_HEIGHT, WORLD_SIZE / 2);
    player.vel.set(0, 0, 0);
  }

  // カメラ位置
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);

  // 採掘処理
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = raycast(world, camera.position, dir, 6);

  if (mineHeld && !player.mining) startMining(hit);

  let mineProgress = 0;
  if (player.mining && player.miningTarget) {
    const t = player.miningTarget;
    const targetBlock = getBlock(world, t.x, t.y, t.z);
    if (hit && hit.x === t.x && hit.y === t.y && hit.z === t.z && targetBlock !== BLOCKS.AIR.id) {
      const elapsed = (performance.now() - player.miningStart) / 1000;
      const miningTime = gameMode === 'creative' ? 0 : getMiningTime(targetBlock);
      if (elapsed >= miningTime) {
        setBlock(world, t.x, t.y, t.z, BLOCKS.AIR.id);
        rebuildMesh();
        player.mining = false;
      } else {
        mineProgress = elapsed / miningTime;
      }
    } else {
      player.mining = false;
    }
  }
  mineBar.hidden = mineProgress === 0;
  mineFill.style.width = `${Math.round(mineProgress * 100)}%`;

  // ハイライト
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  // UI更新
  const tool = Object.values(TOOLS)[player.selectedTool];
  toolDisplay.textContent = `Tool: ${tool.name} (T)`;
  modeDisplay.textContent = `Mode: ${gameMode} (C)`;

  const time = Math.floor((gameTime / DAY_NIGHT_CYCLE) * 24000) % 24000;
  const hours = Math.floor(time / 1000);
  const minutes = Math.floor((time % 1000) / 16.67);

  coords.textContent =
    `X:${player.pos.x.toFixed(1)}  Y:${player.pos.y.toFixed(1)}  Z:${player.pos.z.toFixed(1)}  ` +
    `Time: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}  ` +
    `${player.flying ? '[飛行]' : ''}`;
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
