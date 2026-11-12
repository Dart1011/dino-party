export const POWERUPS = Object.freeze({
  nitro: { name: 'NITRO', color: '#f4c44e', ink: '#a47400', description: 'A 2.5-second speed burst.' },
  shield: { name: 'SHIELD', color: '#67c9d4', ink: '#257582', description: 'Blocks one obstacle or attack for up to 8 seconds.' },
  bolt: { name: 'BOLT ×3', color: '#8fc7ff', ink: '#4279b9', description: 'Fire three quick shots at rivals ahead.' },
  shunt: { name: 'SHUNT', color: '#c49af4', ink: '#7b49ad', description: 'Launch a persistent homing orb.' },
  mine: { name: 'MINE', color: '#ef7865', ink: '#b74436', description: 'Leave an explosive surprise behind you.' },
  barge: { name: 'BARGE', color: '#f29e59', ink: '#aa5a1d', description: 'Blast nearby rivals in both directions.' },
  repair: { name: 'REPAIR', color: '#83c995', ink: '#357548', description: 'Restore a life, or gain a shield at full health.' },
});

export const POWERUP_TYPES = Object.freeze(Object.keys(POWERUPS));

export function drawPowerupIcon(ctx, type, x, y, size, time = 0) {
  const definition = POWERUPS[type] || POWERUPS.nitro;
  const scale = size / 48;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#293438';
  ctx.fillStyle = definition.color;

  if (type === 'bolt') {
    ctx.beginPath();
    ctx.moveTo(5, -22);
    ctx.lineTo(-14, 3);
    ctx.lineTo(-2, 3);
    ctx.lineTo(-7, 22);
    ctx.lineTo(16, -7);
    ctx.lineTo(3, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (type === 'shunt') {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-19, -10);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-19, 10);
    ctx.moveTo(19, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(19, 10);
    ctx.stroke();
  } else if (type === 'mine') {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
      ctx.lineTo(Math.cos(angle) * 21, Math.sin(angle) * 21);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = Math.floor(time * 6) % 2 ? '#fff3cf' : '#293438';
    ctx.fillRect(-3, -3, 6, 6);
  } else if (type === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(18, -13);
    ctx.lineTo(15, 7);
    ctx.quadraticCurveTo(10, 17, 0, 22);
    ctx.quadraticCurveTo(-10, 17, -15, 7);
    ctx.lineTo(-18, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fffdf7';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.stroke();
  } else if (type === 'nitro') {
    for (const offset of [-12, 5]) {
      ctx.beginPath();
      ctx.moveTo(offset - 6, -16);
      ctx.lineTo(offset + 8, 0);
      ctx.lineTo(offset - 6, 16);
      ctx.lineTo(offset - 1, 16);
      ctx.lineTo(offset + 14, 0);
      ctx.lineTo(offset - 1, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (type === 'barge') {
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const radius of [13, 21]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.moveTo(radius * Math.cos(Math.PI * 0.25), radius * Math.sin(Math.PI * 0.25));
      ctx.arc(0, 0, radius, Math.PI * 0.25, Math.PI * 0.75);
      ctx.moveTo(radius * Math.cos(Math.PI * 1.25), radius * Math.sin(Math.PI * 1.25));
      ctx.arc(0, 0, radius, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    }
  } else {
    ctx.fillRect(-7, -20, 14, 40);
    ctx.fillRect(-20, -7, 40, 14);
    ctx.strokeRect(-7, -20, 14, 40);
    ctx.strokeRect(-20, -7, 40, 14);
    ctx.strokeStyle = '#fffdf7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.stroke();
  }
  ctx.restore();
}
