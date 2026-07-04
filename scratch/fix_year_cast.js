const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '../electron/main.js');
let content = fs.readFileSync(mainJsPath, 'utf8');

content = content.replace(
  `[itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || '']`,
  `[itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year ? parseInt(year) : null]`
);

content = content.replace(
  `[itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || '', photoPath || null, id]`,
  `[itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year ? parseInt(year) : null, photoPath || null, id]`
);

fs.writeFileSync(mainJsPath, content, 'utf8');
console.log('Fixed year casting in main.js');
