"""Verify that restoring the photo changes only the floor-plan inset."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("remove_beijing_inset", ROOT / "scripts/remove_beijing_inset.py")
EDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EDIT)


class InsetRemovalTests(unittest.TestCase):
    def test_only_inset_changes_and_original_is_preserved(self):
        source = Image.new("RGBA", (1920, 1080), (255, 255, 255, 255))
        before = np.array(source)
        result = EDIT.restore(source, Image.new("RGB", (1832, 1125), (20, 40, 60)))
        after = np.array(result)
        left, top, right, bottom = EDIT.inset_bounds(source.size)
        outside = np.ones(before.shape[:2], dtype=bool)
        outside[top:bottom, left:right] = False
        np.testing.assert_array_equal(before[outside], after[outside])
        np.testing.assert_array_equal(before, np.array(source))
        np.testing.assert_array_equal(after[(top + bottom) // 2, (left + right) // 2], (20, 40, 60, 255))
        self.assertEqual(result.size, source.size)

    def test_background_alignment_uses_pdf_crop(self):
        width, height = 1920, 1080
        background = np.zeros((1125, 1832, 3), dtype=np.uint8)
        background[:, :, 0] = np.arange(1832)[None, :] % 256
        background[:, :, 1] = np.arange(1125)[:, None] % 256
        result = np.array(EDIT.restore(Image.new("RGB", (width, height)), Image.fromarray(background)))
        x, y = 1720, 140
        expected_x = int((x + 0.5 - 0.00009392811 * width / 960) * 1832 / (975.5701 * width / 960) - 0.5)
        expected_y = int((y + 0.5) * 1125 / height - 0.5)
        self.assertLessEqual(abs(int(result[y, x, 0]) - expected_x % 256), 1)
        self.assertLessEqual(abs(int(result[y, x, 1]) - expected_y % 256), 1)

    def test_rejects_unexpected_aspect_ratio(self):
        with self.assertRaises(ValueError):
            EDIT.restore(Image.new("RGB", (100, 100)), Image.new("RGB", (100, 100)))


if __name__ == "__main__":
    unittest.main()
