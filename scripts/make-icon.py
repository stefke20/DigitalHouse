# renders build/icon.png (512x512) – a blue rounded square with a white house
from PIL import Image, ImageDraw
S = 512; img = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=110, fill=(37, 99, 235, 255))
d.rounded_rectangle([0, 0, S - 1, S // 2], radius=110, fill=(59, 130, 246, 255)); d.rectangle([0, 150, S, S // 2 + 2], fill=(59, 130, 246, 255)); d.rectangle([0, S // 2, S, S], fill=(37, 99, 235, 255))
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=110, outline=(30, 64, 175, 255), width=6)
w = 34; pts = [(96, 262), (256, 112), (416, 262)]
d.line(pts, fill='white', width=w, joint='curve'); d.line([(126, 250), (126, 410), (386, 410), (386, 250)], fill='white', width=w, joint='curve')
d.rounded_rectangle([222, 306, 290, 410], radius=10, fill='white')
img.save('build/icon.png')
