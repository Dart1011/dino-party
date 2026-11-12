import { sceneForDistance } from './scene.js';
import { POWERUPS } from './powerups.js';

const CONFETTI = ['#f4c44e', '#e86f4c', '#73a98b', '#78a7d8', '#b18bd4', '#fff3cf'];

export class Effects {
  constructor() {
    this.reset();
  }

  reset() {
    this.particles = [];
    this.texts = [];
    this.waves = [];
    this.boostAt = new Map();
    this.landAt = new Map();
    this.hitAt = new Map();
    this.footsteps = new Map();
    this.shakeUntil = 0;
    this.shakeDuration = 1;
    this.shakeStrength = 0;
    this.nextMilestone = 1;
    this.lastUpdate = 0;
  }

  laneFor(player, snapshot) {
    const index = snapshot.players.findIndex(candidate => candidate.id === player.id);
    return (index - (snapshot.players.length - 1) / 2) * 24;
  }

  handle(events, localId, snapshot) {
    if (!snapshot) return;
    const now = performance.now();
    for (const event of events) {
      if (event.type === 'obstacle-break') {
        const obstacle = { id: event.id, distance: event.x, y: event.y };
        const theme = sceneForDistance(event.x).theme;
        this.debris(obstacle, 0, theme, event.obstacleType);
        this.text(obstacle, 0, event.obstacleType.startsWith('bird') ? 'BIRD DOWN!' : 'SMASH!', POWERUPS[event.powerup].color);
        this.wave(obstacle, 0, POWERUPS[event.powerup].color, 75, 0.4);
        if (event.id === localId) {
          this.shakeUntil = now + 110;
          this.shakeDuration = 110;
          this.shakeStrength = 3;
        }
        continue;
      }
      if (event.type === 'explosion') {
        const blast = { distance: event.x, y: event.y };
        this.wave(blast, 0, POWERUPS[event.powerup].color, 145, 0.55);
        this.text(blast, 0, 'BOOM!', POWERUPS[event.powerup].color);
        continue;
      }
      const player = snapshot.players.find(candidate => candidate.id === event.id);
      if (!player) continue;
      const lane = this.laneFor(player, snapshot);
      const theme = sceneForDistance(player.distance).theme;
      if (event.type === 'jump') this.dust(player, lane, theme, 6, 1.2);
      if (event.type === 'double-jump') {
        this.wave(player, lane, '#fff3cf', 66, 0.35);
        this.dust(player, lane, theme, 8, 1.3);
      }
      if (event.type === 'drop') this.dust(player, lane, theme, 5, 0.8);
      if (event.type === 'land') {
        this.landAt.set(player.id, now);
        this.dust(player, lane, theme, 12, 1.8);
      }
      if (event.type === 'pickup') {
        this.confetti(player, lane);
        this.text(player, lane, POWERUPS[event.powerup].name, POWERUPS[event.powerup].color);
        this.wave(player, lane, POWERUPS[event.powerup].color, 85, 0.45);
      }
      if (event.type === 'powerup-used') {
        const color = POWERUPS[event.powerup].color;
        this.text(player, lane, event.powerup === 'repair' ? 'REPAIRED!' : `${POWERUPS[event.powerup].name}!`, color);
        this.wave(player, lane, color, event.powerup === 'barge' ? 340 : 80, event.powerup === 'barge' ? 0.6 : 0.4);
      }
      if (event.type === 'shield-block') {
        this.text(player, lane, 'BLOCKED!', POWERUPS.shield.color);
        this.wave(player, lane, POWERUPS.shield.color, 100, 0.5);
      }
      if (event.type === 'attack-hit') {
        this.hitAt.set(player.id, now);
        this.debris(player, lane, theme);
        this.text(player, lane, '-1 LIFE', POWERUPS[event.powerup].color);
        this.wave(player, lane, POWERUPS[event.powerup].color, event.powerup === 'mine' ? 125 : 65, 0.45);
        if (player.id === localId) {
          this.shakeUntil = now + 200;
          this.shakeDuration = 200;
          this.shakeStrength = 5;
        }
      }
      if (event.type === 'hit') {
        this.hitAt.set(player.id, now);
        this.debris(player, lane, theme);
        this.text(player, lane, '-1 LIFE', '#ef7865');
        if (player.id === localId) {
          this.shakeUntil = now + 240;
          this.shakeDuration = 240;
          this.shakeStrength = 7;
        }
      }
      if (event.type === 'out') this.text(player, lane, 'OUT!', '#ef7865');
    }
  }

  update(now, camera, snapshot) {
    const dt = this.lastUpdate ? Math.min(0.04, Math.max(0, (now - this.lastUpdate) / 1000)) : 0;
    this.lastUpdate = now;
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy -= particle.gravity * dt;
      particle.rotation += particle.spin * dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
    for (const text of this.texts) {
      text.life -= dt;
      text.y += text.vy * dt;
    }
    this.texts = this.texts.filter(text => text.life > 0);
    for (const wave of this.waves) wave.life -= dt;
    this.waves = this.waves.filter(wave => wave.life > 0);

    const local = snapshot.players.find(player => player.id === this.localId);
    if (local && !local.out) {
      const milestone = Math.floor(local.distance / 1000);
      if (milestone >= this.nextMilestone) {
        this.nextMilestone = milestone + 1;
        const lane = this.laneFor(local, snapshot);
        this.confetti(local, lane);
        this.text(local, lane, `${milestone * 100} M!`, '#f4c44e');
      }
    }
    for (const player of snapshot.players) {
      const step = Math.floor(player.distance / 42);
      if (!player.out && player.grounded && player.speed > 0 && this.footsteps.get(player.id) !== step) {
        this.footsteps.set(player.id, step);
        this.dust(player, this.laneFor(player, snapshot), sceneForDistance(player.distance).theme, 2, 0.6);
      }
      if (!player.out && player.boostTime > 0 && now - (this.boostAt.get(player.id) || 0) > 38) {
        this.boostAt.set(player.id, now);
        const life = 0.22 + Math.random() * 0.2;
        this.particles.push({
          kind: 'spark', color: Math.random() > 0.4 ? '#f4c44e' : '#fff3cf',
          x: player.distance - 25, y: player.y + 12 + Math.random() * 38,
          vx: -170 - Math.random() * 130, vy: (Math.random() - 0.5) * 45,
          gravity: 0, life, maxLife: life, size: 3 + Math.random() * 5,
          lane: this.laneFor(player, snapshot), rotation: 0, spin: 0,
        });
      }
    }
  }

  shakeOffset(now) {
    const remaining = this.shakeUntil - now;
    if (remaining <= 0) return { x: 0, y: 0 };
    const strength = this.shakeStrength * remaining / this.shakeDuration;
    return { x: (Math.random() - 0.5) * strength * 2, y: (Math.random() - 0.5) * strength };
  }

  dust(player, lane, theme, count, force = 1) {
    for (let index = 0; index < count; index += 1) {
      const life = 0.35 + Math.random() * 0.35;
      this.particles.push({
        kind: 'dust', color: theme.dust,
        x: player.distance - 15 + Math.random() * 20, y: player.y + 2 + Math.random() * 7,
        vx: (-25 - Math.random() * 65) * force, vy: (15 + Math.random() * 40) * force,
        gravity: 75, life, maxLife: life, size: 3 + Math.random() * 6,
        lane, rotation: 0, spin: 0,
      });
    }
  }

  debris(player, lane, theme, obstacleType = 'cactus') {
    const colors = obstacleType.startsWith('bird') ? [theme.bird, theme.cloud, theme.ink] : [theme.cactus, theme.cactusLight, theme.ink];
    for (let index = 0; index < 8; index += 1) {
      const life = 0.55 + Math.random() * 0.4;
      this.particles.push({
        kind: 'debris', color: colors[index % 3],
        x: player.distance + 12, y: player.y + 25,
        vx: -100 + Math.random() * 200, vy: 80 + Math.random() * 150,
        gravity: 390, life, maxLife: life, size: 4 + Math.random() * 5,
        lane, rotation: Math.random() * 6, spin: -8 + Math.random() * 16,
      });
    }
  }

  confetti(player, lane) {
    for (let index = 0; index < 34; index += 1) {
      const life = 0.9 + Math.random() * 0.7;
      this.particles.push({
        kind: 'confetti', color: CONFETTI[index % CONFETTI.length],
        x: player.distance + (Math.random() - 0.5) * 35, y: player.y + 55,
        vx: -150 + Math.random() * 300, vy: 100 + Math.random() * 190,
        gravity: 280, life, maxLife: life, size: 3 + Math.random() * 4,
        lane, rotation: Math.random() * 6, spin: -10 + Math.random() * 20,
      });
    }
  }

  wave(player, lane, color, radius, duration) {
    this.waves.push({ x: player.distance, y: player.y + 32, lane, color, radius, life: duration, maxLife: duration });
  }

  text(player, lane, value, color) {
    this.texts.push({ x: player.distance, y: player.y + 125, vy: 42, life: 1.15, maxLife: 1.15, value, color, lane });
  }

  draw(ctx, camera, ground, scale, anchor) {
    for (const particle of this.particles) {
      const x = anchor + (particle.x - camera.distance) * scale + particle.lane;
      const y = ground - particle.y * scale;
      const alpha = Math.min(1, particle.life / Math.min(0.3, particle.maxLife));
      ctx.globalAlpha = alpha * (particle.kind === 'dust' ? 0.55 : 1);
      ctx.fillStyle = particle.color;
      if (particle.kind === 'dust') {
        ctx.beginPath();
        ctx.ellipse(x, y, particle.size * scale, particle.size * 0.65 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(particle.rotation);
        const size = particle.size * scale;
        ctx.fillRect(-size / 2, -size / 2, size, particle.kind === 'confetti' ? size * 0.55 : size);
        ctx.restore();
      }
    }
    for (const wave of this.waves) {
      const progress = 1 - wave.life / wave.maxLife;
      const x = anchor + (wave.x - camera.distance) * scale + wave.lane;
      const y = ground - wave.y * scale;
      ctx.globalAlpha = (1 - progress) * 0.8;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(1, (1 - progress) * 6 * scale);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, wave.radius * progress * scale), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const text of this.texts) {
      const x = anchor + (text.x - camera.distance) * scale + text.lane;
      const y = ground - text.y * scale;
      const age = text.maxLife - text.life;
      const pop = 1 + Math.sin(Math.min(1, age / 0.22) * Math.PI) * 0.25;
      ctx.globalAlpha = Math.min(1, text.life * 2.5);
      ctx.font = `700 ${Math.round(13 * scale * pop)}px Silkscreen, monospace`;
      ctx.fillStyle = text.color;
      ctx.fillText(text.value, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
