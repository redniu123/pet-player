from __future__ import annotations

import argparse
import re
from collections import deque
from math import sqrt
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_COUNTS = {"idle": 4, "walk": 6, "sit": 4, "sleep": 4, "reaction": 4}
CANVAS_SIZE = 480
CANVAS_MARGIN = 16
TARGET_SUBJECT_SPAN = 400
BASELINE = CANVAS_SIZE - CANVAS_MARGIN
VISUAL_CENTER_X = CANVAS_SIZE // 2
TARGET_ALPHA_AREA = 38000
ALPHA_CUTOFF = 24
MIN_GUTTER_PIXELS = 8
MIN_HORIZONTAL_GUTTER_RATIO = 0.04
MIN_VERTICAL_GUTTER_RATIO = 0.02
COMPONENT_SAMPLE_MAX_EDGE = 192
SIGNIFICANT_COMPONENT_RATIO = 0.01


def load_subjects(source: Path, frame_count: int) -> list[Image.Image]:
    image = Image.open(source).convert("RGBA")
    edges = [round(index * image.width / frame_count) for index in range(frame_count + 1)]
    subjects = []
    for index in range(frame_count):
        frame = image.crop((edges[index], 0, edges[index + 1], image.height))
        box = validate_source_frame(frame, source, index + 1)
        subjects.append(frame.crop(box))
    return subjects


def render_action(subjects: list[Image.Image], output_root: Path, action: str) -> None:
    output_dir = output_root / action
    output_dir.mkdir(parents=True, exist_ok=True)
    for index, subject in enumerate(subjects, start=1):
        # Keep visual body mass and the alpha centroid stable. Bounding-box centering
        # makes a moving tail shift the torso and creates apparent zoom/pan on clicks.
        area, centroid_x = alpha_geometry(subject)
        area_scale = sqrt(TARGET_ALPHA_AREA / area)
        fit_scale = min(
            TARGET_SUBJECT_SPAN / subject.width,
            TARGET_SUBJECT_SPAN / subject.height,
            (VISUAL_CENTER_X - CANVAS_MARGIN) / max(1, centroid_x),
            (CANVAS_SIZE - CANVAS_MARGIN - VISUAL_CENTER_X) / max(1, subject.width - centroid_x),
        )
        scale = min(area_scale, fit_scale)
        size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        resized = subject.resize(size, Image.Resampling.LANCZOS)
        _, resized_centroid_x = alpha_geometry(resized)
        canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
        x = round(VISUAL_CENTER_X - resized_centroid_x)
        y = BASELINE - resized.height
        canvas.alpha_composite(resized, (x, y))
        output_box = alpha_mask(canvas).getbbox()
        if output_box is None or output_box[0] < CANVAS_MARGIN or output_box[2] > CANVAS_SIZE - CANVAS_MARGIN:
            raise ValueError(f"{action} frame {index} cannot fit the normalized canvas without clipping")
        canvas.save(output_dir / f"{index:02d}.png", optimize=True)


def contact_sheet(output_root: Path, frame_counts: dict[str, int]) -> None:
    cell_width, cell_height, label_height = 120, 112, 18
    sheet = Image.new(
        "RGB",
        (max(frame_counts.values()) * cell_width, len(frame_counts) * (cell_height + label_height)),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for row, (action, count) in enumerate(frame_counts.items()):
        row_y = row * (cell_height + label_height)
        draw.text((4, row_y + 2), f"{action} ({count})", fill="#55483e")
        for index in range(count):
            frame = Image.open(output_root / action / f"{index + 1:02d}.png").convert("RGBA")
            frame.thumbnail((cell_width - 12, cell_height - 12), Image.Resampling.LANCZOS)
            x0, y0 = index * cell_width, row_y + label_height
            for y in range(y0, y0 + cell_height, 12):
                for x in range(x0, x0 + cell_width, 12):
                    color = "#ece8e1" if ((x - x0) // 12 + (y - y0) // 12) % 2 else "#faf8f4"
                    draw.rectangle((x, y, min(x + 12, x0 + cell_width), min(y + 12, y0 + cell_height)), fill=color)
            sheet.paste(frame, (x0 + (cell_width - frame.width) // 2, y0 + cell_height - frame.height - 4), frame)
    sheet.save(output_root.parent / "contact-sheet.jpg", quality=78, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True, help="Directory containing transparent action strips")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--actions",
        default=",".join(FRAME_COUNTS),
        help="Comma-separated action subset; default processes all five standard actions",
    )
    parser.add_argument(
        "--frame-counts",
        default="",
        help="Optional comma-separated counts for extra actions, for example write-note=4,heart=4",
    )
    args = parser.parse_args()

    action_names = [item.strip() for item in args.actions.split(",") if item.strip()]
    if not action_names:
        parser.error("--actions must include at least one action")
    if len(action_names) != len(set(action_names)):
        parser.error("--actions contains duplicates")
    frame_counts = dict(FRAME_COUNTS)
    for item in [part.strip() for part in args.frame_counts.split(",") if part.strip()]:
        if "=" not in item:
            parser.error("--frame-counts entries must use action=count")
        action, count_text = [part.strip() for part in item.split("=", 1)]
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,31}", action) or action in FRAME_COUNTS:
            parser.error(f"invalid or reserved extra action: {action}")
        try:
            count = int(count_text)
        except ValueError:
            parser.error(f"invalid frame count for {action}: {count_text}")
        if count < 2 or count > 12:
            parser.error(f"frame count for {action} must be 2 to 12")
        frame_counts[action] = count
    unknown = [action for action in action_names if action not in frame_counts]
    if unknown:
        parser.error(f"unknown actions: {','.join(unknown)}")
    selected_counts = {action: frame_counts[action] for action in action_names}

    loaded = {
        action: load_subjects(args.input_dir / f"{action}.png", count)
        for action, count in selected_counts.items()
    }
    for action, subjects in loaded.items():
        render_action(subjects, args.output_dir, action)
    contact_sheet(args.output_dir, selected_counts)


def alpha_mask(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value > ALPHA_CUTOFF else 0)


def max_vertical_run(mask: Image.Image, x: int, top: int, bottom: int) -> int:
    longest = current = 0
    pixels = mask.load()
    for y in range(top, bottom):
        if pixels[x, y]:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def component_areas(mask: Image.Image) -> list[int]:
    ratio = min(1.0, COMPONENT_SAMPLE_MAX_EDGE / max(mask.size))
    if ratio < 1:
        mask = mask.resize(
            (max(1, round(mask.width * ratio)), max(1, round(mask.height * ratio))),
            Image.Resampling.NEAREST,
        )
    pixels = mask.load()
    visited = bytearray(mask.width * mask.height)
    areas: list[int] = []
    for y in range(mask.height):
        for x in range(mask.width):
            offset = y * mask.width + x
            if visited[offset] or not pixels[x, y]:
                continue
            visited[offset] = 1
            queue = deque([(x, y)])
            area = 0
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                for next_y in range(max(0, current_y - 1), min(mask.height, current_y + 2)):
                    for next_x in range(max(0, current_x - 1), min(mask.width, current_x + 2)):
                        next_offset = next_y * mask.width + next_x
                        if visited[next_offset] or not pixels[next_x, next_y]:
                            continue
                        visited[next_offset] = 1
                        queue.append((next_x, next_y))
            areas.append(area)
    return sorted(areas, reverse=True)


def validate_source_frame(frame: Image.Image, source: Path, frame_index: int) -> tuple[int, int, int, int]:
    mask = alpha_mask(frame)
    box = mask.getbbox()
    if box is None:
        raise ValueError(f"{source.stem} frame {frame_index} is empty")
    left, top, right, bottom = box
    required_x = max(MIN_GUTTER_PIXELS, round(frame.width * MIN_HORIZONTAL_GUTTER_RATIO))
    required_y = max(MIN_GUTTER_PIXELS, round(frame.height * MIN_VERTICAL_GUTTER_RATIO))
    gutters = (left, frame.width - right, top, frame.height - bottom)
    if gutters[0] < required_x or gutters[1] < required_x or gutters[2] < required_y or gutters[3] < required_y:
        raise ValueError(
            f"{source.stem} frame {frame_index} enters the safety gutter "
            f"(left/right/top/bottom={gutters}, required={required_x}/{required_y}). "
            "Possible sprite-sheet cell bleeding or clipped ear/tail. Regenerate the strip with wider empty gutters; "
            "never erase the leaked fragment and continue."
        )

    side_limit = max(18, round((bottom - top) * 0.10))
    left_run = max_vertical_run(mask, left, top, bottom)
    right_run = max_vertical_run(mask, right - 1, top, bottom)
    if left_run >= side_limit or right_run >= side_limit:
        raise ValueError(
            f"{source.stem} frame {frame_index} has a suspiciously flat side edge "
            f"(runs={left_run}/{right_run}, limit={side_limit}). "
            "This usually means the tail or body was cropped; regenerate with the complete natural tail tip visible."
        )

    areas = component_areas(mask)
    if len(areas) > 1 and areas[1] >= max(8, round(areas[0] * SIGNIFICANT_COMPONENT_RATIO)):
        raise ValueError(
            f"{source.stem} frame {frame_index} contains a significant detached fragment "
            f"(components={areas[:3]}). Possible neighboring-frame pollution; regenerate instead of deleting pixels."
        )
    return box


def alpha_geometry(image: Image.Image) -> tuple[int, float]:
    mask = alpha_mask(image)
    width = mask.width
    area = 0
    weighted_x = 0
    for offset, value in enumerate(mask.get_flattened_data()):
        if not value:
            continue
        area += 1
        weighted_x += offset % width
    if area == 0:
        raise ValueError("subject has no visible pixels")
    return area, weighted_x / area


if __name__ == "__main__":
    main()
