import { Course, obstacleSize } from './course.js';
import { playerColor } from './protocol.js';
import { DAY, sceneForDistance } from './scene.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.course = new Course(0);
    this.localId = null;
    this.current = null;
    this.previous = null;
    this.receivedAt = 0;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  resetRace(seed, localId) {
    this.course = new Course(seed);
    this.course.ensure(2500);
    this.localId = localId;
    this.current = null;
    this.previous = null;
  }

  setSnapshot(snapshot) {
    this.previous = this.current;
    this.current = snapshot;
    if (!this.previous) this.previous = snapshot;
    this.receivedAt = performance.now();
  }

  sample(now) {
    if (!this.current) return null;
    const alpha = Math.min(1, Math.max(0, (now - this.receivedAt) / 65));
    const players = this.current.players.map(player => {
      const previous = this.previous?.players.find(candidate => candidate.id === player.id) || player;
      return {
        ...player,
        distance: previous.distance + (player.distance - previous.distance) * alpha,
        y: previous.y + (player.y - previous.y) * alpha,
      };
    });
    return { ...this.current, players };
  }

  drawIdle(time, players) {
    const ctx = this.ctx;
    const ground = this.height * (this.height < 650 ? 0.91 : 0.75);
    this.drawEnvironment(time * 35, time, ground);
    const count = Math.max(2, Math.min(4, players.length || 3));
    for (let index = 0; index < count; index += 1) {
      const x = this.width * (0.12 + index * 0.09);
      const bounce = Math.abs(Math.sin(time * 8 + index)) * 3;
      drawDino(ctx, x, ground - bounce, 0.9, playerColor(index), { phase: Math.floor(time * 10 + index) % 2, grounded: true });
    }
    drawObstacle(ctx, { type: 'cactus-group' }, this.width * 0.49, ground, 0.85, time);
    drawObstacle(ctx, { type: 'cactus-small' }, this.width * 0.58, ground, 0.7, time);
  }

  drawRace(now) {
    const snapshot = this.sample(now);
    if (!snapshot) return;
    const ctx = this.ctx;
    const local = snapshot.players.find(player => player.id === this.localId);
    const camera = local || [...snapshot.players].sort((a, b) => b.distance - a.distance)[0];
    if (!camera) return;
    const ground = this.height * (this.width < 680 ? 0.68 : 0.74);
    const scale = Math.max(0.72, Math.min(1.12, this.width / 1050));
    const anchor = this.width < 680 ? 78 : Math.min(250, this.width * 0.23);
    const scene = sceneForDistance(camera.distance);
    this.course.ensure(camera.distance + this.width / scale + 1800);
    this.drawEnvironment(camera.distance, now / 1000, ground, scene.theme, scene.nightAmount);

    for (const obstacle of this.course.obstacles) {
      const x = anchor + (obstacle.x - camera.distance) * scale;
      if (x < -100) continue;
      if (x > this.width + 100) break;
      drawObstacle(ctx, obstacle, x, ground, scale, now / 1000, scene.theme);
    }

    const ordered = [...snapshot.players].sort((a, b) => Number(a.id === this.localId) - Number(b.id === this.localId));
    for (const player of ordered) {
      const playerIndex = snapshot.players.findIndex(candidate => candidate.id === player.id);
      const laneOffset = (playerIndex - (snapshot.players.length - 1) / 2) * 24;
      const x = anchor + (player.distance - camera.distance) * scale + laneOffset;
      if (x < -100 || x > this.width + 100) continue;
      const y = ground - player.y * scale;
      if (player.immuneTime > 0 && Math.floor(now / 90) % 2 === 0) ctx.globalAlpha = 0.35;
      else ctx.globalAlpha = player.out ? 0.45 : 1;
      if (player.grounded && !player.out && player.speed > 0) this.drawDust(x, ground, scale, now / 1000, player.id, scene.theme);
      drawDino(ctx, x, y, scale, playerColor(player.character), {
        phase: Math.floor(player.distance / 35) % 2,
        grounded: player.grounded,
        ducking: player.ducking || player.out,
        ink: scene.theme.ink,
        background: scene.theme.background,
      });
      ctx.globalAlpha = 1;
      this.drawNameTag(player, x, y, scale, playerIndex % 2 * 13, scene.theme);
    }
  }

  drawEnvironment(distance, time, ground, theme = DAY, nightAmount = 0) {
    const ctx = this.ctx;
    const celestialX = this.width * 0.78;
    const celestialY = this.height * 0.22;
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.width, this.height);

    if (nightAmount > 0) {
      ctx.fillStyle = '#e7e3d8';
      for (let index = 0; index < 28; index += 1) {
        const x = (index * 173 + 41) % Math.max(1, this.width);
        const y = 70 + (index * 67) % Math.max(100, ground - 160);
        const twinkle = 0.55 + Math.sin(time * 2 + index) * 0.25;
        ctx.globalAlpha = nightAmount * twinkle;
        const size = index % 4 === 0 ? 3 : 2;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = nightAmount;
      ctx.fillStyle = '#e7e3d8';
      ctx.beginPath();
      ctx.arc(celestialX, celestialY, 43, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.background;
      ctx.beginPath();
      ctx.arc(celestialX + 18, celestialY - 12, 39, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1 - nightAmount;
    ctx.fillStyle = '#f1c75b';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e7b849';
    ctx.lineWidth = 2;
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(celestialX + Math.cos(angle) * 58, celestialY + Math.sin(angle) * 58);
      ctx.lineTo(celestialX + Math.cos(angle) * 67, celestialY + Math.sin(angle) * 67);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = theme.cloud;
    for (let index = 0; index < 5; index += 1) {
      const x = ((index * 330 - distance * 0.08) % (this.width + 400) + this.width + 400) % (this.width + 400) - 180;
      const y = 105 + (index % 3) * 55;
      ctx.fillRect(Math.round(x), y, 72, 8);
      ctx.fillRect(Math.round(x + 16), y - 8, 36, 8);
    }

    ctx.fillStyle = theme.dune;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    for (let x = 0; x <= this.width + 100; x += 100) {
      const world = x + distance * 0.12;
      ctx.lineTo(x, ground - 50 - Math.sin(world / 260) * 28 - Math.sin(world / 113) * 10);
    }
    ctx.lineTo(this.width, ground);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(ground) + 0.5);
    ctx.lineTo(this.width, Math.round(ground) + 0.5);
    ctx.stroke();

    ctx.fillStyle = theme.detail;
    const offset = -((distance * 0.7) % 150);
    for (let x = offset - 150; x < this.width + 150; x += 150) {
      ctx.fillRect(Math.round(x + 24), ground + 17, 20, 2);
      ctx.fillRect(Math.round(x + 86), ground + 35, 8, 2);
      ctx.fillRect(Math.round(x + 118), ground + 10, 4, 2);
    }
  }

  drawDust(x, ground, scale, time, id, theme) {
    const ctx = this.ctx;
    const seed = [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    ctx.fillStyle = theme.dust;
    for (let index = 0; index < 3; index += 1) {
      const phase = (time * 2.8 + index / 3 + seed) % 1;
      const size = Math.max(2, (1 - phase) * 6) * scale;
      ctx.globalAlpha = (1 - phase) * 0.55;
      ctx.fillRect(x - (22 + phase * 45) * scale, ground - (5 + index * 3 + phase * 12) * scale, size, size);
    }
    ctx.globalAlpha = 1;
  }

  drawNameTag(player, x, y, scale, labelLift = 0, theme = DAY) {
    const ctx = this.ctx;
    const label = player.id === this.localId ? 'YOU' : player.name;
    ctx.font = '700 10px ui-monospace, monospace';
    const width = Math.min(120, ctx.measureText(label).width + 14);
    const top = y - (player.ducking ? 57 : 86) * scale - labelLift;
    ctx.fillStyle = player.id === this.localId ? theme.ink : theme.background;
    ctx.fillRect(Math.round(x - width / 2), Math.round(top - 15), Math.round(width), 19);
    ctx.fillStyle = player.id === this.localId ? theme.background : theme.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, top - 5, 106);
    if (player.out) {
      ctx.fillStyle = '#d97968';
      ctx.fillText('OUT', x, top - 27);
    }
  }
}

function drawDino(ctx, x, y, scale, color, options = {}) {
  const { phase = 0, grounded = true, ducking = false, ink = DAY.ink, background = DAY.background } = options;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;

  if (ducking) {
    ctx.beginPath();
    ctx.moveTo(-18, -24);
    ctx.lineTo(-39, -18);
    ctx.lineTo(-24, -10);
    ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-20, -31, 42, 23);
    ctx.strokeRect(-20, -31, 42, 23);
    ctx.fillRect(8, -40, 34, 23);
    ctx.strokeRect(8, -40, 34, 23);
    ctx.fillStyle = background;
    ctx.fillRect(31, -35, 5, 5);
    ctx.fillStyle = ink;
    ctx.fillRect(33, -34, 3, 3);
    const leg = grounded && phase ? 7 : 0;
    ctx.fillRect(-11, -9, 8, 9 - leg);
    ctx.fillRect(9, -9, 8, 9 - (7 - leg));
  } else {
    ctx.beginPath();
    ctx.moveTo(-17, -39);
    ctx.lineTo(-43, -29);
    ctx.lineTo(-23, -20);
    ctx.lineTo(-8, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-23, -45, 34, 31);
    ctx.strokeRect(-23, -45, 34, 31);
    ctx.fillRect(3, -57, 17, 24);
    ctx.strokeRect(3, -57, 17, 24);
    ctx.fillRect(8, -68, 35, 23);
    ctx.strokeRect(8, -68, 35, 23);
    ctx.fillRect(10, -39, 18, 5);
    ctx.fillRect(23, -35, 5, 7);
    ctx.fillStyle = background;
    ctx.fillRect(31, -62, 6, 6);
    ctx.fillStyle = ink;
    ctx.fillRect(34, -61, 3, 3);
    const firstLeg = grounded && phase ? 5 : 0;
    const secondLeg = grounded && !phase ? 5 : 0;
    ctx.fillRect(-15, -15, 9, 15 - firstLeg);
    ctx.fillRect(3, -15, 9, 15 - secondLeg);
    ctx.fillRect(-16, -4 - firstLeg, 14, 4);
    ctx.fillRect(2, -4 - secondLeg, 14, 4);
  }
  ctx.restore();
}

function drawObstacle(ctx, obstacle, x, ground, scale, time, theme = DAY) {
  const size = obstacleSize(obstacle.type);
  const y = ground - size.y * scale;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.fillStyle = theme.cactus;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;

  if (obstacle.type.startsWith('bird')) {
    ctx.fillStyle = theme.bird;
    const wing = Math.floor(time * 9) % 2 === 0;
    ctx.beginPath();
    ctx.moveTo(-24, -14);
    ctx.lineTo(-9, -20);
    ctx.lineTo(wing ? -2 : 5, wing ? -36 : -5);
    ctx.lineTo(8, -18);
    ctx.lineTo(22, -22);
    ctx.lineTo(25, -13);
    ctx.lineTo(8, -7);
    ctx.lineTo(-8, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.background;
    ctx.fillRect(15, -19, 4, 4);
  } else if (obstacle.type === 'cactus-group') {
    drawCactus(ctx, -21, 0, 0.72, theme);
    drawCactus(ctx, 2, 0, 1, theme);
    drawCactus(ctx, 24, 0, 0.63, theme);
  } else {
    drawCactus(ctx, 0, 0, obstacle.type === 'cactus-large' ? 1.25 : 0.85, theme);
  }
  ctx.restore();
}

function drawCactus(ctx, x, y, scale, theme) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillRect(-8, -54, 16, 54);
  ctx.strokeRect(-8, -54, 16, 54);
  ctx.fillRect(-19, -39, 11, 23);
  ctx.strokeRect(-19, -39, 11, 23);
  ctx.fillRect(8, -32, 11, 18);
  ctx.strokeRect(8, -32, 11, 18);
  ctx.fillStyle = theme.cactusLight;
  ctx.fillRect(-4, -49, 3, 42);
  ctx.restore();
}

export function drawCharacterPreview(canvas, character) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  drawDino(ctx, 27, 60, 0.72, playerColor(character), { phase: 0, grounded: true });
}
