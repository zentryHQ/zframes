# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Generate the mood-pet sprite sheet.

Canvas: 512x512, 4 rows x 4 cols of 128x128 frames.
Rows = moods (happy, neutral, tired, stressed).
Cols = idle cycle (rest, hop, blink, hop).

Frames are drawn at 32x32 logical pixels and scaled x4 with nearest-neighbor
for a crisp pixel-art look. Original art — regenerate freely.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

LOGICAL = 32
SCALE = 4
FRAME = LOGICAL * SCALE  # 128

MOODS = ["happy", "neutral", "tired", "stressed"]
POSES = ["rest", "hop", "blink", "hop"]

BODY = (255, 214, 153, 255)
OUTLINE = (60, 47, 47, 255)
BLUSH = (255, 150, 150, 255)
SWEAT = (120, 190, 255, 255)
MOUTH_FILL = (198, 91, 91, 255)
EYE_WHITE = (255, 255, 255, 255)


def draw_frame(mood: str, pose: str) -> Image.Image:
    im = Image.new("RGBA", (LOGICAL, LOGICAL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    o = -2 if pose == "hop" else 0  # hop lifts the whole pet

    # body blob
    d.ellipse((5, 11 + o, 26, 29 + o), fill=BODY, outline=OUTLINE, width=1)

    # eyes
    ey = 17 + o
    if pose == "blink":
        d.line((9, ey, 12, ey), fill=OUTLINE, width=1)
        d.line((19, ey, 22, ey), fill=OUTLINE, width=1)
    elif mood == "tired":
        d.rectangle((10, ey, 11, ey + 1), fill=OUTLINE)
        d.rectangle((20, ey, 21, ey + 1), fill=OUTLINE)
        d.line((9, ey - 1, 12, ey - 1), fill=OUTLINE, width=1)  # heavy lids
        d.line((19, ey - 1, 22, ey - 1), fill=OUTLINE, width=1)
    elif mood == "stressed":
        d.ellipse((9, ey - 2, 13, ey + 2), fill=EYE_WHITE, outline=OUTLINE, width=1)
        d.ellipse((18, ey - 2, 22, ey + 2), fill=EYE_WHITE, outline=OUTLINE, width=1)
        d.rectangle((11, ey - 1, 11, ey), fill=OUTLINE)
        d.rectangle((20, ey - 1, 20, ey), fill=OUTLINE)
    else:  # happy / neutral
        d.rectangle((10, ey - 1, 11, ey + 1), fill=OUTLINE)
        d.rectangle((20, ey - 1, 21, ey + 1), fill=OUTLINE)

    # mouth + mood extras
    my = 22 + o
    if mood == "happy":
        d.arc((12, my - 3, 19, my + 1), start=20, end=160, fill=OUTLINE, width=1)
        d.rectangle((7, my - 2, 8, my - 1), fill=BLUSH)
        d.rectangle((23, my - 2, 24, my - 1), fill=BLUSH)
    elif mood == "neutral":
        d.line((13, my, 18, my), fill=OUTLINE, width=1)
    elif mood == "tired":
        d.arc((13, my - 1, 18, my + 3), start=200, end=340, fill=OUTLINE, width=1)
        d.ellipse((24, 9 + o, 26, 12 + o), fill=SWEAT)  # sweat drop
    else:  # stressed
        d.ellipse((13, my - 2, 18, my + 2), fill=MOUTH_FILL, outline=OUTLINE, width=1)
        d.line((5, 7 + o, 7, 9 + o), fill=OUTLINE, width=1)  # stress marks
        d.line((8, 6 + o, 9, 8 + o), fill=OUTLINE, width=1)

    return im.resize((FRAME, FRAME), Image.NEAREST)


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    default_out = repo_root / "apps" / "playground" / "public" / "sprites" / "mood-pet.png"
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else default_out
    out.parent.mkdir(parents=True, exist_ok=True)

    sheet = Image.new("RGBA", (FRAME * 4, FRAME * 4), (0, 0, 0, 0))
    for row, mood in enumerate(MOODS):
        for col, pose in enumerate(POSES):
            sheet.paste(draw_frame(mood, pose), (col * FRAME, row * FRAME))

    sheet.save(out)
    print(f"wrote {out} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
