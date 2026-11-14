import type { Source } from '../types';
import { CloudIcon, DeviceIcon } from './icons';

/** Shows where a piece of text was actually generated, as reported by the Firebase SDK. */
export function SourceBadge({ source, compact = false }: { source: Source; compact?: boolean }) {
  const onDevice = source === 'device';
  const label = onDevice ? 'On this device' : 'In the cloud';
  return (
    <span className={`badge ${onDevice ? 'badge--device' : 'badge--cloud'}`} title={label}>
      {onDevice ? <DeviceIcon size={14} /> : <CloudIcon size={14} />}
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </span>
  );
}
