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

        const buildLabelCmds = (isLastLabel) => {
            let cmd = 'CLS\n';

            // --- Item Code ---
            cmd += `TEXT 34,18,"0",0,16,16,"${item.item_code}"\n`;

            // --- Dashed line next to ATG (Right Side) ---
            if (isLastLabel) {
                const codeLen = item.item_code ? String(item.item_code).length : 4;
                const itemCodeEndX = 34 + (codeLen * 16);
                // Start after item code + gap, default to X=160 (gives ~1.6 cm long dashed line)
                const dashStartX = Math.max(160, itemCodeEndX + 24);
                const dashWidthDots = Math.max(0, 290 - dashStartX);
                const numDashes = Math.min(14, Math.floor(dashWidthDots / 9));
                if (numDashes >= 3) {
                    const dashStr = "-".repeat(numDashes);
                    cmd += `TEXT ${dashStartX},23,"0",0,11,11,"${dashStr}"\n`;
                    cmd += `TEXT ${dashStartX + 2},23,"0",0,11,11,"${dashStr}"\n`;
                }
            }

            // --- Header: Brand (Top Right) ---
            cmd += `TEXT 300,28,"0",0,11,11,"ATG"\n`;

            // --- Barcode ---
            cmd += `BARCODE 34,58,"128",40,0,0,3,6,"${item.item_code}"\n`;

            // --- Description ---
            let fullDesc = item.item_name || 'NO_NAME';
            if (fullDesc.length > 30) fullDesc = fullDesc.substring(0, 30);
            cmd += `TEXT 34,106,"0",0,11,11,"${fullDesc}"\n`;

            // --- Footer: Packing (Bottom Left) ---
            const packingText = (item.packing || 1).toString();
            cmd += `TEXT 34,148,"0",0,16,16,"${packingText}"\n`;

            // --- Price ---
            const price = `${item.sale_rate || 0}`;
            const priceFontW = 24;
            const priceFontH = 18;
            let priceEstimatedWidth = price.length * (priceFontW + 2);
            let priceX = 300 - priceEstimatedWidth;
            if (priceX < 50) priceX = 50;

            cmd += `TEXT ${priceX},143,"0",0,${priceFontW},${priceFontH},"${price}"\n`;
            cmd += `TEXT ${priceX + 2},143,"0",0,${priceFontW},${priceFontH},"${price}"\n`;

            return cmd;
        };

        if (quantity > 1) {
            commands += buildLabelCmds(false);
            commands += `PRINT 1,${quantity - 1}\n`;
        }
        commands += buildLabelCmds(true);
        commands += `PRINT 1,1\n`;
    });

    return commands;
};
