export const isCutoffPassed = (
  targetDate?: Date,
  cutoffTimeStr: string = '22:00:00'
): boolean => {
  const now = new Date();
  const [hours, minutes] = cutoffTimeStr.split(':').map(Number);
  const cutoffToday = new Date(now);
  cutoffToday.setHours(hours, minutes, 0, 0);

  if (targetDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    const diffDays = Math.round(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays <= 0) return true; // past or today is locked
    if (diffDays === 1) return now > cutoffToday; // tomorrow locks after cutoff
    return false; // future dates beyond tomorrow are open
  }

  return now > cutoffToday;
};

export const getCutoffMessage = (cutoffTimeStr: string = '22:00:00'): string => {
  const [h, m] = cutoffTimeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHours = h % 12 || 12;
  const displayMinutes = m < 10 ? `0${m}` : m;
  return `Changes for tomorrow must be saved before ${displayHours}:${displayMinutes} ${period}.`;
};
