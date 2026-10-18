# WORK-001 integration scaffold

Maintained Phaser 4.2.1/Vite scaffold with a deliberately temporary integration room. This is the G0 technical spike, not the simulation or an approved creative build.

## Run

Use Node **22.17.1** and npm **10.9.2** (`nvm use 22.17.1` if available). Verify `node -v` and `npm -v`; the host's login shell can select a different Homebrew Node.

```sh
npm ci
npm run dev:host
npm run test
npm run lint
npm run build
npm run preview
```

Dev: **http://127.0.0.1:5187/**. LAN: `http://<mac-ip>:5187/`. Port 5187 is strict because the host already serves a different application on localhost:5173. Preview uses Vite's default port 4173. The iPhone uses Add to Home Screen; real device testing is still required.

Arrow keys/WASD and the fixed joystick move the single-frame avatar. Walk into the marked doorway to swap rooms. Position and scene save under `tpp.save`; remove this key to reset. The production-textured panel has a sound button, focus-test field and dev alignment grid. Console diagnostics are available as `window.__tpp` in development builds only; `await window.__tpp.sample('idle')` samples ten seconds. Warm up for 60 seconds before performance measurement.

## Scope and ownership

Maintained: configuration, layer boundaries, scene module paths, base-y sprite helpers, joystick/keyboard/pointer adapters, CSS font and texture treatment, the asset registry and stopgaps, and pure seeded RNG. These are scaffolding foundations to refine with their later owning packages.

Spike-only, replace during WORK-003/004/014 integration: `app/spikeController.ts`, the `SpikeState` persistence schema, `view/scenes/SpikeScene.ts`, `view/spikeManifest.ts`, `view/spikeDiagnostics.ts`, and the room/street's hard-coded objects/door. No final walk-polygon, rules, content families, pet, projects or real panels are implemented. The rectangular movement clamp is only a renderer/depth harness. The shared CONTRACT-STATE/PERSIST v1.3 is not implemented by this spike.

The minimal local font registration uses CSS `@font-face` plus awaited `document.fonts.load`, before creating Phaser. Both fonts are variable Latin subsets. Runtime assets have stable IDs and SHA-256 provenance in `public/assets/manifest.json`; generated art remains `ai-placeholder`. The native font/texture formats and dimensions follow `phase-2-technical/assets.md`. The one-frame player, room, bed and lamp are Phase 1 stopgaps.

The seven content/tool scripts listed in package.json are future-package entry points and fail until their owning WORK packages deliver the corresponding tools. They have no placeholder success implementation. `lint` currently checks `src tests`; add `tools` when that directory exists. Deploy requires the deferred Wrangler setup/login and is not exercised by WORK-001.

## Evidence and limitations

Actual per-row results and immutable source hashes live in `../working/TASK-022/result.md` and `evidence/`. The browser evidence scripts are task support, not a general gameplay test suite. Headless jsdom tests establish scene construction, not WebGL rendering. The original Phaser mocks are MIT-licensed and attributed beside the helper.

Pinned jsdom 30.1.3 declares a newer Node minimum than 22.17.1. npm emits engine warnings; actual tests run on the pinned Node. This observed compatibility does not change jsdom's declared support.

No creative acceptance, device performance, Safari behavior, physical gesture handling or human sound/latency verdict follows from a successful desktop test. Optional deployment is pending. See the result matrix for precise executed scope.
