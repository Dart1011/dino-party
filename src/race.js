import { Course, obstacleSize } from './course.js';
import { sanitizeInput } from './protocol.js';

const EMPTY_INPUT = sanitizeInput();
const round = value => Math.round(value * 10) / 10;

export class Race {
  constructor(players, seed) {
    this.seed = seed;
    this.course = new Course(seed);
    this.course.ensure(2500);
    this.time = 0;
    this.ended = false;
    this.events = [];
    this.inputs = new Map();
    this.players = new Map(players.map(player => [player.id, {
      id: player.id,
      name: player.name,
      character: player.character,
      distance: 0,
      y: 0,
      vy: 0,
      speed: 0,
      lives: 3,
      ducking: false,
      grounded: true,
      immuneTime: 0,
      stunTime: 0,
      out: false,
      disconnected: false,
    }]));
    for (const id of this.players.keys()) this.inputs.set(id, { ...EMPTY_INPUT });
  }

  setInput(id, input) {
    if (!this.players.has(id)) return;
    const previous = this.inputs.get(id) || EMPTY_INPUT;
    const next = sanitizeInput(input);
    const player = this.players.get(id);
    if (next.jump && !previous.jump && player.grounded && !player.out && player.stunTime <= 0) {
      player.vy = 850;
      player.grounded = false;
      player.ducking = false;
      this.events.push({ type: 'jump', id });
    }
    this.inputs.set(id, next);
  }

  disconnect(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;
    player.out = true;
    this.inputs.set(id, { ...EMPTY_INPUT });
  }

  update(dt) {
    if (this.ended) return;
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time += dt;

    for (const player of this.players.values()) {
      if (player.out) continue;
      const input = this.inputs.get(player.id) || EMPTY_INPUT;
      player.immuneTime = Math.max(0, player.immuneTime - dt);
      player.stunTime = Math.max(0, player.stunTime - dt);
      player.ducking = input.duck;

      const targetSpeed = player.stunTime > 0 ? 150 : 350 + Math.min(600, this.time * 4);
      const acceleration = targetSpeed > player.speed ? 180 : 430;
      player.speed += Math.max(-acceleration * dt, Math.min(acceleration * dt, targetSpeed - player.speed));
      player.distance += player.speed * dt;
      this.course.ensure(player.distance + 1800);

      if (!player.grounded) {
        const gravity = input.duck ? 3400 : 2200;
        player.vy -= gravity * dt;
        player.y += player.vy * dt;
        if (player.y <= 0) {
          player.y = 0;
          player.vy = 0;
          player.grounded = true;
          this.events.push({ type: 'land', id: player.id });
        }
      }

      this.checkCollisions(player);
    }

    this.ended = [...this.players.values()].every(player => player.out);
  }

  checkCollisions(player) {
    if (player.immuneTime > 0 || player.stunTime > 0) return;
    const playerBox = {
      left: player.distance - (player.ducking ? 29 : 20),
      right: player.distance + (player.ducking ? 29 : 20),
      bottom: player.y,
      top: player.y + (player.ducking ? 30 : 54),
    };
    for (const obstacle of this.course.obstacles) {
      const dx = obstacle.x - player.distance;
      if (dx > 80) break;
      if (dx < -80) continue;
      const size = obstacleSize(obstacle.type);
      const obstacleBox = {
        left: obstacle.x - size.width / 2 + 4,
        right: obstacle.x + size.width / 2 - 4,
        bottom: size.y + 3,
        top: size.y + size.height - 3,
      };
      if (playerBox.right <= obstacleBox.left || playerBox.left >= obstacleBox.right || playerBox.top <= obstacleBox.bottom || playerBox.bottom >= obstacleBox.top) continue;
      player.lives -= 1;
      player.stunTime = 0.45;
      player.immuneTime = 2;
      player.speed = 150;
      this.events.push({ type: 'hit', id: player.id, obstacle: obstacle.id });
      if (player.lives <= 0) {
        player.out = true;
        player.speed = 0;
        player.ducking = false;
        this.events.push({ type: 'out', id: player.id });
      }
      break;
    }
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  standings() {
    return [...this.players.values()].sort(comparePlayers);
  }

  snapshot() {
    return {
      time: round(this.time),
      ended: this.ended,
      players: [...this.players.values()].map(player => ({
        ...player,
        distance: round(player.distance),
        y: round(player.y),
        vy: round(player.vy),
        speed: round(player.speed),
        immuneTime: round(player.immuneTime),
        stunTime: round(player.stunTime),
      })),
    };
  }
}

export function comparePlayers(a, b) {
  if (a.out !== b.out) return a.out ? 1 : -1;
  return b.distance - a.distance;
}
