---
name: desktop-pet-maker
description: Guide a user and create a complete Windows desktop pet from one to eight animal or human photos in this repository. Use when Codex is asked for a desktop-pet tutorial, how to start, 制作桌面宠物, 真人宠物, 真人桌宠, to turn photos into animations, build a `.petpack`, or deliver a customer-specific portable EXE.
---

# Desktop Pet Maker repository entry

1. Read `../../../skills/desktop-pet-maker/SKILL.md` completely and follow its animation, processing, privacy, and validation workflow. Resolve every relative path in that skill from `skills/desktop-pet-maker/`.
2. If the user has not supplied a complete confirmed specification, read the source skill's `references/intake-workflow.md` and guide them with short choice or multi-select questions before image generation. Do not preselect optional features, bubbles, system speech, relationship wording, or submissive actions.
3. Follow the repository root `AGENTS.md`, including its default customer-delivery target and release gates.
4. After producing a validated `.petpack`, run `npm run build:customer` with the requested program name and delivery id.
5. Actually launch and verify the portable EXE. Deliver the EXE, `build-report.json`, and a clear list of verified and unverified items.

Do not stop at generated frames or a `.petpack` when the user requested a usable desktop pet.
