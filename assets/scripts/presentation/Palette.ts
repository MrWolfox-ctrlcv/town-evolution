import { Color } from 'cc';
export const PALETTE = {
  paper: '#FFF4DF',
  ink: '#284540',
  teal: '#327C70',
  muted: '#9DAA9A',
  orange: '#D9935C',
  danger: '#AD6250',
  grass: '#90AF76',
  sand: '#DCC392',
};
export function color(hex: string): Color {
  return new Color().fromHEX(hex);
}
