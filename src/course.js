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
    this.next = random(seed);
    this.obstacles = [];
    this.nextX = 900;
    this.nextId = 0;
  }

  ensure(distance) {
    while (this.nextX < distance) {
      const x = this.nextX;
      const roll = this.next();
      let type;
      if (x > 3200 && roll > 0.77) type = this.next() > 0.48 ? 'bird-high' : 'bird-low';
      else if (roll > 0.52) type = 'cactus-group';
      else if (roll > 0.24) type = 'cactus-large';
      else type = 'cactus-small';
      this.obstacles.push({ id: this.nextId++, type, x: Math.round(x) });
      const difficulty = Math.min(1, x / 40000);
      this.nextX += 430 + this.next() * 280 + difficulty * 170;
    }
  }
}

export function obstacleSize(type) {
  if (type === 'cactus-small') return { width: 28, height: 48, y: 0 };
  if (type === 'cactus-large') return { width: 36, height: 70, y: 0 };
  if (type === 'cactus-group') return { width: 66, height: 56, y: 0 };
  if (type === 'bird-high') return { width: 48, height: 28, y: 43 };
  return { width: 48, height: 28, y: 8 };
}
