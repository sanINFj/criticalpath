import os
from PIL import Image, ImageFilter

src_path = r'C:\Users\aryaa\.gemini\antigravity-ide\brain\9916000d-c2db-46fd-8c56-012fcb0b737e\.user_uploaded\media_1792526748877.png'
src = Image.open(src_path).convert('RGBA')
w, h = src.size

# 1. Precise segmentation of gold & blue strokes (excluding drop shadow)
mask = Image.new('L', (w, h), 0)
for y in range(h):
    for x in range(w):
        r, g, b, _ = src.getpixel((x, y))
        is_gold = (r > 105 and g > 82 and r > b + 18)
        is_blue = (b > 78 and b > r + 8)
        is_bevel = (max(r, g, b) > 95 and ((r > b + 15) or (b > r + 8)))
        if is_gold or is_blue or is_bevel:
            mask.putpixel((x, y), 255)

# Slight expansion and subtle blur for pristine anti-aliasing
mask_expanded = mask.filter(ImageFilter.MaxFilter(3))
mask_smooth = mask_expanded.filter(ImageFilter.GaussianBlur(0.7))

# 2. Build crisp transparent image without any background or drop shadow
clean_logo = Image.new('RGBA', (w, h), (0, 0, 0, 0))
for y in range(h):
    for x in range(w):
        r, g, b, _ = src.getpixel((x, y))
        a = mask_smooth.getpixel((x, y))
        # Ensure dark background shadows are completely transparent
        if max(r, g, b) < 75:
            a = 0
        elif a > 0:
            # Clean edge falloff
            if max(r, g, b) < 95:
                a = int(a * 0.7)
        clean_logo.putpixel((x, y), (r, g, b, a))

# Crop tightly to the logo bounds
bbox = clean_logo.getbbox()
cropped = clean_logo.crop(bbox)

# Save transparent logo asset
assets_dir = r'c:\Users\aryaa\Downloads\criticalpath-develop\criticalpath-develop\src\renderer\src\assets'
out_transparent = os.path.join(assets_dir, 'asap_logo.png')
cropped.save(out_transparent, 'PNG')
print(f"Saved shadow-free transparent logo to {out_transparent} (size: {cropped.size})")

# 3. Generate square icon for Windows (.ico) & taskbar (.png)
square_size = max(cropped.width, cropped.height) + 24
square_icon = Image.new('RGBA', (square_size, square_size), (0, 0, 0, 0))
offset_x = (square_size - cropped.width) // 2
offset_y = (square_size - cropped.height) // 2
square_icon.paste(cropped, (offset_x, offset_y), cropped)

resources_dir = r'c:\Users\aryaa\Downloads\criticalpath-develop\criticalpath-develop\resources'
build_dir = r'c:\Users\aryaa\Downloads\criticalpath-develop\criticalpath-develop\build'

icon_256 = square_icon.resize((256, 256), Image.Resampling.LANCZOS)
icon_256.save(os.path.join(resources_dir, 'icon.png'), 'PNG')
icon_256.save(os.path.join(build_dir, 'icon.png'), 'PNG')
print("Saved 256x256 icon.png to resources and build dirs")

ico_path = os.path.join(build_dir, 'icon.ico')
square_icon.save(
    ico_path,
    format='ICO',
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print(f"Saved multi-resolution icon.ico to {ico_path}")
