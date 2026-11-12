export const FINISH_DISTANCE = 15000;

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

export function generateCourse(seed) {
  const next = random(seed);
  const obstacles = [];
  let x = 900;
  let id = 0;
  while (x < FINISH_DISTANCE - 500) {
    const roll = next();
    let type;
    if (x > 3200 && roll > 0.77) type = next() > 0.48 ? 'bird-high' : 'bird-low';
    else if (roll > 0.52) type = 'cactus-group';
    else if (roll > 0.24) type = 'cactus-large';
    else type = 'cactus-small';
    obstacles.push({ id: id++, type, x: Math.round(x) });
    const difficulty = Math.min(1, x / FINISH_DISTANCE);
    x += 410 + next() * 270 - difficulty * 65;
  }
  return obstacles;
}

export function obstacleSize(type) {
  if (type === 'cactus-small') return { width: 28, height: 48, y: 0 };
  if (type === 'cactus-large') return { width: 36, height: 70, y: 0 };
  if (type === 'cactus-group') return { width: 66, height: 56, y: 0 };
  if (type === 'bird-high') return { width: 48, height: 28, y: 43 };
  return { width: 48, height: 28, y: 8 };
}
