"""Render source pages; these are venue references, never seat-specific captures."""
from pathlib import Path
import subprocess
from PIL import Image

root = Path(__file__).resolve().parents[1]
target = root / "assets" / "public"
target.mkdir(parents=True, exist_ok=True)
source = root / "VI" / "Liverse_Beijing_Venue Introduction CHN 2026 v3(1)(1).pdf"
for page, name in [(13, "beijing-live"), (14, "beijing-balcony"), (15, "beijing-stage")]:
    prefix = root / "tmp" / "pdfs" / f"asset-{page}"
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-scale-to", "1600", "-singlefile", "-png", str(source), str(prefix)], check=True)
    image = Image.open(str(prefix) + ".png").convert("RGB")
    image.save(target / (name + ".jpg"), quality=88, optimize=True)
