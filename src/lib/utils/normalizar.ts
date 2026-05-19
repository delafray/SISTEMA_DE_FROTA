export function normalizar(s: string): string {
  return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
