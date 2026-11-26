import { ROLES } from '../../models/access.model.js';

export default function RoleBadge({ role, name }) {
  const info = ROLES[role];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${info?.badge ?? 'bg-tint-strong'}`}>
      {info?.label ?? name ?? role}
    </span>
  );
}
