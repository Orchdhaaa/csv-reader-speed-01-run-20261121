# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Orchdhaaa/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Orchdhaaa/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0. `solve.js` reads a broken CSV text once, left to right, and returns exactly csv-reader's answer `{columns, rows, errors}` for every input: BOM dropped, records ending at LF or CRLF, stray CRs reported and dropped, quoted fields with doubled quotes and line breaks inside, junk after a closing quote reported, unterminated quotes read again as unquoted, short rows padded and long rows cut to the first record's width, every error recorded with its line and row. It is faster because it never builds a field a character at a time: unquoted fields are found by one tight scan and taken as a single slice, quoted fields find their closing quote with `indexOf`, and only broken fields take the segment path. On the practice set it answers every case exactly as csv-reader does, at about 2x the speed cold and about 5x warm.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `/input/cases.json`, answers each one alone with `run` from `solve.js`, and writes `/output/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1kansq7j&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
