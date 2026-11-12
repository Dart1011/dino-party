import { Controls } from './input.js';
import { Room } from './network.js';
import { cleanCharacter, cleanCode, cleanName, CHARACTERS, MAX_PLAYERS, playerColor, shareUrl } from './protocol.js';
import { comparePlayers, Race } from './race.js';
import { sceneForDistance } from './scene.js';
import { drawCharacterPreview, Renderer } from './renderer.js';

const $ = id => document.getElementById(id);
const screens = { home: $('home-screen'), lobby: $('lobby-screen'), results: $('results-screen') };
const renderer = new Renderer($('game-canvas'));
let room;
let view = 'home';
let character = 0;
let roomPlayers = [];
let raceParticipants = [];
let race = null;
let raceId = null;
let raceSeed = null;
let startAt = 0;
let latestSnapshot = null;
let resultScheduled = false;
let toastTimer;
let lastFrame = performance.now();
let accumulator = 0;
let lastSnapshotAt = 0;
let lastInputAt = 0;
let countdownValue = null;

try {
  character = cleanCharacter(Number(localStorage.getItem('dino-character')));
  $('name-input').value = localStorage.getItem('dino-name') || `Dino ${Math.floor(10 + Math.random() * 90)}`;
} catch {
  $('name-input').value = `Dino ${Math.floor(10 + Math.random() * 90)}`;
}
drawCharacterPreview($('character-preview'), character);

const controls = new Controls(sendControls);
room = createRoom();

function createRoom() {
  const next = new Room();
  next.raceProvider = () => race && raceId ? {
    raceId,
    seed: raceSeed,
    startAt,
    sentAt: Date.now(),
    players: raceParticipants,
    snapshot: race.snapshot(),
  } : null;
  next.addEventListener('ready', event => {
    setBusy(false);
    roomPlayers = event.detail.players;
    setView('lobby');
    renderLobby();
    setConnection(`${next.code} · ${next.isHost ? 'HOST' : 'CONNECTED'}`);
  });
  next.addEventListener('lobby', event => {
    roomPlayers = event.detail.players;
    renderLobby();
  });
  next.addEventListener('return-lobby', () => showLobby());
  next.addEventListener('start', event => beginRace(event.detail));
  next.addEventListener('input', event => {
    if (next.isHost) race?.setInput(event.detail.id, event.detail.input);
  });
  next.addEventListener('snapshot', event => {
    if (event.detail.raceId === raceId) handleSnapshot(event.detail.snapshot);
  });
  next.addEventListener('race-events', event => handleRaceEvents(event.detail));
  next.addEventListener('player-left', event => {
    race?.disconnect(event.detail.id);
    if (view === 'race') toast('A runner disconnected.');
  });
  next.addEventListener('error', event => {
    setBusy(false);
    if (view === 'race' || view === 'results') toast(event.detail, 6000);
    else showHomeError(event.detail);
  });
  next.addEventListener('host-left', () => {
    controls.reset();
    next.leave();
    showHome('The host left, so this room has closed. You can create a new room or join another.');
  });
  next.addEventListener('status', event => setConnection(event.detail));
  return next;
}

function setView(next) {
  view = next;
  document.body.dataset.view = next;
  if (next === 'home' || next === 'lobby') document.body.dataset.scene = 'day';
  for (const [name, screen] of Object.entries(screens)) screen.hidden = name !== next;
  const racing = next === 'race';
  $('race-hud').hidden = !racing;
  $('home-footer').hidden = next !== 'home';
  $('leave-button').hidden = next === 'home';
  $('countdown').hidden = true;
  if (!racing) controls.enabled = false;
  if (next !== 'home') clearHomeError();
}

function showHome(error = '') {
  race = null;
  raceId = null;
  latestSnapshot = null;
  roomPlayers = [];
  controls.reset();
  setView('home');
  $('connection-pill').hidden = true;
  setBusy(false);
  if (error) showHomeError(error);
  else clearHomeError();
  const url = new URL(window.location.href);
  url.search = '';
  history.replaceState(null, '', url);
  $('invite-banner').hidden = true;
  $('join-button').textContent = 'Join room';
}

function showLobby() {
  race = null;
  raceId = null;
  latestSnapshot = null;
  resultScheduled = false;
  controls.reset();
  setView('lobby');
  renderLobby();
}

function profile() {
  const value = { name: cleanName($('name-input').value), character };
  $('name-input').value = value.name;
  try {
    localStorage.setItem('dino-name', value.name);
    localStorage.setItem('dino-character', String(character));
  } catch {}
  return value;
}

function createRoomFromUI() {
  clearHomeError();
  setBusy(true, 'Creating your room…');
  room.leave();
  room = createRoom();
  room.create(profile());
}

function joinRoomFromUI() {
  const code = cleanCode($('code-input').value);
  if (code.length !== 6) {
    showHomeError('Enter the six-character room code from your invite.');
    $('code-input').focus();
    return;
  }
  clearHomeError();
  setBusy(true, `Joining ${code}…`);
  room.leave();
  room = createRoom();
  room.join(code, profile());
}

function setBusy(busy, message = 'Connecting…') {
  $('create-button').disabled = busy;
  $('join-button').disabled = busy;
  $('busy-message').hidden = !busy;
  if (busy) $('busy-message').querySelector('span:last-child').textContent = message;
}

function showHomeError(message) {
  setView('home');
  $('home-error').textContent = message;
  $('home-error').hidden = false;
  $('connection-pill').hidden = true;
}

function clearHomeError() {
  $('home-error').hidden = true;
  $('home-error').textContent = '';
}

function setConnection(message) {
  $('connection-pill').hidden = false;
  $('connection-pill').querySelector('span').textContent = message;
}

function renderLobby() {
  if (!room?.code || (view !== 'lobby' && view !== 'home')) return;
  $('copy-code').textContent = room.code;
  $('copy-code').setAttribute('aria-label', `Copy room code ${room.code}`);
  $('share-link').value = shareUrl(room.code);
  $('player-count').textContent = `${roomPlayers.length} / ${MAX_PLAYERS}`;
  $('start-button').hidden = !room.isHost;
  $('start-button').querySelector('span').textContent = roomPlayers.length === 1 ? 'Start solo run' : 'Start run';
  $('host-waiting').hidden = room.isHost;
  $('lobby-subtitle').textContent = room.isHost ? 'Share this link with your friends' : 'You’re in! The host will start the race';
  const list = $('lobby-players');
  list.replaceChildren();
  for (const player of roomPlayers) {
    const item = document.createElement('div');
    item.className = 'lobby-player';
    const avatar = document.createElement('canvas');
    avatar.width = avatar.height = 64;
    const details = document.createElement('div');
    details.className = 'player-name';
    details.textContent = player.name;
    const badge = document.createElement('small');
    badge.textContent = player.host ? 'HOST' : player.id === room.localId ? 'YOU · READY' : 'READY';
    details.append(badge);
    item.append(avatar, details);
    list.append(item);
    drawCharacterPreview(avatar, player.character);
  }
  for (let index = roomPlayers.length; index < Math.min(MAX_PLAYERS, Math.max(4, roomPlayers.length + 1)); index += 1) {
    const empty = document.createElement('div');
    empty.className = 'empty-slot';
    empty.textContent = 'Invite a friend';
    list.append(empty);
  }
}

function startNewRace() {
  if (!room.isHost || roomPlayers.length === 0) return;
  const data = {
    raceId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seed: Math.floor(Math.random() * 0xffffffff),
    startAt: Date.now() + 3500,
    sentAt: Date.now(),
    players: roomPlayers.map(player => ({ ...player })),
  };
  room.startRace(data);
  beginRace(data);
}

function beginRace(data) {
  if (!data?.raceId || !Array.isArray(data.players)) return;
  raceId = data.raceId;
  raceSeed = data.seed;
  raceParticipants = data.players;
  startAt = room.isHost ? data.startAt : Date.now() + (data.startAt - (data.sentAt || Date.now()));
  race = room.isHost && !data.snapshot ? new Race(raceParticipants, raceSeed) : null;
  latestSnapshot = data.snapshot || new Race(raceParticipants, raceSeed).snapshot();
  resultScheduled = false;
  accumulator = 0;
  lastSnapshotAt = 0;
  countdownValue = null;
  controls.reset();
  renderer.resetRace(raceSeed, room.localId);
  renderer.setSnapshot(latestSnapshot);
  setView('race');
  updateHUD();
  updateCountdown();
  const participating = raceParticipants.some(player => player.id === room.localId);
  $('spectator-notice').hidden = participating;
  $('mobile-controls').hidden = !participating;
}

function handleSnapshot(snapshot) {
  if (!snapshot || view !== 'race') return;
  latestSnapshot = snapshot;
  renderer.setSnapshot(snapshot);
  updateHUD();
  if (snapshot.ended && !resultScheduled) {
    resultScheduled = true;
    controls.enabled = false;
    controls.reset();
    const completedRace = raceId;
    setTimeout(() => {
      if (raceId === completedRace) showResults();
    }, 1300);
  }
}

function sortedPlayers() {
  return [...(latestSnapshot?.players || [])].sort(comparePlayers);
}

function updateHUD() {
  if (!latestSnapshot) return;
  const local = latestSnapshot.players.find(player => player.id === room.localId);
  const camera = local || sortedPlayers()[0];
  if (camera) {
    const scene = sceneForDistance(camera.distance);
    $('race-distance').textContent = `${Math.floor(camera.distance / 10)} M`;
    $('race-progress').style.width = `${scene.progress * 100}%`;
    $('race-time').textContent = scene.nightAmount >= 0.5 ? 'NIGHT' : 'DAY';
    $('scene-label').textContent = `${scene.remaining} M UNTIL ${scene.next}`;
    document.body.dataset.scene = scene.nightAmount >= 0.5 ? 'night' : 'day';
  }
  const leaderboard = $('leaderboard');
  leaderboard.replaceChildren();
  sortedPlayers().forEach((player, index) => {
    const row = document.createElement('div');
    row.className = `leader-row${player.id === room.localId ? ' local' : ''}`;
    const rank = document.createElement('span');
    rank.className = 'leader-rank';
    rank.textContent = index + 1;
    const name = document.createElement('span');
    name.className = 'leader-name';
    name.textContent = player.name;
    const distance = document.createElement('span');
    distance.className = 'leader-distance';
    distance.textContent = player.disconnected ? 'LEFT' : player.out ? `OUT · ${Math.floor(player.distance / 10)}m` : `${Math.floor(player.distance / 10)}m`;
    row.append(rank, name, distance);
    leaderboard.append(row);
  });
  $('player-stats').hidden = !local;
  if (local) {
    const lives = document.createElement('span');
    lives.className = 'lives';
    lives.setAttribute('aria-label', `${local.lives} lives remaining`);
    for (let index = 0; index < 3; index += 1) {
      const life = document.createElement('i');
      life.className = index < local.lives ? 'life active' : 'life';
      lives.append(life);
    }
    const speed = document.createElement('span');
    speed.className = 'speed-readout';
    speed.textContent = local.out ? 'OUT' : `${Math.round(local.speed / 5)} KM/H`;
    $('player-stats').replaceChildren(lives, speed);
  }
}

function updateCountdown() {
  const remaining = startAt - Date.now();
  const countdown = $('countdown');
  if (remaining <= 0 || view !== 'race' || latestSnapshot?.time > 0) {
    countdown.hidden = true;
    return;
  }
  countdown.hidden = false;
  const value = Math.ceil(remaining / 1000);
  if (value !== countdownValue) {
    countdownValue = value;
    $('countdown-number').textContent = value;
    $('countdown-number').style.animation = 'none';
    void $('countdown-number').offsetWidth;
    $('countdown-number').style.animation = '';
  }
}

function handleRaceEvents(events) {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (event.id !== room.localId) continue;
    if (event.type === 'hit') toast('Ouch! One life used.');
    if (event.type === 'out') toast('You’re out. Watch your crew run!');
  }
}

function showResults() {
  setView('results');
  const standings = sortedPlayers();
  const local = standings.find(player => player.id === room.localId);
  const winner = standings[0];
  $('results-title').textContent = local && winner?.id === room.localId ? 'You ruled the desert!' : winner ? `${winner.name} wins!` : 'Run complete!';
  $('results-subtitle').textContent = local ? `You ran ${Math.floor(local.distance / 10)} meters. Ready for another?` : 'The desert is calling. Ready for another run?';
  const list = $('results-list');
  list.replaceChildren();
  standings.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = index + 1;
    rank.style.color = index === 0 ? '#fff' : playerColor(player.character);
    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = player.id === room.localId ? `${player.name} (you)` : player.name;
    const detail = document.createElement('span');
    detail.className = 'result-detail';
    detail.textContent = `${Math.floor(player.distance / 10)} m${player.disconnected ? ' · Left' : ''}`;
    row.append(rank, name, detail);
    list.append(row);
  });
  $('rematch-button').hidden = !room.isHost;
  $('lobby-button').hidden = !room.isHost;
  $('results-waiting').hidden = room.isHost;
}

function sendControls(input) {
  if (view !== 'race' || Date.now() < startAt || latestSnapshot?.ended) return;
  if (!raceParticipants.some(player => player.id === room.localId)) return;
  if (room.isHost) race?.setInput(room.localId, input);
  else room.sendInput(input);
}

function toast(message, duration = 2800) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}

async function copyInvite(copyCodeOnly = false) {
  if (!room?.code) return;
  const text = copyCodeOnly ? room.code : shareUrl(room.code);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $('share-link').value = shareUrl(room.code);
    $('share-link').select();
    document.execCommand('copy');
  }
  toast(copyCodeOnly ? 'Room code copied!' : 'Invite link copied! Send it to your crew.');
}

function animate(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (view === 'race' || view === 'results') {
    renderer.drawRace(now);
    updateCountdown();
  } else renderer.drawIdle(now / 1000, roomPlayers);

  const participating = raceParticipants.some(player => player.id === room.localId);
  controls.enabled = view === 'race' && participating && Date.now() >= startAt && !latestSnapshot?.ended;
  if (view === 'race' && Date.now() >= startAt && !latestSnapshot?.ended) {
    if (room.isHost && race) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        race.update(1 / 60);
        accumulator -= 1 / 60;
      }
      if (now - lastSnapshotAt >= 50 || race.ended) {
        lastSnapshotAt = now;
        const snapshot = race.snapshot();
        room.sendSnapshot(raceId, snapshot);
        handleSnapshot(snapshot);
        const events = race.drainEvents();
        handleRaceEvents(events);
        room.sendEvents(events);
      }
    } else if (!room.isHost && participating && now - lastInputAt >= 100) {
      lastInputAt = now;
      room.sendInput(controls.state);
    }
  }
  requestAnimationFrame(animate);
}

$('create-button').addEventListener('click', createRoomFromUI);
$('join-button').addEventListener('click', joinRoomFromUI);
$('code-input').addEventListener('input', event => { event.target.value = cleanCode(event.target.value); });
$('code-input').addEventListener('keydown', event => { if (event.key === 'Enter') joinRoomFromUI(); });
$('name-input').addEventListener('keydown', event => { if (event.key === 'Enter') $('code-input').value ? joinRoomFromUI() : createRoomFromUI(); });
for (const [id, direction] of [['character-previous', -1], ['character-next', 1]]) {
  $(id).addEventListener('click', () => {
    character = (character + direction + CHARACTERS) % CHARACTERS;
    drawCharacterPreview($('character-preview'), character);
    profile();
  });
}
$('start-button').addEventListener('click', startNewRace);
$('rematch-button').addEventListener('click', startNewRace);
$('lobby-button').addEventListener('click', () => {
  room.returnToLobby();
  showLobby();
});
$('copy-link').addEventListener('click', () => copyInvite());
$('copy-code').addEventListener('click', () => copyInvite(true));
$('native-share').hidden = !navigator.share;
$('native-share').addEventListener('click', () => navigator.share({ title: 'Dino Party', text: `Join my Dino Party room ${room.code}`, url: shareUrl(room.code) }).catch(() => {}));
$('leave-button').addEventListener('click', () => {
  room.leave();
  showHome();
});
$('brand-home').addEventListener('click', () => {
  if (view === 'home') return;
  room.leave();
  showHome();
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', event => {
  if (event.target === $('help-dialog')) $('help-dialog').close();
});

const invite = cleanCode(new URLSearchParams(window.location.search).get('room'));
if (invite.length === 6) {
  $('code-input').value = invite;
  $('invite-code').textContent = invite;
  $('invite-banner').hidden = false;
  $('join-button').textContent = 'Join the party';
}

setView('home');
requestAnimationFrame(animate);
