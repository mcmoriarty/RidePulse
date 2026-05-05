# RidePulse

RidePulse is a small browser-based tracker for cycling sessions and training logs.

## What it does

- Log cycle time, distance, active calories, total calories, and average heart rate.
- Compare totals over time with monthly charts and summary cards.
- Filter the log by time range.
- Edit, delete, export, and import activity history.
- Persist everything in `localStorage` in your browser.
- Optionally sync the same data to Firebase so it follows you across devices.
- Starts with a blank slate instead of sample sessions.

## How to run

Open `index.html` in a browser, or serve the folder with any simple static server.

If you want a quick local server and have Python installed:

```powershell
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Firebase sync

To turn on cloud sync:

1. Create a Firebase project.
2. Enable Google sign-in in Firebase Authentication.
3. Create a Cloud Firestore database.
4. Copy your web app config into `firebase-config.js`.
5. Serve the app from `http://localhost` or a hosted domain that Firebase Auth allows.

The app stores one activity log per signed-in user in Firestore and keeps a local backup in the browser.

## Files

- `index.html` - app structure
- `styles.css` - layout and visual design
- `app.js` - storage, filtering, chart rendering, and activity management
- `firebase-config.js` - Firebase project settings placeholder
