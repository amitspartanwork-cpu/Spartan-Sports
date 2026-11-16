# Spartan Sports Inventory

A web app for managing raw-material stock, production planning, and procurement.

## Features

- Searchable inventory with category and stock-status filters.
- Production planning and material-shortfall calculations.
- Export inventory and procurement data to Excel.
- Admin-managed accounts and shared inventory stored in MySQL.
- Admin-only `.xlsx`, `.xls`, and `.csv` imports that merge rows by material name.

## Run locally

The sign-in and shared inventory features require PHP with PDO MySQL and a MySQL database. Live Server alone only serves static files and cannot run the PHP API.

Follow [PHP-SETUP.md](./PHP-SETUP.md) to configure the database, create the private setup key, and create the first administrator. Public self-registration is disabled; administrators create accounts.

## Public preview

[Open the static preview](https://amitspartanwork-cpu.github.io/Spartan-Sports/). The User/Admin screens are presentation-only; imported inventory stays in this browser and is not shared.
