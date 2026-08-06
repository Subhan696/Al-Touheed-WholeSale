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
            cmd += `TEXT 34,0,"0",0,16,16,"${item.item_code}"\n`;

            // --- Header: Brand (Top Right) ---
            cmd += `TEXT 300,10,"0",0,11,11,"ATG"\n`;

            // --- Barcode ---
            cmd += `BARCODE 34,40,"128",40,0,0,3,6,"${item.item_code}"\n`;

            // --- Description ---
            let fullDesc = item.item_name || 'NO_NAME';
            if (fullDesc.length > 30) fullDesc = fullDesc.substring(0, 30);
            cmd += `TEXT 34,88,"0",0,11,11,"${fullDesc}"\n`;

            // --- Footer: Packing (Bottom Left) ---
            const packingText = (item.packing || 1).toString();
            cmd += `TEXT 34,130,"0",0,16,16,"${packingText}"\n`;

            // --- Dashed line to separate end of item code (between packing and price) ---
            if (isLastLabel) {
                const dashStr = "---------";
                cmd += `TEXT 110,148,"0",0,14,14,"${dashStr}"\n`;
                cmd += `TEXT 112,148,"0",0,14,14,"${dashStr}"\n`;
                cmd += `TEXT 110,150,"0",0,14,14,"${dashStr}"\n`;
                cmd += `TEXT 112,150,"0",0,14,14,"${dashStr}"\n`;
            }

            // --- Price ---
            const price = `${item.sale_rate || 0}`;
            const priceFontW = 24;
            const priceFontH = 18;
            let priceEstimatedWidth = price.length * (priceFontW + 2);
            let priceX = 300 - priceEstimatedWidth;
            if (priceX < 50) priceX = 50;

            cmd += `TEXT ${priceX},125,"0",0,${priceFontW},${priceFontH},"${price}"\n`;
            cmd += `TEXT ${priceX + 2},125,"0",0,${priceFontW},${priceFontH},"${price}"\n`;

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
