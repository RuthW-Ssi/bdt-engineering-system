export function fmtTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function fmtDate(d: string): string {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const [y, mo, dd] = d.split('-')
  return `${parseInt(dd)} ${months[parseInt(mo) - 1]} ${parseInt(y) + 543}`
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}
