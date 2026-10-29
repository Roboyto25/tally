# Tally

A food, exercise, and weight tracker for two people (Richard and Amanda), built as a Progressive Web App. Describe what you ate in plain English, review the estimate, save it. Everything stays on the device.

- React 18 + TypeScript + Vite, hosted free on GitHub Pages
- IndexedDB for records, a service worker for offline use
- No backend, accounts, analytics, paid APIs, or API keys

## How food logging works

1. **Type it the way you'd say it.** "2 scrambled eggs, 3 slices of bacon, and 2 pieces of toast with butter."
2. **Estimate** runs on the device against a bundled list of ~170 common foods. It handles numbers, fractions, number words, oz/g/cups/tbsp/tsp/fl oz, sizes (small/medium/large), and common synonyms. Anything it can't match confidently is shown as unmatched; it never makes up a match.
3. **Ask ChatGPT** is for restaurant meals, recipes, and anything the list doesn't know. Tally builds a prompt, you paste it into ChatGPT (with a photo if you like), then paste the answer back. Tally reads the JSON block at the end of the answer. There's no API connection, so the copy-and-paste step is required.
4. **Review.** Every entry is reviewed before saving. You can rename items, change amounts and units (nutrition recalculates), correct any value, add or remove items, and pick the meal.

The app does all the arithmetic. ChatGPT only supplies per-item estimates, never daily totals.

Each item is labeled by source: **Database** (bundled list), **Saved food** (your custom food), **Entered by you**, or **ChatGPT estimate**. Assumed amounts, like "butter" with no quantity, are marked *estimated*.

## Deploy to GitHub Pages

You need a GitHub account. Node.js is optional; it's only needed to run the app on your own computer.

1. Create a new repository on GitHub, for example `tally`. It can be public or private. Private repositories need a paid GitHub plan for Pages.
2. Upload this folder's contents to the repository.
   - **With git:**
     ```bash
     cd tally
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/<your-username>/tally.git
     git push -u origin main
     ```
   - **Without git:** on the repository page, choose **Add file → Upload files** and drag in everything, including the hidden `.github` folder. On macOS, press Cmd+Shift+. in Finder to show it.
3. Turn on Pages. Go to **Settings → Pages**, and under **Build and deployment → Source** choose **GitHub Actions**.
4. Watch the deploy. Open the **Actions** tab. The *Test and deploy to GitHub Pages* workflow runs on every push to `main`, taking about one to two minutes.
5. When it finishes, the site is at `https://<your-username>.github.io/tally/`.

The build uses a relative base path, so it works under any repository name without configuration.

### Run it locally (optional)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the production build
```

After your first `npm install`, commit the generated `package-lock.json`. Then, in `.github/workflows/deploy.yml`, change `npm install` to `npm ci` for fully reproducible builds.

## Install on iPhone

1. Open the site in **Safari**. Other iOS browsers can install too, but Safari is the most reliable.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open Tally from the home screen icon and set up your profile *there*.

**Important on iPhone:** the Home Screen app and a Safari tab keep separate storage. Records entered in a Safari tab won't appear in the installed app. Log from the installed app.

Installed Home Screen apps are also exempt from Safari's rule that clears site data after seven days without use. That's another reason to install it.

## Install on Windows

1. Open the site in **Edge** or **Chrome**.
2. Click the install icon at the right end of the address bar.
   - Alternatively, in Edge use **⋯ → Apps → Install this site as an app**.
   - In Chrome use **⋮ → Cast, save, and share → Install page as app**.
3. Tally opens in its own window and appears in the Start menu.

## Moving data between devices

Each device has its own independent copy of the records. The phone and the computer do not sync.

To copy records from one device to another:

1. On the source device, go to **Settings → Backup, transfer, and reset → Download backup (JSON)**. On iPhone, **Share backup file** lets you save it to Files or iCloud Drive.
2. Move the file to the other device, using AirDrop, iCloud Drive, OneDrive, or email.
3. On the destination device, open **Settings → Backup, transfer, and reset → Choose backup file**, review the summary, and choose:
   - **Merge** adds new records, updates any that are newer in the file, and skips duplicates. Nothing on the device is deleted. If a profile with the same name already exists, for example Richard set up separately on both devices, the records are merged into that profile instead of creating a second one.
   - **Replace** makes the device an exact copy of the file.

The import validates the whole file first and then writes everything in one database transaction. If anything fails, nothing changes.

The simplest setup: create both profiles on one device, export, then **Replace** on the second device. Both devices then share the same profile IDs.

**Back up regularly.** Clearing browser or site data, uninstalling the app, or some privacy settings will erase local records. A weekly export to iCloud Drive or OneDrive is cheap insurance.

CSV exports of the food log, weigh-ins, and workouts are there for spreadsheets. They're one-way; they can't be imported back.

## Privacy model

- Records live in IndexedDB on the device. GitHub serves the app's files and never receives your data.
- Nothing is sent anywhere automatically. The only outbound data is what you choose to send:
  - the food description or photo you share with ChatGPT
  - backup files you export
- The ChatGPT prompt contains only the food description. Your weight, targets, and history are never in it.
- Photos are held in memory for the handoff and never stored.
- There are no analytics, ads, trackers, or third-party scripts.
- Profiles separate two people's logs for everyday use. They are **not** a security boundary: anyone with the device can open either profile. A PIN was left out on purpose, because without a server it would be easy to bypass and would add a way to lock yourself out.

## How the numbers are calculated

| What | Method |
|---|---|
| Resting energy | Mifflin–St Jeor equation |
| Maintenance | Resting energy × activity multiplier: 1.2, 1.375, 1.55, 1.725, or 1.9 |
| Calorie target | Maintenance − (weekly rate × 3,500 ÷ 7). Defaults to 0.5 lb/week. Targets under 1,200 kcal (female) or 1,500 kcal (male), rates above 1% of body weight per week, and deficits over 25% are flagged, not blocked. |
| Protein | Your number, or 0.8 g per lb of goal weight, capped at 40% of calories |
| Fat | 28% of calories |
| Carbs | The remainder. Total carbs, fiber included. |
| Fiber | 14 g per 1,000 kcal |
| Exercise | MET values from the Compendium of Physical Activities. **Net** calories: (MET − 1) × kg × hours, so resting energy isn't counted twice. Uses average speed when distance is entered. |
| Food budget | Calorie target − calories eaten. Exercise is shown separately and is never added to the budget. |
| Weight trend | Least-squares line through actual weigh-ins. Needs 3 weigh-ins over at least 14 days. No interpolation. |
| Target suggestions | Need 4 or more weigh-ins over 21 or more days. After any target change, the next suggestion waits for 3 new weigh-ins. Changes are capped at 200 kcal, never go below the floor, and are never applied without your approval. |
| Averages | Over days with food logged, or only days marked complete if you choose. Days with nothing logged are left out, never counted as zero. |

All targets are estimates, not medical advice. Use the weekly weigh-ins to calibrate them.

## Food data

The values in `src/data/foods.ts` are per 100 g. They were compiled from USDA FoodData Central reference entries (SR Legacy and FNDDS), which are public domain (CC0). A few generic items, such as protein powder, protein bars, and oat milk, use typical product-label values and are marked as such.

Limitations:

- Values were transcribed and rounded by hand for this build. They weren't each re-checked against the live FDC record.
- Spot-check the foods you eat most at <https://fdc.nal.usda.gov>.
- Brand-specific products vary. For anything you eat often, use **Settings → Saved foods and meals → Add a food** with values from the label.

A unit test checks every food for internal consistency: calories versus macros, fiber no larger than carbs, and a resolvable default portion.

## Testing

`npm test` runs the unit tests, which run in CI on every push. They cover:

- nutrition scaling, meal, daily, and budget totals, and recalculation after edits and deletes
- parser behavior on the spec's example meals and edge cases
- exercise kept separate from the food budget
- weight statistics, trends, and recommendations
- missing days versus zero days
- profile separation in summaries
- export, validation, merge deduplication, and CSV escaping
- ChatGPT response parsing in JSON, table, and line formats

During development the production build was also exercised in headless Chromium (43 checks). These covered:

- first-run setup and validation
- local logging, editing, and saving
- the ChatGPT handoff and duplicate-import warning
- unmatched items blocking save
- exercise not changing the budget
- profile isolation
- invalid-file rejection, same-name merge, and repeat-import with no duplicates
- the recommendation cool-down
- export, wipe, and restore
- offline reload and offline logging
- desktop layout
- no horizontal overflow at 320 px

## Troubleshooting

**The site shows a 404 or a blank page after deploying**
- Check **Settings → Pages → Source** is set to *GitHub Actions*, not a branch.
- Check the latest run in the **Actions** tab succeeded.
- The first deploy can take a few minutes to appear.

**The Actions run failed at "Install"**
- Re-run it; npm registry hiccups happen.
- If it persists, run `npm install` locally and commit `package-lock.json`.

**"Type check" shows a warning in Actions**
- It's set to not block deployment. Run `npm run typecheck` locally to see the details.
- Once it passes, remove `continue-on-error: true` from the workflow so type errors block deploys.

**I updated the app but still see the old version**
- The app checks for updates when it opens and shows *A new version of Tally is ready*. Tap **Reload to update**.
- On iPhone, fully closing and reopening the Home Screen app also works.

**My records are missing**
- Check you're in the right profile.
- On iPhone, check you're in the installed app, not a Safari tab; they don't share storage.
- If site data was cleared, restore from your latest backup.

**"Couldn't open local storage"**
- Private or incognito windows and some strict privacy settings block IndexedDB.
- Use a normal window and allow site data for the site.

**Copy prompt doesn't work**
- Some browsers restrict clipboard access.
- Open **Show the prompt**, select the text, and copy it manually.

**Copy and open ChatGPT opens the website, not the app**
- On iPhone, the link may open in Safari. Paste there, or switch to the ChatGPT app and paste; the prompt is already on the clipboard.

**ChatGPT's answer won't import**
- Paste the whole answer, including the fenced JSON block at the end.
- If ChatGPT skipped the block, ask it to "give me the JSON block from the prompt".
- You can also use **Enter values by hand instead**.

**Exported backup didn't appear on iPhone**
- Use **Share backup file** and choose **Save to Files**.

## Project layout

```
src/
  data/foods.ts         bundled nutrition dataset (kept separate from logic)
  lib/                  pure, tested logic
    parser.ts           natural-language food parser and matcher
    units.ts            quantity and unit parsing
    nutrition.ts        scaling, totals, budget
    targets.ts          Mifflin–St Jeor, macros, warnings
    exercise.ts         MET table, net calorie estimates
    weight.ts           stats, trend, projection, suggestions
    progress.ts         daily/weekly/monthly aggregation
    chatgpt.ts          prompt builder, answer parser
    exportImport.ts     export format, validation, merge plan, CSV
    db.ts               IndexedDB layer (versioned schema, transactional import)
  screens/              Dashboard, Food, Exercise, Weight, Progress, Settings, Profile
  components/           shared UI and SVG charts
scripts/                service worker template and the Vite plugin that fills in its file list
tests/                  unit tests (node:test via tsx)
```

### Export file format (schema version 1)

```json
{
  "format": "tally-fitness-export",
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "ISO timestamp",
  "data": {
    "profiles": [],
    "foodEntries": [],
    "customFoods": [],
    "savedMeals": [],
    "exerciseEntries": [],
    "weightEntries": [],
    "goalHistory": [],
    "dayStatus": [],
    "settings": []
  }
}
```

Dates are local `YYYY-MM-DD`, times are local `HH:MM`, and timestamps are ISO 8601 UTC. Weights are in pounds, energy is in kcal, and nutrients are in grams. Field definitions are in `src/lib/types.ts`.
