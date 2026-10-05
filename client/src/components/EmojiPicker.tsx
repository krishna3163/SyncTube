import React, { useState, useMemo } from 'react';
import { X, Sparkles } from 'lucide-react';

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSendFloatingReaction?: (emoji: string) => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Faces',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗',
      '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶',
      '🫥', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪',
      '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶',
      '🥴', '😵', '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐',
      '😕', '🫤', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺',
      '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
      '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈',
      '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures & People',
    icon: '👍',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
      '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '👃', '👀', '👁️',
      '👅', '👄', '🫦', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨',
      '🧑‍🦱', '🧑‍🦰', '👱', '🧑‍🦳', '🧑‍🦲', '👵', '🧓', '👴', '👲', '👳',
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Love',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💋', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️',
      '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '✨', '⭐', '🌟', '⚡',
    ],
  },
  {
    id: 'party',
    name: 'Party & Fun',
    icon: '🎉',
    emojis: [
      '🔥', '🎉', '🎊', '🎈', '🎂', '🍰', '🧁', '🎁', '🪄', '🪅',
      '🪩', '🎮', '🕹️', '🎲', '🎯', '🎳', '🎨', '🎬', '🎤', '🎧',
      '🎼', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🏆', '🥇',
      '🥈', '🥉', '🍿', '🍕', '🍔', '🍟', '🌭', '🌮', '🍩', '🍫',
      '🍬', '🍭', '🍦', '🍧', '🍨', '🍺', '🍻', '🥂', '🍷', '🍸',
      '🍹', '🍾', '☕', '🧋', '👑', '💎', '💰', '💵', '🚀', '🛸',
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔',
      '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴',
      '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🕷️', '🐢', '🐍',
      '🦎', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
      '🦈', '🐊', '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '💐', '🌴',
      '🌲', '🌳', '🍀', '🍁', '🍂', '🍃', '🍄', '🌍', '🌙', '☀️',
    ],
  },
  {
    id: 'objects',
    name: 'Objects & Travel',
    icon: '🚀',
    emojis: [
      '📱', '💻', '🖥️', '📺', '📷', '📸', '📹', '📼', '🔍', '🔎',
      '💡', '🔦', '📖', '📚', '✉️', '📦', '✏️', '📝', '📅', '📌',
      '📍', '🔒', '🔑', '🔨', '🛠️', '⚙️', '💣', '🛡️', '🚗', '🏎️',
      '🏍️', '🚲', '✈️', '🚁', '⛵', '🚢', '🚆', '🚨', '🚦', '🧭',
      '🏖️', '🏝️', '🌋', '🏔️', '⛺', '🏰', '🗼', '🗽', '💈', '🎪',
    ],
  },
];

const QUICK_FLOAT_REACTIONS = ['❤️', '🔥', '😂', '👏', '🎉', '🍿', '💀', '⚡'];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSendFloatingReaction,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) {
      return EMOJI_CATEGORIES.find((c) => c.id === activeCategory)?.emojis || [];
    }
    // Search across all emojis in all categories
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    return Array.from(new Set(all));
  }, [activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="android-emoji-picker">
      {/* Top Header with Quick Reactions & Close */}
      <div className="emoji-picker-header">
        <div className="emoji-quick-reactions-wrap">
          <span className="emoji-quick-label">
            <Sparkles size={12} color="var(--accent)" />
            <span>Quick Send:</span>
          </span>
          <div className="emoji-quick-list">
            {QUICK_FLOAT_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-quick-btn"
                onClick={() => {
                  if (onSendFloatingReaction) {
                    onSendFloatingReaction(emoji);
                  }
                  onSelectEmoji(emoji);
                }}
                title={`Send ${emoji} to screen`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="emoji-picker-close-btn"
          onClick={onClose}
          title="Close emoji picker"
        >
          <X size={15} />
        </button>
      </div>

      {/* Category Tabs Bar */}
      <div className="emoji-category-tabs">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`emoji-cat-tab ${activeCategory === cat.id && !searchQuery ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory(cat.id);
              setSearchQuery('');
            }}
            title={cat.name}
          >
            <span className="emoji-cat-icon">{cat.icon}</span>
            <span className="emoji-cat-name">{cat.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Emoji Grid Container */}
      <div className="emoji-grid-scroll">
        <div className="emoji-grid">
          {filteredEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              className="emoji-item-btn"
              onClick={() => onSelectEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
