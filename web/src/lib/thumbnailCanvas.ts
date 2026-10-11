export const OUTPUT_SIZE = 1000;

export type ImageEntry = {
  img: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
};

type AspectClass = "tall" | "wide" | "squareTall" | "squareWide";

export function classifyAspect(w: number, h: number): AspectClass {
  const ratio = h / w;
  if (ratio >= 2) return "tall";
  if (ratio <= 0.5) return "wide";
  if (ratio >= 1) return "squareTall";
  return "squareWide";
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  valign: "top" | "middle" | "bottom" = "middle",
  halign: "left" | "center" | "right" = "center",
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;
  const scale = Math.min(w / iw, h / ih);
  const sw = iw * scale;
  const sh = ih * scale;
  const ox =
    halign === "left"
      ? x
      : halign === "right"
        ? x + (w - sw)
        : x + (w - sw) / 2;
  const oy =
    valign === "top"
      ? y
      : valign === "bottom"
        ? y + (h - sh)
        : y + (h - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);
}

function drawCascadeGrid(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  area: { x: number; y: number; w: number; h: number },
  overlapPct: number,
  forceCols?: number,
): void {
  const count = images.length;
  if (count === 0) return;

  const cols =
    forceCols ??
    (count >= 25 ? 6 : count >= 16 ? 5 : count >= 10 ? 4 : count <= 4 ? 2 : 3);
  const rows = Math.ceil(count / cols);

  const overlapY = overlapPct + 0.2;
  const cellW = area.w / ((1 - overlapPct) * (cols - 0.25) + 1);
  const cellH = area.h / ((1 - overlapY) * (rows - 1) + 1);
  const stepX = cellW * (1 - overlapPct);
  const stepY = cellH * (1 - overlapY);

  const lastRowCount = count % cols === 0 ? cols : count % cols;
  const isOddTotal = count % 2 === 1;

  images.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const isLastRow = row === rows - 1 && lastRowCount < cols;
    const rowItemCount = isLastRow ? lastRowCount : cols;
    const rowW = (rowItemCount - 1) * stepX + cellW;
    const centerOffsetX =
      isOddTotal && rows <= 2 ? Math.floor((area.w - rowW) / 2) : 0;
    const staggerX = !isLastRow && row % 2 === 1 ? stepX / 2 : 0;
    ctx.globalAlpha = 1;
    drawContain(
      ctx,
      entry.img,
      area.x + centerOffsetX + col * stepX + staggerX,
      area.y + row * stepY,
      cellW,
      cellH,
    );
  });

  ctx.globalAlpha = 1;
}

function drawGridImages(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  area: { x: number; y: number; w: number; h: number },
): void {
  const count = images.length;
  if (count === 0) return;

  const cols = count <= 3 ? 1 : count <= 8 ? 2 : count <= 15 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const OVERLAP = 24;

  const cellW =
    cols === 1 ? area.w : Math.round((area.w + OVERLAP * (cols - 1)) / cols);
  const cellH =
    rows === 1 ? area.h : Math.round((area.h + OVERLAP * (rows - 1)) / rows);

  images.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = area.x + col * (cellW - OVERLAP);
    const y = area.y + row * (cellH - OVERLAP);
    ctx.globalAlpha = 1;
    drawContain(ctx, entry.img, x, y, cellW, cellH);
  });
  ctx.globalAlpha = 1;
}

function drawStackedImages(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  area: { x: number; y: number; w: number; h: number },
  direction: "horizontal" | "vertical",
): void {
  const OFFSET = 28;
  const count = images.length;
  images.forEach((entry, i) => {
    const dx = direction === "horizontal" ? OFFSET * i : 0;
    const dy = direction === "vertical" ? OFFSET * i : 0;
    ctx.globalAlpha = 1;
    drawContain(ctx, entry.img, area.x + dx, area.y + dy, area.w, area.h);
  });
  ctx.globalAlpha = 1;
}

function layout2(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const cls = classifyAspect(images[0].naturalWidth, images[0].naturalHeight);
  if (cls === "tall") {
    const OVERLAP = 15;
    const cellW = Math.round((size + OVERLAP) / 2);
    drawContain(ctx, images[0].img, 0, 0, cellW, size);
    drawContain(ctx, images[1].img, size - cellW, 0, cellW, size);
  } else if (cls === "wide") {
    const OVERLAP = 15;
    const cellH = Math.round((size + OVERLAP) / 2);
    drawContain(ctx, images[0].img, 0, 0, size, cellH, "bottom");
    drawContain(ctx, images[1].img, 0, size - cellH, size, cellH, "top");
  } else {
    const s = size * 0.8;
    drawContain(ctx, images[0].img, 0, 0, s, s);
    drawContain(ctx, images[1].img, size - s, size - s, s, s);
  }
}

function layout3(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const cls = classifyAspect(images[0].naturalWidth, images[0].naturalHeight);
  if (cls === "wide") {
    // 상하 3등분, 15px 겹침
    const OVERLAP = 15;
    const cellH = Math.round((size + OVERLAP * 2) / 3);
    const step = cellH - OVERLAP;
    drawContain(ctx, images[0].img, 0, 0, size, cellH, "bottom");
    drawContain(ctx, images[1].img, 0, step, size, cellH, "middle");
    drawContain(ctx, images[2].img, 0, step * 2, size, cellH, "top");
  } else if (cls === "tall") {
    // 좌우 3등분, 15px 겹침
    const OVERLAP = 15;
    const cellW = Math.round((size + OVERLAP * 2) / 3);
    const step = cellW - OVERLAP;
    drawContain(ctx, images[0].img, 0, 0, cellW, size, "middle", "right");
    drawContain(ctx, images[1].img, step, 0, cellW, size, "middle", "center");
    drawContain(
      ctx,
      images[2].img,
      size - cellW,
      0,
      cellW,
      size,
      "middle",
      "left",
    );
  } else {
    // square: 하단 2/3 hero + 상단 2개
    const OVERLAP = 15;
    const heroH = Math.floor(size * 0.67);
    const heroW = Math.floor(size * 0.7);
    const heroX = Math.floor((size - heroW) / 2);
    const heroY = size - heroH;
    const topH = heroY + OVERLAP;
    drawContain(ctx, images[1].img, 0, 0, size / 2, topH);
    drawContain(ctx, images[2].img, size / 2, 0, size / 2, topH);
    drawContain(ctx, images[0].img, heroX, heroY, heroW, heroH);
  }
}

function layout5PlusTall(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const heroW = Math.floor(size * 0.45);
  const gridArea = { x: heroW, y: 0, w: size - heroW, h: size };
  drawCascadeGrid(ctx, images.slice(1), gridArea, 0.38);
  drawContain(ctx, images[0].img, 0, 0, heroW, size);
}

function drawBalancedRows(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  area: { x: number; y: number; w: number; h: number },
  overlapPct: number,
  numRows: number,
  colShiftY = 0,
  valign: "top" | "middle" | "bottom" = "middle",
  cellAspect?: number,
): void {
  const n = images.length;
  const base = Math.floor(n / numRows);
  const extra = n % numRows;
  const rowCounts = Array.from(
    { length: numRows },
    (_, i) => base + (i < extra ? 1 : 0),
  );
  const maxCols = rowCounts[0];
  const cellW = area.w / ((1 - overlapPct) * (maxCols - 0.8) + 1);
  const stepX = cellW * (1 - overlapPct);
  const overlapY = overlapPct + 0.1;
  const cellH =
    cellAspect !== undefined
      ? cellW * cellAspect
      : area.h / ((1 - overlapY) * (numRows - 1) + 1);
  const stepY = cellH * (1 - overlapY);
  const totalCellsH = (numRows - 1) * stepY + cellH;
  const rowsOffsetY =
    cellAspect !== undefined ? Math.floor((area.h - totalCellsH) / 2) : 0;
  let idx = 0;
  rowCounts.forEach((rowCount, row) => {
    const rowW = (rowCount - 1) * stepX + cellW;
    const startX = area.x + Math.floor((area.w - rowW) / 2);
    for (let col = 0; col < rowCount && idx < n; col++, idx++) {
      const cellX = startX + col * stepX;
      const cellY = area.y + rowsOffsetY + row * stepY + col * colShiftY;
      drawContain(ctx, images[idx].img, cellX, cellY, cellW, cellH, valign);
    }
  });
}

function layout5PlusWide(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const PAD = 0; // 양 옆 패딩 없음
  const TOP_PAD = Math.floor(size * 0.01); // 상단 패딩 1%
  const innerW = size - PAD * 2;

  const heroH = Math.floor(size * 0.47);
  const heroW = size;
  const heroX = 0;
  const bottomPad = Math.floor(size * 0.01);
  const heroY = size - heroH - bottomPad;

  const rest = images.slice(1);

  let heroValign: "top" | "middle" | "bottom" = "top";

  const GAP = Math.floor(size * 0.04); // 히어로와 상단 섹션 사이 간격

  if (rest.length <= 6) {
    // 2열 고정, 행 가변 — 히어로 기준 역산
    const n = rest.length;
    const COLS = 2;
    const rows = Math.ceil(n / COLS);
    const OVERLAP_X = n <= 4 ? 0 : 15;
    const cellW = Math.round((innerW + OVERLAP_X) / COLS);
    const stepX = cellW - OVERLAP_X;
    const aspect = rest[0].naturalHeight / rest[0].naturalWidth;
    const cellH = Math.min(Math.round(cellW * aspect), Math.round(size * 0.32));
    const totalH = rows * cellH;
    const sectionTopY = Math.max(TOP_PAD, heroY - totalH - GAP);
    rest.forEach((entry, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const rowCount = row === rows - 1 && n % COLS !== 0 ? n % COLS : COLS;
      const rowW = (rowCount - 1) * stepX + cellW;
      const startX = PAD + Math.floor((innerW - rowW) / 2);
      drawContain(
        ctx,
        entry.img,
        startX + col * stepX,
        sectionTopY + row * cellH,
        cellW,
        cellH,
        "bottom",
      );
    });
    heroValign = "top";
  } else {
    // 8개+: 2행 (count<10), 10개+: 3행 — 동일 그리드 방식
    const numRows =
      rest.length >= 29
        ? 8
        : rest.length >= 25
          ? 7
          : rest.length >= 21
            ? 6
            : rest.length >= 17
              ? 5
              : rest.length >= 13
                ? 4
                : rest.length >= 9
                  ? 3
                  : 2;
    const topH = Math.floor(size * 0.6);
    const gridStartY = 10;
    const gridArea = { x: 0, y: gridStartY, w: size, h: topH };
    drawBalancedRows(ctx, rest, gridArea, 0.78, numRows, 6, "middle", 0.5);
    heroValign = "top";
  }

  // 히어로를 마지막에 그려 상단 이미지 위에 올라오도록
  drawContain(ctx, images[0].img, heroX, heroY, heroW, heroH, heroValign);
}

function layout5PlusSquareTall(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const PAD = Math.floor(size * 0.03);
  const innerW = size - PAD * 2;

  const heroH = Math.floor(size * 0.73);
  const heroW = size;
  const heroX = 0;
  const bottomPad = Math.floor(size * 0.04);
  const heroY = size - heroH - bottomPad;

  const rest = images.slice(1);

  if (rest.length <= 9) {
    const OVERLAP = 24;
    const n = rest.length;
    const cellW = Math.round((innerW + OVERLAP * (n - 1)) / n);
    const step = cellW - OVERLAP;
    const aspect = rest[0].naturalHeight / rest[0].naturalWidth;
    const cellH = Math.min(Math.round(cellW * aspect), Math.round(size * 0.55));
    rest.forEach((entry, i) => {
      drawContain(ctx, entry.img, PAD + i * step, PAD, cellW, cellH);
    });
  } else {
    const overlapH = Math.floor(size * 0.15);
    const topH = heroY - PAD + overlapH;
    const gridArea = { x: PAD, y: PAD, w: innerW, h: topH };
    const n = rest.length;
    if (n >= 22) {
      drawBalancedRows(ctx, rest, gridArea, 0.48, 3);
    } else {
      drawCascadeGrid(ctx, rest, gridArea, 0.35, Math.ceil(n / 2));
    }
  }

  drawContain(ctx, images[0].img, heroX, heroY, heroW, heroH, "bottom");
}

function layout5PlusSquareWide(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const PAD = Math.floor(size * 0.03);
  const innerW = size - PAD * 2;

  const heroH = Math.floor(size * 0.73);
  const heroW = size;
  const heroX = 0;
  const bottomPad = Math.floor(size * 0.04);
  const heroY = size - heroH - bottomPad;

  const rest = images.slice(1);

  if (rest.length === 2) {
    // 단일 행
    const OVERLAP = 24;
    const n = rest.length;
    const cellW = Math.round((innerW + OVERLAP * (n - 1)) / n);
    const step = cellW - OVERLAP;
    const aspect = rest[0].naturalHeight / rest[0].naturalWidth;
    const cellH = Math.min(Math.round(cellW * aspect), Math.round(size * 0.55));
    rest.forEach((entry, i) => {
      drawContain(ctx, entry.img, PAD + i * step, PAD, cellW, cellH);
    });
  } else if (rest.length === 4) {
    // 5개 squareWide: 상단 4개 2행 2열
    const OVERLAP_X = 24;
    const cellW = Math.round((innerW + OVERLAP_X) / 2);
    const stepX = cellW - OVERLAP_X;
    const aspect = rest[0].naturalHeight / rest[0].naturalWidth;
    const cellH = Math.min(Math.round(cellW * aspect), Math.round(size * 0.35));
    const OVERLAP_Y = Math.round(cellH * 0.5);
    const stepY = cellH - OVERLAP_Y;
    rest.forEach((entry, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      drawContain(
        ctx,
        entry.img,
        PAD + col * stepX,
        PAD + row * stepY,
        cellW,
        cellH,
      );
    });
  } else {
    // 6개 이상: 항상 2행 이상 cascade grid
    const overlapH = Math.floor(size * 0.15);
    const topH = heroY - PAD + overlapH;
    const gridArea = { x: PAD, y: PAD, w: innerW, h: topH };
    const n = rest.length;
    if (n >= 22) {
      drawBalancedRows(ctx, rest, gridArea, 0.48, 4, 6);
    } else if (n >= 11) {
      drawBalancedRows(ctx, rest, gridArea, 0.48, 3, 6);
    } else {
      drawCascadeGrid(ctx, rest, gridArea, 0.35, Math.ceil(n / 2));
    }
  }

  drawContain(ctx, images[0].img, heroX, heroY, heroW, heroH, "bottom");
}

function layoutImages(
  ctx: CanvasRenderingContext2D,
  images: ImageEntry[],
  size: number,
): void {
  const count = images.length;
  if (count === 0) return;
  if (count === 1) {
    drawContain(ctx, images[0].img, 0, 0, size, size);
    return;
  }
  if (count === 2) {
    layout2(ctx, images, size);
    return;
  }
  if (count === 3) {
    const cls3 = classifyAspect(
      images[0].naturalWidth,
      images[0].naturalHeight,
    );
    if (cls3 === "squareTall" || cls3 === "squareWide") {
      cls3 === "squareTall"
        ? layout5PlusSquareTall(ctx, images, size)
        : layout5PlusSquareWide(ctx, images, size);
    } else {
      layout3(ctx, images, size);
    }
    return;
  }
  const cls = classifyAspect(images[0].naturalWidth, images[0].naturalHeight);
  if (count === 4 && cls === "tall") {
    const OVERLAP = 30;
    const cellW = Math.round((size + OVERLAP * 3) / 4);
    const step = cellW - OVERLAP;
    drawContain(ctx, images[0].img, 0, 0, cellW, size);
    drawContain(ctx, images[1].img, step, 0, cellW, size);
    drawContain(ctx, images[2].img, step * 2, 0, cellW, size);
    drawContain(ctx, images[3].img, size - cellW, 0, cellW, size);
    return;
  }
  if (count === 4 && cls === "wide") {
    const OVERLAP = 30;
    const cellH = Math.round((size + OVERLAP * 3) / 4);
    const step = cellH - OVERLAP;
    drawContain(ctx, images[0].img, 0, 0, size, cellH, "bottom");
    drawContain(ctx, images[1].img, 0, step, size, cellH, "middle");
    drawContain(ctx, images[2].img, 0, step * 2, size, cellH, "middle");
    drawContain(ctx, images[3].img, 0, size - cellH, size, cellH, "top");
    return;
  }
  if (cls === "tall") {
    layout5PlusTall(ctx, images, size);
  } else if (cls === "wide") {
    layout5PlusWide(ctx, images, size);
  } else if (cls === "squareTall") {
    layout5PlusSquareTall(ctx, images, size);
  } else {
    layout5PlusSquareWide(ctx, images, size);
  }
}

export async function renderBundleThumbnail(
  images: ImageEntry[],
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  layoutImages(ctx, images, OUTPUT_SIZE);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

export async function loadImageEntry(src: string): Promise<ImageEntry> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    img.onerror = reject;
    img.src = src;
  });
}

const FILL_THRESHOLD = 0.9; // 제품이 가로 또는 세로의 90% 이상을 차지해야 함
const BG_THRESHOLD = 240; // R,G,B 모두 이 값 이상이면 흰 배경으로 판단

/**
 * Gemini가 반환한 흰 배경 썸네일에서 제품 영역을 감지하고,
 * 제품이 가로 또는 세로의 85% 미만을 차지할 경우 자동으로 크롭·확대한다.
 */
export async function autoCropToProduct(base64: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${base64}`;
  });

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (W === 0 || H === 0) return base64;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, W, H).data;

  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      if (
        data[idx] < BG_THRESHOLD ||
        data[idx + 1] < BG_THRESHOLD ||
        data[idx + 2] < BG_THRESHOLD
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return base64; // 제품 감지 실패 시 원본 반환

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  // 여백 3% 추가
  const margin = Math.round(Math.max(W, H) * 0.03);
  const cropX = Math.max(0, minX - margin);
  const cropY = Math.max(0, minY - margin);
  const cropRight = Math.min(W - 1, maxX + margin);
  const cropBottom = Math.min(H - 1, maxY + margin);
  const cropW = cropRight - cropX + 1;
  const cropH = cropBottom - cropY + 1;

  // 정사각형 크롭 영역 계산 (중앙 정렬)
  const cropSize = Math.max(cropW, cropH);
  const squareX = Math.max(
    0,
    Math.min(W - cropSize, cropX - Math.round((cropSize - cropW) / 2)),
  );
  const squareY = Math.max(
    0,
    Math.min(H - cropSize, cropY - Math.round((cropSize - cropH) / 2)),
  );
  const actualSize = Math.min(cropSize, W - squareX, H - squareY);

  const out = document.createElement("canvas");
  out.width = OUTPUT_SIZE;
  out.height = OUTPUT_SIZE;
  const outCtx = out.getContext("2d")!;
  outCtx.fillStyle = "#FFFFFF";
  outCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  outCtx.drawImage(
    canvas,
    squareX,
    squareY,
    actualSize,
    actualSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise<string>((resolve) => {
    out.toBlob((blob) => {
      if (!blob) {
        resolve(base64);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? base64);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

/**
 * 투명 PNG에서 비투명 픽셀(알파 > 10)의 bounding box를 찾아 크롭한다.
 * 여백 2%를 추가하여 제품 크기에 맞는 PNG를 반환한다.
 * removeWhiteBackground 결과물처럼 1000×1000 캔버스에 제품이 작게 있는 경우
 * classifyAspect가 올바른 비율을 반환하도록 크롭 처리한다.
 */
export async function autoCropTransparent(base64: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${base64}`;
  });

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (W === 0 || H === 0) return base64;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, W, H).data;

  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const alpha = data[(y * W + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return base64; // 불투명 픽셀 없음

  const margin = Math.round(Math.max(W, H) * 0.02);
  const cropX = Math.max(0, minX - margin);
  const cropY = Math.max(0, minY - margin);
  const cropW = Math.min(W, maxX + margin + 1) - cropX;
  const cropH = Math.min(H, maxY + margin + 1) - cropY;

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext("2d")!;
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return new Promise<string>((resolve) => {
    out.toBlob((blob) => {
      if (!blob) {
        resolve(base64);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? base64);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

/**
 * 흰 배경을 제거해 투명 PNG로 변환한다.
 * 엣지 플러드 필(Edge Flood Fill) 방식: 이미지 가장자리에서 연결된 흰 픽셀(배경)만
 * 투명 처리하므로 제품 내부의 흰색은 그대로 보존된다.
 */
export async function removeWhiteBackground(base64: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${base64}`;
  });

  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  const BG_FILL_THRESHOLD = 245; // 이 값 이상인 픽셀을 배경 후보로 판단
  const OPAQUE_MAX = 220; // 이 값 미만이면 완전 불투명 (엣지 부드럽게)
  const TRANSPARENT_MIN = 245; // 이 값 이상이면 완전 투명

  // Step 1: 가장자리에서 DFS 플러드 필로 배경 픽셀 탐색
  const isBackground = new Uint8Array(W * H);
  const stack: number[] = [];

  function seedEdge(idx: number) {
    if (isBackground[idx]) return;
    const di = idx * 4;
    if (
      data[di] >= BG_FILL_THRESHOLD &&
      data[di + 1] >= BG_FILL_THRESHOLD &&
      data[di + 2] >= BG_FILL_THRESHOLD
    ) {
      isBackground[idx] = 1;
      stack.push(idx);
    }
  }

  for (let x = 0; x < W; x++) {
    seedEdge(x); // 상단 행
    seedEdge((H - 1) * W + x); // 하단 행
  }
  for (let y = 1; y < H - 1; y++) {
    seedEdge(y * W); // 좌측 열
    seedEdge(y * W + W - 1); // 우측 열
  }

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % W;
    const y = (idx / W) | 0;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < W - 1 ? idx + 1 : -1,
      y > 0 ? idx - W : -1,
      y < H - 1 ? idx + W : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || isBackground[n]) continue;
      const di = n * 4;
      if (
        data[di] >= BG_FILL_THRESHOLD &&
        data[di + 1] >= BG_FILL_THRESHOLD &&
        data[di + 2] >= BG_FILL_THRESHOLD
      ) {
        isBackground[n] = 1;
        stack.push(n);
      }
    }
  }

  // Step 2: 배경 픽셀 완전 투명 처리
  for (let idx = 0; idx < W * H; idx++) {
    if (!isBackground[idx]) continue;
    data[idx * 4 + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise<string>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(base64);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? base64);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}
