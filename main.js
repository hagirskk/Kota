import * as THREE from 'three';

// ---------------------------------------------------------------------------
// ブロック定義
// ---------------------------------------------------------------------------
const BLOCKS = {
  AIR:    { id: 0, name: 'Air',    color: 0x000000, solid: false },
  GRASS:  { id: 1, name: '草',      color: 0x5eb24a, top: 0x6fd24a, side: 0x7a5a3a, solid: true },
  DIRT:   { id: 2, name: '土',      color: 0x8b5a2b, solid: true },
  STONE:  { id: 3, name: '石',      color: 0x888888, solid: true },
  WOOD:   { id: 4, name: '木',      color: 0x6b4423, solid: true },
  LEAVES: { id: 5, name: '葉',      color: 0x2d7a2d, solid: true },
  SAND:   { id: 6, name: '砂',      color: 0xe6d28a, solid: true },
  WATER:  { id: 7, name: '水',      color: 0x3a6dd9, solid: false, transparent: true },
  PLANK:  { id: 8, name: '板',      color: 0xc29866, solid: true },
  BRICK:  { id: 9, name: 'レンガ',  color: 0xaa4a33, solid: true },
};

const BLOCK_BY_ID = Object.values(BLOCKS).reduce((acc, b) => {
  acc[b.id] = b;
  return acc;
}, {});

const PLACEABLE = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.WOOD, BLOCKS.PLANK, BLOCKS.BRICK];

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
// ゲーム初期化
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 120);

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
  keys[e.code] = true;
  if (e.code === 'KeyF') player.flying = !player.flying;
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const i = parseInt(e.code.slice(5), 10) - 1;
    if (i < PLACEABLE.length) selectSlot(i);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

let pointerLocked = false;
const canvas = renderer.domElement;

document.getElementById('startBtn').addEventListener('click', () => {
  canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  document.getElementById('overlay').classList.toggle('hidden', pointerLocked);
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  player.yaw   -= e.movementX * 0.0025;
  player.pitch -= e.movementY * 0.0025;
  const lim = Math.PI / 2 - 0.01;
  if (player.pitch >  lim) player.pitch =  lim;
  if (player.pitch < -lim) player.pitch = -lim;
});

canvas.addEventListener('mousedown', e => {
  if (!pointerLocked) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position;
  const hit = raycast(world, origin, dir, 6);
  if (!hit) return;

  if (e.button === 0) {
    // 破壊
    setBlock(world, hit.x, hit.y, hit.z, BLOCKS.AIR.id);
    rebuildMesh();
  } else if (e.button === 2) {
    // 設置
    if (!hit.face) return;
    const px = hit.x + hit.face[0];
    const py = hit.y + hit.face[1];
    const pz = hit.z + hit.face[2];
    if (!inBounds(px, py, pz)) return;
    if (getBlock(world, px, py, pz) !== BLOCKS.AIR.id) return;

    const newPos = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    // 自分に重ならないか簡易チェック
    const pb = { minX: px, minY: py, minZ: pz, maxX: px+1, maxY: py+1, maxZ: pz+1 };
    const overlap =
      newPos.x + PLAYER_RADIUS > pb.minX && newPos.x - PLAYER_RADIUS < pb.maxX &&
      newPos.y + PLAYER_HEIGHT > pb.minY && newPos.y < pb.maxY &&
      newPos.z + PLAYER_RADIUS > pb.minZ && newPos.z - PLAYER_RADIUS < pb.maxZ;
    if (overlap) return;

    setBlock(world, px, py, pz, PLACEABLE[selected].id);
    rebuildMesh();
  }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('wheel', e => {
  if (!pointerLocked) return;
  selectSlot((selected + (e.deltaY > 0 ? 1 : -1) + PLACEABLE.length) % PLACEABLE.length);
}, { passive: true });

// ---------------------------------------------------------------------------
// ホットバー UI
// ---------------------------------------------------------------------------
let selected = 0;
const hotbar = document.getElementById('hotbar');
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

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------
const GRAVITY = -28;
const JUMP_V = 9;
const SPEED = 5;
const SPRINT = 8;
const FLY_SPEED = 12;

let last = performance.now();
const coords = document.getElementById('coords');

function update(dt) {
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
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }
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
      // 軽くオフセットしてめり込み回避
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

  // ハイライト
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = raycast(world, camera.position, dir, 6);
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  coords.textContent =
    `X:${player.pos.x.toFixed(1)}  Y:${player.pos.y.toFixed(1)}  Z:${player.pos.z.toFixed(1)}  ` +
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
