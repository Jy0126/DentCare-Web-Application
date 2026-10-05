# DentCare — Dental Clinic Management System
Dr. Reina G. Gapit Dental Clinic, Naga City

Two front doors onto one backend:

1. **Web app** — PHP templates served by Apache (XAMPP)
2. **Mobile app** — Flutter, Android

Both read and write the same **Firebase** project, `dentcare-nijims`. A booking
made on the phone shows up on the web dashboard because there is one database
and two clients, not two systems that sync.

---

## Running the web app

The pages are PHP, so they have to be **served** — opening a `.php` file by
double-clicking it will not work, it needs Apache to run the PHP first.

1. Open the **XAMPP Control Panel** and press **Start** next to **Apache**.
2. Open the site: <http://localhost/DENTCARE2/>

`Open DentCare.url` and `Open DentCare Portal.url` in this folder are
double-clickable shortcuts to those addresses, for when you don't want to type
the URL. They still need Apache running first.

### Where the files have to be

Apache serves out of `C:\xampp\htdocs\`, so the web files live in **two** places:

| Folder | What it is |
|---|---|
| `Desktop\DENTCARE2\` | the project you edit — including the Flutter app, docs and database folder |
| `C:\xampp\htdocs\DENTCARE2\` | the copy Apache actually serves — web files only |

**After editing anything in `css/`, `js/`, `templates/`, `index.php` or
`portal.php`, copy it across**, or the browser will keep showing the old
version. From this folder:

```bash
cp -r css js templates index.php portal.php /c/xampp/htdocs/DENTCARE2/
```

### The two pages

| File | Who it's for |
|---|---|
| `index.php` | the public site: landing page, booking, registration, login |
| `portal.php` | signed-in users: the patient, dentist and staff dashboards |

Signing in on `index.php` sends you to `portal.php`; signing out sends you back.
Opening `portal.php` without being signed in bounces you to `index.php`.

There is no `index.html`. There used to be a saved copy of the whole site under
that name, but it went stale every time a template changed, so it was removed —
`index.php` is the only source now.

---

## Running the mobile app

```powershell
flutter run -d android
```

---

## A note on `api/` and `database/`

`api/*.php` and `database/schema.sql` are a complete PHP + MySQL backend that
**nothing in the running app calls** — every screen talks to Firebase instead.
MySQL does not need to be running for the web app to work.

They are kept for reference. If the project is meant to run on MySQL, that is a
migration, not a configuration change — see `docs/PROGRESS.md`.

---

## Documentation

- `docs/PROGRESS.md` — what is done, what is open, and what is blocked on the
  clinic. Read this first before changing anything.
- `docs/LOOP.md` — how work on this project is structured between sessions.
