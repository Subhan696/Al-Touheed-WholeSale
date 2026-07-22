import sys
file_path = 'd:/projects/SHOP/electron/main.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

channels_find = """'get-brands', 'add-brand', 'update-brand', 'delete-brand',"""
channels_replace = """'get-brands', 'add-brand', 'update-brand', 'delete-brand',
    'get-expense-accounts', 'add-expense-account', 'update-expense-account', 'delete-expense-account',
    'get-purchase-expenses',"""

content = content.replace(channels_find, channels_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated channels array in main.js')
