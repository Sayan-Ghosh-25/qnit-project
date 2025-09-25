export function nowPlusMinutes(mins = 10) {
    return new Date(Date.now() + mins * 60 * 1000);
  }
  