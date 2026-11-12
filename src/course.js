import { POWERUP_TYPES } from './powerups.js';

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export class Course {
  constructor(seed) {
    this.nextObstacle = random(seed);
    this.nextPlatform = random(seed ^ 0x9e3779b9);
    this.nextPowerup = random(seed ^ 0x85ebca6b);
    this.obstacles = [];
    this.platforms = [];
    this.powerups = [];
    this.nextX = 900;
    this.nextPlatformX = 1800;
    this.nextPowerupX = 650;
    this.nextObstacleId = 0;
    this.nextPlatformId = 0;
    this.nextPickupId = 0;
  }

  ensure(distance) {
    const pickupCount = this.powerups.length;
    while (this.nextPlatformX < distance + 220) this.addPlatform();
    while (this.nextX < distance + 120) {
      const x = this.nextX;
      const roll = this.nextObstacle();
      let type;
      if (x > 3200 && roll > 0.77) type = this.nextObstacle() > 0.48 ? 'bird-high' : 'bird-low';
      else if (roll > 0.52) type = 'cactus-group';
      else if (roll > 0.24) type = 'cactus-large';
      else type = 'cactus-small';
      if (!this.onRamp(x)) this.obstacles.push({ id: this.nextObstacleId++, type, x: Math.round(x), y: 0 });
      const difficulty = Math.min(1, x / 40000);
      this.nextX += 430 + this.nextObstacle() * 280 + difficulty * 170;
    }
    while (this.nextPowerupX < distance) {
      const x = this.nextPowerupX;
      if (!this.onRamp(x, 90) && !this.obstacles.some(obstacle => Math.abs(obstacle.x - x) < 85)) {
        this.powerups.push({
          id: `p${this.nextPickupId++}`,
          x: Math.round(x),
          y: 43,
          type: this.powerupType(),
        });
      }
      this.nextPowerupX += 1100 + this.nextPowerup() * 500;
    }
    if (this.powerups.length !== pickupCount) this.powerups.sort((a, b) => a.x - b.x);
  }

  addPlatform() {
    const x = this.nextPlatformX;
    const floating = this.nextPlatform() > 0.66;
    const height = floating ? 190 + Math.floor(this.nextPlatform() * 2) * 15 : 115 + Math.floor(this.nextPlatform() * 3) * 10;
    const ramp = floating ? 0 : 190;
    const flat = floating ? 360 + this.nextPlatform() * 170 : 430 + this.nextPlatform() * 240;
    const platform = {
      id: `r${this.nextPlatformId++}`,
      x: Math.round(x),
      height,
      ramp,
      flat: Math.round(flat),
      length: Math.round(ramp * 2 + flat),
      floating,
      entry: floating ? 0 : 22,
    };
    this.platforms.push(platform);
    this.powerups.push({
      id: `${platform.id}-powerup`,
      x: Math.round(platform.x + ramp + flat * 0.5),
      y: height + 43,
      type: this.powerupType(this.nextPlatform),
      platformId: platform.id,
    });
    this.nextPlatformX += platform.length + 1250 + this.nextPlatform() * 900;
  }

  powerupType(next = this.nextPowerup) {
    return POWERUP_TYPES[Math.floor(next() * POWERUP_TYPES.length)];
  }

  onRamp(x, padding = 70) {
    return this.platforms.some(platform => platform.ramp > 0 && (
      (x >= platform.x - padding && x <= platform.x + platform.ramp + padding)
      || (x >= platform.x + platform.ramp + platform.flat - padding && x <= platform.x + platform.length + padding)
    ));
  }

  platformHeight(platform, x) {
    const local = x - platform.x;
    if (local < 0 || local > platform.length) return null;
    if (!platform.ramp) return platform.height;
    if (local < platform.ramp) return platform.entry + (platform.height - platform.entry) * local / platform.ramp;
    if (local <= platform.ramp + platform.flat) return platform.height;
    return platform.entry + (platform.height - platform.entry) * (1 - (local - platform.ramp - platform.flat) / platform.ramp);
  }

  surfacesAt(x) {
    const surfaces = [0];
    for (const platform of this.platforms) {
      if (platform.x > x) break;
      const height = this.platformHeight(platform, x);
      if (height !== null) surfaces.push(height);
    }
    return surfaces.sort((a, b) => b - a);
  }

  surfaceAt(x, maxHeight = Infinity) {
    return this.surfacesAt(x).find(height => height <= maxHeight) ?? 0;
  }

  landingSurface(x, previousY, nextY, previousX = x) {
    if (previousY >= -0.5 && nextY <= 0) return 0;
    for (const platform of this.platforms) {
      if (platform.x > x) break;
      const height = this.platformHeight(platform, x);
      if (height === null || nextY > height) continue;
      const previousHeight = this.platformHeight(platform, previousX);
      const wasAbove = previousHeight === null ? previousY >= height - 0.5 : previousY >= previousHeight - 0.5;
      if (wasAbove) return height;
    }
    return null;
  }
}

export function obstacleSize(type) {
  if (type === 'cactus-small') return { width: 28, height: 48, y: 0 };
  if (type === 'cactus-large') return { width: 36, height: 70, y: 0 };
  if (type === 'cactus-group') return { width: 66, height: 56, y: 0 };
  if (type === 'bird-high') return { width: 48, height: 28, y: 43 };
  return { width: 48, height: 28, y: 8 };
}
