export const MAX_PLAYERS = 8;
export const ROOM_PREFIX = 'dino-party-v3-';
export const CHARACTERS = 6;

export function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || 'Dino';
}

export function cleanCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function cleanCharacter(value) {
  const character = Number(value);
  return Number.isInteger(character) && character >= 0 && character < CHARACTERS ? character : 0;
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

export function hostPeerId(code) {
  return `${ROOM_PREFIX}${cleanCode(code).toLowerCase()}`;
}

export function shareUrl(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', cleanCode(code));
  return url.href;
}

export function playerColor(character) {
  return ['#ef8354', '#4f8edc', '#8c68c9', '#41a67a', '#e3a72f', '#d85b83'][cleanCharacter(character)];
}

export function sanitizeProfile(profile) {
  return {
    name: cleanName(profile?.name),
    character: cleanCharacter(profile?.character),
  };
}

export function sanitizeInput(input) {
  return {
    jump: input?.jump === true,
    duck: input?.duck === true,
    use: input?.use === true,
  };
}
