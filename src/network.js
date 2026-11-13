import mqtt from 'mqtt';
import { MAX_PLAYERS, ROOM_TOPIC_PREFIX, cleanCode, makeRoomCode, sanitizeInput, sanitizeProfile } from './protocol.js';

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const ERROR_MESSAGES = {
  network: 'Could not reach the room service. Check your connection and try again.',
  'browser-incompatible': 'This browser cannot open a room connection. Try the latest Chrome, Edge, Firefox, or Safari.',
};

function clientId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export class Room extends EventTarget {
  constructor() {
    super();
    this.isHost = false;
    this.localId = null;
    this.clientId = clientId();
    this.code = '';
    this.players = [];
    this.phase = 'home';
    this.raceProvider = null;
    this.destroyed = false;
    this.mqttClient = null;
    this.brokerIndex = 0;
    this.hasConnected = false;
    this.hasWelcomed = false;
    this.lastSeen = new Map();
    this.hostLastSeen = 0;
    this.raceId = null;
    this.pendingSnapshot = null;
    this.timers = new Set();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  error(error) {
    const kind = error?.type || error?.name;
    this.emit('error', ERROR_MESSAGES[kind] || error?.message || 'The connection failed. Please try again.');
  }

  every(milliseconds, callback) {
    const timer = setInterval(callback, milliseconds);
    this.timers.add(timer);
    return timer;
  }

  after(milliseconds, callback) {
    const timer = setTimeout(callback, milliseconds);
    this.timers.add(timer);
    return timer;
  }

  create(profile) {
    this.destroyed = false;
    this.isHost = true;
    this.phase = 'lobby';
    this.code = makeRoomCode();
    this.profile = sanitizeProfile(profile);
    this.localId = 'host';
    this.players = [{ id: 'host', ...this.profile, host: true }];
    this.connect();
    this.every(3000, () => this.sendPresence());
    this.every(100, () => this.flushSnapshot());
    this.every(5000, () => this.removeStalePlayers());
    this.after(25000, () => {
      if (!this.hasConnected && !this.destroyed) this.error({ type: 'network' });
    });
  }

  join(code, profile) {
    this.destroyed = false;
    this.isHost = false;
    this.phase = 'joining';
    this.code = cleanCode(code);
    this.profile = sanitizeProfile(profile);
    this.localId = this.clientId;
    this.players = [];
    this.hostLastSeen = Date.now();
    this.connect();
    this.every(4000, () => this.sendPresence());
    this.every(3000, () => {
      if (this.phase !== 'joining' && Date.now() - this.hostLastSeen > 35000) {
        const wasDestroyed = this.destroyed;
        this.leave();
        if (!wasDestroyed) this.emit('host-left');
      }
    });
    this.after(30000, () => {
      if (this.phase !== 'joining' || this.destroyed) return;
      this.leave();
      if (this.hasConnected) this.emit('error', 'The room did not respond. Check the code and make sure the host still has the room open.');
      else this.error({ type: 'network' });
    });
  }

  connect() {
    if (this.destroyed) return;
    const topic = `${ROOM_TOPIC_PREFIX}${this.code}`;
    const client = mqtt.connect(BROKERS[this.brokerIndex], {
      clientId: `dino-party-${this.clientId}`,
      clean: true,
      connectTimeout: 12000,
      reconnectPeriod: 2000,
      keepalive: 30,
    });
    this.mqttClient = client;
    client.on('connect', () => {
      if (this.destroyed || client !== this.mqttClient) {
        client.end(true);
        return;
      }
      client.subscribe(topic, { qos: 0 }, error => {
        if (error) {
          this.emit('status', 'Still trying to reach the room service…');
          return;
        }
        this.hostLastSeen = Date.now();
        if (this.isHost) {
          if (!this.hasConnected) this.emit('ready', { code: this.code, players: this.players });
          this.sendPresence();
          this.broadcastLobby();
          this.flushSnapshot();
        } else {
          this.publish({ type: 'hello', profile: this.profile });
        }
        this.hasConnected = true;
        this.emit('status', `${this.code} · ${this.isHost ? 'HOST' : 'CONNECTED'}`);
      });
    });
    client.on('message', (receivedTopic, payload) => {
      if (receivedTopic !== topic) return;
      try {
        const message = JSON.parse(payload.toString());
        if (!message || message.sender === this.localId) return;
        if (message.target && message.target !== this.localId) return;
        this.receive(message);
      } catch {}
    });
    client.on('close', () => {
      if (!this.destroyed && client === this.mqttClient) this.emit('status', 'Reconnecting to the room service…');
    });
    client.on('error', () => {
      if (this.destroyed || client !== this.mqttClient) return;
      if (!this.hasConnected) {
        this.brokerIndex = (this.brokerIndex + 1) % BROKERS.length;
        this.emit('status', 'Trying another room service…');
        client.end(true);
        this.connect();
      } else {
        this.emit('status', 'Connection interrupted. Reconnecting…');
      }
    });
  }

  publish(message, afterLeave = false) {
    if (!this.mqttClient?.connected || (this.destroyed && !afterLeave)) return;
    const body = JSON.stringify({ ...message, sender: this.localId, isHost: this.isHost });
    this.mqttClient.publish(`${ROOM_TOPIC_PREFIX}${this.code}`, body, { qos: 0, retain: false });
  }

  broadcast(message) {
    this.publish(message);
  }

  sendPresence() {
    if (this.destroyed) return;
    if (!this.isHost && this.phase === 'joining') this.publish({ type: 'hello', profile: this.profile });
    else this.publish({ type: 'presence', phase: this.phase, profile: this.profile });
  }

  receive(message) {
    if (this.isHost) {
      if (message.isHost) return;
      this.receiveAsHost(message);
      return;
    }
    if (!message.isHost || message.sender !== 'host') return;
    this.hostLastSeen = Date.now();
    if (message.type === 'welcome') {
      const resuming = this.hasWelcomed;
      this.hasWelcomed = true;
      this.localId = message.id;
      this.phase = message.phase;
      this.players = message.players;
      if (!resuming) this.emit('ready', { code: this.code, players: this.players });
      this.emit('lobby', { players: this.players, phase: this.phase });
      if (message.race) {
        const newRace = message.race.raceId !== this.raceId;
        this.raceId = message.race.raceId;
        if (!resuming || newRace) this.emit('start', message.race);
        else if (message.race.snapshot) this.emit('snapshot', { raceId: message.race.raceId, snapshot: message.race.snapshot });
      }
      return;
    }
    if (message.type === 'lobby') {
      this.phase = message.phase;
      this.players = message.players;
      this.emit('lobby', message);
      if (message.phase === 'lobby') this.emit('return-lobby');
    }
    if (message.type === 'start') {
      this.phase = 'race';
      this.raceId = message.raceId;
      this.emit('start', message);
    }
    if (message.type === 'snapshot') this.emit('snapshot', message);
    if (message.type === 'events') this.emit('race-events', message.events);
    if (message.type === 'full') {
      this.leave();
      this.emit('error', 'That room is full. Rooms support up to 8 players.');
    }
    if (message.type === 'host-left') {
      const wasDestroyed = this.destroyed;
      this.leave();
      if (!wasDestroyed) this.emit('host-left');
    }
  }

  receiveAsHost(message) {
    if (message.sender === 'host' || !/^[a-f0-9]{16}$/.test(message.sender)) return;
    this.lastSeen.set(message.sender, Date.now());
    if (message.type === 'hello' || (message.type === 'presence' && !this.players.some(player => player.id === message.sender))) {
      this.acceptGuest(message);
      return;
    }
    if (!this.players.some(player => player.id === message.sender)) return;
    if (message.type === 'input') this.emit('input', { id: message.sender, input: sanitizeInput(message.input) });
    if (message.type === 'profile') this.updatePlayer(message.sender, message.profile);
    if (message.type === 'leave') this.removePlayer(message.sender);
  }

  acceptGuest(message) {
    const id = message.sender;
    const existing = this.players.find(player => player.id === id);
    if (!existing && this.players.length >= MAX_PLAYERS) {
      this.publish({ type: 'full', target: id });
      return;
    }
    if (existing) Object.assign(existing, sanitizeProfile(message.profile));
    else this.players.push({ id, ...sanitizeProfile(message.profile), host: false });
    this.publish({
      type: 'welcome',
      target: id,
      id,
      code: this.code,
      phase: this.phase,
      players: this.publicPlayers(),
      race: this.phase === 'race' ? this.raceProvider?.() : null,
    });
    this.broadcastLobby();
  }

  publicPlayers() {
    return this.players.map(({ id, name, character, host }) => ({ id, name, character, host }));
  }

  updatePlayer(id, profile) {
    const player = this.players.find(player => player.id === id);
    if (!player) return;
    Object.assign(player, sanitizeProfile(profile));
    this.broadcastLobby();
  }

  updateProfile(profile) {
    this.profile = sanitizeProfile(profile);
    if (this.isHost) this.updatePlayer(this.localId, this.profile);
    else this.publish({ type: 'profile', profile: this.profile });
  }

  startRace(race) {
    if (!this.isHost) return;
    this.phase = 'race';
    this.raceId = race.raceId;
    this.broadcast({ type: 'start', ...race });
  }

  sendSnapshot(raceId, snapshot) {
    if (!this.isHost) return;
    this.pendingSnapshot = { raceId, snapshot };
    if (snapshot.ended) this.flushSnapshot();
  }

  flushSnapshot() {
    if (!this.isHost || !this.pendingSnapshot || !this.mqttClient?.connected || this.destroyed) return;
    const message = { type: 'snapshot', ...this.pendingSnapshot };
    this.pendingSnapshot = null;
    this.broadcast(message);
  }

  sendEvents(events) {
    if (events.length) this.broadcast({ type: 'events', events });
  }

  sendInput(input) {
    if (!this.isHost) this.publish({ type: 'input', input: sanitizeInput(input) });
  }

  returnToLobby() {
    if (!this.isHost) return;
    this.phase = 'lobby';
    this.broadcastLobby();
  }

  broadcastLobby() {
    if (!this.isHost) return;
    const message = { type: 'lobby', phase: this.phase, players: this.publicPlayers() };
    this.broadcast(message);
    this.emit('lobby', { phase: this.phase, players: this.players });
  }

  removePlayer(id) {
    const player = this.players.find(player => player.id === id);
    if (!player) return;
    this.players = this.players.filter(player => player.id !== id);
    this.lastSeen.delete(id);
    this.emit('player-left', { id });
    this.broadcastLobby();
  }

  removeStalePlayers() {
    if (!this.isHost) return;
    const cutoff = Date.now() - 35000;
    for (const player of [...this.players]) {
      if (!player.host && (this.lastSeen.get(player.id) || 0) < cutoff) this.removePlayer(player.id);
    }
  }

  leave() {
    if (this.destroyed) return;
    this.publish({ type: this.isHost ? 'host-left' : 'leave' }, true);
    this.destroyed = true;
    this.phase = 'home';
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.timers.clear();
    this.mqttClient?.end();
    this.players = [];
    this.pendingSnapshot = null;
  }
}
