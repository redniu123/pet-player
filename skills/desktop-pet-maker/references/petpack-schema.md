# `.petpack` schema version 1

A `.petpack` is a ZIP archive with a different extension. Paths use `/`, are relative to the archive root, and must never contain `..`.

```text
pet.json
preview.png
animations/
  idle/01.png ...
  walk/01.png ...
  sit/01.png ...
  sleep/01.png ...
  reaction/01.png ...
```

Manifest fields:

- `schemaVersion`: required integer `1`.
- `packageVersion`: recommended package revision such as `1.0.0`; increment it when updating a built-in package.
- `id`: required lowercase ASCII letters, numbers, and hyphens; 2–48 characters.
- `name`: required display name.
- `personality`: array of short strings.
- `preview`: required relative PNG path.
- `normalizationMetric`: optional scale-validation mode. New packages use `alpha-area-v1` to compare opaque visual mass; packages that omit it retain legacy `bbox-span-v1` validation for schema-v1 compatibility.
- `animations`: required object keyed by action.
- `behavior.random`: weighted state definitions used by the player. Each item may optionally contain `message` or a randomized `messages` pool plus optional `speech`, using the same text limits as a context-menu step.
- The player is silent by default. It must never invent character dialogue for automatic states, pet switching, returning, or clicks; bubbles and system speech appear only when the manifest explicitly supplies them.
- Omit empty dialogue fields. Do not use placeholder relationship wording or generic clingy phrases.
- `contextMenuActions`: optional array of at most sixteen resource-driven right-click interactions. Keep character-specific wording and actions here rather than hard-coding them in the player.
  - A single-step item uses a stable `id`, visible `label`, animation `action`, optional bubble `message` or randomized `messages` pool, optional system-TTS `speech`, and `duration` from 600 to 3,600,000 milliseconds.
  - A sequence item uses `id`, `label`, and `sequence` with one to eight steps. Each step accepts the same animation and message fields as a single-step item. The complete sequence may last at most 60 seconds.
  - Do not configure both `message` and `messages`, or combine `sequence` with single-step fields.

Build-time feature modules such as call-relative and kowtow live outside the archive under pet-framework/features/. The assembler merges their animation configuration and menu actions into this schema-v1 manifest; the player and .petpack importer do not load executable plugin code.

Each animation contains:

- `frames`: ordered relative PNG paths.
- `durations`: milliseconds, same length as `frames`.
- `loop`: boolean.
- `holdLastFrame`: optional boolean for transitions such as `sit` and `reaction`.
- `scale`: optional display multiplier from `0.5` to `1.5`. Keep most actions at `1`; use a smaller value for a lying pose when it otherwise looks oversized.

Standard action counts are idle 4, walk 6, sit 4, sleep 4, and reaction 4. The player may accept future optional actions, but the maker must produce all five standard actions.

Optional animation ids use lowercase letters, numbers, and hyphens. A package may contain at most 32 animations; every optional animation must contain 2 to 12 PNG frames with matching durations and receives the same path, alpha, scale, and file validation as a standard action. Human build configs declare these under `extraAnimations`, and context-menu actions may reference them directly.

If a mode intentionally disables a standard action at runtime, retain valid compatibility frames for that action but omit it from `behavior.random` and all automatic scheduling.

The archive must contain only the manifest, preview, and referenced assets. Every PNG must have an alpha channel, non-empty visible pixels, transparent corners, and no material green-screen residue.

All exported frames must use the same transparent canvas size and baseline. Normalize visual scale across all actions, not merely within each action strip, so switching poses does not make the pet jump in size.
