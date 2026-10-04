// Anime character avatar data for profile picture picker
// Each avatar is a CSS-rendered character using emoji + gradient backgrounds
// No external assets required

export interface AnimeAvatar {
  id: string;
  name: string;
  emoji: string;
  bgFrom: string;
  bgTo: string;
  series: string;
  spriteCol?: number;
  spriteRow?: number;
}

export const ANIME_AVATARS: AnimeAvatar[] = [
  { id: 'naruto',    name: 'Naruto',      emoji: '🦊', bgFrom: '#ff6b00', bgTo: '#ff9c00', series: 'Naruto', spriteCol: 0, spriteRow: 0 },
  { id: 'goku',      name: 'Goku',        emoji: '⚡', bgFrom: '#1a73e8', bgTo: '#4fc3f7', series: 'Dragon Ball', spriteCol: 1, spriteRow: 0 },
  { id: 'sailor',    name: 'Sailor Moon', emoji: '🌙', bgFrom: '#c471ed', bgTo: '#f7797d', series: 'Sailor Moon', spriteCol: 2, spriteRow: 0 },
  { id: 'pikachu',   name: 'Pikachu',     emoji: '⚡', bgFrom: '#f9ca24', bgTo: '#f0932b', series: 'Pokémon', spriteCol: 3, spriteRow: 0 },
  { id: 'luffy',     name: 'Luffy',       emoji: '🏴‍☠️', bgFrom: '#e74c3c', bgTo: '#c0392b', series: 'One Piece', spriteCol: 0, spriteRow: 1 },
  { id: 'levi',      name: 'Levi',        emoji: '⚔️', bgFrom: '#2c3e50', bgTo: '#4a4a4a', series: 'Attack on Titan', spriteCol: 1, spriteRow: 1 },
  { id: 'zerotwo',   name: 'Zero Two',    emoji: '🌸', bgFrom: '#f953c6', bgTo: '#b91d73', series: 'DITF', spriteCol: 2, spriteRow: 1 },
  { id: 'rem',       name: 'Rem',         emoji: '💙', bgFrom: '#4facfe', bgTo: '#00f2fe', series: 'Re:Zero', spriteCol: 3, spriteRow: 1 },
  { id: 'itachi',    name: 'Itachi',      emoji: '🔴', bgFrom: '#1a1a2e', bgTo: '#16213e', series: 'Naruto', spriteCol: 0, spriteRow: 2 },
  { id: 'gojo',      name: 'Gojo',        emoji: '🌀', bgFrom: '#667eea', bgTo: '#764ba2', series: 'JJK', spriteCol: 1, spriteRow: 2 },
  { id: 'nezuko',    name: 'Nezuko',      emoji: '🎋', bgFrom: '#f093fb', bgTo: '#f5576c', series: 'Demon Slayer', spriteCol: 2, spriteRow: 2 },
  { id: 'hinata',    name: 'Hinata',      emoji: '🏐', bgFrom: '#ff7c00', bgTo: '#ff5252', series: 'Haikyuu', spriteCol: 3, spriteRow: 2 },
  { id: 'kakashi',   name: 'Kakashi',     emoji: '📖', bgFrom: '#3a3a3a', bgTo: '#6a6a6a', series: 'Naruto', spriteCol: 0, spriteRow: 3 },
  { id: 'mikasa',    name: 'Mikasa',      emoji: '🩸', bgFrom: '#b71c1c', bgTo: '#ef5350', series: 'Attack on Titan', spriteCol: 1, spriteRow: 3 },
  { id: 'tanjiro',   name: 'Tanjiro',     emoji: '🌊', bgFrom: '#0f3460', bgTo: '#533483', series: 'Demon Slayer', spriteCol: 2, spriteRow: 3 },
  { id: 'erza',      name: 'Erza',        emoji: '⚜️', bgFrom: '#b83232', bgTo: '#f0a500', series: 'Fairy Tail', spriteCol: 3, spriteRow: 3 },
];

export function getAvatarById(id: string): AnimeAvatar | undefined {
  return ANIME_AVATARS.find((a) => a.id === id);
}

export function getDefaultAvatar(): AnimeAvatar {
  return ANIME_AVATARS[0];
}

// Generate a consistent avatar index from a username string
export function getAvatarForUsername(username: string): AnimeAvatar {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ANIME_AVATARS.length;
  return ANIME_AVATARS[index];
}
