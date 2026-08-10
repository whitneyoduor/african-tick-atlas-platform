export const KEY_SPECIES = [
  "Rhipicephalus appendiculatus",
  "Rhipicephalus sanguineus",
  "Rhipicephalus microplus",
  "Hyalomma marginatum",
  "Hyalomma rufipes",
];

export function prioritizeSpecies<T extends { name: string }>(list: T[]): T[] {
  const order = new Map(KEY_SPECIES.map((s, i) => [s.toLowerCase(), i]));
  const keyed: { item: T; index: number }[] = [];
  const rest: T[] = [];
  for (const item of list) {
    const idx = order.get((item.name || "").trim().toLowerCase());
    if (idx !== undefined) {
      keyed.push({ item, index: idx });
    } else {
      rest.push(item);
    }
  }
  keyed.sort((a, b) => a.index - b.index);
  return [...keyed.map((k) => k.item), ...rest];
}
