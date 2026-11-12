import { sceneForDistance } from './scene.js';

const CONFETTI = ['#f4c44e', '#e86f4c', '#73a98b', '#78a7d8', '#b18bd4', '#fff3cf'];

export class Effects {
  constructor() {
    this.reset();
  }

  reset() {
    this.particles = [];
    this.texts = [];
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
      const player = snapshot.players.find(candidate => candidate.id === event.id);
      if (!player) continue;
      const lane = this.laneFor(player, snapshot);
      const theme = sceneForDistance(player.distance).theme;
      if (event.type === 'jump') this.dust(player, lane, theme, 6, 1.2);
      if (event.type === 'land') {
        this.landAt.set(player.id, now);
        this.dust(player, lane, theme, 12, 1.8);
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
        x: player.distance - 15 + Math.random() * 20, y: 2 + Math.random() * 7,
        vx: (-25 - Math.random() * 65) * force, vy: (15 + Math.random() * 40) * force,
        gravity: 75, life, maxLife: life, size: 3 + Math.random() * 6,
        lane, rotation: 0, spin: 0,
      });
    }
  }

  debris(player, lane, theme) {
    for (let index = 0; index < 8; index += 1) {
      const life = 0.55 + Math.random() * 0.4;
      this.particles.push({
        kind: 'debris', color: [theme.cactus, theme.cactusLight, theme.ink][index % 3],
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
