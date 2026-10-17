"""Compare decoded PDF card RGB pixels, in draw order, against frozen PNG references."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream

parser = argparse.ArgumentParser()
parser.add_argument("pdf")
parser.add_argument("--references", required=True)
args = parser.parse_args()
manifest_path = Path(args.references)
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
reader = PdfReader(args.pdf)
assert len(reader.pages) == len(manifest["pages"]), "Page count differs from sheet plan"
pages = []
for number, (page, planned) in enumerate(zip(reader.pages, manifest["pages"]), 1):
    images = page["/Resources"].get("/XObject", {})
    cards = []
    for operands, command in ContentStream(page.get_contents(), reader).operations:
        if command != b"Do":
            continue
        image = images[operands[0]].get_object()
        if image.get("/Subtype") != "/Image":
            continue
        index = len(cards)
        assert index < len(planned["cells"]), f"Extra image on page {number}"
        cell = planned["cells"][index]
        reference = manifest_path.parent / cell["reference"]
        size = (int(image["/Width"]), int(image["/Height"]))
        assert image["/ColorSpace"] == "/DeviceRGB", image["/ColorSpace"]
        assert image["/BitsPerComponent"] == 8
        rgb = image.get_data()
        assert len(rgb) == size[0] * size[1] * 3
        if "/SMask" in image:
            alpha = image["/SMask"].get_object().get_data()
            assert all(value == 255 for value in alpha), "Card raster unexpectedly transparent"
        with Image.open(reference) as expected:
            expected = expected.convert("RGB")
            assert size == expected.size, (size, expected.size)
            expected_hash = hashlib.sha256(expected.tobytes()).hexdigest()
        actual_hash = hashlib.sha256(rgb).hexdigest()
        assert actual_hash == expected_hash, f"Wrong frozen pixels: page {number}, card {index + 1}, {reference.name}"
        cards.append({"cardId": cell["cardId"], "reference": reference.name, "sizePx": list(size), "rgbSha256": actual_hash})
    assert len(cards) == len(planned["cells"]), f"Missing image on page {number}"
    pages.append({"page": number, "side": planned["side"], "cards": cards})
print(json.dumps({"status": "PASS", "cardsPerPage": [len(p["cards"]) for p in pages], "pages": pages}, ensure_ascii=False, indent=2))
