# Canvas Sync

[中文说明](README.zh-CN.md)

Sync selected Canvas courses to your computer so you can browse the original materials and give tools such as Codex and Claude Code access to them. This version syncs course pages, files, assignments, announcements, and module structure. Recording transcripts and embedded recordings are not supported yet.

## Getting started on Windows

1. If Node.js LTS is not installed, open **PowerShell** from the Start menu, paste the following command, and press Enter:

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

   Follow the installation prompts. If Windows asks for permission, select Yes. Close PowerShell after installation. If `winget` is unavailable, download the LTS installer from [nodejs.org](https://nodejs.org/) and keep the default npm option.
2. Download and extract the project, then double-click `start-windows.bat`. The first launch requires an internet connection to install dependencies and Chromium.
3. Click **Sign in to Canvas**, complete your Canvas sign-in and verification in the browser window, then return and click **Refresh courses**. Dashboard courses appear first, followed by other accessible courses.
4. Check the default **Sync folder**, or click **Choose folder** to change it. You can also enter the full path to an existing folder and click **Save folder**. Your choice is remembered for the next launch. Changing folders does not move previously synced files.
5. Select one or more courses and click **Sync selected courses** in the top right. Each course has its own progress bar; selected courses are synced one at a time. Any incomplete items are shown beneath the progress bar.
6. Open the course folder in your sync location and view `Course Index.md` for modules and links to materials. You can also point Codex or Claude Code at this folder.

Keep the command window open while the app runs. You sign in through the browser; the session is stored in `.canvas-course-library/browser` in your Windows user directory. The app does not upload course files to another service.

## Getting started on Ubuntu

1. Install Node.js LTS (including npm) from [nodejs.org](https://nodejs.org/en/download) and confirm that `node --version` and `npm --version` work in a new terminal.
2. Install the folder picker and Playwright system dependencies. From the extracted project folder, run:

   ```bash
   sudo apt update
   sudo apt install -y zenity xdg-utils
   npm install
   npx playwright install-deps chromium
   ```

3. Start Canvas Sync from the project folder:

   ```bash
   bash start-ubuntu.sh
   ```

   The first launch downloads Chromium. The app opens in your default browser; if it does not, visit `http://127.0.0.1:38465`. Keep the terminal open while using the app. Use the same sign-in, course selection, and sync steps described above. On Ubuntu, the default sync folder is `~/Documents/Canvas Course Library`; the browser session is stored in `~/.canvas-course-library/browser`.

A graphical Ubuntu desktop session is needed for the sign-in browser and folder picker. You can also enter an existing folder path directly in the app. Ubuntu has not yet been tested end to end against a real Canvas account.

## Library layout

- `Modules`: folders organized by Canvas module, containing pages, attachments, and assignments. Detected links to Canvas attachments in pages point to local files.
- `Other Materials`: materials and assignments not in a module, plus course announcements.
- `Course Index.md`: materials listed in module order. A file referenced by multiple modules is stored only once.
- `.canvas-sync.json`: saved file paths and previous sync information.

On subsequent syncs, unchanged remote files are not downloaded again, and locally edited files are not silently overwritten. Materials deleted from Canvas are not automatically deleted locally. If some content cannot be accessed, the app reports incomplete items and lists the reasons in the course index.

## Current limitations

- The current Canvas URL is configured for UTS (`https://canvas.uts.edu.au`). Support for choosing another institution is not implemented yet.
- End-to-end testing on Windows with a UTS Canvas session through this app has not yet been completed. A cloud browser session was used to check that the Canvas course API could be read; the sync process was tested with simulated course data.
- This version does not retrieve subtitles or audio from Zoom or other embedded recordings, and it does not download video. Recording links shown on pages are retained; external tools may only retain the Canvas entry point.
- Only content accessible to the current account and discoverable through the Canvas API can be synced. Third-party platforms, restricted files, and complex embedded content may not be saved offline; check the failure messages and course index.
- The course list includes current, completed, and pending courses returned by Canvas. Some past courses or materials may be unavailable if the institution restricts access.
- Canvas file links within pages are rewritten to local attachments where possible. Links between pages and other external links may still require an internet connection and Canvas sign-in.
- If you manually edit a generated course index, subsequent syncs preserve it and report a conflict. Keep notes in a separate file.
