import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);   // standard font, NOT embedded: stresses PDF.js font fallback
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 12; i++) {
  const land = i === 6;                                        // one landscape page: mixed page sizes
  const page = pdf.addPage(land ? [842, 595] : [595, 842]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: rgb(0.12, 0.25, 0.69) });
  page.drawText(`Operating Systems - Unit ${i}`, { x: 40, y: height - 58, size: 26, font: bold, color: rgb(1, 1, 1) });
  for (let l = 0; l < 14; l++) page.drawText(`Line ${l + 1}: The scheduler selects the next ready process using priority and aging.`, { x: 40, y: height - 130 - l * 26, size: 13, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Page ${i} of 12`, { x: 40, y: 30, size: 11, font });
}
fs.writeFileSync('/tmp/e2e/data/notes.pdf', await pdf.save());
const svg = `<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="900" fill="#e0f2fe"/><circle cx="400" cy="450" r="260" fill="#1e40af"/><rect x="800" y="200" width="600" height="500" rx="30" fill="#10b981"/><text x="800" y="140" font-size="64" font-family="sans-serif" fill="#0f172a">Process state diagram</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile('/tmp/e2e/data/diagram.png');
console.log('files ok', fs.statSync('/tmp/e2e/data/notes.pdf').size, fs.statSync('/tmp/e2e/data/diagram.png').size);
