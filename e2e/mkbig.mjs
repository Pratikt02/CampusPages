import fs from 'node:fs'; import { PDFDocument } from 'pdf-lib'; import sharp from 'sharp';
const pdf = await PDFDocument.create();
for (let i = 0; i < 6; i++) { const img = await sharp({ create: { width: 700, height: 700, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 80 } } }).png().toBuffer();
  const page = pdf.addPage([595, 842]); page.drawImage(await pdf.embedPng(img), { x: 30, y: 100, width: 535, height: 535 }); page.drawText(`Big page ${i + 1}`, { x: 30, y: 780, size: 20 }); }
fs.writeFileSync('/tmp/e2e/data/big.pdf', await pdf.save()); console.log('big.pdf bytes', fs.statSync('/tmp/e2e/data/big.pdf').size);
