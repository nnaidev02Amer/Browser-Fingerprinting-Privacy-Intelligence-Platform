/**
 * Copy text to the clipboard. Uses the async Clipboard API (secure contexts)
 * and falls back to a hidden textarea + execCommand elsewhere.
 * @returns {Promise<boolean>} whether the copy succeeded
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.('copy') === true;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
