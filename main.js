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
  TORCH:  { id: 11, name: '松明',    color: 0xffcc55, solid: false, hardness: 0.1, torch: true, light: 14 },
};

const BLOCK_BY_ID = Object.values(BLOCKS).reduce((acc, b) => {
  acc[b.id] = b;
  return acc;
}, {});

const PLACEABLE = [
  BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.STONE, BLOCKS.COBBLESTONE, BLOCKS.SAND,
  BLOCKS.WOOD, BLOCKS.PLANK, BLOCKS.BRICK, BLOCKS.LEAVES, BLOCKS.TORCH,
];

// 採掘したときに手に入るブロック
const DROP_OF = {
  [BLOCKS.GRASS.id]: BLOCKS.DIRT.id,
  [BLOCKS.STONE.id]: BLOCKS.COBBLESTONE.id,
  [BLOCKS.WATER.id]: null,
};
function dropOf(id) { return id in DROP_OF ? DROP_OF[id] : id; }

// クラフトレシピ
const RECIPES = [
  { name: '板 ×4',     out: BLOCKS.PLANK.id,  n: 4, needs: [[BLOCKS.WOOD.id, 1]] },
  { name: '松明 ×4',   out: BLOCKS.TORCH.id,  n: 4, needs: [[BLOCKS.PLANK.id, 1]] },
  { name: 'レンガ ×1', out: BLOCKS.BRICK.id,  n: 1, needs: [[BLOCKS.COBBLESTONE.id, 2]] },
  { name: '石 ×1',     out: BLOCKS.STONE.id,  n: 1, needs: [[BLOCKS.COBBLESTONE.id, 1], [BLOCKS.SAND.id, 1]] },
  { name: '草 ×1',     out: BLOCKS.GRASS.id,  n: 1, needs: [[BLOCKS.DIRT.id, 2]] },
];

// ---------------------------------------------------------------------------
// ツール定義
// ---------------------------------------------------------------------------
const TIER_COLOR = { wood: 0x8b5a2b, stone: 0x8a8a8a, iron: 0xdcdcdc };
const TOOLS = {
  HAND:           { id: 0, name: '素手',       kind: 'hand',    tier: null,    speed: 1.0, damage: 2 },
  WOODEN_PICKAXE: { id: 1, name: '木のツルハシ', kind: 'pickaxe', tier: 'wood',  speed: 1.5, damage: 3 },
  STONE_PICKAXE:  { id: 2, name: '石のツルハシ', kind: 'pickaxe', tier: 'stone', speed: 2.2, damage: 4 },
  IRON_PICKAXE:   { id: 3, name: '鉄のツルハシ', kind: 'pickaxe', tier: 'iron',  speed: 3.0, damage: 5 },
  WOODEN_SWORD:   { id: 4, name: '木の剣',     kind: 'sword',   tier: 'wood',  speed: 1.0, damage: 5 },
  STONE_SWORD:    { id: 5, name: '石の剣',     kind: 'sword',   tier: 'stone', speed: 1.0, damage: 6 },
  IRON_SWORD:     { id: 6, name: '鉄の剣',     kind: 'sword',   tier: 'iron',  speed: 1.0, damage: 8 },
};
const TOOL_LIST = Object.values(TOOLS);

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
// テクスチャアトラス (16px ピクセルアートを手続き生成)
// 列 = ブロック ID、行 = 0:上面 1:側面 2:底面
// ---------------------------------------------------------------------------
const TILE = 16;
const ATLAS_COLS = 12;
const ATLAS_ROWS = 3;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeAtlas() {
  const cvs = document.createElement('canvas');
  cvs.width = TILE * ATLAS_COLS;
  cvs.height = TILE * ATLAS_ROWS;
  const ctx = cvs.getContext('2d');
  const rnd = mulberry32(20240920);
  const rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const scale = (c, k) => rgb(c).map(v => Math.max(0, Math.min(255, v * k)));
  const jitter = amt => 1 + (rnd() * 2 - 1) * amt;

  const put = (col, row, fn) => {
    const img = ctx.createImageData(TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * TILE + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, col * TILE, row * TILE);
  };
  const all = (col, fn) => { put(col, 0, fn); put(col, 1, fn); put(col, 2, fn); };

  const noisy = (base, amt) => () => scale(base, jitter(amt));
  const grassTop = () => scale(BLOCKS.GRASS.top, jitter(0.12));
  const dirt = noisy(BLOCKS.DIRT.color, 0.16);
  const grassEdge = Array.from({ length: TILE }, () => 3 + Math.floor(rnd() * 3));
  const grassSide = (x, y) => (y < grassEdge[x] ? grassTop() : dirt());

  const stone = () => scale(BLOCKS.STONE.color, rnd() < 0.12 ? 0.78 : jitter(0.1));
  const cobble = (x, y) => {
    const edge = (x % 5 === 0) || (y % 5 === 0) || ((x + y) % 7 === 0);
    return scale(BLOCKS.COBBLESTONE.color, edge ? 0.62 : jitter(0.14));
  };
  const woodCols = Array.from({ length: TILE }, () => 0.78 + rnd() * 0.42);
  const woodSide = (x) => scale(BLOCKS.WOOD.side, woodCols[x] * jitter(0.05));
  const woodTop = (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    return scale(BLOCKS.WOOD.top, (Math.floor(d) % 2 ? 0.8 : 1.05) * jitter(0.05));
  };
  const leaves = () => scale(BLOCKS.LEAVES.color, rnd() < 0.28 ? 0.55 : jitter(0.14));
  const sand = noisy(BLOCKS.SAND.color, 0.07);
  const plankRows = Array.from({ length: TILE }, () => 0.9 + rnd() * 0.2);
  const plank = (x, y) => {
    if (y % 4 === 3) return scale(BLOCKS.PLANK.color, 0.6);
    const seam = ((Math.floor(y / 4) % 2) * 8 + 7) % TILE;
    if (x === seam) return scale(BLOCKS.PLANK.color, 0.65);
    return scale(BLOCKS.PLANK.color, plankRows[y] * jitter(0.05));
  };
  const brick = (x, y) => {
    const row = Math.floor(y / 4);
    const mortar = (y % 4 === 3) || ((x + row * 4) % 8 === 7);
    return mortar ? scale(0xb8ab98, jitter(0.05)) : scale(BLOCKS.BRICK.color, jitter(0.1));
  };
  const water = (x, y) => scale(BLOCKS.WATER.color, 0.9 + 0.18 * Math.sin((x + y * 2) * 0.7) + (rnd() - 0.5) * 0.08);

  all(BLOCKS.AIR.id, () => [0, 0, 0]);
  put(BLOCKS.GRASS.id, 0, grassTop);
  put(BLOCKS.GRASS.id, 1, grassSide);
  put(BLOCKS.GRASS.id, 2, dirt);
  all(BLOCKS.DIRT.id, dirt);
  all(BLOCKS.STONE.id, stone);
  put(BLOCKS.WOOD.id, 0, woodTop);
  put(BLOCKS.WOOD.id, 1, woodSide);
  put(BLOCKS.WOOD.id, 2, woodTop);
  all(BLOCKS.LEAVES.id, leaves);
  all(BLOCKS.SAND.id, sand);
  all(BLOCKS.WATER.id, water);
  all(BLOCKS.PLANK.id, plank);
  all(BLOCKS.BRICK.id, brick);
  all(BLOCKS.COBBLESTONE.id, cobble);
  const torchHead = () => scale(0xffe08a, jitter(0.1));
  const torchSide = (x, y) => (y < 3 ? torchHead() : scale(0x7a5230, jitter(0.12)));
  put(BLOCKS.TORCH.id, 0, torchHead);
  put(BLOCKS.TORCH.id, 1, torchSide);
  put(BLOCKS.TORCH.id, 2, () => scale(0x5a3a20, 1));

  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// メッシュ生成 (不透明・半透明で別メッシュ、頂点 AO 付き)
// ---------------------------------------------------------------------------
const FACES = [
  { dir: [ 1, 0, 0], corners: [[1,0,0],[1,1,0],[1,0,1],[1,1,1]], normal: [1,0,0],  shade: 0.85, u: 2, v: 1, row: 1 },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,0,0],[0,1,0]], normal: [-1,0,0], shade: 0.85, u: 2, v: 1, row: 1 },
  { dir: [ 0, 1, 0], corners: [[0,1,1],[1,1,1],[0,1,0],[1,1,0]], normal: [0,1,0],  shade: 1.0,  u: 0, v: 2, row: 0 },
  { dir: [ 0,-1, 0], corners: [[0,0,0],[1,0,0],[0,0,1],[1,0,1]], normal: [0,-1,0], shade: 0.6,  u: 0, v: 2, row: 2 },
  { dir: [ 0, 0, 1], corners: [[1,0,1],[1,1,1],[0,0,1],[0,1,1]], normal: [0,0,1],  shade: 0.75, u: 0, v: 1, row: 1 },
  { dir: [ 0, 0,-1], corners: [[0,0,0],[0,1,0],[1,0,0],[1,1,0]], normal: [0,0,-1], shade: 0.75, u: 0, v: 1, row: 1 },
];
const AO_LEVELS = [0.45, 0.65, 0.82, 1.0];

function occludes(world, x, y, z) {
  const b = BLOCK_BY_ID[getBlock(world, x, y, z)];
  return !!(b && b.solid && !b.transparent);
}

function vertexAO(world, x, y, z, face, corner) {
  const base = [x + face.dir[0], y + face.dir[1], z + face.dir[2]];
  const s1 = [0, 0, 0], s2 = [0, 0, 0];
  s1[face.u] = corner[face.u] ? 1 : -1;
  s2[face.v] = corner[face.v] ? 1 : -1;
  const side1 = occludes(world, base[0] + s1[0], base[1] + s1[1], base[2] + s1[2]);
  const side2 = occludes(world, base[0] + s2[0], base[1] + s2[1], base[2] + s2[2]);
  const diag  = occludes(world, base[0] + s1[0] + s2[0], base[1] + s1[1] + s2[1], base[2] + s1[2] + s2[2]);
  if (side1 && side2) return AO_LEVELS[0];
  return AO_LEVELS[3 - (side1 + side2 + diag)];
}

// 松明の光を BFS で広げる (MC 風のブロックライト)
const light = new Uint8Array(WORLD_SIZE * WORLD_HEIGHT * WORLD_SIZE);
const LIGHT_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function computeLight(world) {
  light.fill(0);
  let queue = [];
  for (let i = 0; i < world.length; i++) {
    if (world[i] === BLOCKS.TORCH.id) { light[i] = BLOCKS.TORCH.light; queue.push(i); }
  }
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const lv = light[i] - 1;
      if (lv <= 0) continue;
      const x = i % WORLD_SIZE, y = Math.floor(i / (WORLD_SIZE * WORLD_SIZE)), z = Math.floor(i / WORLD_SIZE) % WORLD_SIZE;
      for (const d of LIGHT_DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (!inBounds(nx, ny, nz)) continue;
        const j = idx(nx, ny, nz);
        if (BLOCK_BY_ID[world[j]].solid) continue;
        if (light[j] < lv) { light[j] = lv; next.push(j); }
      }
    }
    queue = next;
  }
}
function lightAt(x, y, z) { return inBounds(x, y, z) ? light[idx(x, y, z)] : 0; }

function vertexLight(x, y, z, face, corner) {
  const base = [x + face.dir[0], y + face.dir[1], z + face.dir[2]];
  const s1 = [0, 0, 0], s2 = [0, 0, 0];
  s1[face.u] = corner[face.u] ? 1 : -1;
  s2[face.v] = corner[face.v] ? 1 : -1;
  const l = Math.max(
    lightAt(base[0], base[1], base[2]),
    lightAt(base[0] + s1[0], base[1] + s1[1], base[2] + s1[2]),
    lightAt(base[0] + s2[0], base[1] + s2[1], base[2] + s2[2]),
    lightAt(base[0] + s1[0] + s2[0], base[1] + s1[1] + s2[1], base[2] + s1[2] + s2[2]),
  );
  return l / BLOCKS.TORCH.light;
}

function buildMesh(world) {
  const opaque = { positions: [], normals: [], colors: [], uvs: [], torch: [], indices: [] };
  const water  = { positions: [], normals: [], colors: [], uvs: [], torch: [], indices: [] };
  computeLight(world);

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const id = getBlock(world, x, y, z);
        if (id === BLOCKS.AIR.id) continue;
        const block = BLOCK_BY_ID[id];
        const target = block.transparent ? water : opaque;

        if (block.torch) {
          for (const face of FACES) {
            const idxBase = target.positions.length / 3;
            for (const c of face.corners) {
              target.positions.push(x + 0.4375 + c[0] * 0.125, y + c[1] * 0.6, z + 0.4375 + c[2] * 0.125);
              target.normals.push(...face.normal);
              target.colors.push(1, 1, 1);
              target.uvs.push((id + c[face.u]) / ATLAS_COLS, (face.row + (1 - c[face.v])) / ATLAS_ROWS);
              target.torch.push(1);
            }
            target.indices.push(idxBase, idxBase + 1, idxBase + 2, idxBase + 2, idxBase + 1, idxBase + 3);
          }
          continue;
        }

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const neighbor = BLOCK_BY_ID[getBlock(world, nx, ny, nz)];

          if (block === neighbor) continue;
          if (neighbor && neighbor.solid && !neighbor.transparent) continue;
          if (block.transparent && neighbor && neighbor.transparent) continue;

          const idxBase = target.positions.length / 3;
          for (const c of face.corners) {
            const ao = block.transparent ? 1 : vertexAO(world, x, y, z, face, c);
            const l = face.shade * ao;
            target.positions.push(x + c[0], y + c[1], z + c[2]);
            target.normals.push(...face.normal);
            target.colors.push(l, l, l);
            target.uvs.push((id + c[face.u]) / ATLAS_COLS, (face.row + (1 - c[face.v])) / ATLAS_ROWS);
            target.torch.push(vertexLight(x, y, z, face, c));
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
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  geo.setAttribute('torch', new THREE.Float32BufferAttribute(mesh.torch, 1));
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

function collides(world, pos, radius = PLAYER_RADIUS, height = PLAYER_HEIGHT) {
  const minX = Math.floor(pos.x - radius);
  const maxX = Math.floor(pos.x + radius);
  const minY = Math.floor(pos.y);
  const maxY = Math.floor(pos.y + height - 0.01);
  const minZ = Math.floor(pos.z - radius);
  const maxZ = Math.floor(pos.z + radius);
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
      if (b && (b.solid || b.torch)) {
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
const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_DUSK = new THREE.Color(0xff8c4a);
const SKY_NIGHT = new THREE.Color(0x0d1230);

// 太陽の高さ (-1..1) から空の色を決める
function getSkyColor(elev) {
  const c = new THREE.Color();
  if (elev > 0.3) return c.copy(SKY_DAY);
  if (elev > 0) return c.lerpColors(SKY_DUSK, SKY_DAY, elev / 0.3);
  if (elev > -0.25) return c.lerpColors(SKY_NIGHT, SKY_DUSK, (elev + 0.25) / 0.25);
  return c.copy(SKY_NIGHT);
}

function sunElevation(time) {
  const t = (time % DAY_NIGHT_CYCLE) / DAY_NIGHT_CYCLE;
  return Math.sin((t - 0.125) * Math.PI * 2);
}

// ---------------------------------------------------------------------------
// ゲーム初期化
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const initialSkyColor = getSkyColor(1);
scene.background = initialSkyColor;
scene.fog = new THREE.Fog(initialSkyColor, 40, 120);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);

// ライト (太陽は昼夜サイクルで動く)
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.castShadow = true;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
sun.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
sun.shadow.camera.left = -52;
sun.shadow.camera.right = 52;
sun.shadow.camera.top = 52;
sun.shadow.camera.bottom = -52;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.target.position.set(WORLD_SIZE / 2, SEA_LEVEL, WORLD_SIZE / 2);
scene.add(sun, sun.target);
const SUN_LOW = new THREE.Color(0xffa060);
const SUN_HIGH = new THREE.Color(0xfff4e0);

const hemi = new THREE.HemisphereLight(0x87ceeb, 0x5a4a30, 0.5);
scene.add(hemi);
const NIGHT_HEMI = new THREE.Color(0x4a5a8a);

// 月明かり (太陽の反対側から、影なし)
const moon = new THREE.DirectionalLight(0x8fa0d0, 0);
moon.target.position.set(WORLD_SIZE / 2, SEA_LEVEL, WORLD_SIZE / 2);
scene.add(moon, moon.target);

// 雲 (二枚重ねで x 方向にループさせる)
const CLOUD_SPAN = 128;
const cloudCells = [];
for (let cx = 0; cx < CLOUD_SPAN / 4; cx++) {
  for (let cz = -8; cz < 24; cz++) {
    if (valueNoise(cx * 4, cz * 4, 14, 777) > 0.6) cloudCells.push([cx * 4, cz * 4]);
  }
}
const cloudGroup = new THREE.Group();
const cloudGeo = new THREE.BoxGeometry(4, 2, 4);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777, transparent: true, opacity: 0.85 });
for (const offset of [0, -CLOUD_SPAN]) {
  const inst = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCells.length);
  const m = new THREE.Matrix4();
  cloudCells.forEach(([x, z], i) => {
    m.setPosition(x + 2 + offset, 44, z + 2);
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  cloudGroup.add(inst);
}
scene.add(cloudGroup);

// ワールド
const world = createWorld();
generateTerrain(world, Math.floor(Math.random() * 10000));

const atlas = makeAtlas();
// 頂点属性 torch (0..1) を暖色の光として加算する
function withTorchLight(mat) {
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float torch;\nvarying float vTorch;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTorch = torch;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTorch;')
      .replace('#include <dithering_fragment>',
        'gl_FragColor.rgb += vTorch * vTorch * vec3(1.0, 0.78, 0.45) * diffuseColor.rgb * 1.7;\n#include <dithering_fragment>');
  };
  return mat;
}
const material = withTorchLight(new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true }));
const waterMat = withTorchLight(new THREE.MeshLambertMaterial({
  map: atlas,
  vertexColors: true,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
}));

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
  opaqueMesh.castShadow = true;
  opaqueMesh.receiveShadow = true;
  waterMesh = new THREE.Mesh(toGeometry(water), waterMat);
  waterMesh.receiveShadow = true;
  scene.add(opaqueMesh);
  scene.add(waterMesh);
}
rebuildMesh();

// ---------------------------------------------------------------------------
// 手に持っている道具 (一人称表示)
// ---------------------------------------------------------------------------
scene.add(camera);
const handGroup = new THREE.Group();
handGroup.position.set(0.55, -0.5, -0.9);
camera.add(handGroup);
let heldMesh = null;
let heldToolId = -1;
let swingT = 1;

function buildHeldItem(tool) {
  const g = new THREE.Group();
  const box = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const tier = TIER_COLOR[tool.tier];
  if (tool.kind === 'hand') {
    box(0.2, 0.2, 0.45, 0xd9a77a, 0, 0, 0);
    g.rotation.set(0.3, -0.4, 0.2);
  } else if (tool.kind === 'pickaxe') {
    box(0.07, 0.75, 0.07, 0x8b5a2b, 0, 0, 0);
    box(0.55, 0.1, 0.1, tier, 0, 0.36, 0);
    box(0.12, 0.16, 0.12, tier, -0.24, 0.3, 0);
    box(0.12, 0.16, 0.12, tier, 0.24, 0.3, 0);
    g.rotation.set(0.5, -0.9, 0.4);
  } else {
    box(0.08, 0.7, 0.025, tier, 0, 0.28, 0);
    box(0.06, 0.16, 0.06, tier, 0, 0.66, 0);
    box(0.26, 0.06, 0.06, 0x8b5a2b, 0, -0.08, 0);
    box(0.06, 0.24, 0.06, 0x5a3a1a, 0, -0.23, 0);
    g.rotation.set(0.6, -0.7, 0.5);
  }
  return g;
}

function updateHeldItem(dt = 0, mining = false) {
  if (heldToolId !== player.selectedTool) {
    if (heldMesh) handGroup.remove(heldMesh);
    heldMesh = buildHeldItem(TOOL_LIST[player.selectedTool]);
    handGroup.add(heldMesh);
    heldToolId = player.selectedTool;
  }
  if (mining && swingT >= 1) swingT = 0;
  swingT = Math.min(1, swingT + dt * 4);
  const s = Math.sin(swingT * Math.PI);
  handGroup.rotation.set(-s * 1.1, -s * 0.5, 0);
  handGroup.position.set(0.55 - s * 0.15, -0.5 - s * 0.1, -0.9);
}

function swingHeldItem() { swingT = 0; }

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
  maxHealth: 20,
  dead: false,
  invuln: 0,
  attackCd: 0,
  sinceHurt: 0,
  regenT: 0,
  knock: new THREE.Vector3(),
  kills: 0,
};

// スポーン地点を地面に合わせる
const spawnPoint = new THREE.Vector3(WORLD_SIZE / 2, WORLD_HEIGHT, WORLD_SIZE / 2);
{
  const cx = Math.floor(WORLD_SIZE / 2);
  const cz = Math.floor(WORLD_SIZE / 2);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (BLOCK_BY_ID[getBlock(world, cx, y, cz)].solid) {
      spawnPoint.set(cx + 0.5, y + 2, cz + 0.5);
      break;
    }
  }
  player.pos.copy(spawnPoint);
}

// ---------------------------------------------------------------------------
// 体力
// ---------------------------------------------------------------------------
const heartsEl = document.getElementById('hearts');
const hurtEl = document.getElementById('hurt');
const deathOverlay = document.getElementById('deathOverlay');
let hurtFlash = 0;
let shownHealth = -1;

for (let i = 0; i < 10; i++) {
  const h = document.createElement('span');
  h.className = 'heart';
  h.textContent = '♥';
  heartsEl.appendChild(h);
}

function renderHearts() {
  if (shownHealth === player.health) return;
  shownHealth = player.health;
  [...heartsEl.children].forEach((el, i) => {
    const v = player.health - i * 2;
    el.className = 'heart ' + (v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
  });
}

function damagePlayer(amount, from) {
  if (player.dead || gameMode === 'creative' || player.invuln > 0 || amount <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.invuln = 0.5;
  player.sinceHurt = 0;
  hurtFlash = 1;
  if (from) {
    const kx = player.pos.x - from.x, kz = player.pos.z - from.z;
    const len = Math.hypot(kx, kz) || 1;
    player.knock.set(kx / len * 7, 0, kz / len * 7);
    if (player.onGround) player.vel.y = 5;
  }
  if (player.health === 0) die();
}

function die() {
  player.dead = true;
  player.mining = false;
  mineHeld = false;
  deathOverlay.classList.remove('hidden');
  if (pointerLocked) document.exitPointerLock();
}

function respawn() {
  player.dead = false;
  player.health = player.maxHealth;
  player.pos.copy(spawnPoint);
  player.vel.set(0, 0, 0);
  player.knock.set(0, 0, 0);
  deathOverlay.classList.add('hidden');
  startGame();
}
document.getElementById('respawnBtn').addEventListener('click', respawn);

// ---------------------------------------------------------------------------
// 敵モブ (ゾンビ): 夜に湧いて追いかけてくる。日光で燃える
// ---------------------------------------------------------------------------
const MOB_TYPES = {
  zombie:  { radius: 0.3, height: 1.9, speed: 2.4, hp: 20, damage: 3, reach: 1.7, burns: true },
  creeper: { radius: 0.3, height: 1.7, speed: 2.6, hp: 20, damage: 0, reach: 2.6, burns: false },
};
const MOB_MAX = 8;
const EXPLOSION_RADIUS = 2.5;
const explosions = [];
const zombies = [];
const zombieGroup = new THREE.Group();
scene.add(zombieGroup);
const mobRaycaster = new THREE.Raycaster();
let spawnTimer = 0;

function makeFaceTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4f8a3a';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#3c6b2c';
  ctx.fillRect(0, 0, 8, 2);
  ctx.fillStyle = '#111';
  ctx.fillRect(1, 3, 2, 1);
  ctx.fillRect(5, 3, 2, 1);
  ctx.fillStyle = '#2a4a20';
  ctx.fillRect(3, 5, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const zombieFace = makeFaceTexture();

function buildZombieMesh() {
  const mats = {
    skin:  new THREE.MeshLambertMaterial({ color: 0x5a9a3f }),
    face:  new THREE.MeshLambertMaterial({ map: zombieFace }),
    shirt: new THREE.MeshLambertMaterial({ color: 0x2f8f8f }),
    pants: new THREE.MeshLambertMaterial({ color: 0x3b3f8a }),
  };
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const g = new THREE.Group();
  const s = mats.skin;
  const head = box(0.5, 0.5, 0.5, [s, s, s, s, mats.face, s], 0, 1.65, 0);
  const body = box(0.5, 0.75, 0.25, mats.shirt, 0, 1.025, 0);
  const armL = box(0.25, 0.75, 0.25, mats.skin, -0.375, 1.4, 0);
  const armR = box(0.25, 0.75, 0.25, mats.skin,  0.375, 1.4, 0);
  const legL = box(0.25, 0.65, 0.25, mats.pants, -0.125, 0.65, 0);
  const legR = box(0.25, 0.65, 0.25, mats.pants,  0.125, 0.65, 0);
  // 腕と脚は付け根を回転の中心にする
  for (const m of [armL, armR]) { m.geometry.translate(0, -0.375, 0); m.position.y = 1.4; }
  for (const m of [legL, legR]) { m.geometry.translate(0, -0.325, 0); m.position.y = 0.65; }
  armL.rotation.x = armR.rotation.x = -Math.PI / 2;
  g.add(head, body, armL, armR, legL, legR);
  return { group: g, parts: { head, armL, armR, legL, legR }, mats: Object.values(mats) };
}

function makeMottledTexture(base, dark, face) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(face ? 7 : 3);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    ctx.fillStyle = rnd() < 0.35 ? dark : base;
    ctx.fillRect(x, y, 1, 1);
  }
  if (face) {
    ctx.fillStyle = '#111';
    ctx.fillRect(1, 2, 2, 2); ctx.fillRect(5, 2, 2, 2);
    ctx.fillRect(3, 4, 2, 2); ctx.fillRect(2, 5, 1, 2); ctx.fillRect(5, 5, 1, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const creeperSkin = makeMottledTexture('#4fa04a', '#2f6e2c', false);
const creeperFace = makeMottledTexture('#4fa04a', '#2f6e2c', true);

function buildCreeperMesh() {
  const mats = {
    skin: new THREE.MeshLambertMaterial({ map: creeperSkin }),
    face: new THREE.MeshLambertMaterial({ map: creeperFace }),
  };
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const g = new THREE.Group();
  const sk = mats.skin;
  const head = box(0.5, 0.5, 0.5, [sk, sk, sk, sk, mats.face, sk], 0, 1.45, 0);
  const body = box(0.5, 0.75, 0.25, sk, 0, 0.825, 0);
  const legs = [[-0.125, 0.25], [0.125, 0.25], [-0.125, -0.25], [0.125, -0.25]].map(([x, z]) => {
    const l = box(0.25, 0.375, 0.25, sk, x, 0.375, z);
    l.geometry.translate(0, -0.1875, 0);
    return l;
  });
  g.add(head, body, ...legs);
  return { group: g, parts: { head, legs }, mats: Object.values(mats) };
}

function skyExposed(x, y, z) {
  for (let yy = Math.floor(y) + 2; yy < WORLD_HEIGHT; yy++) {
    if (BLOCK_BY_ID[getBlock(world, Math.floor(x), yy, Math.floor(z))].solid) return false;
  }
  return true;
}

function spawnMob(kind, x, y, z) {
  const type = MOB_TYPES[kind];
  const { group, parts, mats } = kind === 'creeper' ? buildCreeperMesh() : buildZombieMesh();
  const zb = {
    kind, type,
    fuse: 0,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    yaw: Math.random() * Math.PI * 2,
    hp: type.hp,
    onGround: false,
    attackCd: 0,
    hurtT: 0,
    swing: 0,
    wanderT: 0,
    wander: new THREE.Vector2(),
    burning: false,
    dead: false,
    deathT: 0,
    walkT: 0,
    group, parts, mats,
  };
  group.userData.zombie = zb;
  zombieGroup.add(group);
  zombies.push(zb);
  return zb;
}
const spawnZombie = (x, y, z) => spawnMob('zombie', x, y, z);

function removeZombie(zb) {
  zombieGroup.remove(zb.group);
  zb.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  zb.mats.forEach(m => m.dispose());
  zombies.splice(zombies.indexOf(zb), 1);
}

function trySpawnZombies() {
  if (gameMode !== 'survival' || zombies.length >= MOB_MAX) return;
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 16;
    const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
    const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
    if (x < 1 || z < 1 || x >= WORLD_SIZE - 1 || z >= WORLD_SIZE - 1) continue;
    let y = WORLD_HEIGHT - 1;
    while (y > 0 && !BLOCK_BY_ID[getBlock(world, x, y, z)].solid) y--;
    const ground = getBlock(world, x, y, z);
    if (ground !== BLOCKS.GRASS.id && ground !== BLOCKS.SAND.id && ground !== BLOCKS.DIRT.id) continue;
    if (getBlock(world, x, y + 1, z) !== BLOCKS.AIR.id || getBlock(world, x, y + 2, z) !== BLOCKS.AIR.id) continue;
    if (lightAt(x, y + 1, z) >= 8) continue; // 松明の明かりの中では湧かない
    spawnMob(Math.random() < 0.3 ? 'creeper' : 'zombie', x + 0.5, y + 1, z + 0.5);
    return;
  }
}

function mobInCrosshair() {
  if (zombies.length === 0) return null;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mobRaycaster.set(camera.position, dir);
  mobRaycaster.far = 4.5;
  const hits = mobRaycaster.intersectObjects(zombieGroup.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.zombie) o = o.parent;
    if (o && !o.userData.zombie.dead) return o.userData.zombie;
  }
  return null;
}

function attackMob(zb) {
  const tool = TOOL_LIST[player.selectedTool];
  zb.hp -= tool.damage;
  zb.hurtT = 0.3;
  const knock = tool.kind === 'sword' ? 8 : 6;
  const kx = zb.pos.x - player.pos.x, kz = zb.pos.z - player.pos.z;
  const len = Math.hypot(kx, kz) || 1;
  zb.vel.x = kx / len * knock;
  zb.vel.z = kz / len * knock;
  if (zb.onGround) zb.vel.y = 5;
  player.attackCd = tool.kind === 'sword' ? 0.35 : 0.5;
  swingHeldItem();
  if (zb.hp <= 0 && !zb.dead) {
    zb.dead = true;
    zb.deathT = 0;
    player.kills++;
  }
}

const HURT_COLOR = new THREE.Color(0x7a1010);
const FIRE_COLOR = new THREE.Color(0xff6a00);
const NO_EMISSIVE = new THREE.Color(0x000000);

function explode(center, radius) {
  let changed = false;
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  const r = Math.ceil(radius);
  for (let x = cx - r; x <= cx + r; x++) {
    for (let y = Math.max(1, cy - r); y <= cy + r; y++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (!inBounds(x, y, z)) continue;
        const d = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z);
        if (d <= radius && getBlock(world, x, y, z) !== BLOCKS.AIR.id) {
          setBlock(world, x, y, z, BLOCKS.AIR.id);
          changed = true;
        }
      }
    }
  }
  if (changed) rebuildMesh();

  const reach = radius * 2.2;
  const pd = center.distanceTo(new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z));
  if (pd < reach) damagePlayer(Math.round(12 * (1 - pd / reach)), center);
  for (const o of zombies) {
    if (!o.dead && o.pos.distanceTo(center) < radius * 2) {
      o.hp -= 10; o.hurtT = 0.3;
      if (o.hp <= 0) { o.dead = true; o.deathT = 0; }
    }
  }

  const m = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.9 })
  );
  m.position.copy(center);
  scene.add(m);
  explosions.push({ mesh: m, t: 0 });
}

function updateExplosions(dt) {
  for (const e of [...explosions]) {
    e.t += dt;
    e.mesh.scale.setScalar(1 + e.t * 2);
    e.mesh.material.opacity = Math.max(0, 0.9 - e.t * 2.2);
    if (e.t > 0.45) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      explosions.splice(explosions.indexOf(e), 1);
    }
  }
}

const FUSE_COLOR = new THREE.Color(0xffffff);

function updateZombie(zb, dt, daylight) {
  const type = zb.type;
  if (zb.dead) {
    zb.deathT += dt;
    zb.group.rotation.z = Math.min(Math.PI / 2, zb.deathT * 4);
    zb.group.position.y = zb.pos.y + Math.min(0.5, zb.deathT * 2);
    if (zb.deathT > 1.2) removeZombie(zb);
    return;
  }

  // ゾンビは日光で燃える
  zb.burning = type.burns && daylight > 0.12 && skyExposed(zb.pos.x, zb.pos.y, zb.pos.z);
  if (zb.burning) {
    zb.hp -= 2 * dt;
    if (zb.hp <= 0) { zb.dead = true; zb.deathT = 0; return; }
  }

  const toPlayer = new THREE.Vector2(player.pos.x - zb.pos.x, player.pos.z - zb.pos.z);
  const dist = toPlayer.length();
  if (dist > 60 || zb.pos.y < -10) { removeZombie(zb); return; }
  if (!type.burns && daylight > 0.12 && dist > 20) { removeZombie(zb); return; }

  let moveX = 0, moveZ = 0;
  const hunting = gameMode === 'survival' && !player.dead && dist < 24;
  if (hunting) {
    if (dist > 0.01) { moveX = toPlayer.x / dist; moveZ = toPlayer.y / dist; }
    zb.yaw = Math.atan2(moveX, moveZ);
  } else {
    zb.wanderT -= dt;
    if (zb.wanderT <= 0) {
      zb.wanderT = 2 + Math.random() * 3;
      if (Math.random() < 0.6) zb.wander.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
      else zb.wander.set(0, 0);
    }
    moveX = zb.wander.x; moveZ = zb.wander.y;
    if (moveX || moveZ) zb.yaw = Math.atan2(moveX, moveZ);
  }

  // クリーパー: 近づくと導火線に火がつき、1.5 秒で爆発
  if (zb.kind === 'creeper') {
    if (hunting && dist < type.reach) zb.fuse += dt;
    else zb.fuse = Math.max(0, zb.fuse - dt * 2);
    if (zb.fuse > 0) { moveX = 0; moveZ = 0; }
    if (zb.fuse >= 1.5) {
      explode(new THREE.Vector3(zb.pos.x, zb.pos.y + 0.8, zb.pos.z), EXPLOSION_RADIUS);
      removeZombie(zb);
      return;
    }
  }

  const speed = hunting ? type.speed : type.speed * 0.5;
  const moving = (moveX !== 0 || moveZ !== 0);

  // 移動 + 衝突 (壁に当たったら自動ジャンプ)
  const decay = Math.max(0, 1 - 6 * dt);
  zb.vel.x = zb.vel.x * decay + moveX * speed;
  zb.vel.z = zb.vel.z * decay + moveZ * speed;
  zb.vel.y += GRAVITY * dt;

  let blocked = false;
  const tryMove = (axis, delta) => {
    const next = zb.pos.clone();
    next[axis] += delta;
    if (!collides(world, next, type.radius, type.height)) {
      zb.pos[axis] = next[axis];
    } else if (axis === 'y') {
      if (delta < 0) zb.onGround = true;
      zb.vel.y = 0;
    } else {
      blocked = true;
    }
  };
  zb.onGround = false;
  tryMove('x', zb.vel.x * dt);
  tryMove('z', zb.vel.z * dt);
  const wasOnGround = zb.onGround;
  tryMove('y', zb.vel.y * dt);
  if (blocked && (zb.onGround || wasOnGround) && moving) zb.vel.y = JUMP_V * 0.8;
  zb.vel.x *= 0.9; zb.vel.z *= 0.9;

  // 近接攻撃 (ゾンビ)
  zb.attackCd -= dt;
  if (type.damage > 0 && hunting && dist < type.reach && Math.abs(player.pos.y - zb.pos.y) < 2 && zb.attackCd <= 0) {
    zb.attackCd = 1.0;
    zb.swing = 0.35;
    damagePlayer(type.damage, zb.pos);
  }

  // 見た目
  zb.walkT += dt * (moving ? 8 : 0);
  const s = Math.sin(zb.walkT) * 0.6 * (moving ? 1 : 0);
  if (zb.parts.armL) {
    zb.parts.legL.rotation.x = s;
    zb.parts.legR.rotation.x = -s;
    zb.swing = Math.max(0, zb.swing - dt);
    const armLift = -Math.PI / 2 - zb.swing * 2;
    zb.parts.armL.rotation.x = armLift + Math.sin(zb.walkT * 0.5) * 0.08;
    zb.parts.armR.rotation.x = armLift - Math.sin(zb.walkT * 0.5) * 0.08;
  } else {
    const [a, b, c, d] = zb.parts.legs;
    a.rotation.x = d.rotation.x = s;
    b.rotation.x = c.rotation.x = -s;
  }
  zb.hurtT = Math.max(0, zb.hurtT - dt);
  let emissive = zb.hurtT > 0 ? HURT_COLOR : zb.burning ? FIRE_COLOR : NO_EMISSIVE;
  let strength = zb.burning ? 0.5 + Math.random() * 0.5 : 1;
  if (zb.fuse > 0) {
    emissive = FUSE_COLOR;
    strength = 0.35 + 0.35 * Math.sin(zb.fuse * 28);
    zb.group.scale.setScalar(1 + zb.fuse * 0.25);
  } else {
    zb.group.scale.setScalar(1);
  }
  for (const m of zb.mats) { m.emissive.copy(emissive).multiplyScalar(strength); }

  zb.group.position.copy(zb.pos);
  zb.group.rotation.y = zb.yaw;
}

function updateMobs(dt, daylight) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = 1.5;
    if (daylight <= 0 && playing) trySpawnZombies();
  }
  for (const zb of [...zombies]) updateZombie(zb, dt, daylight);
  updateExplosions(dt);
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
  if (e.code === 'Escape' && craftOpen) toggleCraft();
  else if (e.code === 'Escape' && dragLook && playing) stopGame();
  if (e.code === 'KeyE' && (playing || craftOpen)) toggleCraft();
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const i = parseInt(e.code.slice(5), 10) - 1;
    if (i < PLACEABLE.length) selectSlot(i);
  }
  if (e.code === 'Digit0' && PLACEABLE.length >= 10) selectSlot(9);
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
  saveGame(true);
}

document.getElementById('startBtn').addEventListener('click', startGame);

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) {
    dragLook = false;
    hint.hidden = true;
  } else if (playing && !dragLook && !player.dead && !craftOpen) {
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
    if (dragMoved > 6) { player.mining = false; mineHeld = false; }
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

  const item = PLACEABLE[selected];
  if (gameMode === 'survival' && !takeItem(item.id, 1)) {
    toast(`${item.name}を持っていません (E でクラフト)`);
    return;
  }
  setBlock(world, px, py, pz, item.id);
  rebuildMesh();
}

canvas.addEventListener('mousedown', e => {
  if (!playing || isTouch) return;
  if (dragLook && e.button === 0) {
    dragging = true;
    dragMoved = 0;
  }
  if (e.button === 0) mineHeld = true;
  else if (e.button === 2) placeBlock(aimedBlock());
});

// ---------------------------------------------------------------------------
// タッチ操作 (タブレット / スマホ)
// ---------------------------------------------------------------------------
const joy = { x: 0, y: 0 };
let mineHeld = false;
let attackHeld = false;
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
holdButton('btnMine', () => { mineHeld = true; }, () => { mineHeld = false; player.mining = false; });
holdButton('btnAttack', () => { attackHeld = true; }, () => { attackHeld = false; });
holdButton('btnPlace', () => placeBlock(aimedBlock()));
holdButton('btnFly', () => { player.flying = !player.flying; });
holdButton('btnMenu', () => stopGame());
holdButton('btnCraft', () => toggleCraft());

window.addEventListener('mouseup', e => {
  if (e.button === 0) {
    player.mining = false;
    mineHeld = false;
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
    <span class="num">${(i + 1) % 10}</span>
    <div class="swatch" style="background:#${b.color.toString(16).padStart(6,'0')}"></div>
    <span class="label">${b.name}</span>
    <span class="count"></span>
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
// インベントリ
// ---------------------------------------------------------------------------
const inventory = Object.create(null);
const STARTER_KIT = [[BLOCKS.TORCH.id, 8], [BLOCKS.PLANK.id, 16], [BLOCKS.BRICK.id, 8], [BLOCKS.DIRT.id, 8]];

function countOf(id) { return inventory[id] || 0; }
function addItem(id, n) { inventory[id] = countOf(id) + n; renderHotbar(); }
function takeItem(id, n) {
  if (countOf(id) < n) return false;
  inventory[id] -= n;
  renderHotbar();
  return true;
}
function giveStarterKit() { for (const [id, n] of STARTER_KIT) addItem(id, n); }
function renderHotbar() {
  [...hotbar.children].forEach((el, i) => {
    const n = countOf(PLACEABLE[i].id);
    el.querySelector('.count').textContent = gameMode === 'creative' ? '∞' : n;
    el.classList.toggle('empty', gameMode === 'survival' && n === 0);
  });
}
giveStarterKit();

const toastEl = document.getElementById('toast');
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastT = 2.2;
}

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
  player.selectedTool = (player.selectedTool + 1) % TOOL_LIST.length;
  updateHeldItem();
}

function cycleGameMode() {
  gameMode = gameMode === 'survival' ? 'creative' : 'survival';
  renderHotbar();
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
const startFraction = parseFloat(new URLSearchParams(location.search).get('time'));
let gameTime = DAY_NIGHT_CYCLE * (Number.isFinite(startFraction) ? startFraction : 0.3); // 既定は朝
const coords = document.getElementById('coords');
const mineBar = document.getElementById('mineBar');
let autosaveT = 0;
const mineFill = document.getElementById('mineFill');

function getMiningTime(blockId) {
  const block = BLOCK_BY_ID[blockId];
  const tool = TOOL_LIST[player.selectedTool];
  const hardness = block ? (block.hardness || 0.5) : 0;
  const toolSpeed = tool.speed || 1;
  return Math.max(0.1, hardness / toolSpeed);
}

function update(dt) {
  gameTime += dt;

  // 昼夜サイクル更新 (太陽の高さ → 空の色・光・雲の流れ・水面の揺らぎ)
  const dayT = (gameTime % DAY_NIGHT_CYCLE) / DAY_NIGHT_CYCLE;
  const sunAngle = (dayT - 0.125) * Math.PI * 2;
  const elev = Math.sin(sunAngle);
  const daylight = Math.max(0, elev);
  const skyColor = getSkyColor(elev);
  scene.background = skyColor;
  scene.fog.color = skyColor;

  const sx = Math.cos(sunAngle) * 140, sy = elev * 140;
  sun.position.set(WORLD_SIZE / 2 + sx, SEA_LEVEL + sy, WORLD_SIZE / 2 + 50);
  sun.intensity = daylight * 1.5;
  sun.color.lerpColors(SUN_LOW, SUN_HIGH, Math.min(1, daylight * 2.5));
  sun.castShadow = elev > 0.04;
  moon.position.set(WORLD_SIZE / 2 - sx, SEA_LEVEL - sy, WORLD_SIZE / 2 - 30);
  moon.intensity = Math.max(0, -elev) * 0.35;
  hemi.color.lerpColors(NIGHT_HEMI, skyColor, Math.min(1, Math.max(0, elev + 0.25) * 2));
  hemi.intensity = 0.3 + daylight * 0.5;
  scene.fog.near = 30 + daylight * 20;

  cloudGroup.position.x = (gameTime * 0.7) % CLOUD_SPAN;
  waterMat.opacity = 0.66 + 0.06 * Math.sin(gameTime * 1.7);

  // 体力まわりのタイマー
  player.invuln = Math.max(0, player.invuln - dt);
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.sinceHurt += dt;
  if (!player.dead && player.health < player.maxHealth && player.sinceHurt > 5) {
    player.regenT += dt;
    if (player.regenT >= 2) {
      player.regenT = 0;
      player.health = Math.min(player.maxHealth, player.health + 1);
    }
  }
  hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
  hurtEl.style.opacity = hurtFlash * 0.7;
  heartsEl.hidden = gameMode !== 'survival';
  renderHearts();
  player.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));

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
  if (player.dead) { dx = 0; dz = 0; }

  const speed = player.flying ? FLY_SPEED : (keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT : SPEED);

  if (player.flying) {
    player.vel.x = dx * speed;
    player.vel.z = dz * speed;
    player.vel.y = 0;
    if (keys['Space']) player.vel.y =  speed;
    if (keys['ControlLeft'] || keys['ShiftLeft']) player.vel.y = -speed;
  } else {
    player.vel.x = dx * speed + player.knock.x;
    player.vel.z = dz * speed + player.knock.z;
    player.vel.y += GRAVITY * dt;
    if (keys['Space'] && player.onGround && !player.dead) player.vel.y = JUMP_V;
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
  const vyBefore = player.vel.y;
  tryMove('y', player.vel.y * dt);

  // 落下ダメージ (落下高さ - 3 ブロック分)
  if (player.onGround && vyBefore < 0 && !player.flying) {
    const fallHeight = vyBefore * vyBefore / (2 * -GRAVITY);
    if (fallHeight > 3.5) damagePlayer(Math.floor(fallHeight - 3));
  }

  // 落ちすぎ防止
  if (player.pos.y < -20) {
    player.pos.copy(spawnPoint);
    player.vel.set(0, 0, 0);
  }

  // カメラ位置
  camera.position.set(player.pos.x, player.pos.y + (player.dead ? 0.6 : EYE_HEIGHT), player.pos.z);

  // モブ更新
  updateMobs(dt, elev);

  // 採掘 / 攻撃
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = raycast(world, camera.position, dir, 6);

  if (mineHeld && !player.mining && !player.dead) {
    const zb = mobInCrosshair();
    if (zb) {
      if (player.attackCd <= 0) attackMob(zb);
    } else {
      startMining(hit);
    }
  }

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
        const drop = dropOf(targetBlock);
        if (gameMode === 'survival' && drop) addItem(drop, 1);
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

  // 攻撃ボタン (押しっぱなしで連続攻撃)
  if (attackHeld && !player.dead && player.attackCd <= 0) {
    const zb = mobInCrosshair();
    if (zb) attackMob(zb);
    else { player.attackCd = 0.3; swingHeldItem(); }
  }
  updateHeldItem(dt, player.mining);

  // トースト / オートセーブ
  toastT -= dt;
  if (toastT <= 0) toastEl.hidden = true;
  autosaveT += dt;
  if (autosaveT > 30 && playing && !player.dead) { autosaveT = 0; saveGame(true); }

  // UI更新
  const tool = TOOL_LIST[player.selectedTool];
  toolDisplay.textContent = `${tool.name}  攻撃${tool.damage} / 採掘×${tool.speed}  (T)`;
  modeDisplay.textContent = `Mode: ${gameMode} (C)`;

  const time = Math.floor((gameTime / DAY_NIGHT_CYCLE) * 24000) % 24000;
  const hours = Math.floor(time / 1000);
  const minutes = Math.floor((time % 1000) / 16.67);

  coords.textContent =
    `X:${player.pos.x.toFixed(1)}  Y:${player.pos.y.toFixed(1)}  Z:${player.pos.z.toFixed(1)}  ` +
    `Time: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}  ` +
    `撃破:${player.kills}  ${player.flying ? '[飛行]' : ''}`;
}

// ---------------------------------------------------------------------------
// クラフト
// ---------------------------------------------------------------------------
const craftOverlay = document.getElementById('craftOverlay');
const craftList = document.getElementById('craftList');
let craftOpen = false;

function canCraft(r) { return r.needs.every(([id, n]) => countOf(id) >= n); }

function renderCraft() {
  craftList.innerHTML = '';
  for (const r of RECIPES) {
    const row = document.createElement('div');
    row.className = 'recipe' + (canCraft(r) ? '' : ' nope');
    const need = r.needs.map(([id, n]) => `${BLOCK_BY_ID[id].name} ×${n}（所持 ${countOf(id)}）`).join(' ＋ ');
    row.innerHTML = `<div class="rname">${r.name}</div><div class="rneed">${need}</div><button class="tbtn small">作る</button>`;
    row.querySelector('button').addEventListener('click', () => craft(r));
    craftList.appendChild(row);
  }
}

function craft(r) {
  if (!canCraft(r)) { toast('材料が足りません'); return; }
  for (const [id, n] of r.needs) takeItem(id, n);
  addItem(r.out, r.n);
  toast(`${r.name} を作りました`);
  renderCraft();
}

function toggleCraft() {
  craftOpen = !craftOpen;
  craftOverlay.classList.toggle('hidden', !craftOpen);
  if (craftOpen) {
    renderCraft();
    if (pointerLocked) document.exitPointerLock();
  } else if (playing && !isTouch && !dragLook) {
    try { canvas.requestPointerLock(); } catch (_) {}
  }
}
document.getElementById('craftClose').addEventListener('click', toggleCraft);
document.getElementById('craftBtn').addEventListener('click', () => { if (!craftOpen) toggleCraft(); });

// ---------------------------------------------------------------------------
// セーブ / ロード (ブラウザの localStorage)
// ---------------------------------------------------------------------------
const SAVE_KEY = 'kotaCraft.save.v1';
const continueBtn = document.getElementById('continueBtn');

function bytesToB64(u8) {
  let str = '';
  for (let i = 0; i < u8.length; i += 8192) str += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(str);
}
function b64ToBytes(b64) {
  const str = atob(b64);
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
  return u8;
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; }
}
function updateContinueBtn() { continueBtn.disabled = !hasSave(); }

function saveGame(silent) {
  try {
    const data = {
      v: 1,
      world: bytesToB64(world),
      pos: player.pos.toArray(),
      yaw: player.yaw, pitch: player.pitch,
      health: player.health,
      inventory: { ...inventory },
      gameTime, gameMode,
      kills: player.kills,
      tool: player.selectedTool,
      spawn: spawnPoint.toArray(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (!silent) toast('セーブしました');
    updateContinueBtn();
    return true;
  } catch (_) {
    if (!silent) toast('セーブできませんでした');
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const bytes = b64ToBytes(d.world);
    if (bytes.length !== world.length) return false;
    world.set(bytes);
    player.pos.fromArray(d.pos);
    player.yaw = d.yaw; player.pitch = d.pitch;
    player.health = d.health;
    player.vel.set(0, 0, 0);
    player.kills = d.kills || 0;
    player.selectedTool = d.tool || 0;
    gameTime = d.gameTime;
    gameMode = d.gameMode || 'survival';
    if (d.spawn) spawnPoint.fromArray(d.spawn);
    for (const k of Object.keys(inventory)) delete inventory[k];
    Object.assign(inventory, d.inventory);
    for (const zb of [...zombies]) removeZombie(zb);
    rebuildMesh();
    renderHotbar();
    toast('ロードしました');
    return true;
  } catch (_) {
    toast('ロードできませんでした');
    return false;
  }
}

function newWorld() {
  world.fill(0);
  generateTerrain(world, Math.floor(Math.random() * 10000));
  const cx = Math.floor(WORLD_SIZE / 2), cz = Math.floor(WORLD_SIZE / 2);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (BLOCK_BY_ID[getBlock(world, cx, y, cz)].solid) { spawnPoint.set(cx + 0.5, y + 2, cz + 0.5); break; }
  }
  player.pos.copy(spawnPoint);
  player.vel.set(0, 0, 0);
  player.health = player.maxHealth;
  player.kills = 0;
  player.dead = false;
  gameTime = DAY_NIGHT_CYCLE * 0.3;
  for (const k of Object.keys(inventory)) delete inventory[k];
  giveStarterKit();
  for (const zb of [...zombies]) removeZombie(zb);
  rebuildMesh();
  toast('新しいワールドを生成しました');
}

continueBtn.addEventListener('click', () => { if (loadGame()) startGame(); });
document.getElementById('saveBtn').addEventListener('click', () => saveGame(false));
document.getElementById('newWorldBtn').addEventListener('click', () => { newWorld(); startGame(); });
updateContinueBtn();

window.__kota = { player, zombies, spawnZombie, spawnMob, inventory, saveGame, loadGame, addItem, world, setBlock, rebuildMesh, BLOCKS };

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
