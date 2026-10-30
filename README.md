# Tally

A chat-first food, weight, and cholesterol-nutrition coach for two people, built as a Progressive Web App. Tell it what you ate in plain English, review the meal card, save it, and get specific suggestions for the rest of the day. Everything stays on the device.

- React 18 + TypeScript + Vite, hosted free on GitHub Pages
- IndexedDB for records, a service worker for offline use
- No backend, accounts, analytics, paid APIs, or API keys
- The chat is **not** an AI model: matching, math, recommendations, and summaries are deterministic code running on the device. ChatGPT is an optional, manual hand-off for hard cases.

## What's new in 2.0

- **Chat is the home screen.** Log meals, correct them ("actually only half a tablespoon of butter"), ask questions, get meal ideas, record weigh-ins and workouts.
- **Cholesterol-aware tracking:**
  - Saturated fat, soluble fiber, dietary cholesterol, and sodium, alongside calories, protein, carbs, fat, and fiber.
  - Saturated-fat and sodium limits, plus a soluble-fiber goal.
- **Recommendation engine.** After every saved meal, Tally says where the day stands and suggests 2–3 specific meals with portions and nutrition, ranked for your remaining calories, saturated fat, fiber, and protein.
- **Blood tests (optional).** Enter LDL, HDL, total cholesterol, and triglycerides under Progress and see them over time.
- **Navigation:** Chat, Today, Progress. Food form, Exercise, Weight, and Settings are one tap away (sidebar on desktop; Today screen and top bar on phones).
- **Existing data upgrades automatically.**
  - The database moves from version 1 to version 2 by adding new stores only.
  - Meals logged before 2.0 show saturated fat and the other new nutrients as *unknown*, never as zero.
  - Backups from 1.x still import.

## Using the chat

| You type | What happens |
|---|---|
| "I had three eggs, two slices of toast with butter, and bacon" | Meal card with each item, totals, and what the day looks like after it. **Nothing is saved until you tap Save.** |
| "Actually, I only used half a tablespoon of butter" / "no bacon" / "it was turkey bacon" / "also a coffee" | Edits the pending card. No duplicate entry. |
| "How many calories in a slice of pizza?" / "Is pizza OK tonight?" | Nutrition and impact on your day. **Not logged**; tap "I ate this" if you did. |
| "What should I eat for dinner?" / "High-protein dinner under 600 calories, low in saturated fat" | Ranked meal ideas with portions and reasons. "Log this" turns one into a meal card. |
| "How much fiber do I have left?" / "How am I doing today?" | Remaining amounts from your logged food. |
| "I weighed 242 this morning" / "walked 40 minutes" | Confirmation card, then saved. |
| "How have I done this week?" / "What should I improve?" / "Am I consistently over on saturated fat?" | Summary from your records, including your biggest saturated-fat sources and specific swaps. If too few days are logged, it says so. |
| "How has my weight changed this month?" / "Show my LDL results" | Measured weigh-ins or lab values only. |

Restaurant meals, mixed dishes, and anything not in the food list get an **Ask ChatGPT** button on the card. The photo button next to the message box starts the same hand-off with a photo.

## How the recommendations work

The engine is in `src/lib/recommend.ts`.

1. It reads saved entries for today and computes what's left: calories, protein, saturated-fat allowance, fiber, soluble fiber, and sodium.
2. It picks a calorie budget for the next meal:
   - breakfast: about 25% of the daily target
   - lunch: about a third
   - dinner: what's left, keeping about 150 kcal for a snack
   - "under N calories" is a hard cap
3. It scores 28 portioned meal ideas (`src/data/mealIdeas.ts`) plus your saved meals. Portions are scaled 0.75–1.5× and rounded to ordinary amounts.
4. Ranking priorities, in order: stay within calories; keep saturated fat low and favor unsaturated fats; add fiber, especially soluble fiber; meet protein; keep sodium reasonable. Foods you eat often get a small boost.
5. Each suggestion lists its reasons, such as "low in saturated fat (1.4 g of 3 g left)" or "22 g fiber, about 3.6 g soluble."

All nutrition is computed from the food database, not stored with the idea. Once you're at your calorie target, it suggests no more meals.

## Cholesterol-related targets

These are defaults; edit them in **Settings → Calorie and macro targets**. Your clinician's numbers take precedence.

| Target | Default | Basis |
|---|---|---|
| Saturated fat | under 10% of calories (≈23 g at 2,100 kcal) | Dietary Guidelines for Americans. AHA suggests about 6% for people lowering LDL; the settings screen shows both. |
| Total fiber | 14 g per 1,000 kcal (≈25–30 g) | Dietary Guidelines reference |
| Soluble fiber | 7 g | Within the 5–10 g/day range commonly cited for LDL lowering |
| Sodium | 2,300 mg | Dietary Guidelines upper limit |
| Dietary cholesterol | tracked, no limit | For most people it affects blood LDL less than saturated fat does |

Tally never estimates or predicts blood cholesterol from food logs, and it doesn't diagnose or comment on medication. Blood test results are stored and plotted exactly as entered.

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
- The chat runs locally. Chat history is stored per profile on the device and included in backups.
- Nothing is sent anywhere automatically. The only outbound data is what you choose to send:
  - the food description or photo you share with ChatGPT
  - backup files you export
- A ChatGPT food prompt contains only the food description. A meal-idea prompt contains only today's remaining calories, protein, saturated fat, and fiber. Weight, history, and blood tests are never included.
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

`src/data/foodsExt.ts` adds saturated fat, dietary cholesterol, and sodium for every food, from the same USDA sources.
- Meats, beans, and vegetables are listed unsalted as cooked; canned and restaurant versions have much more sodium.
- **Soluble fiber** isn't reported by USDA for most foods. It is filled in only for 14 foods with published values (oats, oat cereal, beans, lentils, chickpeas, peas, apple, orange, pear, banana, broccoli) and left unknown everywhere else. That's why the dashboard shows soluble fiber as "at least."

Limitations:

- Values were transcribed and rounded by hand for this build. They weren't each re-checked against the live FDC record.
- Spot-check the foods you eat most at <https://fdc.nal.usda.gov>.
- Brand-specific products vary. For anything you eat often, use **Settings → Saved foods and meals → Add a food** with values from the label, including saturated fat and sodium.

Automated tests check every food for internal consistency (calories versus macros, fiber within carbs, saturated fat within fat, soluble fiber within fiber) and check that every meal idea resolves against the database.

## Testing

`npm test` runs the unit tests (39 groups). They run in CI on every push and cover:

- nutrition scaling, totals, and the budget
- unknown-versus-zero handling for the new nutrients
- target defaults
- the parser on the spec's examples
- chat intent classification, including "questions never log food"
- conversational corrections without duplicates
- recommendation constraints, including the hard calorie cap, saturated-fat headroom, and no suggestions once at target
- ChatGPT response parsing with the new fields
- weekly, saturated-fat, weight, and lab summaries refusing to conclude on thin data
- export, import, and merge for schema v1 and v2
- profile separation

For 2.0, the production build was also exercised in headless Chromium (92 browser checks):

- **Upgrade:** records entered in 1.0 were opened by 2.0 on the same origin. All records were preserved, the database upgraded to v2, and dashboard totals were unchanged.
- **Chat flow:** your example messages; correction; save; the follow-up recommendation; pizza question not logged; "under 600 kcal" respected; Edit details and Ask ChatGPT hand-offs with no double save; weigh-in and workout from chat; blood test entry and chat lookup; chat history persistence and ordering; Amanda's chat and labs separate from Richard's; v2 export contents; no overflow at 320 px.
- **The original 1.0 suites:** food form, ChatGPT import and duplicate guard, exercise not touching the budget, profile isolation, backup and restore, offline loading, and offline chat logging.

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
    chat.ts             chat intent rules and conversational corrections
    recommend.ts        what-to-eat-next engine
    insights.ts         weekly, saturated-fat, weight, and lab summaries
  data/foodsExt.ts      saturated fat, cholesterol, sodium, soluble fiber per food
  data/mealIdeas.ts     portioned meal ideas for recommendations
  coach.ts              shared coaching helpers and chat card types
  screens/              Chat, Dashboard, Food, Exercise, Weight, Progress, Settings, Profile
  components/Labs.tsx   blood test entry and charts
  components/           shared UI and SVG charts
scripts/                service worker template and the Vite plugin that fills in its file list
tests/                  unit tests (node:test via tsx)
```

### Export file format (schema version 2; version 1 files still import)

```json
{
  "format": "tally-fitness-export",
  "schemaVersion": 2,
  "appVersion": "2.0.0",
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
    "labResults": [],
    "chatMessages": [],
    "settings": []
  }
}
```

Dates are local `YYYY-MM-DD`, times are local `HH:MM`, and timestamps are ISO 8601 UTC. Weights are in pounds, energy is in kcal, and nutrients are in grams, except cholesterol and sodium, which are in milligrams. The optional nutrients (`satFat`, `solubleFiber`, `cholesterol`, `sodium`) are left out when unknown. Field definitions are in `src/lib/types.ts`.
