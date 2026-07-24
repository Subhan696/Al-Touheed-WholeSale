import re

with open(r'd:\projects\SHOP\electron\main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update channels array
if "'get-receipt-settings'" not in content:
    content = content.replace(
        "'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',",
        "'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',\n    'get-receipt-settings', 'save-receipt-settings',"
    )

# 2. Update get-stock-report
content = content.replace(
    "SELECT item_code, SUM(qty) as qty FROM stock_adjustments GROUP BY item_code",
    "SELECT item_code, SUM(adjustment_qty) as qty FROM stock_adjustments GROUP BY item_code"
)

# 3. Add receipt settings cases
cases = """
    case 'get-receipt-settings': {
      try {
        const settingsPath = require('path').join(require('electron').app.getPath('userData'), 'receipt_settings.json');
        if (require('fs').existsSync(settingsPath)) {
          return JSON.parse(require('fs').readFileSync(settingsPath, 'utf8'));
        }
        return { copies: 1, printOnSave: true }; // default
      } catch (err) {
        console.error('Error reading receipt settings:', err);
        return {};
      }
    }

    case 'save-receipt-settings': {
      try {
        const settingsPath = require('path').join(require('electron').app.getPath('userData'), 'receipt_settings.json');
        require('fs').writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true };
      } catch (err) {
        console.error('Error saving receipt settings:', err);
        return { error: err.message };
      }
    }
"""

if "case 'get-receipt-settings':" not in content:
    content = content.replace("    default:\n      throw new Error", cases + "\n    default:\n      throw new Error")

with open(r'd:\projects\SHOP\electron\main.js', 'w', encoding='utf-8') as f:
    f.write(content)
