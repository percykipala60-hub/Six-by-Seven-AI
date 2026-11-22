import Icon from './Icon.jsx';

const TAILLES = { sm: 16, md: 22, lg: 40 };

export default function StarsDisplay({ stars = 0, size = 'md', animated = false, max = 3 }) {
  return (
    <div
      className={`stars-display stars-${size} ${animated ? 'stars-animated' : ''}`}
      role="img"
      aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`star ${i < stars ? 'filled' : 'empty'}`}
          style={animated ? { animationDelay: `${i * 0.15}s` } : undefined}
        >
          <Icon name="star" size={TAILLES[size] ?? 22} fill={i < stars} />
        </span>
      ))}
    </div>
  );
}
