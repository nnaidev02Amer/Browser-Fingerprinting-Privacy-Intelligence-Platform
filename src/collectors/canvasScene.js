/**
 * The shared canvas test scene. Used by the main-thread collector and by the
 * Web Worker (which passes an OffscreenCanvas), so both draw identical content.
 * Text, gradients, shadows and emoji exercise the font and anti-aliasing stack.
 */
export const CANVAS_SIZE = 200;

export function drawScene(ctx) {
  ctx.textBaseline = 'top';
  ctx.font = "14px 'Arial'";
  ctx.fillStyle = 'rgba(255, 102, 0, 0.8)';
  ctx.fillRect(50, 20, 100, 50);

  const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  gradient.addColorStop(0, '#069');
  gradient.addColorStop(1, '#0ff');
  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 5;
  ctx.fillText('Browser Fingerprint 😊 Ωß', 10, 30);

  ctx.beginPath();
  ctx.arc(100, 100, 50, 0, Math.PI * 2);
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = 2;
  ctx.stroke();
}
