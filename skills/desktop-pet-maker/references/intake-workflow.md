# Choice-driven intake workflow

Use this workflow before generating images when a user asks to make a desktop pet, asks for a tutorial, or says they want to start but does not yet provide a complete confirmed specification.

## Interaction rules

- Lead with one short sentence: this repository is a working Windows desktop-pet player plus a `.petpack`/customer-EXE production pipeline, and Codex can guide the whole build.
- Do not start image generation from an incomplete first message.
- Prefer the client's structured question UI when it is available. Otherwise present numbered choices and explicitly allow a comma-separated multi-select reply such as `B1,B2,F1,F4,D1`.
- Ask in at most three short rounds. Do not dump implementation jargon on a non-technical user.
- Never preselect embarrassing, submissive, relationship-specific, bubble, or speech behavior. Optional features default to none.
- After collecting answers, show a compact build summary and ask for one confirmation only when the user has not already clearly said to start. If the user supplied a complete specification and told Codex to start, execute without reconfirming.
- If photos are missing, pause before generation and request them. Continue other safe preparation work when useful.

## Round 1: references and identity

Tell the user to attach 1–8 clear original photos of exactly one subject:

- Require at least one well-lit, unobstructed image that shows the face and complete body.
- Prefer front, full-body, and left/right side views. Ask for back or tail views only when those markings matter.
- Reject severe blur, heavy filters, cropped bodies, tiny subjects, or photos containing multiple ambiguous people/animals.
- State that originals remain separate, are not overwritten, and are not sent to unrelated services.

Collect:

- Subject type: `A1 animal`, `A2 human`, or `A3 other character`.
- Display name, personality keywords, and program name.
- Stable features that must be preserved.
- Style: `S1 soft 2D`, `S2 pixel art`, `S3 realistic photo`, or `S4 custom`. Recommend soft 2D for animals and realistic photo for people, but let the user choose.

## Round 2: feature multi-select

Explain that `idle` and `walk` are the two core actions. Every omitted schema-v1 standard action receives safe compatibility frames but is not automatically scheduled.

Offer these behavior choices:

- `B1` roam left/right automatically.
- `B2` sit/rest automatically.
- `B3` sleep automatically.
- `B4` play a real reaction animation when clicked.
- `B5` quiet companion mode: idle plus optional roaming only.

Offer these independent menu interactions:

- `F1 drink-water` — drink water.
- `F2 eat-snack` — eat a snack.
- `F3 stretch` — stretch.
- `F4 wave-hello` — wave; use a front-paw greeting for animals.
- `F5 dance` — short in-place dance.
- `F6 edge-sit` — sit at the screen edge.
- `F7 call-relative` — say a user-provided form of address. Ask for menu label, bubble text, and speech text; never assume “dad”.
- `F8 kowtow` — kneeling/kowtow action; human mode only and never selected by default.
- `F9 fan-greeting` — restrained peek/wink/wave greeting.
- `F10 custom` — collect one short action description.

Only offer actions appropriate to the supplied subject. A selected visible feature must have its own generated animation id unless it is exactly the selected standard `sit`, `sleep`, or `reaction` action. Do not pretend a new feature exists by changing only a bubble while reusing an unrelated animation.

Suggested presets may be offered, but never silently applied:

- Quiet: `B1,B5,D1`.
- Lively: `B1,B2,B4,F3,F4,F5,D2`.
- Daily care: `B1,B2,B3,F1,F2,F3,D1`.
- Custom: user selects any compatible set.

## Round 3: bubbles, speech, and delivery

Offer one bubble policy:

- `D1 silent` — no automatic or interaction bubbles. This is the default.
- `D2 interaction-only` — bubbles appear only for explicitly selected menu actions.
- `D3 custom automatic` — the user supplies one or more phrases for specific automatic states.
- `D4 custom` — describe another policy.

Ask separately whether Windows system text-to-speech is enabled. Default is off. Never clone or imitate a person's voice without separate authorization and a supported workflow.

Confirm delivery defaults:

- Portable customer EXE opens directly to this one pet.
- Pet import/switch/library controls are hidden.
- Unsigned builds may trigger a Windows unknown-publisher warning.

## Build contract after intake

1. Save a concise specification in the pet work directory, including selected and declined features.
2. Generate only core actions and selected visible actions. Produce safe compatibility frames for omitted required schema-v1 actions and keep them out of random scheduling and menus.
3. Keep dialogue resource-driven in `pet.json`. With `D1`, omit `message`, `messages`, and `speech`.
4. Process transparent frames, normalize visual mass/centroid/baseline, pass source-cell safety gates, validate the package, and build the customer EXE.
5. Launch and verify the EXE. Image generation alone is not completion.
