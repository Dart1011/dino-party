export const SCENE_LENGTH = 7000;

export const DAY = Object.freeze({
  background: '#f4efe3',
  ink: '#293438',
  dune: '#e8deca',
  cloud: '#ebe3d2',
  detail: '#9b9589',
  dust: '#c9bda7',
  cactus: '#56856c',
  cactusLight: '#74a184',
  bird: '#6d6687',
});

export const NIGHT = Object.freeze({
  background: '#151c26',
  ink: '#e7e3d8',
  dune: '#202b37',
  cloud: '#384351',
  detail: '#67717b',
  dust: '#53606b',
  cactus: '#6f9c82',
  cactusLight: '#8ab494',
  bird: '#9a8fb5',
});

function colorParts(color) {
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
}

function mixColor(from, to, amount) {
  const a = colorParts(from);
  const b = colorParts(to);
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * amount)).join(',')})`;
}

export function sceneForDistance(distance) {
  const safeDistance = Math.max(0, distance);
  const cycle = Math.floor(safeDistance / SCENE_LENGTH);
  const progress = safeDistance % SCENE_LENGTH / SCENE_LENGTH;
  const transition = Math.max(0, Math.min(1, (progress - 0.86) / 0.14));
  const smooth = transition * transition * (3 - 2 * transition);
  const returningToDay = cycle % 2 === 1;
  const nightAmount = returningToDay ? 1 - smooth : smooth;
  const from = returningToDay ? NIGHT : DAY;
  const to = returningToDay ? DAY : NIGHT;
  const theme = Object.fromEntries(Object.keys(DAY).map(key => [key, mixColor(from[key], to[key], smooth)]));
  return {
    theme,
    nightAmount,
    progress,
    remaining: Math.ceil((1 - progress) * SCENE_LENGTH / 10),
    next: returningToDay ? 'SUNRISE' : 'NIGHTFALL',
  };
}
