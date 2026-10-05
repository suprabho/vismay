/** Small text helpers shared by the stub and the brief sections. */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The playbook bans em dashes in generated text (0.4). */
export function hasEmDash(s: string): boolean {
  return s.includes('—')
}
