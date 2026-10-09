export function normalizePlayerName(value) {
  const cleaned = String(value || 'Player')
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, 18).join('').trim() || 'Player';
}
