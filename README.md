# Lexa Vietnamese Learning Core

Lexa is a Vietnamese vocabulary learning tool focused on high-frequency word study, pronunciation practice, and lightweight grammar support.

## What it does

- Browse a ranked word vault
- Mark words as Known, Learning, or Ignore
- Open any word to hear pronunciation
- Practice targeted sentences in a recall session
- Review grammar notes and curated examples

## Project structure

- `index.html` - main word vault
- `memory.html` - practice mode
- `grammar.html` - grammar guide
- `gravity.html` - optional word puzzle
- `styles.css` - shared UI system
- `vault.js`, `memory.js`, `grammar.js`, `gravity.js` - page logic
- `server/` - local data and persistence helpers
- `extension/` - browser extension hooks for capturing words

## Run locally

This project is built as a browser-based app. Open the HTML entry points directly in a Chromium browser, or serve the folder with any static web server.

### Recommended flow

1. Open `index.html` for the word vault.
2. Open `memory.html` for practice sessions.
3. Open `grammar.html` for grammar examples.

If you are using the Chrome extension pieces, load the folder as an unpacked extension and keep the `server/data/` files available.

## Why this project matters

Lexa helps learners turn exposure into retention by combining:

- frequency-based vocabulary selection
- pronunciation playback
- active recall practice
- repeatable status tracking
- concise grammar explanations

## Maintainer notes

This repository is maintained as an active Vietnamese learning project, with ongoing work on vocabulary workflows, pronunciation quality, and practice ergonomics.

## Roadmap

- tighter study flow between vault and practice mode
- better curated examples and grammar notes
- improved onboarding for first-time users
- cleaner public documentation and release notes

## Open Source application notes

If you are reviewing this repository for the Codex for Open Source program, the maintainer story is:

- this repo is an active learning tool with recurring maintenance needs
- new vocabulary data and practice content are added over time
- the project benefits from automation around review, content updates, and release work

