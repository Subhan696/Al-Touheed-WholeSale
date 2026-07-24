import json
import os

pdf_json_path = r'd:\projects\SHOP\parsed.json'
user_json_path = r'D:\Downloads\stock_items.json'

with open(pdf_json_path, 'r', encoding='utf-8') as f:
    pdf_items = json.load(f)

with open(user_json_path, 'r', encoding='utf-8') as f:
    user_items = json.load(f)

# The user json seems to have keys like 'itemCode' and 'qty', maybe others.
print(f"Total items in PDF parsed data: {len(pdf_items)}")
print(f"Total items in User JSON data: {len(user_items)}")

pdf_map = {str(i['itemCode']): int(i['qty']) for i in pdf_items}
user_map = {}
for i in user_items:
    # Some user jsons might use 'item_code' instead of 'itemCode'
    code = str(i.get('itemCode', i.get('item_code', '')))
    if code:
        user_map[code] = int(i.get('qty', i.get('packing_qty', 0)))

missing_in_user = []
mismatch_qty = []
missing_in_pdf = []

for code, qty in pdf_map.items():
    if code not in user_map:
        missing_in_user.append((code, qty))
    elif user_map[code] != qty:
        mismatch_qty.append((code, qty, user_map[code]))

for code, qty in user_map.items():
    if code not in pdf_map:
        missing_in_pdf.append((code, qty))

print(f"\nItems in PDF but missing from User JSON: {len(missing_in_user)}")
for c, q in missing_in_user[:10]:
    print(f" - Code: {c}, Qty: {q}")
if len(missing_in_user) > 10:
    print("   ... (truncated)")

print(f"\nItems in User JSON but missing from PDF: {len(missing_in_pdf)}")
for c, q in missing_in_pdf[:10]:
    print(f" - Code: {c}, Qty: {q}")
if len(missing_in_pdf) > 10:
    print("   ... (truncated)")

print(f"\nItems with Qty Mismatch: {len(mismatch_qty)}")
for c, pdf_q, usr_q in mismatch_qty[:10]:
    print(f" - Code: {c}, PDF Qty: {pdf_q}, User Qty: {usr_q}")
if len(mismatch_qty) > 10:
    print("   ... (truncated)")

