import sys
file_path = 'd:/projects/SHOP/electron/main.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

find_q = """      case 'add-expense-account': { 
        await query('INSERT INTO expense_accounts (account_name, default_rate) VALUES ($1, $2)', [data.account_name, data.default_rate]); 
        broadcast('expense_accounts'); 
        return { success: true }; 
      }"""

replace_q = """      case 'add-expense-account': { 
        try {
          await query('INSERT INTO expense_accounts (account_name, default_rate) VALUES ($1, $2) ON CONFLICT (account_name) DO UPDATE SET default_rate = EXCLUDED.default_rate', [data.account_name, data.default_rate]); 
          broadcast('expense_accounts'); 
          return { success: true }; 
        } catch (err) {
          return { success: false, error: err.message };
        }
      }"""

if find_q in content:
    content = content.replace(find_q, replace_q)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated add-expense-account in main.js')
else:
    print('Could not find add-expense-account codeblock')
