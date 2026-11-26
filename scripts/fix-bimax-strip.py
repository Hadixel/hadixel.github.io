import json
import subprocess

cmd = """sudo -u postgres psql -d kmodern -t -A -c 'SELECT "publishedBlocks" FROM "Page" WHERE slug = '"'"'home'"'"';' """
out = subprocess.check_output(cmd, shell=True, text=True).strip()
blocks = json.loads(out)
updated = False

for b in blocks:
    if b.get('type') == 'uspRow':
        items = b.get('props', {}).get('items', [])
        for item in items:
            if 'بیمکث' in item.get('title', ''):
                if item.get('imageInvert'):
                    del item['imageInvert']
                    updated = True
                    print('Removed imageInvert from bimax in block', b.get('id'))

if updated:
    sql = 'UPDATE "Page" SET "publishedBlocks" = \'' + json.dumps(blocks).replace("'", "''") + '\' WHERE slug = \'home\';'
    subprocess.check_call(['sudo', '-u', 'postgres', 'psql', '-d', 'kmodern', '-c', sql])
    print('Page publishedBlocks successfully updated in PostgreSQL!')
else:
    print('No imageInvert found on bimax')
