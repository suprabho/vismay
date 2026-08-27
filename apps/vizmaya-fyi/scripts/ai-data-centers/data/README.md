# ai-data-centers importer data

- `sample_data_centers.csv` / `sample_data_center_timelines.csv` — **synthetic
  fixtures** for exercising the importer locally without network access:

  ```
  pnpm ai-data-centers:import \
    --facilities scripts/ai-data-centers/data/sample_data_centers.csv \
    --timelines scripts/ai-data-centers/data/sample_data_center_timelines.csv
  ```

  The values are made up — never let them reach the production tables.

- `data_centers.csv` / `data_center_timelines.csv` (not committed) — where to
  drop **real** manual downloads from https://epoch.ai/data/ai-data-centers.
  The importer falls back to these paths automatically when the epoch.ai
  download fails (their Cloudflare blocks some IPs).
