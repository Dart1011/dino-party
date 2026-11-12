export const SCENE_LENGTH = 7000;

export const DAY = Object.freeze({
  skyTop: '#eee8da',
  background: '#f4efe3',
  ink: '#293438',
  mountain: '#e3d8c4',
  midground: '#d9cdb5',
  dune: '#e8deca',
  cloud: '#ebe3d2',
  detail: '#9b9589',
  foreground: '#c6b89f',
  shadow: '#293438',
  dust: '#c9bda7',
  cactus: '#56856c',
  cactusLight: '#74a184',
  bird: '#6d6687',
});

export const SUNSET = Object.freeze({
  skyTop: '#8d6f91',
  background: '#d99a82',
  ink: '#453b4d',
  mountain: '#c48778',
  midground: '#a56e68',
  dune: '#b97768',
  cloud: '#d8a09b',
  detail: '#80616b',
  foreground: '#835c60',
  shadow: '#453b4d',
  dust: '#b98470',
  cactus: '#596f62',
  cactusLight: '#7f8f72',
  bird: '#65566f',
});

export const NIGHT = Object.freeze({
  skyTop: '#0c1220',
  background: '#151c26',
  ink: '#e7e3d8',
  mountain: '#1b2632',
  midground: '#26323d',
  dune: '#202b37',
  cloud: '#384351',
  detail: '#67717b',
  foreground: '#34414c',
  shadow: '#05080d',
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

function mixPalette(from, to, amount) {
  if (amount <= 0) return { ...from };
  if (amount >= 1) return { ...to };
  return Object.fromEntries(Object.keys(DAY).map(key => [key, mixColor(from[key], to[key], amount)]));
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
  const theme = smooth < 0.58
    ? mixPalette(from, SUNSET, smooth / 0.58)
    : mixPalette(SUNSET, to, (smooth - 0.58) / 0.42);
  return {
    theme,
    nightAmount,
    progress,
    remaining: Math.ceil((1 - progress) * SCENE_LENGTH / 10),
    next: returningToDay ? 'SUNRISE' : 'NIGHTFALL',
  };
}
