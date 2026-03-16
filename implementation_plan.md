# Subcategory System — Implementation Plan

## Problem
The user wants to drill down within categories. For example, Commodities should break down into Metals, Agribusiness, Energy, Livestock. Stocks should break down into Real Estate, AI, Defence, etc. Each subcategory should have its own target weight within per-profile configurations.

## Architecture

```
Investment {
  category: 'Stocks' | 'Bonds' | ...     ← main category (unchanged)
  subcategory: string                      ← NEW: e.g. 'AI', 'Defence', 'Energy', 'General'
}

TargetProfile {
  weights: Record<AssetCategory, number>           ← main weights (unchanged)
  subWeights: Record<AssetCategory, SubWeight[]>   ← NEW: per-category subcategory weights
}

SubWeight { name: string, weight: number }
```

**Key design decisions:**
- Subcategories are **strings** (not a union type) — fully user-definable
- Each category has a **default subcategory** `"General"` for unmatched assets
- `subWeights` are **relative within the category** (e.g. within the 10% Commodities allocation: Metals 40%, Energy 30%, Agri 20%, Livestock 10%)
- Auto-detection via sector/name keywords, plus user-override via the existing rules system

## Proposed Changes

### Data Model

#### [MODIFY] [parser.ts](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/parser.ts)
- Add `subcategory: string` field to [Investment](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/parser.ts#26-41) interface (default: `'General'`)

---

### Categorizer

#### [MODIFY] [categorizer.ts](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/categorizer.ts)
- Add `autoSubcategory(inv: Investment): string` — keyword-based detection:
  - **Commodities**: `Metals` (copper, lithium, mining), `Energy` (oil, erdöl, erdgas, uran), `Agribusiness` (nahrungsmittel, agrar), `Livestock` → default `General`
  - **Stocks**: `AI` (palantir, nvidia, semiconductor), `Defence` (verteidigung, luftfahrt, bae, rolls-royce, leonardo), `Real Estate` (immobilien, realty, reit) → default `General`
- Update [categorize()](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/categorizer.ts#90-96) to also set `subcategory`
- Add `computeSubAllocation()` — computes breakdown within a single category
- Export `DEFAULT_SUBCATEGORIES` — the built-in subcategory names per category

---

### Profiles

#### [MODIFY] [targetProfiles.ts](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/targetProfiles.ts)
- Add `subWeights?: Record<string, SubWeight[]>` to [TargetProfile](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/targetProfiles.ts#8-13)
- `SubWeight = { name: string, weight: number }`
- Update `DEFAULT_PROFILE` with default sub-weights for Commodities and Stocks
- Backward-compatible: profiles without `subWeights` still work

---

### User Rules

#### [MODIFY] [userRules.ts](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/userRules.ts)
- Add optional `subcategory?: string` to [UserRule](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/userRules.ts#5-10)
- [applyRules](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/utils/userRules.ts#47-64) also applies subcategory overrides

---

### Dashboard UI

#### [MODIFY] [Dashboard.tsx](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/components/Dashboard.tsx)
- **Holdings Table**: Add subcategory column or show subcategory as a tag next to the name
- **Holdings Grouping**: Within each category group, show a small bar/badge per subcategory
- **Subcategory Dropdown**: Next to the category select, add a subcategory input/select
- **Target Allocation Card**: When editing a profile, allow defining subcategory weights per category (collapsible sub-sections)

---

### Styling

#### [MODIFY] [index.css](file:///C:/Users/LukasS/OneDrive/Dokumente/Development/Stockpicker/src/index.css)
- Subcategory badge/tag styles
- Subcategory weight editor styles

## Verification

1. Upload CSV → assets are auto-assigned subcategories
2. Dropdown in holdings allows changing subcategory
3. Weight editor shows subcategory breakdown per category
4. Profile save/load preserves subcategory weights
