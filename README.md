# GYM BUDS

A minimalist fitness tracker: calories, weekly workout planner, supplement log, progress charts and profile.
Plain HTML, CSS and JavaScript on the front end; Node.js + Express + SQLite on the back end.
Light and dark mode, animated illustrations, and a mobile-first dashboard with bottom navigation.

## Run it in VS Code

1. Install Node.js 18 or newer (https://nodejs.org). Check with `node -v`.
2. Open this folder in VS Code (File > Open Folder), then open a terminal (Ctrl+`).
3. Install dependencies:

       npm install express better-sqlite3 bcryptjs@2

4. Start the server:

       npm start

   (or `npm run dev` to auto-restart when you edit server files)
5. Open http://localhost:3000

The SQLite database is created automatically at `data/gymbuds.db`. Delete that file to reset all data.

## Project structure

    server.js          Express server and all API routes
    db.js              SQLite connection and table definitions
    data/              Database file (created on first run)
    public/
      index.html       Landing page
      auth.html        Login, sign up, forgot and reset password
      app.html         Dashboard (overview, calories, workouts, supplements, profile)
      css/             styles.css (shared), landing.css, auth.css, app.css
      images/          Optional photos (see images/README.md)
      js/              theme.js (light/dark), common.js (API helper), landing.js, auth.js, app.js,
                       charts.js (SVG charts), foods.js (small built-in food list)

## Light / dark mode and photos

- The theme follows your device setting at first. The sun/moon button switches it and the choice is remembered in the browser.
- Colours live in CSS variables at the top of `public/css/styles.css`. Change them there to restyle the whole app.
- Add your own photos by dropping files into `public/images/` (names are listed in `public/images/README.md`).

## Publish on GitHub

1. Install Git (https://git-scm.com) and create a free account at https://github.com.
2. Tell Git who you are (once per computer):

       git config --global user.name "Your Name"
       git config --global user.email "you@example.com"

3. On github.com click **New repository**, name it `gym-buds`, leave "Add a README" unchecked, and create it.
4. In the VS Code terminal, inside the project folder:

       git init
       git add .
       git commit -m "Initial commit: GYM BUDS"
       git branch -M main
       git remote add origin https://github.com/YOUR-USERNAME/gym-buds.git
       git push -u origin main

   (GitHub shows these exact commands on the new empty repository page.) When asked to sign in, use the browser prompt or a personal access token instead of your password.

Using VS Code buttons instead: Source Control icon > Initialize Repository > type a message > Commit > Publish Branch > sign in to GitHub > choose Public or Private.

`.gitignore` already keeps `node_modules/` and the database (`data/*.db`) out of GitHub, so user accounts are never uploaded.
To update later: `git add .`, `git commit -m "Describe the change"`, `git push`.

Note: GitHub Pages only hosts static files, so it can't run this Node server. To put the full app online, use a Node host
such as Render, Railway or Fly.io (SQLite needs a persistent disk there), and set `NODE_ENV=production`.

## Notes

- Passwords are hashed with bcrypt. Sessions are random tokens stored (hashed) in the database and sent in an HttpOnly cookie.
- Every API query is scoped to the logged-in user, so accounts only see their own data.
- Forgot password: there is no email server, so the reset link is printed in the terminal running the server.
- Supplement reminders use in-page alerts and browser notifications, and only fire while the app is open in a tab.
- Calorie goal defaults to a rough estimate (Mifflin-St Jeor) from your sign-up details. It is editable in Profile.
- Set `PORT` to change the port, and `NODE_ENV=production` when serving over HTTPS (adds the Secure cookie flag).
- GYM BUDS is a tracking tool, not medical advice.
