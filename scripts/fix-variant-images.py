import json
import subprocess
import urllib.parse
import sys

color_keywords = {
    'مشکی': ['meshki', 'meski', 'black', '_b.', '_b_', 'مشکی', 'شیشه'],
    'سفید': ['sefid', 'sfid', 'white', '_w.', '_w_', 'سفید'],
    'استیل': ['steel', 'estil', 'metal', 'استیل', 'نقره'],
    'طوسی': ['tousi', 'tusi', 'gray', 'grey', 'طوسی'],
    'کرم': ['beige', 'kerem', 'cream', 'کرم', 'بژ'],
}

cmd = """sudo -u postgres psql -d kmodern -t -A -c "SELECT json_agg(p) FROM (SELECT p.id, p.name, json_agg(json_build_object('id', v.id, 'colorName', v.\\"colorName\\", 'images', v.images)) as variants FROM \\"Product\\" p JOIN \\"Variant\\" v ON p.id = v.\\"productId\\" GROUP BY p.id, p.name HAVING count(v.id) > 1) p;" """
output = subprocess.check_output(cmd, shell=True, text=True)
data = json.loads(output)

changes = []
for prod in data:
    vars = prod['variants']
    # Full image pool for this product
    pool = list(dict.fromkeys([img for v in vars for img in (v.get('images') or [])]))
    if not pool:
        continue
    
    primary_shot = pool[0]

    for v in vars:
        c_name = v.get('colorName') or ''
        matched_img = None
        for key, kw_list in color_keywords.items():
            if key in c_name:
                for img in pool:
                    decoded = urllib.parse.unquote(img).lower()
                    if any(k in decoded for k in kw_list):
                        matched_img = img
                        break
            if matched_img:
                break
        
        # If no specific photo exists for this color, stick to the primary product shot!
        # NEVER cycle to arbitrary camera angles of another color!
        target_first_img = matched_img if matched_img else primary_shot
        current_first_img = (v.get('images') or [None])[0]

        if target_first_img != current_first_img:
            new_imgs = [target_first_img] + [img for img in pool if img != target_first_img]
            changes.append((v['id'], prod['name'], c_name, current_first_img, target_first_img, new_imgs))

print(f"Total planned changes: {len(changes)} variants across {len(set(c[1] for c in changes))} products")
for c in changes[:10]:
    old_file = (c[3] or '').split('/')[-1]
    new_file = (c[4] or '').split('/')[-1]
    print(f"Product: {c[1]} | Color: {c[2]} -> Old: {old_file} => New: {new_file}")

# Apply changes to Postgres safely without shell interpolation
for v_id, p_name, c_name, old_img, new_img, new_imgs in changes:
    escaped_imgs = ['"' + img.replace('"', '\\"') + '"' for img in new_imgs]
    arr_str = '{' + ','.join(escaped_imgs) + '}'
    sql = f'UPDATE "Variant" SET images = \'{arr_str}\' WHERE id = \'{v_id}\';'
    subprocess.check_call(['sudo', '-u', 'postgres', 'psql', '-d', 'kmodern', '-c', sql])

print("All variant image assignments updated successfully in database!")
