export const generateTSPL = (items) => {
    let commands = '';

    // --- Printer setup ---
    commands += 'SIZE 50 mm,25 mm\n';
    commands += 'GAP 3 mm,0 mm\n';
    commands += 'SPEED 4\n';
    commands += 'DENSITY 12\n';
    commands += 'DIRECTION 1\n';
    commands += 'REFERENCE 0,0\n';
    commands += 'CODEPAGE 1252\n';

    items.forEach(item => {
        const quantity = parseInt(item.quantity, 10) || 1;
        if (quantity <= 0) return;

        commands += 'CLS\n';

        // --- Item Code ---
        commands += `TEXT 34,0,"0",0,16,16,"${item.item_code}"\n`;

        // --- Header: Brand (Top Right) ---
        commands += `TEXT 300,10,"0",0,11,11,"ATG"\n`;

        // --- Barcode ---
        commands += `BARCODE 34,40,"128",40,0,0,3,6,"${item.item_code}"\n`;

        // --- Description ---
        let fullDesc = item.item_name || 'NO_NAME';
        if (fullDesc.length > 30) fullDesc = fullDesc.substring(0, 30);
        commands += `TEXT 34,88,"0",0,11,11,"${fullDesc}"\n`;
        // --- Footer: Packing (Bottom Left) ---
        const packingText = (item.packing || 1).toString();
        commands += `TEXT 34,130,"0",0,16,16,"${packingText}"\n`;


        // --- Price: bigger width, slightly shorter height, bolder ---
        const price = `${item.sale_rate || 0}`;
        const priceFontW = 24; // Wider
        const priceFontH = 18; // Slightly shorter
        let priceEstimatedWidth = price.length * (priceFontW + 2);
        let priceX = 300 - priceEstimatedWidth; // Move more left
        if (priceX < 50) priceX = 50;

        // Fake bold by printing twice slightly shifted
        commands += `TEXT ${priceX},125,"0",0,${priceFontW},${priceFontH},"${price}"\n`;
        commands += `TEXT ${priceX + 2},125,"0",0,${priceFontW},${priceFontH},"${price}"\n`;

        // --- Print ---
        commands += `PRINT 1,${quantity}\n`;
    });

    return commands;
};
