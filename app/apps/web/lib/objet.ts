/** Copie d'un objet sans certains champs (remplace « const { a: _a, ...reste } = o »). */
export function sans<T extends object, K extends keyof T>(objet: T, ...cles: K[]): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(objet).filter(([cle]) => !(cles as PropertyKey[]).includes(cle)),
  ) as Omit<T, K>;
}
