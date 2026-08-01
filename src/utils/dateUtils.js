export function getLocalDateString(d = new Date()) {
  if (!d) return '';
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return trimmed.slice(0, 10);
  }
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
}

export function parseLocalDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const matchTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
    if (matchTime) {
      const year = parseInt(matchTime[1], 10);
      const month = parseInt(matchTime[2], 10) - 1;
      const day = parseInt(matchTime[3], 10);
      const hours = parseInt(matchTime[4], 10);
      const minutes = parseInt(matchTime[5], 10);
      const seconds = parseInt(matchTime[6] || '0', 10);
      return new Date(year, month, day, hours, minutes, seconds);
    }
    const matchDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchDate) {
      const year = parseInt(matchDate[1], 10);
      const month = parseInt(matchDate[2], 10) - 1;
      const day = parseInt(matchDate[3], 10);
      return new Date(year, month, day);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function getFirstDayOfMonthString() {
  const d = new Date();
  d.setDate(1);
  return getLocalDateString(d);
}

export function getPrintedInvoiceNo(invNo) {
  if (!invNo) return '';
  const str = String(invNo).trim();
  const num = parseInt(str, 10);
  if (!isNaN(num) && num > 0 && /^\d+$/.test(str)) {
    const cycle = ((num - 1) % 100) + 1;
    return String(cycle);
  }
  return str;
}
