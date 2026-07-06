import type { GlyphRasterizer } from './templates';

/**
 * Canvas 2D によるglyphラスタライザ(ブラウザ専用)。
 * テンプレートバンク構築時のみ使用される(フレーム処理では呼ばれない)。
 */
export function createCanvasRasterizer(): GlyphRasterizer {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is unavailable');
  const alpha = new Uint8Array(size * size);

  return (ch, angleDeg, fontFamily, bold) => {
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.font = `${bold ? 'bold ' : ''}64px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) alpha[i] = img.data[i * 4 + 3];
    // 呼び出しごとに同一バッファを返すとバンク構築で上書きされるためコピーする
    return { alpha: alpha.slice(), size };
  };
}
