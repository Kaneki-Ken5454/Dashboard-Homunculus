# Claude.md — Damage Calculator Reference

> **Update this file every time a calculation bug is fixed or a rule changes.**

---

## Project Overview

This is a Pokémon raid dashboard built with React + TypeScript + Vite.
The two key calculation pages are:

| Page | File | Purpose |
|------|------|---------|
| Damage Calc | `src/pages/DamageCalcTool.tsx` | Standard 1-vs-1 damage calculator |
| Counter Calc | `src/pages/CounterCalcTool.tsx` | Raid boss counter team builder with Monte Carlo |

Core engine lives in **`src/lib/engine_pokemon.ts`** (damage formula, type chart, stat calc).

---

## Pokémon Damage Formula (Gen 9 / Showdown standard)

```
base  = floor( floor( floor(2*Level/5 + 2) * BP * Atk / Def ) / 50 ) + 2

roll_i (i = 0..15) = floor(base * (85 + i) / 100)

apply(d):
  d = floor(d * spread)       // 0.75 in doubles, 1 otherwise
  d = floor(d * weather)
  d = floor(d * crit)         // 1.5 on crit
  if STAB: d = floor(d * stab)  // 1.5 normally, 2.0 if Tera + original type
  d = floor(d * typeEff)
  d = floor(d * screen)       // 0.5 behind Reflect/Light Screen
  d = floor(d * item)
  d = floor(d * expertBelt)
  return max(1, d)

damage range = [apply(roll_0), apply(roll_15)]
```

### Verified Reference

> 252+ Atk Adamant Zygarde-Complete **Tectonic Rage (Z, 180 BP)** vs 0 HP / 0 Def Heatran (lv 100):
> **1020–1204 dmg (315.7–372.7%)** — Guaranteed OHKO ✅

Calculated manually and confirmed matches Showdown.

---

## Shadow Move Rules

Shadow moves are **always super-effective** against every type.

| Defender typing | Type effectiveness multiplier |
|-----------------|-------------------------------|
| Single-type     | **2×** |
| Dual-type       | **4×** (2× × 2×) |

### Implementation (engine_pokemon.ts)

The TYPECHART stores `tc[defType][atkType]`. For Shadow attacking:

```typescript
// CORRECT — 2× per defending type so dual-type = 4× total
for (const dt of allDefTypes) {
  tc[dt]['Shadow'] = 2;
}
```

> ⚠️ **Bug fixed 2025-03 (commit: shadow-multiplier):** The original code set this to `4`
> (4× per type), which made single-type = 4× and dual-type = 16×. Both values were wrong.

---

## Boss HP Scaling (CounterCalcTool)

Raid boss HP is calculated in two stages:

```
baseHp    = calcStat(boss.data.stats.hp, evs, ivs, true, 1, level) * raidMultiplier
totalHp   = baseHp * (1 + hpPerRaider/100 * (numRaiders - 1))
```

`RAID_TIERS` multipliers (engine_pokemon.ts):

| Tier | Multiplier |
|------|-----------|
| Normal | 1× |
| 3★ | 2× |
| 4★ | 3× |
| 5★ | 6.8× |
| 6★ | 10× |
| 7★ | 22× |

### Key Rule: Never pre-scale the base HP stat

**Wrong** (caused double-scaling bug):
```typescript
const bossFake = { ...boss.data, stats: { ...boss.data.stats,
  hp: Math.round(boss.data.stats.hp * raidMult) } };
// Then runCalc would apply calcStat() on top of the already-scaled value → wrong defHp
```

**Correct** (fixed 2025-03):
```typescript
const bossFake = { ...boss.data }; // leave HP stat untouched
// totalHp is computed separately with the two-stage formula above
```

Only **HP** is raid-scaled. Defense, SpDef and all other stats are passed as-is.

---

## Stale Results Bug (CounterCalcTool)

When boss configuration changes, the slot `result` objects must be cleared immediately.
Otherwise minP/maxP computed against the old boss HP will display next to the new boss HP.

**Fix** (updateBoss function):
```typescript
const updateBoss = (p: Partial<BossState>) => {
  setBoss(b => ({ ...b, ...p }));
  setCalculated(false);
  setSlots(ss => ss.map(s => ({ ...s, result: null }))); // ← clears stale results
};
```

---

## calcStat Formula

```
HP:    floor((2*base + iv + floor(ev/4)) * level/100) + level + 10
Other: floor((floor((2*base + iv + floor(ev/4)) * level/100) + 5) * nature)
```

Nature modifier: 1.1 for boosted stat, 0.9 for reduced, 1.0 otherwise.

---

## Z-Move Base Power Conversion

| Original BP | Z-Power |
|-------------|---------|
| ≤ 55 | 100 |
| ≤ 65 | 120 |
| ≤ 75 | 140 |
| ≤ 85 | 160 |
| ≤ 95 | 175 |
| ≤ 100 | 180 |
| ≤ 110 | 185 |
| ≤ 125 | 190 |
| > 125 | 195 |

Earthquake (100 BP) → Tectonic Rage (180 BP) ✓

---

## Known Custom Pokémon

Custom Pokémon (e.g. Shadow Mega Mewtwo) are injected via `injectCustomPokemon()` and
stored under the key `pktool_custom_pokemon_v1` in localStorage.
Their move types can include `Shadow` — type effectiveness applies as documented above.

---

## Change Log

| Date | File | Change |
|------|------|--------|
| 2025-03 | `engine_pokemon.ts` | Fixed Shadow multiplier: `4` per type → `2` per type |
| 2025-03 | `CounterCalcTool.tsx` | Fixed bossFake HP double-scaling (removed pre-scale of base stat) |
| 2025-03 | `CounterCalcTool.tsx` | Fixed stale results: `updateBoss` now clears slot results |
| 2025-03 | `CounterCalcTool.tsx` | `defHp` in SlotResult now stores correct `totalHp` |

---

## Team Battle Simulation (`simulateTeamBattle`)

Added to `CounterCalcTool.tsx`. Simulates a sequential battle where each counter fights the boss until it faints, then the next one takes over.

**Algorithm:**
1. For each slot (in order): compute its HP, avg damage per hit to boss, avg boss damage per hit back.
2. Use speed to decide turn order (attacker moves first if `atkSpe >= bossSpe`).
3. Loop turn-by-turn until counter faints (`hp <= 0`) or boss dies.
4. Record `hitsDealt`, `dmgDealt`, `dmgTaken`, `fainted` per slot.
5. Sum up total damage and check if boss was killed.

**Displayed in ResultsPanel:**
- Total % of boss HP dealt
- Boss HP remaining
- Estimated raiders needed
- Per-slot: name, % damage dealt, hits landed, Fainted/Survived badge

---

## Raid Team Picking Tips

Updated in the Team Builder tips card (`CounterCalcTool.tsx`):
1. Check boss weaknesses (4× and 2× types first)
2. Match move category to weaker defense (Def < SpD → Physical, SpD < Def → Special)
3. Use the counter's strongest move for the super-effective type (STAB + SE = 3×)
4. Review boss moveset — avoid counters with > 30% OHKO risk
5. Dual-type bosses: find types weak to BOTH for 4× damage; Shadow = always 2× per type (4× on dual-type)

Auto-Find panel now also shows Dual-type 4× reminder when boss has two types.

| Date | File | Change |
|------|------|--------|
| 2025-03 | `CounterCalcTool.tsx` | Added `simulateTeamBattle` — sequential full-team fight simulation |
| 2025-03 | `CounterCalcTool.tsx` | `ResultsPanel` now shows battle breakdown (hits, fainted, % dealt per slot) |
| 2025-03 | `CounterCalcTool.tsx` | Updated raid tips to match server team-picking guide |
| 2025-03 | `CounterCalcTool.tsx` | Auto-Find panel shows Dual-type 4× reminder |
| 2025-03 | `auto_finder.ts` | Fixed bossFake HP pre-scaling (same double-scale bug) |
