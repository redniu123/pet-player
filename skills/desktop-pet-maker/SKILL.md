---
name: desktop-pet-maker
description: Guide users through choosing features and create reusable animated `.petpack` packages plus customer-specific Windows desktop-pet EXEs from one to eight animal or human reference photos. Use for requests to make a desktop pet, ask for a tutorial or how to start, 真人宠物, 真人桌宠, 把这个人做成桌宠, turn photos into identity-consistent animations, configure interactions or dialogue, validate a package, or deliver a portable EXE.
---

# Desktop Pet Maker

Create one validated `.petpack` for the universal Desktop Pet Player. When working in its repository, continue through the customer-specific EXE build and runtime verification. Keep image generation creative; keep frame processing, validation, and packaging deterministic.

## Intake before generation

- When the user asks for a tutorial, asks how to start, or has not supplied a complete confirmed specification, read [references/intake-workflow.md](references/intake-workflow.md) completely and run its choice-driven intake before generating images.
- Prefer structured choice controls when available; otherwise use short numbered options and accept comma-separated multi-select ids.
- Require the user to choose optional behavior, interactions, bubbles, and speech. Select none by default. Never assume relationship-specific wording, kowtow, bubbles, or speech.
- Keep the player silent unless `pet.json` explicitly supplies `message`, `messages`, or `speech`.
- Once photos and choices are complete, continue through packaging and EXE verification; image generation alone is not completion.

## Mode selection

- For cats, dogs, or other animals, use the standard workflow below.
- If the request says `真人宠物`, `真人桌宠`, `把这个人做成桌宠`, or the supplied references depict a person, read [references/human-mode.md](references/human-mode.md) completely and apply it automatically. Do not preselect its optional pose, relationship, kowtow, bubble, or speech features.
- If a human-specific rule conflicts with an animal default, the human-mode rule wins.

## Workflow

1. Locate 1–8 photos of the same subject. Prefer a clear face, side view, and full body. Do not mix identities.
2. Record the display name and personality. Derive a lowercase ASCII package id; use hyphens only.
3. Inspect every reference image. Summarize stable identity traits. For animals, include species, body shape, coat colors and markings, face, ears, eyes, muzzle, legs, and tail. For people, use the human-mode identity contract.
4. Read [references/image-prompts.md](references/image-prompts.md). First generate `idle` (4 frames) and right-facing `walk` (6 frames). Generate `sit`, `sleep`, `reaction`, and independent optional actions only when selected during intake. For omitted schema-v1 standard actions, clone processed idle frames for compatibility and omit those actions from automatic behavior and menus.
   - For humans inside the repository, run `npm run make:human -- ... --plan-only` first and treat `requiredGeneratedActions` as authoritative.
   - For animals, use the same selected-action rule and give each genuinely different optional feature its own animation id.
   - Never represent a new visible feature by changing only its bubble text while reusing an unrelated animation.
   - Preserve selected and declined feature ids in the work-directory specification.
   - Keep all omitted optional dialogue fields absent.
5. Save generated strips as `<action>-chroma.png`. Preserve generated originals.
6. Remove the chroma background with the installed imagegen helper. Use `--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`.
7. Run `scripts/process_animation_strips.py` on the selected transparent strips. The script must reject any source cell that enters its safety gutter, has a suspicious flat side cut, or contains a significant detached component. Treat these failures as sprite-sheet cell bleeding or body/ear/tail clipping: regenerate the strip with wider gutters. Never erase a leaked fragment and continue, because the missing pixels cannot be recovered.
8. The processor must normalize every frame to one shared canvas and foot baseline, use opaque visual mass for scale, and align the alpha centroid so tail motion cannot shift the torso. Inspect the contact sheet for identity drift, green fringe, duplicate or empty frames, incomplete or flat-cut tail tips, unstable baselines, and apparent zoom/pan within or between actions.
9. For repository-based human pets, run `npm run make:human` with the selected features to assemble, validate, and build the package. For animals or standalone use, run `scripts/create_pet_manifest.py` with the pet id, name, personality, preview, and frames directory.
10. Read [references/petpack-schema.md](references/petpack-schema.md) when changing fields or animation behavior.
11. Run `scripts/petpack_tool.py validate <pet-directory>`, then `build <pet-directory> <output.petpack>`.
12. Deliver the `.petpack`, contact sheet, manifest path, and the final image prompt set. Import it into the player when the player project is available.

## Quality gates

- Keep one recognizable subject identity across all frames.
- Keep one subject per frame and the whole body visible. For animals, retain the complete natural tail tip. Keep feet, paws, knees, hands, or the lying body on a stable baseline appropriate to the pose.
- Require empty left/right safety gutters in every source cell. Reject cell-edge contact, neighboring-frame fragments, flat-cut extremities, or any manual cleanup that merely deletes the spill.
- Reject baked text, labels, borders, shadows, motion marks, green-screen remnants, and undeclared decorative props. Permit one simple prop only when essential to a selected action such as drinking or eating.
- Use the right-facing walk strip for left movement by mirroring in the player.
- Normalize by opaque visual mass and alpha centroid, not by the full bounding-box center. Limb, clothing, or tail motion must not make the torso grow, shrink, or translate.
- Rapidly replay `reaction` at least 50 times in the regression check. The pet's CSS scale and anchor must remain absolute, and stationary clicks must not move the window.
- In the player, transparent pixels outside the visible pet must pass mouse input through to applications behind the desktop-pet window.
- Do not rebuild or fork the player for a new pet. Keep pet-specific work inside the `.petpack`; when this skill runs inside the Desktop Pet Player repository, continue with the repository instructions to build and verify the customer EXE.
- Do not silently accept a malformed package; fix validation failures before delivery.

## Defaults

- Use the soft 2D game-sprite style for animals unless the user specifies another style. Human mode defaults to photorealistic photography.
- Default to no optional interactions, no bubbles, and no system speech until the user selects them.
- Use personality only to shape `reaction` poses and dialogue metadata; do not change stable physical traits.
- Produce a first complete version without asking for aesthetic approval when sufficient photos are present. Invite refinement after delivery.
