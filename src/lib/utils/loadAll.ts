const PAGE = 1000;

export async function loadAll<T>(
  builder: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let p = 0; p < 100; p++) {
    const { data } = await builder(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
