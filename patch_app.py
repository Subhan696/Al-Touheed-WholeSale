import sys
file_path = 'd:/projects/SHOP/src/App.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_find = """import ManufacturerDiscounts from './components/ManufacturerDiscounts';"""
import_replace = """import ManufacturerDiscounts from './components/ManufacturerDiscounts';
import ExpenseAccounts from './components/ExpenseAccounts';"""
content = content.replace(import_find, import_replace)

# Add route
route_find = """if (tabKey === 'manufacturer-discounts') return <ManufacturerDiscounts />;"""
route_replace = """if (tabKey === 'manufacturer-discounts') return <ManufacturerDiscounts />;
  if (tabKey === 'expense-accounts') return <ExpenseAccounts />;"""
content = content.replace(route_find, route_replace)

# Add sidebar button
sidebar_find = """{currentUser?.role === 'admin' && (
              <button className={`nav-item ${activeTab === 'manufacturer-discounts' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-discounts')}>
                <span className="icon">💸</span> Mfg Discounts
              </button>
            )}"""
sidebar_replace = """{currentUser?.role === 'admin' && (
              <button className={`nav-item ${activeTab === 'manufacturer-discounts' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-discounts')}>
                <span className="icon">💸</span> Mfg Discounts
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <button className={`nav-item ${activeTab === 'expense-accounts' ? 'active' : ''}`} onClick={() => openWindow('expense-accounts')}>
                <span className="icon">🚛</span> Freight Expense
              </button>
            )}"""
content = content.replace(sidebar_find, sidebar_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated App.jsx')
