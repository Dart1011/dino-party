import { Course, obstacleSize } from './course.js';
import { sanitizeInput } from './protocol.js';

const EMPTY_INPUT = sanitizeInput();
const round = value => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Race {
  constructor(players, seed) {
    this.seed = seed;
    this.course = new Course(seed);
    this.course.ensure(2500);
    this.time = 0;
    this.ended = false;
    this.events = [];
    this.inputs = new Map();
    this.collected = new Set();
    this.destroyed = new Set();
    this.projectiles = [];
    this.mines = [];
    this.nextEntityId = 1;
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
      jumpsUsed: 0,
      immuneTime: 0,
      stunTime: 0,
      shieldTime: 0,
      boostTime: 0,
      dropThroughTime: 0,
      powerup: null,
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
    if (next.jump && !previous.jump && !player.out && player.stunTime <= 0) {
      if (player.grounded) {
        player.vy = 850;
        player.grounded = false;
        player.jumpsUsed = 1;
        player.ducking = false;
        this.events.push({ type: 'jump', id });
      } else if (player.jumpsUsed < 2) {
        player.vy = 800;
        player.jumpsUsed += 1;
        player.dropThroughTime = 0;
        this.events.push({ type: 'double-jump', id });
      }
    }
    if (next.use && !previous.use && !player.out && player.stunTime <= 0) this.usePowerup(player);
    this.inputs.set(id, next);
  }

  usePowerup(player) {
    const type = player.powerup;
    if (!type) return;
    player.powerup = null;
    if (type === 'nitro') player.boostTime = 2.5;
    if (type === 'shield') player.shieldTime = 8;
    if (type === 'repair') {
      if (player.lives < 3) player.lives += 1;
      else player.shieldTime = Math.max(player.shieldTime, 4);
    }
    if (type === 'mine') {
      this.mines.push({
        id: `e${this.nextEntityId++}`,
        ownerId: player.id,
        x: player.distance - 42,
        y: player.y,
        arm: 0.65,
        life: 18,
      });
    }
    if (type === 'barge') {
      this.destroyObstaclesInRadius(player.distance, player.y, 340, 155, player.id, type);
      for (const target of this.players.values()) {
        if (target.id === player.id) continue;
        if (Math.abs(target.distance - player.distance) <= 340 && Math.abs(target.y - player.y) <= 155) {
          this.attack(target, player.id, type);
        }
      }
    }
    if (type === 'bolt' || type === 'shunt') {
      const targets = [...this.players.values()]
        .filter(target => !target.out && target.id !== player.id && target.distance > player.distance + 15 && target.distance < player.distance + (type === 'bolt' ? 1150 : 1700))
        .sort((a, b) => a.distance - b.distance);
      const count = type === 'bolt' ? 3 : 1;
      for (let index = 0; index < count; index += 1) {
        this.projectiles.push({
          id: `e${this.nextEntityId++}`,
          type,
          ownerId: player.id,
          targetId: targets[index] ? targets[index].id : targets[0]?.id || null,
          x: player.distance + 35,
          y: player.y + 34 + (index - 1) * 10,
          speed: player.speed + (type === 'bolt' ? 900 : 560) + index * 35,
          life: type === 'bolt' ? 2.2 : 3.4,
        });
      }
    }
    this.events.push({ type: 'powerup-used', id: player.id, powerup: type });
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
    dt = clamp(dt, 0, 0.05);
    this.time += dt;

    for (const player of this.players.values()) {
      if (player.out) continue;
      const input = this.inputs.get(player.id) || EMPTY_INPUT;
      player.immuneTime = Math.max(0, player.immuneTime - dt);
      player.stunTime = Math.max(0, player.stunTime - dt);
      player.shieldTime = Math.max(0, player.shieldTime - dt);
      player.boostTime = Math.max(0, player.boostTime - dt);
      player.dropThroughTime = Math.max(0, player.dropThroughTime - dt);
      player.ducking = input.duck;
      this.movePlayer(player, input, dt);
      this.collectPowerups(player);
      this.checkCollisions(player);
      if (player.boostTime > 0) this.checkRamming(player);
    }

    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.ended = [...this.players.values()].every(player => player.out);
  }

  movePlayer(player, input, dt) {
    const previousY = player.y;
    const previousDistance = player.distance;
    const wasGrounded = player.grounded;
    const baseSpeed = 350 + Math.min(600, this.time * 4);
    const targetSpeed = player.stunTime > 0 ? 150 : baseSpeed + (player.boostTime > 0 ? 380 : 0);
    const acceleration = player.boostTime > 0 ? 1200 : targetSpeed > player.speed ? 180 : 430;
    player.speed += clamp(targetSpeed - player.speed, -acceleration * dt, acceleration * dt);
    player.distance += player.speed * dt;
    this.course.ensure(player.distance + 1800);

    if (wasGrounded) {
      const step = Math.max(8, (player.distance - previousDistance) * 0.82 + 1);
      const surface = this.course.surfaceAt(player.distance, player.y + step);
      if (surface < player.y - step) {
        player.grounded = false;
        player.vy = 0;
      } else {
        player.y = surface;
        player.vy = 0;
      }
    }

    if (!player.grounded) {
      const gravity = input.duck ? 3400 : 2200;
      player.vy -= gravity * dt;
      const nextY = player.y + player.vy * dt;
      const surface = player.dropThroughTime > 0 ? (nextY <= 0 ? 0 : null) : this.course.landingSurface(player.distance, previousY, nextY, previousDistance);
      if (surface !== null && player.vy <= 0) {
        player.y = surface;
        player.vy = 0;
        player.grounded = true;
        player.jumpsUsed = 0;
        this.events.push({ type: 'land', id: player.id, height: surface });
      } else player.y = nextY;
    }

    if (player.grounded && input.duck && player.y > 2) {
      player.grounded = false;
      player.vy = -130;
      player.y -= 3;
      player.dropThroughTime = 0.24;
      this.events.push({ type: 'drop', id: player.id });
    }
  }

  collectPowerups(player) {
    for (const pickup of this.course.powerups) {
      if (pickup.x - player.distance > 42) break;
      if (pickup.x < player.distance - 42) continue;
      if (this.collected.has(pickup.id) || player.powerup) continue;
      if (Math.abs(player.y + 28 - pickup.y) > 52) continue;
      this.collected.add(pickup.id);
      player.powerup = pickup.type;
      this.events.push({ type: 'pickup', id: player.id, powerup: pickup.type, x: pickup.x, y: pickup.y });
    }
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      const target = this.players.get(projectile.targetId);
      if (target && !target.out && target.distance > projectile.x - 30) {
        const tracking = projectile.type === 'bolt' ? 1050 : 650;
        projectile.y += clamp(target.y + 30 - projectile.y, -tracking * dt, tracking * dt);
      }
      projectile.x += projectile.speed * dt;
      if (projectile.life <= 0) continue;
      const obstacle = this.projectileObstacle(projectile);
      if (obstacle) {
        this.destroyObstacle(obstacle, projectile.ownerId, projectile.type);
        projectile.life = 0;
        continue;
      }
      for (const player of this.players.values()) {
        if (player.id === projectile.ownerId || player.out || player.immuneTime > 0) continue;
        if (Math.abs(player.distance - projectile.x) > 31 || Math.abs(player.y + 29 - projectile.y) > 45) continue;
        this.attack(player, projectile.ownerId, projectile.type);
        projectile.life = 0;
        break;
      }
    }
    this.projectiles = this.projectiles.filter(projectile => projectile.life > 0);
  }

  projectileObstacle(projectile) {
    for (const obstacle of this.course.obstacles) {
      if (obstacle.x - projectile.x > 80) break;
      if (obstacle.x < projectile.x - 80 || this.destroyed.has(obstacle.id)) continue;
      const box = obstacleBounds(obstacle);
      if (projectile.x + 11 <= box.left || projectile.x - 11 >= box.right || projectile.y + 16 <= box.bottom || projectile.y - 16 >= box.top) continue;
      return obstacle;
    }
    return null;
  }

  obstaclesInRadius(x, y, radius, vertical) {
    const obstacles = [];
    for (const obstacle of this.course.obstacles) {
      if (obstacle.x - x > radius) break;
      if (obstacle.x < x - radius || this.destroyed.has(obstacle.id)) continue;
      const box = obstacleBounds(obstacle);
      if (Math.abs(box.centerY - y) <= vertical) obstacles.push(obstacle);
    }
    return obstacles;
  }

  destroyObstaclesInRadius(x, y, radius, vertical, sourceId, powerup) {
    const obstacles = this.obstaclesInRadius(x, y, radius, vertical);
    for (const obstacle of obstacles) this.destroyObstacle(obstacle, sourceId, powerup);
    return obstacles.length;
  }

  destroyObstacle(obstacle, sourceId, powerup) {
    if (this.destroyed.has(obstacle.id)) return;
    this.destroyed.add(obstacle.id);
    const size = obstacleSize(obstacle.type);
    this.events.push({
      type: 'obstacle-break',
      id: sourceId,
      obstacle: obstacle.id,
      obstacleType: obstacle.type,
      x: obstacle.x,
      y: (obstacle.y || 0) + size.y + size.height / 2,
      powerup,
    });
  }

  updateMines(dt) {
    for (const mine of this.mines) {
      mine.life -= dt;
      mine.arm = Math.max(0, mine.arm - dt);
      if (mine.arm > 0 || mine.life <= 0) continue;
      const obstacleTriggered = this.obstaclesInRadius(mine.x, mine.y, 65, 85).length > 0;
      const playerTriggered = [...this.players.values()].some(player => player.id !== mine.ownerId && !player.out && player.immuneTime <= 0
        && Math.abs(player.distance - mine.x) <= 32 && Math.abs(player.y - mine.y) <= 60);
      if (obstacleTriggered || playerTriggered) this.explodeMine(mine);
    }
    this.mines = this.mines.filter(mine => mine.life > 0);
  }

  explodeMine(mine) {
    this.destroyObstaclesInRadius(mine.x, mine.y, 95, 105, mine.ownerId, 'mine');
    for (const player of this.players.values()) {
      if (player.id === mine.ownerId || player.out) continue;
      if (Math.abs(player.distance - mine.x) <= 90 && Math.abs(player.y - mine.y) <= 75) this.attack(player, mine.ownerId, 'mine');
    }
    this.events.push({ type: 'explosion', id: mine.ownerId, x: mine.x, y: mine.y, powerup: 'mine' });
    mine.life = 0;
  }

  attack(player, sourceId, powerup) {
    if (player.out || player.immuneTime > 0) return false;
    if (player.shieldTime > 0) {
      player.shieldTime = 0;
      player.immuneTime = 0.55;
      this.events.push({ type: 'shield-block', id: player.id, sourceId, powerup });
      return true;
    }
    player.lives -= 1;
    player.stunTime = Math.max(player.stunTime, powerup === 'mine' ? 0.85 : 0.65);
    player.immuneTime = 1.3;
    player.speed = Math.min(player.speed, 170);
    player.boostTime = 0;
    if (powerup === 'barge' || powerup === 'nitro') player.distance = Math.max(0, player.distance - 45);
    if (powerup === 'mine') {
      player.grounded = false;
      player.vy = 390;
      player.jumpsUsed = Math.max(1, player.jumpsUsed);
    }
    this.events.push({ type: 'attack-hit', id: player.id, sourceId, powerup, lives: Math.max(0, player.lives) });
    if (player.lives <= 0) {
      player.out = true;
      player.speed = 0;
      player.ducking = false;
      this.events.push({ type: 'out', id: player.id, sourceId, powerup });
    }
    return true;
  }

  checkRamming(player) {
    for (const target of this.players.values()) {
      if (target.id === player.id || target.out) continue;
      if (Math.abs(target.distance - player.distance) <= 35 && Math.abs(target.y - player.y) <= 60) {
        this.attack(target, player.id, 'nitro');
      }
    }
  }

  checkCollisions(player) {
    if ((player.immuneTime > 0 || player.stunTime > 0) && player.boostTime <= 0) return;
    const playerBox = {
      left: player.distance - (player.ducking ? 29 : 20),
      right: player.distance + (player.ducking ? 29 : 20),
      bottom: player.y,
      top: player.y + (player.ducking ? 30 : 54),
    };
    for (const obstacle of this.course.obstacles) {
      const dx = obstacle.x - player.distance;
      if (dx > 80) break;
      if (dx < -80 || this.destroyed.has(obstacle.id)) continue;
      const obstacleBox = obstacleBounds(obstacle);
      if (playerBox.right <= obstacleBox.left || playerBox.left >= obstacleBox.right || playerBox.top <= obstacleBox.bottom || playerBox.bottom >= obstacleBox.top) continue;
      if (player.boostTime > 0) {
        this.destroyObstacle(obstacle, player.id, 'nitro');
        continue;
      }
      if (player.shieldTime > 0) {
        player.shieldTime = 0;
        player.immuneTime = 1;
        this.events.push({ type: 'shield-block', id: player.id, obstacle: obstacle.id, powerup: 'obstacle' });
        break;
      }
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
      collected: [...this.collected],
      destroyed: [...this.destroyed],
      projectiles: this.projectiles.map(projectile => ({
        ...projectile,
        x: round(projectile.x),
        y: round(projectile.y),
        speed: round(projectile.speed),
        life: round(projectile.life),
      })),
      mines: this.mines.map(mine => ({ ...mine, x: round(mine.x), y: round(mine.y), arm: round(mine.arm), life: round(mine.life) })),
      players: [...this.players.values()].map(player => ({
        ...player,
        distance: round(player.distance),
        y: round(player.y),
        vy: round(player.vy),
        speed: round(player.speed),
        immuneTime: round(player.immuneTime),
        stunTime: round(player.stunTime),
        shieldTime: round(player.shieldTime),
        boostTime: round(player.boostTime),
        dropThroughTime: round(player.dropThroughTime),
      })),
    };
  }
}

function obstacleBounds(obstacle) {
  const size = obstacleSize(obstacle.type);
  return {
    left: obstacle.x - size.width / 2 + 4,
    right: obstacle.x + size.width / 2 - 4,
    bottom: (obstacle.y || 0) + size.y + 3,
    top: (obstacle.y || 0) + size.y + size.height - 3,
    centerY: (obstacle.y || 0) + size.y + size.height / 2,
  };
}

export function comparePlayers(a, b) {
  if (a.out !== b.out) return a.out ? 1 : -1;
  return b.distance - a.distance;
}
