# ADR 0007: GitHub automation control-plane safety

## Status

Accepted. Renumbered from a duplicate "ADR 0002" on 2026-08-04 (two ADRs shared the number; every bare "ADR 0002" citation in this repo means the north-star ADR, so this one moved). Decision text unchanged.

## Context

Several deleted implementation notes recorded small but durable constraints for repository automation. They are not LifeOS runtime behavior, but they do affect safe maintenance of GitHub-based automation.

## Decision

GitHub automation remains an engineering control-plane only: it may operate on isolated branches and approved GitHub metadata surfaces, must use label/path/validation gates, must preserve human review for control-plane changes, and must use reliable merge-base-aware diffs for pull request risk or eligibility decisions.

## Consequences

- Automation changes stay separate from LifeOS product/runtime automation.
- Future workflow edits that broaden permissions, write surfaces, or diff assumptions need explicit review.
- These constraints do not authorize new in-app autonomous behavior.
