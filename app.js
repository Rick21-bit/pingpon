const STORAGE_KEY = 'pingpon_session_v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const netCanvas = document.getElementById('net-canvas');
const netCtx = netCanvas.getContext('2d');

const CW = 720;
const CH = 420;
canvas.width = CW;
canvas.height = CH;
netCanvas.width = 320;
netCanvas.height = 240;

const INPUT_SIZE = 5;
const HIDDEN_SIZE = 4;
const OUTPUT_SIZE = 1;
const GENOME_LENGTH = INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE + HIDDEN_SIZE * OUTPUT_SIZE + OUTPUT_SIZE;
const POP_SIZE = 16;
const FRAMES_PER_EVAL = 600;

function rand(min, max) { return Math.random() * (max - min) + min; }

class Game {
  constructor() { this.reset(); }

  reset() {
    this.ball = { x: CW/2, y: CH/2, vx: rand(4,6) * (Math.random()<0.5?1:-1), vy: rand(-3,3), r: 6 };
    this.left = { x: 14, y: CH/2 - 35, w: 10, h: 70, vy: 0 };
    this.right = { x: CW - 24, y: CH/2 - 35, w: 10, h: 70, vy: 0 };
    this.leftScore = 0;
    this.rightScore = 0;
    this.hits = 0;
    this.frames = 0;
  }

  update(control) {
    const b = this.ball;
    b.x += b.vx;
    b.y += b.vy;

    if (b.y - b.r < 0 || b.y + b.r > CH) b.vy *= -1;

    const l = this.left;
    const targetL = b.y - l.h/2;
    l.y += (targetL - l.y) * 0.12;
    l.y = Math.max(0, Math.min(CH - l.h, l.y));

    const r = this.right;
    r.y += control * 5;
    r.y = Math.max(0, Math.min(CH - r.h, r.y));

    if (this.collide(b, l)) { b.vx = Math.abs(b.vx) * 1.05; b.x = l.x + l.w + b.r; }
    if (this.collide(b, r)) { b.vx = -Math.abs(b.vx) * 1.04; b.x = r.x - b.r; this.hits++; }

    if (b.x < 0) { this.rightScore++; this.respawn(1); }
    if (b.x > CW) { this.leftScore++; this.respawn(-1); }

    this.frames++;
  }

  collide(b, p) {
    return b.x - b.r < p.x + p.w && b.x + b.r > p.x &&
           b.y > p.y && b.y < p.y + p.h;
  }

  respawn(dir) {
    this.ball = { x: CW/2, y: CH/2, vx: rand(4,6) * dir, vy: rand(-3,3), r: 6 };
    this.left.y = CH/2 - 35;
    this.right.y = CH/2 - 35;
  }

  draw() {
    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, CW, CH);

    ctx.strokeStyle = '#1f232b';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(CW/2, 0);
    ctx.lineTo(CW/2, CH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(this.left.x, this.left.y, this.left.w, this.left.h);
    ctx.fillRect(this.right.x, this.right.y, this.right.w, this.right.h);

    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI*2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

    ctx.fillStyle = '#6b7280';
    ctx.font = '14px sans-serif';
    ctx.fillText(`AI hits: ${this.hits}`, CW/2 + 14, 24);
  }
}

function activate(x) { return Math.tanh(x); }

function forward(genome, inputs) {
  let ptr = 0;
  const hidden = [];
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    let sum = genome[ptr + HIDDEN_SIZE];
    for (let i = 0; i < INPUT_SIZE; i++) sum += inputs[i] * genome[ptr + i];
    hidden[h] = activate(sum);
    ptr += INPUT_SIZE + 1;
  }
  let out = genome[ptr + OUTPUT_SIZE];
  for (let h = 0; h < HIDDEN_SIZE; h++) out += hidden[h] * genome[ptr + h];
  return Math.tanh(out);
}

class Population {
  constructor() {
    this.genomes = Array.from({ length: POP_SIZE }, () => Array.from({ length: GENOME_LENGTH }, () => rand(-1, 1)));
    this.fitness = new Array(POP_SIZE).fill(0);
    this.generation = 1;
    this.current = 0;
    this.best = { genome: this.genomes[0], fitness: -Infinity };
  }

  evaluate(game) {
    const fitness = game.hits * 100 + game.frames * 0.1;
    this.fitness[this.current] = fitness;
    if (fitness > this.best.fitness) this.best = { genome: [...this.genomes[this.current]], fitness };
  }

  nextGenome() {
    this.current++;
    if (this.current >= POP_SIZE) {
      this.evolve();
      this.current = 0;
    }
  }

  evolve() {
    const paired = this.genomes.map((g, i) => ({ g, f: this.fitness[i] })).sort((a, b) => b.f - a.f);
    const elite = paired.slice(0, 4).map(p => p.g);
    const next = [];
    while (next.length < POP_SIZE) {
      const a = elite[Math.floor(Math.random() * elite.length)];
      const b = elite[Math.floor(Math.random() * elite.length)];
      const child = [];
      for (let i = 0; i < GENOME_LENGTH; i++) {
        let val = Math.random() < 0.5 ? a[i] : b[i];
        if (Math.random() < 0.15) val += rand(-0.3, 0.3);
        child.push(Math.max(-2, Math.min(2, val)));
      }
      next.push(child);
    }
    this.genomes = next;
    this.generation++;
    saveSession();
  }
}

function saveSession() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ generation: pop.generation, best: pop.best })); }
function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function getInputs(game) {
  return [
    game.ball.x / CW,
    game.ball.y / CH,
    game.ball.vx / 10,
    game.ball.vy / 10,
    (game.right.y + game.right.h/2) / CH
  ];
}

const game = new Game();
const pop = new Population();
const saved = loadSession();
if (saved && saved.generation > 1) {
  pop.generation = saved.generation;
  pop.best = saved.best;
}

let paused = false;

function step() {
  if (!paused) {
    const inputs = getInputs(game);
    const control = forward(pop.genomes[pop.current], inputs);
    game.update(control);

    if (game.frames >= FRAMES_PER_EVAL) {
      pop.evaluate(game);
      pop.nextGenome();
      game.reset();
      updateStats();
    }
  }
  game.draw();
  drawNetwork(pop.genomes[pop.current]);
  requestAnimationFrame(step);
}

function updateStats() {
  document.getElementById('gen').textContent = pop.generation;
  document.getElementById('member').textContent = pop.current + 1;
  document.getElementById('hits').textContent = game.hits;
  document.getElementById('best').textContent = Math.round(pop.best.fitness);
}

function drawNetwork(genome) {
  const w = netCanvas.width;
  const h = netCanvas.height;
  netCtx.clearRect(0, 0, w, h);

  const layers = [INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE];
  const positions = [];
  const layerX = [40, w/2, w - 40];
  for (let l = 0; l < layers.length; l++) {
    const yGap = h / (layers[l] + 1);
    for (let n = 0; n < layers[l]; n++) positions.push({ x: layerX[l], y: yGap * (n + 1), layer: l, index: n });
  }

  let ptr = 0;
  for (let hneuron = 0; hneuron < HIDDEN_SIZE; hneuron++) {
    const hiddenNode = positions.find(p => p.layer === 1 && p.index === hneuron);
    for (let i = 0; i < INPUT_SIZE; i++) {
      const inputNode = positions.find(p => p.layer === 0 && p.index === i);
      const weight = genome[ptr + i];
      netCtx.strokeStyle = weight > 0 ? `rgba(34,211,238,${Math.min(1, Math.abs(weight))})` : `rgba(248,113,113,${Math.min(1, Math.abs(weight))})`;
      netCtx.lineWidth = 1.5;
      netCtx.beginPath();
      netCtx.moveTo(inputNode.x, inputNode.y);
      netCtx.lineTo(hiddenNode.x, hiddenNode.y);
      netCtx.stroke();
    }
    ptr += INPUT_SIZE + 1;
  }

  const outputNode = positions.find(p => p.layer === 2);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    const hiddenNode = positions.find(p => p.layer === 1 && p.index === h);
    const weight = genome[ptr + h];
    netCtx.strokeStyle = weight > 0 ? `rgba(34,211,238,${Math.min(1, Math.abs(weight))})` : `rgba(248,113,113,${Math.min(1, Math.abs(weight))})`;
    netCtx.beginPath();
    netCtx.moveTo(hiddenNode.x, hiddenNode.y);
    netCtx.lineTo(outputNode.x, outputNode.y);
    netCtx.stroke();
  }

  for (const p of positions) {
    netCtx.beginPath();
    netCtx.arc(p.x, p.y, 8, 0, Math.PI*2);
    netCtx.fillStyle = p.layer === 2 ? '#60a5fa' : '#f0f1f3';
    netCtx.fill();
  }
}

document.getElementById('pause').onclick = () => { paused = !paused; document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause'; };
document.getElementById('new-session').onclick = () => { localStorage.removeItem(STORAGE_KEY); location.reload(); };

updateStats();
step();
