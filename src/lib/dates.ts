export function formatDate(date: Date | string, format: 'date' | 'datetime' | 'isoDate' = 'date'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  switch (format) {
    case 'date':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    case 'datetime':
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    case 'isoDate':
      return d.toISOString().split('T')[0]
    default:
      return d.toLocaleDateString()
  }
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, 'datetime')
}

export function formatDateForInput(date: Date | string): string {
  return formatDate(date, 'isoDate')
}

export function toLocalInput(isoString: string): string {
  const d = new Date(isoString)
  const offset = d.getTimezoneOffset()
  const localTime = new Date(d.getTime() - offset * 60000)
  return localTime.toISOString().slice(0, 16)
}

export function fromLocalInputToISO(localInput: string): string | null {
  if (!localInput) return null
  try {
    const d = new Date(localInput)
    return d.toISOString()
  } catch {
    return null
  }
}