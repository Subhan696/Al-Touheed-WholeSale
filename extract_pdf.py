import json

transcript_path = r'C:\Users\ST\.gemini\antigravity-ide\brain\8b0efe22-55d5-41d2-a34b-f45ae2ea5d5b\.system_generated\logs\transcript_full.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in reversed(f.readlines()):
        try:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT' and 'this is the pdf' in data.get('content', ''):
                with open(r'd:\projects\SHOP\ocr_dump.json', 'w', encoding='utf-8') as out:
                    out.write(line)
                print("Found and wrote to ocr_dump.json, length of content:", len(data.get('content', '')))
                break
        except Exception as e:
            pass
