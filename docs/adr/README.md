# ADR index

Decision records amending `docs/ARCHITECTURE.md` and product doctrine. Append-only: never edit an accepted ADR's decision — supersede it with a new one. A bare "ADR 0002" citation anywhere in this repo means the north-star ADR (the former duplicate-numbered automation ADR is now 0007).

| ADR                                                | Decision (one line)                                                                   | Status                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [0001](0001-v1-server-boundary.md)                 | V1 server logic in Next.js Route Handlers/Server Actions, not Supabase Edge Functions | Accepted                                                 |
| [0002](0002-north-star-stages-and-trust-ladder.md) | North star: trust ladder, spine/perimeter, staged roadmap, NS-INV-1..9                | Accepted; D3's blanket usage gate superseded by ADR 0005 |
| [0003](0003-ux-north-star-moments-architecture.md) | UX north star: moments architecture (Start/Flow/Close), Today as single home          | Accepted; amends 0002                                    |
| [0004](0004-coherence-framework.md)                | Coherence registry + guards; STOP-and-surface on contradictions                       | Accepted; amends 0002, 0003                              |
| [0005](0005-staged-evolution-after-v1.md)          | Capability-specific evidence gates replace the blanket stage usage gate               | Accepted; supersedes 0002 D3's usage gate                |
| [0006](0006-multi-client-doctrine.md)              | One authoritative domain layer, many thin clients (`/api/v1` + CLI)                   | Accepted; amends 0001's phrasing, 0002 scope wording     |
| [0007](0007-github-automation-control-plane.md)    | GitHub automation is engineering control-plane only, label/path/validation gated      | Accepted; renumbered from duplicate 0002 on 2026-08-04   |
