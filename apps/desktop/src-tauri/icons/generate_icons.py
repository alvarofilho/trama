"""Generate Trama desktop icons from the product's inline brand mark."""

from io import BytesIO
from pathlib import Path
import struct
import zlib

from PIL import Image, ImageDraw


OUT = Path(__file__).parent


def render(size: int) -> Image.Image:
    # Warm charcoal tile and mint threads, matching the desktop app palette.
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    pad = round(size * 0.055 * scale)
    radius = round(size * 0.23 * scale)
    draw.rounded_rectangle(
        (pad, pad, size * scale - pad, size * scale - pad),
        radius=radius,
        fill=(25, 29, 34, 255),
    )

    # Three upright strands with two crossings, the Trama logo mark.
    left, right = size * 0.285, size * 0.715
    top, bottom = size * 0.245, size * 0.755
    stroke = max(2, round(size * 0.072)) * scale
    color = (139, 227, 193, 255)
    points = [
        ((left, top), (left, bottom)),
        ((size * 0.5, top), (size * 0.5, bottom)),
        ((right, top), (right, bottom)),
        ((left, size * 0.37), (right, size * 0.63)),
        ((left, size * 0.63), (right, size * 0.37)),
    ]
    for (x1, y1), (x2, y2) in points:
        draw.line(
            (round(x1 * scale), round(y1 * scale), round(x2 * scale), round(y2 * scale)),
            fill=color,
            width=stroke,
        )
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def png_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


for name, size in {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "StoreLogo.png": 50,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
}.items():
    render(size).save(OUT / name, format="PNG", optimize=True)

render(512).save(
    OUT / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

# ICNS icon family chunks: 16, 32, 64, 128, 256 and 512 pixel PNG payloads.
chunks = []
for size, chunk_type in [(16, b"icp4"), (32, b"icp5"), (64, b"icp6"), (128, b"ic07"), (256, b"ic08"), (512, b"ic09")]:
    payload = png_bytes(render(size))
    chunks.append(chunk_type + struct.pack(">I", len(payload) + 8) + payload)
body = b"".join(chunks)
(OUT / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)
