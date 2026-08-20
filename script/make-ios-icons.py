#!/usr/bin/env python3
"""
Generate the iOS app icon and splash image from the MyLifos mark.

The mark is the same calendar glyph the login page and app shell draw inline
(client/src/pages/LoginPage.tsx), redrawn here rather than rasterised from the SVG so the
output has no dependency on a working SVG renderer — ImageMagick without librsvg produces
garbage, and adding a headless browser to a build step for one image is not worth it.

Geometry is copied straight from that SVG's 32x32 viewBox:

    rect  x=2  y=6  w=28 h=24 rx=4   stroke 2   calendar body
    path  M2 12 h28                  stroke 2   header rule
    rect  x=8  y=2  w=2  h=6  rx=1              left binding tab
    rect  x=22 y=2  w=2  h=6  rx=1              right binding tab
    circle cx=10/16/22 cy=21 r=2                goal / orange / blue dots

Colours come from the CSS custom properties in client/src/index.css, converted from HSL
here so the two cannot drift apart silently.

Apple's rules the output has to satisfy:
  * exactly 1024x1024 for the App Store icon
  * no alpha channel — an icon with transparency is rejected at upload
  * square, no rounded corners of our own; iOS applies the superellipse mask

Usage:  python3 script/make-ios-icons.py
"""
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "ios/App/App/Assets.xcassets"


def hsl(h: float, s: float, lightness: float) -> tuple[int, int, int]:
    """CSS `hsl(h s% l%)` -> RGB, so values can be pasted from index.css unchanged."""
    r, g, b = colorsys.hls_to_rgb(h / 360.0, lightness / 100.0, s / 100.0)
    return round(r * 255), round(g * 255), round(b * 255)


NAVY = hsl(222, 47, 22)    # --primary
GREEN = hsl(142, 68, 36)   # --cat-goal
ORANGE = hsl(25, 85, 52)   # literal in LoginPage.tsx
BLUE = hsl(210, 80, 48)    # literal in LoginPage.tsx
WHITE = (255, 255, 255)


def draw_mark(img: Image.Image, box: float, cx: float, cy: float) -> None:
    """Draw the calendar mark, `box` px across, centred on (cx, cy)."""
    d = ImageDraw.Draw(img)
    u = box / 32.0                      # one SVG user unit in pixels
    ox, oy = cx - box / 2, cy - box / 2  # top-left of the 32x32 box

    def X(v: float) -> float: return ox + v * u
    def Y(v: float) -> float: return oy + v * u

    stroke = max(1, round(2 * u))

    # Binding tabs first, so the body's stroke overlaps them cleanly.
    for tab_x in (8, 22):
        d.rounded_rectangle(
            [X(tab_x), Y(2), X(tab_x + 2), Y(8)],
            radius=1 * u, fill=WHITE,
        )

    # Calendar body
    d.rounded_rectangle(
        [X(2), Y(6), X(30), Y(30)],
        radius=4 * u, outline=WHITE, width=stroke,
    )

    # Header rule. Inset by half a stroke at each end so it meets the body's inner
    # edge instead of poking through it.
    d.line([X(2) + stroke / 2, Y(12), X(30) - stroke / 2, Y(12)], fill=WHITE, width=stroke)

    # The three category dots
    for dot_x, colour in ((10, GREEN), (16, ORANGE), (22, BLUE)):
        d.ellipse(
            [X(dot_x - 2), Y(21 - 2), X(dot_x + 2), Y(21 + 2)],
            fill=colour,
        )


def write(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # "RGB" not "RGBA": App Store Connect rejects an icon with an alpha channel.
    img.convert("RGB").save(path, "PNG")
    print(f"  {img.width}x{img.height}  {path.relative_to(ROOT)}")


def main() -> None:
    print("Writing iOS assets:")

    # App icon. The mark fills ~62% of the canvas — Apple's own icons sit in roughly
    # this range, and going larger collides with the corner mask.
    icon = Image.new("RGB", (1024, 1024), NAVY)
    draw_mark(icon, box=1024 * 0.62, cx=512, cy=512)
    write(ASSETS / "AppIcon.appiconset/AppIcon-512@2x.png", icon)

    # Splash. Capacitor uses one square image for every orientation and crops it, so the
    # mark has to survive an aggressive centre crop — hence a much smaller proportion.
    for name, size in (("splash-2732x2732.png", 2732),
                       ("splash-2732x2732-1.png", 2732),
                       ("splash-2732x2732-2.png", 2732)):
        splash = Image.new("RGB", (size, size), NAVY)
        draw_mark(splash, box=size * 0.20, cx=size / 2, cy=size / 2)
        write(ASSETS / "Splash.imageset" / name, splash)


if __name__ == "__main__":
    main()
