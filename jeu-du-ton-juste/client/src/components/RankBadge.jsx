import Icon from './Icon.jsx';
import { getRankLabel } from '../engine/rewards.js';

const ICONE = { diamant: 'crown', platine: 'gem', or: 'medal', argent: 'medal', bronze: 'medal' };

/** Rang obtenu sur un niveau. Les couleurs viennent de styles.css (lisibles en clair et en sombre). */
export default function RankBadge({ rank, size = 'md' }) {
  if (!rank) return <span className={`rank-badge rank-null size-${size}`}>—</span>;
  return (
    <span className={`rank-badge rank-${rank} size-${size}`}>
      <Icon name={ICONE[rank]} size={size === 'lg' ? 18 : 14} />
      {getRankLabel(rank)}
    </span>
  );
}
