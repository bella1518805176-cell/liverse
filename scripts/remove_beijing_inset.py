"""Restore the original photo beneath the page-13 floor-plan inset."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
VENUE_PDF = ROOT / "VI/Liverse_Beijing_Venue Introduction CHN 2026 v3(1)(1).pdf"
OUTPUT = ROOT / "output/image-edit/beijing-audience-floorplan-removed.png"


def inset_bounds(size: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = size
    # Include antialiasing around the inset, with a small feathering margin.
    return (
        round(width * 777 / 960),
        round(height * 13 / 540),
        round(width * 949 / 960),
        round(height * 130 / 540),
    )


def restore(source: Image.Image, background: Image.Image) -> Image.Image:
    if source.width * 9 != source.height * 16:
        raise ValueError("Expected the original 16:9 venue slide")
    original = source.convert("RGBA")
    width, height = original.size
    # The PDF places Im24 at (0.00009392811, 0), sized 975.5701 x 540 pt.
    # Match that transform, including its deliberate crop beyond the right edge.
    left, top, right, bottom = inset_bounds(original.size)
    scale_x = background.width / (975.5701 * width / 960)
    scale_y = background.height / height
    restored = background.convert("RGBA").transform(
        (right - left, bottom - top),
        Image.Transform.AFFINE,
        (scale_x, 0, (left - 0.00009392811 * width / 960) * scale_x,
         0, scale_y, top * scale_y),
        resample=Image.Resampling.BICUBIC,
    )
    # Feather only the outer margin. The entire inset is covered at full opacity.
    yy, xx = np.indices((bottom - top, right - left))
    distance = np.minimum.reduce((xx, yy, right - left - 1 - xx, bottom - top - 1 - yy))
    feather = max(1, round(width / 640))
    mask = Image.fromarray(np.clip(distance / feather * 255, 0, 255).astype("uint8"))
    original.paste(Image.composite(restored, original.crop((left, top, right, bottom)), mask), (left, top))
    return original


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--pdf", type=Path, default=VENUE_PDF)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Output must differ from the original image")
    page = PdfReader(args.pdf).pages[12]
    background = next(image.image for image in page.images if image.name == "Im24.jpg")
    with Image.open(args.source) as source:
        result = restore(source, background)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        result.save(args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
