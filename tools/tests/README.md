Tests that need no browser (run each with `node tools/tests/<name>.js`; each prints PASS/FAIL lines and ends with ALL PASSED):

- `chiptest.js`: the sound engine (pitch, duty, envelope, noise, effects, WAV).
- `gametest.js`: the game rules of the in-app engine.
- `romtest2.js`, `romtest3.js`: the Game Boy ROM against the in-app engine and the game rules, in the strict emulator `tools/gbemu.js`.
- `romaudio.js`, `romsfx.js`: the ROM's music player and sound effects, checked register by register.
