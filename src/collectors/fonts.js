import { UnsupportedError } from '../utils/errors';

const CANDIDATE_FONTS = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Bookman Old Style', 'Calibri', 'Cambria',
  'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Courier', 'Courier New',
  'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact',
  'Lucida Console', 'Lucida Sans Unicode', 'Menlo', 'Monaco', 'MS Gothic', 'MS PGothic',
  'Palatino', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Roboto', 'Ubuntu', 'Cantarell', 'DejaVu Sans',
  'Liberation Sans', 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji',
];

// A font is "installed" if text drawn with it measures differently from every
// generic fallback. Testing against three bases avoids false negatives, e.g.
// Times New Roman looks identical to the default serif.
const BASE_FONTS = ['monospace', 'sans-serif', 'serif'];
const TEST_STRING = 'mmmmmmmmmmlli0Oo@WwÅ';
const TEST_SIZE = '72px';

export const fontsCollector = {
  id: 'fonts',
  label: 'Fonts',
  timeoutMs: 3000,
  collect() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UnsupportedError('Canvas 2D context is unavailable');

    const measure = (family) => {
      ctx.font = `${TEST_SIZE} ${family}`;
      return ctx.measureText(TEST_STRING).width;
    };

    const baseWidths = BASE_FONTS.map((base) => measure(base));
    const installed = CANDIDATE_FONTS.filter((font) =>
      BASE_FONTS.some((base, i) => measure(`"${font}", ${base}`) !== baseWidths[i]),
    );

    return { tested: CANDIDATE_FONTS.length, installed: installed.sort() };
  },
  stableView: (data) => data.installed,
};
