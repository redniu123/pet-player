# Human desktop-pet mode

Apply this mode automatically when the user asks for a `真人宠物`, `真人桌宠`, asks to turn a person into a desktop pet, or supplies human reference photos.

## Minimal-input contract

- Accept 1–8 photos of the same person. Prefer at least one clear, unobstructed face and one full-body image; use front and side views when available.
- Preserve the originals and separate references, generated source images, rejected candidates, transparent frames, and package output.
- Do not demand a long prompt. Infer stable appearance, clothing, program name, and package id from the request and files when safe. If a name is truly required and unavailable, ask only one concise question.
- Use only photos supplied for this task. Do not upload them to unrelated services.

## Default product behavior

Unless the user overrides it, implement all of the following:

- Render the person in a realistic photographic style. Never default to pixel art, anime, cartoon, illustration, toy, or game-character styling.
- Keep the same recognizable face, age, hairstyle, body proportions, skin tone, and clothing across every frame.
- Use a neutral, dignified standing pose for core idle and movement unless the user chooses another posture.
- Use `walk` for a six-frame ordinary right-facing walk cycle; mirror it in the player for left movement.
- When `call-relative` is selected, use `reaction` for a four-frame front-facing standing speech animation. The person looks toward the viewer and naturally opens and closes the mouth.
- When `kowtow` is selected, use `sit` for a four-frame front-facing kowtow: upright kneel, lean forward, hands and head lower, then return toward kneeling.
- Disable sleep at runtime. Because schema version 1 still requires `sleep`, duplicate safe idle frames for compatibility, but never include `sleep` in `behavior.random` and never schedule it elsewhere.
- Stop roaming while a context-menu interaction is playing; resume normal behavior after it ends.

## Reusable feature framework

When working in the Desktop Pet Player repository, use the build-time modules in `pet-framework/features/` instead of hand-editing one character's `pet.json`:

- Always generate and process `idle` (4 frames) and `walk` (6 frames).
- Select `call-relative` to require `reaction` (4 speech frames). Configure `label`, `message`, and `speech`; do not create separate hard-coded call-dad/call-brother modules.
- Select `kowtow` to require `sit` (4 kowtow frames).
- Never generate `sleep` for humans. The assembler clones processed `idle` frames for sleep.
- When a feature is omitted, let the assembler clone `idle` into its schema-v1 action (`reaction` or `sit`) and omit its context-menu item. Do not generate unused feature frames.
- Run `npm run make:human -- --id <id> --name <name> --features <ids> --plan-only` before image generation. Treat `requiredGeneratedActions` as the authoritative action list.
- When the user asks for additional visible actions, prefer a module in `pet-framework/features/`. Otherwise declare each real action under `extraAnimations` with its own frame durations and image prompt. Generate independent frames for those action ids and point menu items to them; changing only a bubble while reusing `idle`, `reaction`, or `sit` does not count as a new visual action.
- Process only that subset with `skills/desktop-pet-maker/scripts/process_animation_strips.py --actions <comma-separated-actions>`; do not create placeholder strips for omitted features.
- After processing the requested frames, run the same command with `--frames-dir`, `--preview`, feature options, and optionally `--build-exe --app-name <name>`.

Do not preselect optional human features. New packages use the stable action id `call-relative` only when the user selects and configures it; retain legacy `call-dad` only when updating an existing package that already exposes that id.

The feature assembler produces the equivalent configured context-menu actions in `pet.json`. For example:

```json
{
  "contextMenuActions": [
    {
      "id": "call-relative",
      "label": "叫哥哥",
      "action": "reaction",
      "message": "哥哥！",
      "speech": "哥哥",
      "duration": 3600
    }
  ],
  "behavior": {
    "random": [
      { "state": "walk", "weight": 72, "minDuration": 1800, "maxDuration": 4800 },
      { "state": "idle", "weight": 28, "minDuration": 2200, "maxDuration": 4200 }
    ]
  }
}
```

Use Windows system Chinese text-to-speech for `speech`. Do not clone or imitate the referenced person's voice unless the user separately provides authorization and explicitly requests a supported voice workflow.

## Image-generation contract

Create or approve one identity master before the animation strips. Extract a stable identity description covering face shape, eyes, eyebrows, nose, mouth, ears, hairstyle, skin tone, build, approximate height proportions, clothing, footwear, and distinctive visible features.

Use the same identity master and reference set for every strip. Apply this suffix to all human animation prompts:

```text
Preserve exactly the same adult human identity, face, hairstyle, body proportions, clothing, and footwear from the approved references. Use realistic photographic rendering with natural anatomy, skin texture, fabric detail, perspective, and consistent studio lighting. Show exactly one complete person per cell on a perfectly flat solid #00ff00 chroma-key background. Lay out exactly the requested frames in one horizontal row of equal cells and temporal order. Keep identical camera distance, subject scale, torso visual mass, ground baseline, and generous empty gutters in every cell. Keep the entire head, hair, hands, fingers, knees, legs, and feet inside its cell. No crop, extra limbs, merged fingers, duplicate person, identity drift, text, labels, borders, grid lines, floor, shadows, unrelated props, motion marks, watermark, or green clothing. Permit only one simple prop when it is essential to the selected action.
```

Generate only the core actions plus actions required by the selected feature plan. Action prompts:

- `idle` — exactly four neutral standing frames with only subtle breathing, blink, head, and shoulder movement; create a seamless loop.
- `walk` — exactly six frames walking naturally to the right with alternating steps, believable weight transfer, and a seamless cycle.
- `reaction` — exactly four frames kneeling upright and facing the viewer, looking toward the camera while saying one short word; mouth closed, opening, open, and returning toward closed. Keep the body stationary.
- `sit` — exactly four frames facing the viewer: upright kneel, bowing forward, hands supporting on the ground with forehead lowered, and returning toward the upright kneel.
- `sleep` — do not generate a sleeping pose. Copy the processed idle frames into the required sleep action after normalization.

Regenerate any strip with cell-edge contact, neighboring-cell leakage, clipped hair/hands/feet, detached body fragments, malformed anatomy, face drift, inconsistent camera scale, or missing safety gutters. Never repair a leaked neighbor fragment by erasing it.

## Human-mode QA

In addition to the standard gates:

- Inspect faces at full resolution across every frame; reject identity or age drift.
- Confirm both `reaction` and `sit` face the viewer rather than the movement direction when those actions are selected.
- When `call-relative` is selected, confirm its configured menu label produces `reaction`, its configured bubble, and its configured system speech.
- When `kowtow` is selected, confirm its menu item produces `sit` and only the configured bubble.
- Observe runtime behavior long enough to see idle, left walk, and right walk, and confirm no sleep state occurs.
- Replay interactions at least 50 times with no apparent zoom, pan, baseline jump, or unintended drag.
- Verify transparent pixels pass clicks through to the application behind the window, while visible pixels remain interactive.
- Build and launch the customer-specific portable EXE, verify its independent user-data directory, tray, context menu, drag, roaming, left/right orientation, and exit.

Deliver the final EXE, `build-report.json`, validation report, `.petpack`, contact sheet, and an accurate note that unsigned builds may trigger a Windows unknown-publisher warning.
