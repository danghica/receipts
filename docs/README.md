# Receipt Management — Documentation

This directory contains documentation for the **Receipt management** app: a local Node.js web application that extracts data from Chinese receipt images (发票), lets you review and edit the values, then saves them to Excel and stores cropped receipt images.

## Documentation Index

| Document | Description |
|----------|-------------|
| [User guide](user-guide.md) | Setup, running the app, and the upload → edit → accept flow |
| [Architecture](architecture.md) | System design, modules, and data flow |
| [API reference](api.md) | HTTP endpoints, request/response formats |
| [Configuration](configuration.md) | Region config (`receipt-regions.json`), environment variables |
| [Development](development.md) | Source layout, scripts, and how to extend the app |

## Planning documents

The following planning documents describe features that have been implemented:

- [plan-add-名字-column.md](plan-add-名字-column.md) — Adding the 名字 (custom name) column and manual input
- [plan-frames-around-parsed-strings.md](plan-frames-around-parsed-strings.md) — Drawing frames (bounding boxes) around OCR regions on the receipt image

## Quick links

- **Project README:** [../README.md](../README.md)
- **Region config README:** [../config/receipt-regions.README.md](../config/receipt-regions.README.md) (calibration details)
