import sys
file_path = 'd:/projects/SHOP/src/App.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

btn_find = """          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'manufacturer-discounts' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-discounts')}>
              <span className="icon">🏭</span> Mfg Discounts
            </button>
          )}"""
btn_replace = """          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'manufacturer-discounts' ? 'active' : ''}`} onClick={() => openWindow('manufacturer-discounts')}>
              <span className="icon">🏭</span> Mfg Discounts
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'expense-accounts' ? 'active' : ''}`} onClick={() => openWindow('expense-accounts')}>
              <span className="icon">🚚</span> Freight Expense
            </button>
          )}"""

content = content.replace(btn_find, btn_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated App.jsx with sidebar button')
