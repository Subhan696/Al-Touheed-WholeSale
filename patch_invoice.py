import re
with open('electron/main.js', 'r', encoding='utf-8') as f:
    code = f.read()

target = '''    case 'get-next-invoice-no': {
      const r = await query("SELECT MAX(CAST(invoice_no AS INTEGER)) FROM sales WHERE invoice_no ~ '^[0-9]+$'");
      return String((parseInt(r.rows[0].max) || 0) + 1);
    }'''

replacement = '''    case 'get-next-invoice-no': {
      try {
        await query(\
          INSERT INTO global_counters (name, value)
          SELECT 'invoice_no', COALESCE(MAX(CAST(invoice_no AS INTEGER)), 0) FROM sales WHERE invoice_no ~ '^[0-9]+$'
          ON CONFLICT (name) DO NOTHING
        \);
        const res = await query(\
          UPDATE global_counters SET value = value + 1 WHERE name = 'invoice_no' RETURNING value
        \);
        return String(res.rows[0].value);
      } catch (err) {
        console.error('Error getting next invoice no:', err);
        const r = await query("SELECT MAX(CAST(invoice_no AS INTEGER)) FROM sales WHERE invoice_no ~ '^[0-9]+$'");
        return String((parseInt(r.rows[0].max) || 0) + 1);
      }
    }'''

code = code.replace(target, replacement)
with open('electron/main.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched main.js!")
