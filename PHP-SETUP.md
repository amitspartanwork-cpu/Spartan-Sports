# PHP and MySQL setup

The sign-in, account management, and shared inventory features use PHP sessions and MySQL. Live Server and the GitHub Pages preview serve only static files and cannot run the PHP API. The Pages demo login is not authentication; imported inventory is stored only in each visitor's browser.

1. In XAMPP, start **Apache** and **MySQL**.
2. Make the project available under Apache's document root (for example, `C:\xampp\htdocs\spartan-workweb`) while preserving the `files (2)` folder.
3. Copy `files (2)/config.example.php` to `files (2)/config.php`. Set the MySQL credentials and a long, private `setup_key` in `config.php`; do not publish that file or key.
4. Create the `spartan_sports` database (or change the name in `config.php`); the inventory tables are created by the API on first request.
5. Open `http://localhost/spartan-workweb/index.html`. On the first visit, create the administrator using the setup key.
6. Sign in as administrator to create staff/admin accounts and import a `.xlsx`, `.xls`, or `.csv` inventory spreadsheet.

Imports require a `Material` (or `Name`) column and a `Stock` column. `Category`, `Needed`, `Unit`, and `Price` are optional. Rows matching an existing material name are updated; new names are added. Imported data is shared through MySQL.
