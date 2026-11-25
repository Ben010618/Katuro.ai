/** `promise`, or a rejection with `message` after `ms` (the timer is always cleared). */
export function withTimeout(promise, ms, message = 'This took too long') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}
