import json

with open(r'd:\projects\SHOP\opening_purchase.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

parsed_items = []
for item in items:
    parsed_items.append({
        "itemCode": str(item["alias_name"]),
        "qty": int(item["qty"])
    })

with open(r'd:\projects\SHOP\parsed.json', 'w', encoding='utf-8') as f:
    json.dump(parsed_items, f, indent=2)

print(f"Successfully converted {len(parsed_items)} items to parsed.json")
