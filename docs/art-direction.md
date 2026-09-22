# Jev 对拳俱乐部 — Comic arcade redesign

## Direction and ownership
The user requested a full visual, interaction and asset redesign using gamedev-skills/awesome-gamedev-agent-skills. Installed and applied router, game-ui-ux, game-feel and create-game-assets. Next.js, the TypeSafe integration, the signed history and the precommitted round protocol remain the product foundation. Visual direction is delegated to the assistant.

## Art target
An independent comic arcade club: warm paper, ink outlines, cobalt opponent, vermilion player, butter-yellow emphasis. Big playful typography, printed ticket details, illustrated glove cards, and an original small robot mascot. No stock emoji, generic dashboard panels, pixel-font body copy or photographic assets.

Palette: paper #f7f3e8; ink #252522; player #ec563a; opponent #4663ed; accent #f8d45a; pale blue #e7ebff. Heavy rounded black contours, flat screen-print fills, minimal halftone shading, clear silhouettes. Cream gloves have navy cuffs so they work for both opponents.

## Technical frame
2D React DOM/CSS, responsive flow and grids. Desktop target 1440px, minimum phone width 320px with safe-area insets. Glove artwork appears at 34–190 CSS pixels, mascot at 88–127px. Artwork ships as hand-authored SVG sources in public/art (240x240 viewBox, transparent background, shared cream fill, ink contour, cel shadow and charcoal cuff) so it stays sharp at every size. The mascot is inline SVG in app/icons.js and animates via CSS classes. Explicit width/height prevent layout shifts. UI labels, buttons and focus indicators remain HTML; artwork is decorative beside readable move labels.

## Interaction contract
One central action beneath the arena progresses through connect, prepare, choose, resolve and play again. Key setup and proof inspection use native modal dialogs with focus restoration. The cover itself is an intentional reveal control. The three cards support pointer and 1/2/3 keyboard input only after the server has committed; Enter starts the next round only outside text fields and overlays. Effects subscribe to successful local events, never manufacture a result or delay network operations.

Feedback tiers: 120ms button press; 240ms choice pop; 420ms cover flip; 600ms verified-result burst. Respect prefers-reduced-motion and an explicit reduced-motion toggle. Optional original synthesized sound starts only after an explicit user toggle, with no background playback. Scores, outcome words and icons accompany all color cues.

## Asset plan
No raster generation shipped: the imagegen attempt failed on quota, so the design uses original vector art instead. public/art/rock.svg, scissors.svg and paper.svg were redrawn from the project's existing local hand outlines with a shared palette, contour weight, cuff and cel shading; they are one cohesive family by construction. Mascot and Star are inline SVG components in app/icons.js. Sound is synthesized at runtime in lib/sound.js with no audio files or network requests. The only remaining third-party asset is the Manrope variable font already bundled by the project.

## Verification boundary
The user previously requested no tests and direct deployment. Do not run automated or gameplay tests. Source-art inspection is part of making the assets; successful Vercel production build and deployment are reported separately from unperformed gameplay testing.
