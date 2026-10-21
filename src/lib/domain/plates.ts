/** Plates per side for a target weight (display units). Greedy, largest first. */
export function platesPerSide(target: number, bar: number, available: number[]): { plates: number[]; remainder: number } {
  let perSide = (target - bar) / 2;
  if (perSide <= 0) return { plates: [], remainder: 0 };
  const plates: number[] = [];
  for (const p of [...available].sort((a, b) => b - a)) {
    while (perSide + 1e-9 >= p) {
      plates.push(p);
      perSide -= p;
    }
  }
  return { plates, remainder: Number((perSide * 2).toFixed(3)) };
}
