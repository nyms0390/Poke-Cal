Game 2, turns 0–7 (truth/floette-g2.json)

| type | truth | found | exact | emitted | recall | precision |
|---|---|---|---|---|---|---|
| reveal | 10 | 10 | 10 | 10 | 100% | 100% |
| stat | 3 | 3 | 3 | 3 | 100% | 100% |
| turn | 7 | 7 | 7 | 7 | 100% | 100% |
| switch | 7 | 7 | 7 | 7 | 100% | 100% |
| mega | 2 | 2 | 2 | 2 | 100% | 100% |
| move | 18 | 18 | 18 | 18 | 100% | 100% |
| hp | 23 | 22 | 13 | 22 | 96% | 100% |
| faint | 6 | 6 | 6 | 6 | 100% | 100% |
| end | 1 | 1 | 1 | 1 | 100% | 100% |
| **all** | 77 | 76 | 67 | 76 | 99% | 100% |

Move order: 18/18 truth moves in the right relative order (LCS); 18 moves emitted.

Misses (in truth, not emitted):
- T2 hp you Incineroar

Found with wrong details:
- T2 hp you Incineroar @575.25s: to 0 (want 71)
- T3 hp you Floette @653.5s: to null (want 42)
- T3 hp opp Glimmora @662.25s: to null (want 36)
- T3 hp opp Glimmora @668.5s: from null (want 36)
- T3 hp you Floette @674.25s: from null (want 42)
- T4 hp you Floette @747.26s: to null (want 16)
- T4 hp you Rillaboom @747.26s: to null (want 67)
- T4 hp you Floette @756s: from null (want 16)
- T4 hp you Rillaboom @751.51s: from null (want 67)

False / extra events (emitted, not in truth):

Game 3, turns 0–2 (truth/floette-g3.json)

| type | truth | found | exact | emitted | recall | precision |
|---|---|---|---|---|---|---|
| reveal | 6 | 6 | 6 | 6 | 100% | 100% |
| stat | 2 | 2 | 2 | 2 | 100% | 100% |
| turn | 2 | 2 | 2 | 2 | 100% | 100% |
| move | 8 | 8 | 8 | 8 | 100% | 100% |
| mega | 1 | 1 | 1 | 1 | 100% | 100% |
| hp | 4 | 4 | 3 | 4 | 100% | 100% |
| faint | 1 | 1 | 1 | 1 | 100% | 100% |
| switch | 2 | 2 | 2 | 2 | 100% | 100% |
| **all** | 26 | 26 | 25 | 26 | 100% | 100% |

Move order: 8/8 truth moves in the right relative order (LCS); 8 moves emitted.

Misses (in truth, not emitted):

Found with wrong details:
- T2 hp you Incineroar @1081.26s: to null (want 64)

False / extra events (emitted, not in truth):

