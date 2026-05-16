# Playwright MCP Validation

Use this for bounded browser-based validation in local/dev LifeOS.

## When to use Playwright MCP

- after UI/UX changes
- after app shell/navigation changes
- after button/action behavior changes
- after Capture/Triage/Calendar/Execute/Review changes
- when the user says the UI looks broken, static, or non-functional
- before claiming UI work is done

## When not to use Playwright MCP

- docs-only changes
- backend-only changes with no UI impact
- schema-only changes unless UI verification is relevant
- broad autonomous exploration without a specific user journey

## Required browser walkthrough journeys

- first visit / empty app
- capture messy thought
- save thought
- save and organize
- review triage item
- accept as task/project
- propose time block
- disconnected Google Calendar state
- execute empty state
- execute active session if available
- daily review
- health degraded/ready states
- areas/settings/local reset confirmation
- mobile viewport navigation
- keyboard tab path through primary actions

If a journey is not reachable in the current environment, report it as blocked with reason.

## Required output format in handoff

- journeys tested
- pass/fail
- screenshots or accessibility observations if available
- defects found
- small fixes made
- deferred issues
- validation commands run

## Safety boundaries

- never perform real external Google Calendar writes unless explicitly approved
- do not touch production data
- prefer local/dev app targets
- use mock/demo mode when possible
- stop and report if auth secrets, production access, or production writes are required
