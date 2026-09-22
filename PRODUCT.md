# Jev 对拳

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User explicitly updated the stack to Next.js. Next.js App Router, React, CSS, and Node.js Route Handlers, deployed through Vercel CLI.

## Users
A person playing rock, paper, scissors against TypeSafe's Jev, on phone or desktop.

## Product Purpose
Play repeated rounds against the real Jev model, show both win rates and every round, and give Jev all completed rounds in the current series before its next decision.

## Capabilities and Constraints
- The user supplies their own TypeSafe API key in the game. Keep it in page memory and transmit it only to this application's API proxy and TypeSafe.
- Jev must finish choosing before the player can submit a move. A covering div can be lifted voluntarily.
- Publish a salted SHA-256 commitment before the human acts, reveal its proof afterward, and verify in the browser.
- Record outcomes and peeking. Show blind-play statistics and all-round statistics separately.
- Assumption for this implementation: personal browser-local history, not a global competitive leaderboard. No account or paid database requested. Signed records detect edits but cannot prevent a player rolling back their own browser or replaying saved requests.
- Never manufacture a Jev move when the real provider fails.

## Product Principles
Make the state of each round visible. Preserve completed history. Explain what the proof actually verifies. Make revealing optional and intentional.
