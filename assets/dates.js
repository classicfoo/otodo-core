export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateLabel(value) {
  const date = parseDate(value);
  if (!date) return '';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDate - startOfToday) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return 'Overdue';
  if (diffDays <= 7) return 'Next week';
  return date.toLocaleDateString();
}

export function dueStatus(value) {
  const date = parseDate(value);
  if (!date) return { label: '', status: '' };
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDate - startOfToday) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', status: 'overdue' };
  if (diffDays === 0) return { label: 'Today', status: 'today' };
  if (diffDays === 1) return { label: 'Tomorrow', status: 'soon' };
  if (diffDays <= 7) return { label: 'Next week', status: 'soon' };
  return { label: date.toLocaleDateString(), status: '' };
}
