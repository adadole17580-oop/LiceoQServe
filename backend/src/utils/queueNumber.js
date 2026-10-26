export function formatQueueNumber(sequence, officeName) {
  const prefix = officeName === 'Cashier' ? 'C' : 'R'
  return `${prefix}-${String(sequence).padStart(3, '0')}`
}
