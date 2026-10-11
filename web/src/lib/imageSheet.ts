/**
 * createImageSheet — 여러 이미지 버퍼를 하나의 그리드 시트로 합성.
 * sharp 기반, 4096×4096 흰색 배경, 1~9장 자동 레이아웃.
 */
export async function createImageSheet(imageBuffers: Buffer[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const sheetSize = 4096;
  const count = imageBuffers.length;
  if (count === 0) throw new Error("No images provided");

  // 레이아웃 결정 (1-9장)
  let cols: number, rows: number;
  if (count === 1) { cols = 1; rows = 1; }
  else if (count === 2) { cols = 2; rows = 1; }
  else if (count <= 4) { cols = 2; rows = 2; }
  else if (count <= 6) { cols = 3; rows = 2; }
  else { cols = 3; rows = 3; }

  const cellW = Math.floor(sheetSize / cols);
  const cellH = Math.floor(sheetSize / rows);

  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let x = col * cellW;
    const y = row * cellH;
    // 3장일 때 마지막 이미지는 하단 중앙
    if (count === 3 && i === 2) {
      x = Math.floor((sheetSize - cellW) / 2);
    }
    const resized = await sharp(imageBuffers[i])
      .resize(cellW, cellH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    composites.push({ input: resized, left: x, top: y });
  }

  return sharp({
    create: { width: sheetSize, height: sheetSize, channels: 4 as const, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
