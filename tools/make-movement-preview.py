"""Assemble the browser's staged comparison captures into a small looping QA preview.

Run tools/check-movement-browser.mjs review first, then python tools/make-movement-preview.py.
Requires Pillow. This is a visualization artifact, not a frame-rate measurement.
"""
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]
files=sorted((root/'movement-shots').glob('frame-*.png'))
if len(files)!=16:
    raise SystemExit('Expected 16 browser review frames; run the review capture first.')
frames=[]
for file in files:
    with Image.open(file) as source:
        frames.append(source.resize((768,540),Image.Resampling.LANCZOS).convert('P',palette=Image.Palette.ADAPTIVE,colors=128))
target=root/'docs/images/player-movement.gif'
target.parent.mkdir(parents=True,exist_ok=True)
frames[0].save(target,save_all=True,append_images=frames[1:],duration=85,loop=0,disposal=2,optimize=False)
print(target)
