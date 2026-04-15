

## Plan: Create `position_snapshots` table and fix build errors

### 1. Database Migration
Create `position_snapshots` table with the SQL provided, plus RLS policy for public access.

### 2. Fix `usePositionSnapshots.ts` build errors

The file references `position_snapshots` table which doesn't exist in the generated types yet (will be fixed after migration), and uses `pos.seasonScore` which doesn't exist on `StockPositionResult`.

**Fixes:**
- Change `pos.seasonScore` (line 75) to a computed value or use an existing field. The classification's `seasonScore` is not on `StockPositionResult` — we can default to `0` or derive from the stage.
- After the migration runs, the types will auto-regenerate and the table reference errors will resolve.
- If types don't regenerate immediately, cast the table calls to bypass TypeScript until they do.

### 3. Fix the `\n` text change
The previous edit replaced the PnL percentage display with a literal `"\n"` string. This should instead just hide the element or show nothing. Will clean that up.

### Steps
1. Run migration to create `position_snapshots` table with RLS
2. Fix `seasonScore` → use `0` or compute from stage in `usePositionSnapshots.ts`  
3. Fix the `"\n"` text in Portfolio.tsx to show nothing
4. Add type casts for the table name if types haven't regenerated

